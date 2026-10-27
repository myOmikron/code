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

use super::super::handler::denied;
use super::schema::CaptureMatchLifeConflictRequest;
use super::schema::CapturedMatchLifeConflict;
use super::schema::ClaimMatchLifeRequest;
use super::schema::MatchLifeConflict;
use super::schema::MatchLifeConflicts;
use super::schema::MatchLifeErrors;
use super::schema::MatchLifeHistoryResponse;
use super::schema::SaveMatchLifeRequest;
use crate::models::account::Account;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::access::TournamentGrant;
use crate::models::tournament::life_history;
use crate::models::tournament::round::MatchUuid;

/// History routes in the authenticated Organizer-or-Participant group.
pub fn routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(get_match_life_history)
        .handler(claim_match_life_history)
        .handler(save_match_life_history)
        .handler(release_match_life_history)
        .handler(takeover_match_life_history)
        .handler(list_match_life_conflicts)
        .handler(get_match_life_conflict)
        .handler(capture_match_life_conflict)
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
    Ok(ApiJson(state.into()))
}

async fn locked_grant(
    tx: &mut Transaction,
    original: &TournamentGrant,
) -> ApiResult<TournamentGrant, MatchLifeErrors> {
    let tournament = original
        .tournament
        .lock_for_update(tx)
        .await?
        .ok_or_else(denied)?;
    Ok(TournamentGrant {
        tournament,
        ..original.clone()
    })
}

fn accepted(
    result: Result<life_history::RecordingState, life_history::RecordingRefusal>,
) -> ApiResult<ApiJson<MatchLifeHistoryResponse>, MatchLifeErrors> {
    match result {
        Ok(response) => Ok(ApiJson(response.into())),
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
    let fresh = locked_grant(&mut tx, &grant).await?;
    if fresh.match_play(&mut tx, played).await?.is_none() {
        tx.rollback().await?;
        return Err(denied());
    }
    let result =
        life_history::claim(&mut tx, played.into_inner(), account.uuid, request.into()).await?;
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
    let fresh = locked_grant(&mut tx, &grant).await?;
    let Some(context) = fresh.match_play(&mut tx, played).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    let result = life_history::save(&mut tx, &context, account.uuid, request.into()).await?;
    if result.is_ok() {
        tx.commit().await?;
    } else {
        tx.rollback().await?;
    }
    accepted(result)
}

/// Release a synchronized recording slot without deleting its history.
#[post("/{tournament}/matches/{match}/life-history/release")]
pub async fn release_match_life_history(
    account: Account,
    grant: TournamentGrant,
    Path((_, played)): Path<(TournamentUuid, MatchUuid)>,
    ApiJson(request): ApiJson<ClaimMatchLifeRequest>,
) -> ApiResult<ApiJson<MatchLifeHistoryResponse>, MatchLifeErrors> {
    transfer(account, grant, played, request, true).await
}

/// Explicitly take over the confirmed latest saved state while online.
#[post("/{tournament}/matches/{match}/life-history/takeover")]
pub async fn takeover_match_life_history(
    account: Account,
    grant: TournamentGrant,
    Path((_, played)): Path<(TournamentUuid, MatchUuid)>,
    ApiJson(request): ApiJson<ClaimMatchLifeRequest>,
) -> ApiResult<ApiJson<MatchLifeHistoryResponse>, MatchLifeErrors> {
    transfer(account, grant, played, request, false).await
}

async fn transfer(
    account: Account,
    grant: TournamentGrant,
    played: MatchUuid,
    request: ClaimMatchLifeRequest,
    release: bool,
) -> ApiResult<ApiJson<MatchLifeHistoryResponse>, MatchLifeErrors> {
    let mut tx = Database::global().start_transaction().await?;
    let fresh = locked_grant(&mut tx, &grant).await?;
    if fresh.match_play(&mut tx, played).await?.is_none() {
        tx.rollback().await?;
        return Err(denied());
    }
    let result = life_history::transfer(
        &mut tx,
        played.into_inner(),
        account.uuid,
        request.into(),
        release,
    )
    .await?;
    if result.is_ok() {
        tx.commit().await?;
    } else {
        tx.rollback().await?;
    }
    accepted(result)
}

/// Lists recovered branches only for this Match's authorized audience.
#[get("/{tournament}/matches/{match}/life-history/conflicts")]
pub async fn list_match_life_conflicts(
    grant: TournamentGrant,
    Path((_, played)): Path<(TournamentUuid, MatchUuid)>,
) -> ApiResult<ApiJson<MatchLifeConflicts>> {
    let mut tx = Database::global().start_transaction().await?;
    if grant.match_play(&mut tx, played).await?.is_none() {
        tx.commit().await?;
        return Err(denied());
    }
    let result = life_history::conflicts(&mut tx, played.into_inner()).await?;
    tx.commit().await?;
    Ok(ApiJson(result.into()))
}

/// Reads one recovered branch without applying it to the Match.
#[get("/{tournament}/matches/{match}/life-history/conflicts/{conflict}")]
pub async fn get_match_life_conflict(
    grant: TournamentGrant,
    Path((_, played, conflict)): Path<(TournamentUuid, MatchUuid, uuid::Uuid)>,
) -> ApiResult<ApiJson<MatchLifeConflict>> {
    let mut tx = Database::global().start_transaction().await?;
    if grant.match_play(&mut tx, played).await?.is_none() {
        tx.commit().await?;
        return Err(denied());
    }
    let result = life_history::conflict(&mut tx, played.into_inner(), conflict).await?;
    tx.commit().await?;
    Ok(ApiJson(result.ok_or_else(denied)?.into()))
}

/// Preserves all recovered old-device changes as an independent authorized artifact.
#[post("/{tournament}/matches/{match}/life-history/conflicts")]
pub async fn capture_match_life_conflict(
    account: Account,
    grant: TournamentGrant,
    Path((_, played)): Path<(TournamentUuid, MatchUuid)>,
    ApiJson(request): ApiJson<CaptureMatchLifeConflictRequest>,
) -> ApiResult<ApiJson<CapturedMatchLifeConflict>, MatchLifeErrors> {
    let mut tx = Database::global().start_transaction().await?;
    let fresh = locked_grant(&mut tx, &grant).await?;
    let Some(context) = fresh.match_play(&mut tx, played).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    let result =
        life_history::capture_conflict(&mut tx, &context, account.uuid, request.into()).await?;
    match result {
        Ok(result) => {
            tx.commit().await?;
            Ok(ApiJson(result.into()))
        }
        Err(error) => {
            tx.rollback().await?;
            let mut errors = FormErrors::<MatchLifeErrors>::new();
            errors.writer_conflict = error.writer_conflict;
            errors.request_conflict = error.request_conflict;
            errors.invalid_history = error.invalid_history;
            errors.revision_conflict = error.revision_conflict;
            errors.fail()
        }
    }
}
