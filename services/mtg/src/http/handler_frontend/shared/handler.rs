use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::get;
use galvyn::post;
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
use crate::http::handler_frontend::tournaments::decks;
use crate::http::handler_frontend::tournaments::decks::schema::RegisteredListsResponse;
use crate::http::handler_frontend::tournaments::live;
use crate::http::handler_frontend::tournaments::live::schema::EventStream;
use crate::http::handler_frontend::tournaments::participants;
use crate::http::handler_frontend::tournaments::participants::handler::RosterChange;
use crate::http::handler_frontend::tournaments::participants::schema::ListParticipantsResponse;
use crate::http::handler_frontend::tournaments::participants::schema::ParticipantResponse;
use crate::http::handler_frontend::tournaments::participants::schema::SignUpErrors;
use crate::http::handler_frontend::tournaments::rounds;
use crate::http::handler_frontend::tournaments::rounds::schema::RoundsResponse;
use crate::http::handler_frontend::tournaments::rounds::schema::StandingsResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentResponse;
use crate::models::account::Account;
use crate::models::account::extractor::Viewer;
use crate::models::collection::Collection;
use crate::models::collection::listing::EntryPage;
use crate::models::collection::listing::EntryQuery;
use crate::models::collection::listing::MAX_LIMIT;
use crate::models::collection::statistics::CollectionStatistics;
use crate::models::deck::Deck;
use crate::models::deck::listing::ListedSlot;
use crate::models::deck::tag::DeckTag;
use crate::models::tournament::Tournament;
use crate::models::tournament::registered_deck::ListReader;

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

/// Fetch the Tournament a share link points at
///
/// As anybody without a part in running it sees it: the link is the
/// authorization, not the reader, so even an Organizer gets no share link back.
#[get("/{token}")]
pub async fn get_shared_tournament(
    Path(token): Path<String>,
) -> ApiResult<ApiJson<TournamentResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let token = MaxStr::new(token).map_err(|_| unknown_link())?;
    let tournament = Tournament::get_by_share_token(&mut tx, &token)
        .await?
        .ok_or_else(unknown_link)?;
    let owner = tournament.owner_name(&mut tx).await?;

    tx.commit().await?;

    Ok(ApiJson(TournamentResponse::new(tournament, owner, None)))
}

/// The Participants of the Tournament a share link points at
///
/// Says which of them is the reader, if any.
#[get("/{token}/participants")]
pub async fn list_shared_tournament_participants(
    viewer: Viewer,
    Path(token): Path<String>,
) -> ApiResult<ApiJson<ListParticipantsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let token = MaxStr::new(token).map_err(|_| unknown_link())?;
    let Some(tournament) = Tournament::get_by_share_token(&mut tx, &token).await? else {
        tx.rollback().await?;
        return Err(unknown_link());
    };
    let response = participants::handler::list(&mut tx, &tournament, viewer).await?;

    tx.commit().await?;

    Ok(ApiJson(response))
}

/// Sign the logged-in Account up for the Tournament a share link points at
///
/// The way into an unlisted Tournament; refused like `sign_up_for_tournament`.
#[post("/{token}/sign-up")]
pub async fn sign_up_for_shared_tournament(
    account: Account,
    Path(token): Path<String>,
) -> ApiResult<ApiJson<ParticipantResponse>, SignUpErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let token = MaxStr::new(token).map_err(|_| unknown_link())?;
    let Some(tournament) = Tournament::get_by_share_token(&mut tx, &token).await? else {
        tx.rollback().await?;
        return Err(unknown_link());
    };
    let change = RosterChange::begin(&mut tx, &tournament).await?;
    let response = participants::handler::sign_up(&mut tx, &tournament, &account).await;
    change.finish(tx, &tournament, response).await
}

/// The Rounds of the Tournament a share link points at
///
/// Never a previewed one: the link shows what anybody sees.
#[get("/{token}/rounds")]
pub async fn list_shared_tournament_rounds(
    Path(token): Path<String>,
) -> ApiResult<ApiJson<RoundsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let token = MaxStr::new(token).map_err(|_| unknown_link())?;
    let Some(tournament) = Tournament::get_by_share_token(&mut tx, &token).await? else {
        tx.rollback().await?;
        return Err(unknown_link());
    };
    let response = rounds::handler::rounds_view(&mut tx, &tournament, false).await?;

    tx.commit().await?;

    Ok(ApiJson(response))
}

/// The standings of the Tournament a share link points at
#[get("/{token}/standings")]
pub async fn get_shared_tournament_standings(
    Path(token): Path<String>,
) -> ApiResult<ApiJson<StandingsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let token = MaxStr::new(token).map_err(|_| unknown_link())?;
    let Some(tournament) = Tournament::get_by_share_token(&mut tx, &token).await? else {
        tx.rollback().await?;
        return Err(unknown_link());
    };
    let response = rounds::handler::standings_view(&mut tx, &tournament).await?;

    tx.commit().await?;

    Ok(ApiJson(response))
}

/// The shared lists of the Tournament a share link points at, once it is Finished
///
/// None before; a link never reads as an Organizer.
#[get("/{token}/registered-lists")]
pub async fn list_shared_tournament_registered_lists(
    Path(token): Path<String>,
) -> ApiResult<ApiJson<RegisteredListsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let token = MaxStr::new(token).map_err(|_| unknown_link())?;
    let Some(tournament) = Tournament::get_by_share_token(&mut tx, &token).await? else {
        tx.rollback().await?;
        return Err(unknown_link());
    };
    let response =
        decks::handler::registered_lists_view(&mut tx, &tournament, ListReader::Other).await?;

    tx.commit().await?;

    Ok(ApiJson(response))
}

/// Follow what changes in the Tournament a share link points at, as Server-Sent Events
///
/// What anybody sees: never the previewed Round.
#[get("/{token}/events")]
pub async fn follow_shared_tournament(Path(token): Path<String>) -> ApiResult<EventStream> {
    let mut tx = Database::global().start_transaction().await?;

    let token = MaxStr::new(token).map_err(|_| unknown_link())?;
    let Some(tournament) = Tournament::get_by_share_token(&mut tx, &token).await? else {
        tx.rollback().await?;
        return Err(unknown_link());
    };

    tx.commit().await?;

    Ok(EventStream::new(live::hub::follow(tournament.uuid, false)))
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
fn unknown_link<E>() -> ApiError<E> {
    ApiError::bad_request("Request was denied")
}
