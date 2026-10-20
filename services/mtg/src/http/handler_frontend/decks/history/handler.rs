use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;

use crate::http::handler_frontend::decks::handler::granted;
use crate::http::handler_frontend::decks::history::schema::DeckChangeResponse;
use crate::http::handler_frontend::decks::history::schema::DeckHistoryResponse;
use crate::http::handler_frontend::decks::history::schema::DeckPointResponse;
use crate::http::handler_frontend::decks::history::schema::DeckUndoResponse;
use crate::http::handler_frontend::decks::history::schema::GetDeckHistoryQuery;
use crate::http::handler_frontend::decks::history::schema::SetDeckCheckpointRequest;
use crate::models::account::Account;
use crate::models::deck::DeckUuid;
use crate::models::deck::history::DeckChangeUuid;
use crate::models::deck::history::DeckHistory;

/// The most Deck changes one page holds
const MAX_LIMIT: u32 = 100;

/// A deck's Deck history, newest first
///
/// Only the owner reads it, whoever else may see the deck itself.
#[get("/{deck}/history")]
pub async fn get_deck_history(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
    Query(query): Query<GetDeckHistoryQuery>,
) -> ApiResult<ApiJson<DeckHistoryResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(DeckHistory::lock_for_reading(&mut tx, deck_uuid, account.uuid).await?)?;
    let state = DeckHistory::undo_state(&mut tx, deck_uuid).await?;
    let page = DeckHistory::page(
        &mut tx,
        deck_uuid,
        query.after,
        query.limit.clamp(1, MAX_LIMIT),
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(DeckHistoryResponse {
        changes: page
            .changes
            .into_iter()
            .map(DeckChangeResponse::from)
            .collect(),
        next_cursor: page.next_cursor,
        undo: DeckUndoResponse::from(state),
    }))
}

/// Take back the latest Deck change that is not undone yet
///
/// Only the owner undoes. Refused when only the deck's first Deck change is left.
#[post("/{deck}/history/undo")]
pub async fn undo_deck_change(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
) -> ApiResult<ApiJson<DeckUndoResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let edit = granted(DeckHistory::lock(&mut tx, deck_uuid, account.uuid).await?)?;
    if !edit.undo(&mut tx).await? {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Nothing to undo"));
    }
    let state = DeckHistory::undo_state(&mut tx, deck_uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(DeckUndoResponse::from(state)))
}

/// Apply the latest undone Deck change again
///
/// Only the owner redoes. Refused when nothing is undone or a later Deck
/// change discarded the undo.
#[post("/{deck}/history/redo")]
pub async fn redo_deck_change(
    account: Account,
    Path(deck_uuid): Path<DeckUuid>,
) -> ApiResult<ApiJson<DeckUndoResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let edit = granted(DeckHistory::lock(&mut tx, deck_uuid, account.uuid).await?)?;
    if !edit.redo(&mut tx).await? {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Nothing to redo"));
    }
    let state = DeckHistory::undo_state(&mut tx, deck_uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(DeckUndoResponse::from(state)))
}

/// The deck as it was right after one of its Deck changes, read-only
///
/// Only the owner reads it. Computed backwards from the deck as it is now.
#[get("/{deck}/history/{change}")]
pub async fn get_deck_point(
    account: Account,
    Path((deck_uuid, change)): Path<(DeckUuid, DeckChangeUuid)>,
) -> ApiResult<ApiJson<DeckPointResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(DeckHistory::lock_for_reading(&mut tx, deck_uuid, account.uuid).await?)?;
    let point = DeckHistory::point(&mut tx, deck_uuid, change).await?;

    tx.commit().await?;

    let point = point.ok_or_else(|| ApiError::bad_request("No such Deck change"))?;
    Ok(ApiJson(DeckPointResponse::from(point)))
}

/// Bring the deck back to how it was right after one of its Deck changes
///
/// Only the owner resets. Recorded as one Deck change of its own, which can be
/// undone; the Deck changes since stay in the Deck history.
#[post("/{deck}/history/{change}/reset")]
pub async fn reset_deck(
    account: Account,
    Path((deck_uuid, change)): Path<(DeckUuid, DeckChangeUuid)>,
) -> ApiResult<ApiJson<DeckUndoResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let edit = granted(DeckHistory::lock(&mut tx, deck_uuid, account.uuid).await?)?;
    if !edit.reset(&mut tx, change).await? {
        tx.rollback().await?;
        return Err(ApiError::bad_request("No such Deck change"));
    }
    let state = DeckHistory::undo_state(&mut tx, deck_uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(DeckUndoResponse::from(state)))
}

/// Name one of the deck's Deck changes with a Deck checkpoint, or rename its
/// Deck checkpoint
///
/// Only the owner names. A Deck change carries at most one Deck checkpoint,
/// so naming a named one renames it.
#[put("/{deck}/history/{change}/checkpoint")]
pub async fn set_deck_checkpoint(
    account: Account,
    Path((deck_uuid, change)): Path<(DeckUuid, DeckChangeUuid)>,
    ApiJson(request): ApiJson<SetDeckCheckpointRequest>,
) -> ApiResult<ApiJson<()>> {
    let name = request.name.trim();
    if name.is_empty() {
        return Err(ApiError::bad_request("A Deck checkpoint needs a name"));
    }
    let name = MaxStr::new(name.to_owned())
        .map_err(|_| ApiError::bad_request("A Deck checkpoint name is too long"))?;

    let mut tx = Database::global().start_transaction().await?;

    let edit = granted(DeckHistory::lock(&mut tx, deck_uuid, account.uuid).await?)?;
    if !edit.name_checkpoint(&mut tx, change, Some(name)).await? {
        tx.rollback().await?;
        return Err(ApiError::bad_request("No such Deck change"));
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Remove the Deck checkpoint of one of the deck's Deck changes
///
/// Only the owner removes. A Deck change without one stays as it is.
#[delete("/{deck}/history/{change}/checkpoint")]
pub async fn remove_deck_checkpoint(
    account: Account,
    Path((deck_uuid, change)): Path<(DeckUuid, DeckChangeUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    let edit = granted(DeckHistory::lock(&mut tx, deck_uuid, account.uuid).await?)?;
    if !edit.name_checkpoint(&mut tx, change, None).await? {
        tx.rollback().await?;
        return Err(ApiError::bad_request("No such Deck change"));
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}
