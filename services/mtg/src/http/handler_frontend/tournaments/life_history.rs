//! Authorized durable Match Life history, independent of Result reporting.

use galvyn::core::GalvynRouter;
use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::DefaultBodyLimit;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;

use super::handler::denied;
use crate::models::account::Account;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::access::TournamentAccess;
use crate::models::tournament::access::TournamentGrant;
use crate::models::tournament::life_history;
use crate::models::tournament::life_history::ClaimMatchLifeRequest;
use crate::models::tournament::life_history::MatchLifeErrors;
use crate::models::tournament::life_history::MatchLifeHistoryResponse;
use crate::models::tournament::life_history::SaveMatchLifeRequest;
use crate::models::tournament::round::MatchUuid;

/// History routes in the authenticated Organizer-or-Participant group.
pub fn routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(get_match_life_history)
        .handler(claim_match_life_history)
        .handler(save_match_life_history)
        .layer(DefaultBodyLimit::max(4 * 1024 * 1024))
}

/// Observe uploaded history without claiming the recording device.
#[get("/{tournament}/matches/{match}/life-history")]
pub async fn get_match_life_history(
    grant: TournamentGrant,
    Path((_, played)): Path<(TournamentUuid, MatchUuid)>,
) -> ApiResult<ApiJson<MatchLifeHistoryResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let context = grant.match_play(&mut tx, played).await?;
    if context.is_none() {
        tx.commit().await?;
        return Err(denied());
    }
    let state = life_history::read(&mut tx, played.into_inner()).await?;
    tx.commit().await?;
    Ok(ApiJson(state))
}

async fn fresh_grant(
    tx: &mut Transaction,
    original: &TournamentGrant,
    account: &Account,
) -> ApiResult<TournamentGrant, MatchLifeErrors> {
    original
        .tournament
        .lock_for_update(tx)
        .await?
        .ok_or_else(denied)?;
    Tournament::get_granted(
        tx,
        original.tournament.uuid,
        Some(account.uuid),
        TournamentAccess::MatchHistory,
    )
    .await?
    .ok_or_else(denied)
}

fn accepted(
    result: Result<MatchLifeHistoryResponse, MatchLifeErrors>,
) -> ApiResult<ApiJson<MatchLifeHistoryResponse>, MatchLifeErrors> {
    match result {
        Ok(response) => Ok(ApiJson(response)),
        Err(refusal) => {
            let mut errors = FormErrors::<MatchLifeErrors>::new();
            errors.writer_conflict = refusal.writer_conflict;
            errors.revision_conflict = refusal.revision_conflict;
            errors.request_conflict = refusal.request_conflict;
            errors.invalid_history = refusal.invalid_history;
            errors.fail()
        }
    }
}

/// Deliberately claim a recording slot with a private, device-local capability.
#[post("/{tournament}/matches/{match}/life-history/claim")]
pub async fn claim_match_life_history(
    account: Account,
    grant: TournamentGrant,
    Path((_, played)): Path<(TournamentUuid, MatchUuid)>,
    ApiJson(request): ApiJson<ClaimMatchLifeRequest>,
) -> ApiResult<ApiJson<MatchLifeHistoryResponse>, MatchLifeErrors> {
    let mut tx = Database::global().start_transaction().await?;
    let fresh = fresh_grant(&mut tx, &grant, &account).await?;
    if fresh.match_play(&mut tx, played).await?.is_none() {
        tx.rollback().await?;
        return Err(denied());
    }
    let result = life_history::claim(&mut tx, played.into_inner(), account.uuid, request).await?;
    if result.is_ok() {
        tx.commit().await?;
    } else {
        tx.rollback().await?;
    }
    accepted(result)
}

/// Upload history using only the active recording Account, device and private capability.
#[put("/{tournament}/matches/{match}/life-history")]
pub async fn save_match_life_history(
    account: Account,
    grant: TournamentGrant,
    Path((_, played)): Path<(TournamentUuid, MatchUuid)>,
    ApiJson(request): ApiJson<SaveMatchLifeRequest>,
) -> ApiResult<ApiJson<MatchLifeHistoryResponse>, MatchLifeErrors> {
    let mut tx = Database::global().start_transaction().await?;
    let fresh = fresh_grant(&mut tx, &grant, &account).await?;
    let Some(context) = fresh.match_play(&mut tx, played).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    let result = life_history::save(&mut tx, &context, account.uuid, request).await?;
    if result.is_ok() {
        tx.commit().await?;
    } else {
        tx.rollback().await?;
    }
    accepted(result)
}
