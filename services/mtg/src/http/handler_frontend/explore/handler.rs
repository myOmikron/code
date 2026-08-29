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

use crate::http::handler_frontend::collections::schema::CollectionStatisticsResponse;
use crate::http::handler_frontend::collections::schema::ListCardsQuery;
use crate::http::handler_frontend::collections::schema::ListCardsResponse;
use crate::http::handler_frontend::collections::schema::ListedEntryResponse;
use crate::http::handler_frontend::decks::schema::DeckCardResponse;
use crate::http::handler_frontend::decks::schema::DeckTagResponse;
use crate::http::handler_frontend::decks::schema::ListDeckCardsResponse;
use crate::http::handler_frontend::explore::schema::PublicCollectionResponse;
use crate::http::handler_frontend::explore::schema::PublicDeckResponse;
use crate::http::handler_frontend::explore::schema::PublicProfileResponse;
use crate::http::handler_frontend::explore::schema::SearchPublicDecksQuery;
use crate::http::handler_frontend::explore::schema::SearchPublicDecksResponse;
use crate::http::handler_frontend::shared::schema::redact_entry;
use crate::http::handler_frontend::shared::schema::redact_statistics;
use crate::models::account::Account;
use crate::models::account::Username;
use crate::models::collection::Collection;
use crate::models::collection::CollectionUuid;
use crate::models::collection::listing::CollectionSummary;
use crate::models::collection::listing::EntryPage;
use crate::models::collection::listing::EntryQuery;
use crate::models::collection::listing::MAX_LIMIT;
use crate::models::collection::statistics::CollectionStatistics;
use crate::models::deck::Deck;
use crate::models::deck::DeckUuid;
use crate::models::deck::discovery::MAX_LIMIT as MAX_DECK_LIMIT;
use crate::models::deck::discovery::PublicDeckPage;
use crate::models::deck::discovery::PublicDeckQuery;
use crate::models::deck::listing::ListedSlot;
use crate::models::deck::tag::DeckTag;
use crate::models::visibility::Visibility;

/// How many decks a profile page leads with
const PROFILE_DECKS: u32 = MAX_DECK_LIMIT;

/// Search the decks their owners put on show
///
/// By what a deck or its commander is called, by format, or by who built it. Only decks at
/// [`Visibility::Public`] are ever found here — an unlisted deck stays behind
/// its share link.
#[get("/decks")]
pub async fn search_public_decks(
    Query(query): Query<SearchPublicDecksQuery>,
) -> ApiResult<ApiJson<SearchPublicDecksResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let limit = query.limit.clamp(1, MAX_DECK_LIMIT);
    let page = PublicDeckPage::read(
        &mut tx,
        &PublicDeckQuery {
            deck: None,
            search: non_empty(query.search),
            format: non_empty(query.format),
            // The column holds the lowercased spelling, so the filter has to
            // arrive in that spelling too.
            owner: non_empty(query.owner).map(|owner| owner.to_lowercase()),
            sort: query.sort,
            descending: query.descending,
            limit,
            offset: query.offset,
        },
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(SearchPublicDecksResponse {
        decks: page
            .decks
            .into_iter()
            .map(PublicDeckResponse::from)
            .collect(),
        total: page.total,
        limit,
        offset: query.offset,
    }))
}

/// Fetch one deck its owner put on show
#[get("/decks/{deck}")]
pub async fn get_public_deck(
    Path(deck_uuid): Path<DeckUuid>,
) -> ApiResult<ApiJson<PublicDeckResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let deck = public_deck(&mut tx, deck_uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(PublicDeckResponse::from(deck)))
}

/// Every card of a public deck, with the catalog data and the tags on it
///
/// The same answer the owner reads, for the same reason as a shared deck's: a
/// deck has no prices paid, so nothing here has to be held back.
#[get("/decks/{deck}/cards")]
pub async fn list_public_deck_cards(
    Path(deck_uuid): Path<DeckUuid>,
) -> ApiResult<ApiJson<ListDeckCardsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let deck = visible_deck(&mut tx, deck_uuid).await?;
    let cards = ListedSlot::read_deck(&mut tx, deck.uuid)
        .await?
        .into_iter()
        .map(DeckCardResponse::from)
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

