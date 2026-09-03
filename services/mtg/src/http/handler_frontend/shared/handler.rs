use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::get;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;

use crate::http::handler_frontend::collections::schema::CollectionStatisticsResponse;
use crate::http::handler_frontend::collections::schema::ListCardsQuery;
use crate::http::handler_frontend::collections::schema::ListCardsResponse;
use crate::http::handler_frontend::collections::schema::ListedEntryResponse;
use crate::http::handler_frontend::decks::schema::DeckCardResponse;
use crate::http::handler_frontend::decks::schema::DeckTagResponse;
use crate::http::handler_frontend::decks::schema::ListDeckCardsResponse;
use crate::http::handler_frontend::shared::schema::SharedCollectionResponse;
use crate::http::handler_frontend::shared::schema::SharedDeckResponse;
use crate::http::handler_frontend::shared::schema::redact_entry;
use crate::http::handler_frontend::shared::schema::redact_slot;
use crate::http::handler_frontend::shared::schema::redact_statistics;
use crate::models::account::Account;
use crate::models::collection::Collection;
use crate::models::collection::listing::EntryPage;
use crate::models::collection::listing::EntryQuery;
use crate::models::collection::listing::MAX_LIMIT;
use crate::models::collection::statistics::CollectionStatistics;
use crate::models::deck::Deck;
use crate::models::deck::listing::ListedSlot;
use crate::models::deck::tag::DeckTag;

/// Fetch the collection a share link points at
#[get("/{token}")]
pub async fn get_shared_collection(
    Path(token): Path<String>,
) -> ApiResult<ApiJson<SharedCollectionResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let collection = resolve(&mut tx, &token).await?;
    let owner = Account::get_by_uuid(&mut tx, collection.owner)
        .await?
        .ok_or_else(unknown_link)?;

    tx.commit().await?;

    Ok(ApiJson(SharedCollectionResponse {
        name: collection.name,
        description: collection.description,
        owner: owner.username.as_str().to_string(),
        created_at: SchemaDateTime(collection.created_at),
    }))
}

/// List a page of a shared collection's cards, sorted and filtered
///
/// The listing the owner reads, minus what was paid, see [`redact_entry`].
#[get("/{token}/cards")]
pub async fn list_shared_collection_cards(
    Path(token): Path<String>,
    Query(query): Query<ListCardsQuery>,
) -> ApiResult<ApiJson<ListCardsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let collection = resolve(&mut tx, &token).await?;

    let limit = query.limit.clamp(1, MAX_LIMIT);
    let page = EntryPage::read(
        &mut tx,
        collection.uuid,
        &EntryQuery {
            sort: query.sort,
            descending: query.descending,
            limit,
            offset: query.offset,
            after: query.after,
            search: query.search,
            condition: query.condition,
            finish: query.finish,
            rarity: query.rarity,
            printing: query.printing,
        },
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(ListCardsResponse {
        entries: page
            .entries
            .into_iter()
            .map(ListedEntryResponse::from)
            .map(redact_entry)
            .collect(),
        total: page.total,
        total_copies: page.total_copies,
        limit,
        offset: query.offset,
        next_cursor: page.next_cursor,
    }))
}

/// Count a shared collection's statistics
///
/// Minus the purchase figures, see [`redact_statistics`].
#[get("/{token}/statistics")]
pub async fn get_shared_collection_statistics(
    Path(token): Path<String>,
) -> ApiResult<ApiJson<CollectionStatisticsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let collection = resolve(&mut tx, &token).await?;
    let statistics = CollectionStatistics::compute(&mut tx, collection.uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(redact_statistics(
        CollectionStatisticsResponse::from(statistics),
    )))
}

/// Fetch the deck a share link points at
#[get("/{token}")]
pub async fn get_shared_deck(Path(token): Path<String>) -> ApiResult<ApiJson<SharedDeckResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let deck = resolve_deck(&mut tx, &token).await?;
    let owner = Account::get_by_uuid(&mut tx, deck.owner)
        .await?
        .ok_or_else(unknown_link)?;

    tx.commit().await?;

    Ok(ApiJson(SharedDeckResponse {
        name: deck.name,
        description: deck.description,
        format: deck.format,
        allowed_color_identity: deck.allowed_color_identity,
        owner: owner.username.as_str().to_string(),
        created_at: SchemaDateTime(deck.created_at),
    }))
}

/// Every card of a shared deck, with the catalog data and the tags on it
///
/// The listing the owner reads, minus the proxy flags, see [`redact_slot`].
#[get("/{token}/cards")]
pub async fn list_shared_deck_cards(
    Path(token): Path<String>,
) -> ApiResult<ApiJson<ListDeckCardsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let deck = resolve_deck(&mut tx, &token).await?;

    let cards = ListedSlot::read_deck(&mut tx, deck.uuid)
        .await?
        .into_iter()
        .map(DeckCardResponse::from)
        .map(redact_slot)
        .collect();
    // The owner's tags, so the reader can group by them as the owner does.
    let tags = DeckTag::get_usable(&mut tx, deck.owner, deck.uuid)
        .await?
        .into_iter()
        .map(DeckTagResponse::from)
        .collect();

    tx.commit().await?;

    Ok(ApiJson(ListDeckCardsResponse { cards, tags }))
}

/// Resolve a share token into the deck it unlocks, see [`resolve`]
async fn resolve_deck(tx: &mut Transaction, token: &str) -> ApiResult<Deck> {
    let token = MaxStr::new(token.to_owned()).map_err(|_| unknown_link())?;
    Deck::get_by_share_token(tx, &token)
        .await?
        .ok_or_else(unknown_link)
}

/// Resolve a share token into the collection it unlocks
///
/// A token that is too long, unknown or left over on a collection that is not
/// [`Unlisted`](crate::models::visibility::Visibility::Unlisted) any more all
/// come back as the same error.
async fn resolve(tx: &mut Transaction, token: &str) -> ApiResult<Collection> {
    let token = MaxStr::new(token.to_owned()).map_err(|_| unknown_link())?;
    Collection::get_by_share_token(tx, &token)
        .await?
        .ok_or_else(unknown_link)
}

/// The one answer every unusable link gets
fn unknown_link() -> ApiError {
    ApiError::bad_request("Request was denied")
}
