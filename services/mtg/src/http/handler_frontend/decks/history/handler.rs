use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use galvyn::rorm::Database;

use crate::http::handler_frontend::decks::handler::granted;
use crate::http::handler_frontend::decks::history::schema::DeckChangeResponse;
use crate::http::handler_frontend::decks::history::schema::DeckHistoryResponse;
use crate::http::handler_frontend::decks::history::schema::GetDeckHistoryQuery;
use crate::models::account::Account;
use crate::models::deck::Deck;
use crate::models::deck::DeckUuid;
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

    granted(Deck::may_administer(&mut tx, deck_uuid, account.uuid).await?)?;
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
    }))
}