/// Fetch an account's public profile: what it put on show
#[get("/profiles/{username}")]
pub async fn get_public_profile(
    Path(username): Path<String>,
) -> ApiResult<ApiJson<PublicProfileResponse>> {
    let username = Username::new(username).map_err(|_| unknown_profile())?;

    let mut tx = Database::global().start_transaction().await?;

    let account = Account::get_by_username(&mut tx, &username)
        .await?
        .ok_or_else(unknown_profile)?;

    let decks =
        PublicDeckPage::read_for_account(&mut tx, &username.normalized(), PROFILE_DECKS).await?;

    let collections: Vec<Collection> = Collection::get_all_for_account(&mut tx, account.uuid)
        .await?
        .into_iter()
        .filter(|collection| collection.visibility == Visibility::Public)
        .collect();
    // Counted for the whole account in one read, then narrowed to the public
    // ones: the summary is two statements either way, and reading it per
    // collection would be two per tile.
    let mut summaries = if collections.is_empty() {
        Default::default()
    } else {
        CollectionSummary::read_for_account(&mut tx, account.uuid).await?
    };

    tx.commit().await?;

    let owner = account.username.as_str().to_string();
    Ok(ApiJson(PublicProfileResponse {
        username: owner.clone(),
        created_at: SchemaDateTime(account.created_at),
        decks: decks.into_iter().map(PublicDeckResponse::from).collect(),
        collections: collections
            .into_iter()
            .map(|collection| {
                let summary = summaries.remove(&collection.uuid);
                PublicCollectionResponse::new(collection, owner.clone(), summary)
            })
            .collect(),
    }))
}

/// Fetch one collection its owner put on show
#[get("/collections/{collection}")]
pub async fn get_public_collection(
    Path(collection_uuid): Path<CollectionUuid>,
) -> ApiResult<ApiJson<PublicCollectionResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let collection = visible_collection(&mut tx, collection_uuid).await?;
    let owner = Account::get_by_uuid(&mut tx, collection.owner)
        .await?
        .ok_or_else(unknown_profile)?;
    let mut summaries = CollectionSummary::read_for_account(&mut tx, collection.owner).await?;
    let summary = summaries.remove(&collection.uuid);

    tx.commit().await?;

    Ok(ApiJson(PublicCollectionResponse::new(
        collection,
        owner.username.as_str().to_string(),
        summary,
    )))
}

/// List a page of a public collection's cards, sorted and filtered
///
/// The listing the owner reads, minus what was paid, see [`redact_entry`].
#[get("/collections/{collection}/cards")]
pub async fn list_public_collection_cards(
    Path(collection_uuid): Path<CollectionUuid>,
    Query(query): Query<ListCardsQuery>,
) -> ApiResult<ApiJson<ListCardsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let collection = visible_collection(&mut tx, collection_uuid).await?;

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

/// Count a public collection's statistics
///
/// Minus the purchase figures, see [`redact_statistics`].
#[get("/collections/{collection}/statistics")]
pub async fn get_public_collection_statistics(
    Path(collection_uuid): Path<CollectionUuid>,
) -> ApiResult<ApiJson<CollectionStatisticsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let collection = visible_collection(&mut tx, collection_uuid).await?;
    let statistics = CollectionStatistics::compute(&mut tx, collection.uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(redact_statistics(
        CollectionStatisticsResponse::from(statistics),
    )))
}

/// Resolve a deck a stranger may read, with what a list shows of it
async fn public_deck(
    tx: &mut Transaction,
    deck: DeckUuid,
) -> ApiResult<crate::models::deck::discovery::PublicDeck> {
    PublicDeckPage::read_one(tx, deck)
        .await?
        .ok_or_else(unknown_deck)
}

/// Resolve a deck a stranger may read
///
/// No viewer is passed on purpose: this is the anonymous half of the api, and
/// an owner reads their own deck through the endpoints that know them.
async fn visible_deck(tx: &mut Transaction, deck: DeckUuid) -> ApiResult<Deck> {
    Deck::get_visible(tx, deck, None)
        .await?
        .ok_or_else(unknown_deck)
}

/// Resolve a collection a stranger may read, see [`visible_deck`]
async fn visible_collection(
    tx: &mut Transaction,
    collection: CollectionUuid,
) -> ApiResult<Collection> {
    Collection::get_visible(tx, collection, None)
        .await?
        .ok_or_else(unknown_deck)
}

/// Drops an empty filter, which is what a cleared search field sends
fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.trim().is_empty())
}

/// The one answer everything not on show gets
fn unknown_deck() -> ApiError {
    ApiError::bad_request("Request was denied")
}

/// The one answer every profile that cannot be read gets
fn unknown_profile() -> ApiError {
    ApiError::bad_request("Request was denied")
}
