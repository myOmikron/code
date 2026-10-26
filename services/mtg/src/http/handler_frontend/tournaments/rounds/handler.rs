use std::collections::HashMap;

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;

use crate::http::handler_frontend::tournaments::handler::denied;
use crate::http::handler_frontend::tournaments::participants::schema::ParticipantResponse;
use crate::http::handler_frontend::tournaments::rounds::schema::MatchResponse;
use crate::http::handler_frontend::tournaments::rounds::schema::PairedRoundResponse;
use crate::http::handler_frontend::tournaments::rounds::schema::ResultResponse;
use crate::http::handler_frontend::tournaments::rounds::schema::RoundErrors;
use crate::http::handler_frontend::tournaments::rounds::schema::RoundResponse;
use crate::http::handler_frontend::tournaments::rounds::schema::RoundsResponse;
use crate::http::handler_frontend::tournaments::rounds::schema::SeatResponse;
use crate::http::handler_frontend::tournaments::rounds::schema::SetResultErrors;
use crate::http::handler_frontend::tournaments::rounds::schema::SetResultRequest;
use crate::http::handler_frontend::tournaments::rounds::schema::SetSwissRoundsErrors;
use crate::http::handler_frontend::tournaments::rounds::schema::SetSwissRoundsRequest;
use crate::http::handler_frontend::tournaments::rounds::schema::StandingResponse;
use crate::http::handler_frontend::tournaments::rounds::schema::StandingsResponse;
use crate::http::handler_frontend::tournaments::rounds::schema::TournamentStateResponse;
use crate::models::account::Account;
use crate::models::account::extractor::Viewer;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::round::MatchUuid;
use crate::models::tournament::round::ResultRefusal;
use crate::models::tournament::round::RoundState;
use crate::tournament::standings::Share;
use crate::tournament::standings::standings;

/// The Rounds of a Tournament the reader may see
///
/// A previewed Round only shows to the Tournament's Organizers.
#[get("/{tournament}/rounds")]
pub async fn list_tournament_rounds(
    viewer: Viewer,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<RoundsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_visible(&mut tx, tournament, viewer.account()).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let organizer = match viewer.account() {
        Some(account) => tournament.organizer_role(&mut tx, account).await?.is_some(),
        None => false,
    };
    let response = rounds_view(&mut tx, &tournament, organizer).await?;

    tx.commit().await?;

    Ok(ApiJson(response))
}

/// The standings of a Tournament: Match points from every Result so far
#[get("/{tournament}/standings")]
pub async fn get_tournament_standings(
    viewer: Viewer,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<StandingsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_visible(&mut tx, tournament, viewer.account()).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let response = standings_view(&mut tx, &tournament).await?;

    tx.commit().await?;

    Ok(ApiJson(response))
}

/// Pair the next Round as a preview, as an Organizer
///
/// Round 1 is paired at random, later Rounds by Match points without
/// rematches. Only Organizers see the preview until it starts. Refused while
/// another Round is previewed or running and once every Swiss Round was paired.
#[post("/{tournament}/rounds")]
pub async fn pair_tournament_round(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<PairedRoundResponse>, RoundErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) =
        Tournament::get_as_organizer_for_update(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let number = match tournament.pair_round(&mut tx).await? {
        Ok(number) => number,
        Err(refusal) => {
            tx.rollback().await?;
            return Err(ApiError::FormError(refusal.into()));
        }
    };

    tx.commit().await?;

    Ok(ApiJson(PairedRoundResponse { number }))
}

