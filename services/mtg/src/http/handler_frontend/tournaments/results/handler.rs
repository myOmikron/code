use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::post;
use galvyn::rorm::Database;
use tracing::info;

use crate::http::handler_frontend::tournaments::handler::denied;
use crate::http::handler_frontend::tournaments::live::TournamentEvent;
use crate::http::handler_frontend::tournaments::live::emit;
use crate::http::handler_frontend::tournaments::results::schema::DisputeResultErrors;
use crate::http::handler_frontend::tournaments::results::schema::ReportResultErrors;
use crate::http::handler_frontend::tournaments::results::schema::ReportResultRequest;
use crate::models::account::Account;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::result::DisputeResultRefusal;
use crate::models::tournament::result::ReportResultRefusal;
use crate::models::tournament::result::ResultChange;
use crate::models::tournament::result::ResultChangeKind;
use crate::models::tournament::round::MatchUuid;
use crate::tournament::reporting::DisputeRefusal;
use crate::tournament::reporting::ReportRefusal;

/// Report the Result of one's own Match, as its Participant
///
/// It counts at once. The reporter may correct it while the Round runs;
/// another Participant who disagrees disputes it instead. A locked Account
/// cannot report: an Organizer sets its Result.
#[post("/{tournament}/matches/{match}/report")]
pub async fn report_tournament_match_result(
    account: Account,
    Path((tournament, played)): Path<(TournamentUuid, MatchUuid)>,
    ApiJson(request): ApiJson<ReportResultRequest>,
) -> ApiResult<ApiJson<()>, ReportResultErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) =
        Tournament::get_visible_for_update(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let Some(participant) = tournament.participant_of(&mut tx, account.uuid).await? else {
        tx.rollback().await?;
        return Err(no_such_match());
    };
    let outcome = tournament
        .report_result(
            &mut tx,
            played,
            participant,
            &request.games_won,
            request.games_drawn,
        )
        .await?;
    let change = match outcome {
        Ok(change) => change,
        Err(refusal) => {
            tx.rollback().await?;
            let mut errors = FormErrors::<ReportResultErrors>::new();
            match refusal {
                ReportResultRefusal::NoSuchMatch
                | ReportResultRefusal::Refused(ReportRefusal::NotInMatch) => {
                    return Err(no_such_match());
                }
                ReportResultRefusal::EnteredAfterwards => errors.entered_afterwards = true,
                ReportResultRefusal::NotRunning => errors.not_running = true,
                ReportResultRefusal::InvalidScore => errors.invalid_score = true,
                ReportResultRefusal::Refused(ReportRefusal::ReportedByOther) => {
                    errors.reported_by_other = true;
                }
                ReportResultRefusal::Refused(ReportRefusal::Disputed) => errors.disputed = true,
                ReportResultRefusal::Refused(ReportRefusal::Confirmed) => errors.confirmed = true,
            }
            return errors.fail();
        }
    };

    tx.commit().await?;

    if let Some(change) = change {
        announce(&tournament, &change);
    }
    Ok(ApiJson(()))
}

/// Dispute the Result another Participant reported for one's own Match
///
/// Possible while the Round runs. The Round cannot end until an Organizer
/// settles the Result. A locked Account cannot dispute.
#[post("/{tournament}/matches/{match}/dispute")]
pub async fn dispute_tournament_match_result(
    account: Account,
    Path((tournament, played)): Path<(TournamentUuid, MatchUuid)>,
) -> ApiResult<ApiJson<()>, DisputeResultErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) =
        Tournament::get_visible_for_update(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let Some(participant) = tournament.participant_of(&mut tx, account.uuid).await? else {
        tx.rollback().await?;
        return Err(no_such_match());
    };
    let change = match tournament
        .dispute_result(&mut tx, played, participant)
        .await?
    {
        Ok(change) => change,
        Err(refusal) => {
            tx.rollback().await?;
            let mut errors = FormErrors::<DisputeResultErrors>::new();
            match refusal {
                DisputeResultRefusal::NoSuchMatch
                | DisputeResultRefusal::Refused(DisputeRefusal::NotInMatch) => {
                    return Err(no_such_match());
                }
                DisputeResultRefusal::EnteredAfterwards => errors.entered_afterwards = true,
                DisputeResultRefusal::NotRunning => errors.not_running = true,
                DisputeResultRefusal::Refused(DisputeRefusal::NoResult) => errors.no_result = true,
                DisputeResultRefusal::Refused(DisputeRefusal::OwnReport) => {
                    errors.own_report = true;
                }
                DisputeResultRefusal::Refused(DisputeRefusal::Confirmed) => {
                    errors.confirmed = true;
                }
            }
            return errors.fail();
        }
    };

    tx.commit().await?;

    if let Some(change) = change {
        announce(&tournament, &change);
        tournament.push_result_disputed(&change).await;
    }
    Ok(ApiJson(()))
}

/// Tell whoever follows `tournament` that a Result was reported, disputed or set
///
/// Called once the change is committed, from every route that changes a
/// Result. Logs it and hands it to the live updates. The dispute route
/// pushes beside it ([`Tournament::push_result_disputed`]), which skips a
/// Tournament entered afterwards; live updates do not need to.
pub fn announce(tournament: &Tournament, change: &ResultChange) {
    info!(
        tournament = ?tournament.uuid,
        round = change.round,
        played = ?change.played,
        kind = ?change.kind,
        by = ?change.by,
        "Result changed"
    );
    let (round, match_uuid) = (change.round, change.played);
    emit(
        tournament.uuid,
        match change.kind {
            ResultChangeKind::Reported => TournamentEvent::ResultReported { round, match_uuid },
            ResultChangeKind::Disputed => TournamentEvent::ResultDisputed { round, match_uuid },
            ResultChangeKind::Set => TournamentEvent::ResultSet { round, match_uuid },
        },
    );
    emit(tournament.uuid, TournamentEvent::StandingsChanged);
}

/// The refusal for a Match that is not the Account's own
fn no_such_match<T>() -> ApiError<T> {
    ApiError::bad_request("No such match")
}