/// Throw a previewed Round away, as an Organizer, to pair it again
#[delete("/{tournament}/rounds/{number}")]
pub async fn discard_tournament_round(
    account: Account,
    Path((tournament, number)): Path<(TournamentUuid, i16)>,
) -> ApiResult<ApiJson<()>, RoundErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) =
        Tournament::get_as_organizer_for_update(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let previewed = tournament
        .rounds(&mut tx, true)
        .await?
        .iter()
        .any(|round| round.number == number && round.state == RoundState::Previewed);
    if !previewed {
        tx.rollback().await?;
        let mut errors = FormErrors::<RoundErrors>::new();
        errors.not_previewed = true;
        return errors.fail();
    }
    tournament.discard_preview(&mut tx).await?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Start a previewed Round, as an Organizer: from now on everybody sees it
///
/// Starting Round 1 closes Registration and settles the number of Swiss Rounds.
#[post("/{tournament}/rounds/{number}/start")]
pub async fn start_tournament_round(
    account: Account,
    Path((tournament, number)): Path<(TournamentUuid, i16)>,
) -> ApiResult<ApiJson<()>, RoundErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) =
        Tournament::get_as_organizer_for_update(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    if let Err(refusal) = tournament.start_round(&mut tx, number).await? {
        tx.rollback().await?;
        return Err(ApiError::FormError(refusal.into()));
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// End a running Round once every Match has its Result, as an Organizer
///
/// After the last Swiss Round the Tournament is Finished.
#[post("/{tournament}/rounds/{number}/end")]
pub async fn end_tournament_round(
    account: Account,
    Path((tournament, number)): Path<(TournamentUuid, i16)>,
) -> ApiResult<ApiJson<TournamentStateResponse>, RoundErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) =
        Tournament::get_as_organizer_for_update(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let state = match tournament.end_round(&mut tx, number).await? {
        Ok(state) => state,
        Err(refusal) => {
            tx.rollback().await?;
            return Err(ApiError::FormError(refusal.into()));
        }
    };

    tx.commit().await?;

    Ok(ApiJson(TournamentStateResponse { state }))
}

/// Set or correct the Result of a Match, as an Organizer
///
/// Any time once its Round started, also after the Tournament is over; the
/// standings follow, the pairings stay as they are.
#[put("/{tournament}/matches/{match}/result")]
pub async fn set_tournament_match_result(
    account: Account,
    Path((tournament, played)): Path<(TournamentUuid, MatchUuid)>,
    ApiJson(request): ApiJson<SetResultRequest>,
) -> ApiResult<ApiJson<()>, SetResultErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) =
        Tournament::get_as_organizer_for_update(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let outcome = tournament
        .set_result(&mut tx, played, &request.games_won, request.games_drawn)
        .await?;
    if let Err(refusal) = outcome {
        tx.rollback().await?;
        let mut errors = FormErrors::<SetResultErrors>::new();
        match refusal {
            ResultRefusal::NoSuchMatch => return Err(ApiError::bad_request("No such match")),
            ResultRefusal::NotStarted => errors.not_started = true,
            ResultRefusal::InvalidScore => errors.invalid_score = true,
        }
        return errors.fail();
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Set how many Swiss Rounds are played, as an Organizer
///
/// At least as many as were paired. Set to the Rounds played once the last of
/// them ended, the Tournament is Finished.
#[put("/{tournament}/swiss-rounds")]
pub async fn set_tournament_swiss_rounds(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
    ApiJson(request): ApiJson<SetSwissRoundsRequest>,
) -> ApiResult<ApiJson<TournamentStateResponse>, SetSwissRoundsErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) =
        Tournament::get_as_organizer_for_update(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let Some(state) = tournament
        .set_swiss_rounds(&mut tx, request.swiss_rounds)
        .await?
    else {
        tx.rollback().await?;
        let mut errors = FormErrors::<SetSwissRoundsErrors>::new();
        errors.out_of_range = true;
        return errors.fail();
    };

    tx.commit().await?;

    Ok(ApiJson(TournamentStateResponse { state }))
}

/// Cancel a Tournament, as an Organizer
///
/// Any time before it is Finished. A previewed Round goes; the Rounds played
/// so far stay visible.
#[post("/{tournament}/cancel")]
pub async fn cancel_tournament(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) =
        Tournament::get_as_organizer_for_update(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    if !tournament.cancel(&mut tx).await? {
        tx.rollback().await?;
        return Err(ApiError::bad_request("The tournament is over"));
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// The Rounds of `tournament`, with the previewed one if `organizer`
pub async fn rounds_view(
    tx: &mut Transaction,
    tournament: &Tournament,
    organizer: bool,
) -> ApiResult<RoundsResponse> {
    let names = names(tx, tournament).await?;
    let rounds = tournament.rounds(tx, organizer).await?;
    let suggested_swiss_rounds = tournament.suggested_swiss_rounds(tx).await?;
    Ok(RoundsResponse {
        rounds: rounds
            .into_iter()
            .map(|round| RoundResponse {
                number: round.number,
                state: round.state,
                matches: round
                    .matches
                    .into_iter()
                    .map(|played| {
                        let result = played.games_drawn.and_then(|games_drawn| {
                            let games_won = played
                                .seats
                                .iter()
                                .map(|seat| seat.games_won)
                                .collect::<Option<Vec<i16>>>()?;
                            Some(ResultResponse {
                                games_won,
                                games_drawn,
                            })
                        });
                        MatchResponse {
                            uuid: played.uuid,
                            table_number: played.table_number,
                            seats: played
                                .seats
                                .into_iter()
                                .map(|seat| {
                                    let (name, guest) = name_of(&names, seat.participant);
                                    SeatResponse {
                                        participant: seat.participant,
                                        name,
                                        guest,
                                        seat: seat.seat,
                                    }
                                })
                                .collect(),
                            result,
                        }
                    })
                    .collect(),
            })
            .collect(),
        swiss_rounds: tournament.swiss_rounds,
        suggested_swiss_rounds,
    })
}

/// The standings of `tournament`
pub async fn standings_view(
    tx: &mut Transaction,
    tournament: &Tournament,
) -> ApiResult<StandingsResponse> {
    let names = names(tx, tournament).await?;
    let dropped: HashMap<ParticipantUuid, i16> = tournament
        .participants(tx)
        .await?
        .into_iter()
        .filter_map(|participant| Some((participant.uuid, participant.dropped_after_round?)))
        .collect();
    let record = tournament.record(tx).await?;
    Ok(StandingsResponse {
        tiebreakers: record.ruleset.tiebreakers().to_vec(),
        standings: standings(&record)
            .into_iter()
            .map(|line| {
                let participant = ParticipantUuid::from_entrant(line.entrant);
                let (name, guest) = name_of(&names, participant);
                StandingResponse {
                    place: line.place,
                    participant,
                    name,
                    guest,
                    match_points: line.match_points,
                    wins: line.wins,
                    losses: line.losses,
                    draws: line.draws,
                    byes: line.byes,
                    tiebreakers: line.tiebreakers.iter().map(Share::to_f64).collect(),
                    dropped_after_round: dropped.get(&participant).copied(),
                }
            })
            .collect(),
    })
}

/// Every Participant's name and whether it is a Guest
async fn names(
    tx: &mut Transaction,
    tournament: &Tournament,
) -> ApiResult<HashMap<ParticipantUuid, (String, bool)>> {
    Ok(tournament
        .participants(tx)
        .await?
        .into_iter()
        .map(|participant| {
            let response = ParticipantResponse::from(participant);
            (response.uuid, (response.name, response.guest))
        })
        .collect())
}

/// The name of `participant` and whether it is a Guest
fn name_of(
    names: &HashMap<ParticipantUuid, (String, bool)>,
    participant: ParticipantUuid,
) -> (String, bool) {
    names
        .get(&participant)
        .cloned()
        .unwrap_or_else(|| (String::new(), true))
}
