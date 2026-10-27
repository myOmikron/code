use std::collections::HashMap;

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;

use crate::http::handler_frontend::tournaments::handler::denied;
use crate::http::handler_frontend::tournaments::live::TournamentEvent;
use crate::http::handler_frontend::tournaments::live::emit;
use crate::http::handler_frontend::tournaments::participants::schema::ParticipantResponse;
use crate::http::handler_frontend::tournaments::results::handler::announce;
use crate::http::handler_frontend::tournaments::rounds::schema::ArrangeRoundErrors;
use crate::http::handler_frontend::tournaments::rounds::schema::ArrangeRoundRequest;
use crate::http::handler_frontend::tournaments::rounds::schema::CurrentRoundResponse;
use crate::http::handler_frontend::tournaments::rounds::schema::MatchResponse;
use crate::http::handler_frontend::tournaments::rounds::schema::MyMatchResponse;
use crate::http::handler_frontend::tournaments::rounds::schema::PairedRoundResponse;
use crate::http::handler_frontend::tournaments::rounds::schema::ResultResponse;
use crate::http::handler_frontend::tournaments::rounds::schema::RoundErrors;
use crate::http::handler_frontend::tournaments::rounds::schema::RoundResponse;
use crate::http::handler_frontend::tournaments::rounds::schema::RoundTimerResponse;
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
use crate::models::tournament::access::TournamentGrant;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::round::Match;
use crate::models::tournament::round::MatchUuid;
use crate::models::tournament::round::ResultRefusal;
use crate::models::tournament::round::Round;
use crate::models::tournament::round::RoundState;
use crate::models::tournament::round_edit::ArrangeRefusal;
use crate::tournament::layout::Layout;
use crate::tournament::layout::LayoutError;
use crate::tournament::standings::Share;
use crate::tournament::standings::standings;

/// The Rounds of a Tournament the reader may see
///
/// A previewed Round only shows to the Tournament's Organizers.
#[get("/{tournament}/rounds")]
pub async fn list_tournament_rounds(
    viewer: Viewer,
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<ApiJson<RoundsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let tournament = grant.tournament;
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
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<ApiJson<StandingsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let tournament = grant.tournament;
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
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<ApiJson<PairedRoundResponse>, RoundErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
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

    emit(
        tournament.uuid,
        TournamentEvent::RoundPaired { round: number },
    );
    Ok(ApiJson(PairedRoundResponse { number }))
}

/// Throw a previewed Round away, as an Organizer, to pair it again
#[delete("/{tournament}/rounds/{number}")]
pub async fn discard_tournament_round(
    grant: TournamentGrant,
    Path((_, number)): Path<(TournamentUuid, i16)>,
) -> ApiResult<ApiJson<()>, RoundErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
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

    emit(
        tournament.uuid,
        TournamentEvent::RoundDiscarded { round: number },
    );
    Ok(ApiJson(()))
}

/// Start a previewed Round, as an Organizer: from now on everybody sees it
///
/// Starting Round 1 closes Registration and settles the number of Swiss Rounds.
#[post("/{tournament}/rounds/{number}/start")]
pub async fn start_tournament_round(
    grant: TournamentGrant,
    Path((_, number)): Path<(TournamentUuid, i16)>,
) -> ApiResult<ApiJson<()>, RoundErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    if let Err(refusal) = tournament.start_round(&mut tx, number).await? {
        tx.rollback().await?;
        return Err(ApiError::FormError(refusal.into()));
    }

    tx.commit().await?;
    tournament.push_round_paired(number).await;

    emit(
        tournament.uuid,
        TournamentEvent::RoundStarted { round: number },
    );
    emit(tournament.uuid, TournamentEvent::StandingsChanged);
    Ok(ApiJson(()))
}

/// End a running Round once every Match has its Result, as an Organizer
///
/// After the last Swiss Round the Tournament is Finished.
#[post("/{tournament}/rounds/{number}/end")]
pub async fn end_tournament_round(
    grant: TournamentGrant,
    Path((_, number)): Path<(TournamentUuid, i16)>,
) -> ApiResult<ApiJson<TournamentStateResponse>, RoundErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
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

    emit(
        tournament.uuid,
        TournamentEvent::RoundEnded { round: number },
    );
    Ok(ApiJson(TournamentStateResponse { state }))
}

/// Lay out a previewed Round by hand, as an Organizer
///
/// The whole Round at once: every Match in table order with its Participants
/// in Seat order, and the Byes. Starting the Round starts this layout.
#[put("/{tournament}/rounds/{number}/layout")]
pub async fn arrange_tournament_round(
    grant: TournamentGrant,
    Path((_, number)): Path<(TournamentUuid, i16)>,
    ApiJson(request): ApiJson<ArrangeRoundRequest>,
) -> ApiResult<ApiJson<()>, ArrangeRoundErrors> {
    let layout = Layout {
        matches: request
            .matches
            .iter()
            .map(|seats| seats.iter().map(|seat| seat.into_inner()).collect())
            .collect(),
        byes: request.byes.iter().map(|bye| bye.into_inner()).collect(),
    };
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    if let Err(refusal) = tournament.arrange_preview(&mut tx, number, &layout).await? {
        tx.rollback().await?;
        let mut errors = FormErrors::<ArrangeRoundErrors>::new();
        match refusal {
            ArrangeRefusal::TournamentOver => errors.tournament_over = true,
            ArrangeRefusal::NotPreviewed => errors.not_previewed = true,
            ArrangeRefusal::TopCut => errors.top_cut = true,
            ArrangeRefusal::Invalid(mistakes) => {
                for mistake in mistakes {
                    match mistake {
                        LayoutError::NotPairable(_) => errors.not_pairable = true,
                        LayoutError::SeatedTwice(_) => errors.seated_twice = true,
                        LayoutError::NotSeated(_) => errors.not_seated = true,
                        LayoutError::MatchSize { .. } => errors.match_size = true,
                        LayoutError::NoByes => errors.no_byes = true,
                        LayoutError::CutSize => errors.cut_size = true,
                    }
                }
            }
        }
        return errors.fail();
    }

    tx.commit().await?;

    emit(
        tournament.uuid,
        TournamentEvent::RoundPaired { round: number },
    );
    Ok(ApiJson(()))
}

/// Take back the latest ended Round, as an Organizer: it runs again
///
/// Only while no later Round started; a previewed next Round goes. Its
/// Results stay. A Tournament its last Swiss Round finished is back in Swiss.
#[post("/{tournament}/rounds/{number}/take-back")]
pub async fn take_back_tournament_round(
    grant: TournamentGrant,
    Path((_, number)): Path<(TournamentUuid, i16)>,
) -> ApiResult<ApiJson<TournamentStateResponse>, RoundErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    let state = match tournament.take_back_round(&mut tx, number).await? {
        Ok(state) => state,
        Err(refusal) => {
            tx.rollback().await?;
            return Err(ApiError::FormError(refusal.into()));
        }
    };

    tx.commit().await?;

    emit(
        tournament.uuid,
        TournamentEvent::RoundTakenBack { round: number },
    );
    Ok(ApiJson(TournamentStateResponse { state }))
}

/// Set or correct the Result of a Match, as an Organizer
///
/// Any time once its Round started, also after the Tournament is over; the
/// standings follow, the pairings stay as they are. This is how an Organizer
/// settles a disputed Result and reports for Guests and locked Accounts.
#[put("/{tournament}/matches/{match}/result")]
pub async fn set_tournament_match_result(
    account: Account,
    grant: TournamentGrant,
    Path((_, played)): Path<(TournamentUuid, MatchUuid)>,
    ApiJson(request): ApiJson<SetResultRequest>,
) -> ApiResult<ApiJson<()>, SetResultErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    let outcome = tournament
        .set_result(&mut tx, played, &request.games_won, request.games_drawn)
        .await?;
    let change = match outcome {
        Ok(change) => change,
        Err(refusal) => {
            tx.rollback().await?;
            let mut errors = FormErrors::<SetResultErrors>::new();
            match refusal {
                ResultRefusal::NoSuchMatch => return Err(ApiError::bad_request("No such match")),
                ResultRefusal::NotStarted => errors.not_started = true,
                ResultRefusal::InvalidScore => errors.invalid_score = true,
                ResultRefusal::DroppedWinner => errors.dropped_winner = true,
            }
            return errors.fail();
        }
    };

    tx.commit().await?;

    announce(&tournament, &change);
    tournament.push_result_settled(&change, account.uuid).await;
    Ok(ApiJson(()))
}

/// Set how many Swiss Rounds are played, as an Organizer
///
/// At least as many as were paired. Set to the Rounds played once the last of
/// them ended, the Tournament is Finished.
#[put("/{tournament}/swiss-rounds")]
pub async fn set_tournament_swiss_rounds(
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
    ApiJson(request): ApiJson<SetSwissRoundsRequest>,
) -> ApiResult<ApiJson<TournamentStateResponse>, SetSwissRoundsErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
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

    emit(tournament.uuid, TournamentEvent::TournamentChanged);
    Ok(ApiJson(TournamentStateResponse { state }))
}

/// Cancel a Tournament, as an Organizer
///
/// Any time before it is Finished. A previewed Round goes; the Rounds played
/// so far stay visible.
#[post("/{tournament}/cancel")]
pub async fn cancel_tournament(
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    if !tournament.cancel(&mut tx).await? {
        tx.rollback().await?;
        return Err(ApiError::bad_request("The tournament is over"));
    }

    tx.commit().await?;

    emit(tournament.uuid, TournamentEvent::TournamentChanged);
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
    let now = OffsetDateTime::now_utc();
    let top_cut_size = tournament.top_cut_size(tx).await?;
    let top_cut_winner = tournament.top_cut_winner(tx).await?;
    Ok(RoundsResponse {
        rounds: rounds
            .into_iter()
            .map(|round| RoundResponse {
                number: round.number,
                stage: round.stage,
                state: round.state,
                timer: running_timer(tournament, &round, now),
                matches: round
                    .matches
                    .into_iter()
                    .map(|played| match_response(&names, played))
                    .collect(),
            })
            .collect(),
        swiss_rounds: tournament.swiss_rounds,
        suggested_swiss_rounds,
        server_time: SchemaDateTime(now),
        top_cut_size,
        top_cut_winner,
    })
}

/// The reader's Match in the running Round of a Tournament, with the round timer
///
/// For a Participant with an Account: its table, its opponents and its Seat,
/// or its Bye. An Account playing in none gets the Round and timer only.
#[get("/{tournament}/my-match")]
pub async fn get_my_tournament_match(
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<ApiJson<MyMatchResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let TournamentGrant {
        tournament,
        participant,
        ..
    } = grant;
    let names = names(&mut tx, &tournament).await?;
    let running = tournament
        .rounds(&mut tx, false)
        .await?
        .into_iter()
        .find(|round| round.state == RoundState::Running);

    tx.commit().await?;

    let now = OffsetDateTime::now_utc();
    let round = running.map(|round| CurrentRoundResponse {
        number: round.number,
        timer: running_timer(&tournament, &round, now),
        my_match: participant.and_then(|participant| {
            round
                .matches
                .into_iter()
                .find(|played| {
                    played
                        .seats
                        .iter()
                        .any(|seat| seat.participant == participant)
                })
                .map(|played| match_response(&names, played))
        }),
    });
    Ok(ApiJson(MyMatchResponse {
        participant,
        round,
        server_time: SchemaDateTime(now),
    }))
}

/// The round timer of `round` while it runs, read at `now`
fn running_timer(
    tournament: &Tournament,
    round: &Round,
    now: OffsetDateTime,
) -> Option<RoundTimerResponse> {
    if round.state != RoundState::Running {
        return None;
    }
    round.timer.map(|timer| RoundTimerResponse {
        length_seconds: timer.length_seconds,
        ends_at: SchemaDateTime(timer.ends_at),
        remaining_seconds: timer.remaining_seconds(now),
        time_up: timer.time_up(now),
        extra_turns: tournament.ruleset.extra_turns(),
    })
}

/// A Match or Bye with its Participants' names
fn match_response(
    names: &HashMap<ParticipantUuid, (String, bool)>,
    played: Match,
) -> MatchResponse {
    let result = played.games_drawn.and_then(|games_drawn| {
        let games_won = played
            .seats
            .iter()
            .map(|seat| seat.games_won)
            .collect::<Option<Vec<i16>>>()?;
        Some(ResultResponse {
            games_won,
            games_drawn,
            state: played.result_state?,
            reported_by: played.reported_by,
            disputed_by: played.disputed_by,
        })
    });
    MatchResponse {
        uuid: played.uuid,
        table_number: played.table_number,
        seats: played
            .seats
            .into_iter()
            .map(|seat| {
                let (name, guest) = name_of(names, seat.participant);
                SeatResponse {
                    participant: seat.participant,
                    name,
                    guest,
                    seat: seat.seat,
                }
            })
            .collect(),
        result,
        rematch: played.rematch,
    }
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

/// Opens a Match for its Participants or Organizers without recording or submitting any Result.
#[get("/{tournament}/matches/{match}/play")]
pub async fn get_tournament_match_play(
    grant: TournamentGrant,
    Path((_, played)): Path<(TournamentUuid, MatchUuid)>,
) -> ApiResult<ApiJson<super::schema::MatchPlayResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let context = grant.match_play(&mut tx, played).await?;
    tx.commit().await?;
    let context = context.ok_or_else(denied)?;
    let now = OffsetDateTime::now_utc();
    Ok(ApiJson(super::schema::MatchPlayResponse {
        participant: grant.participant,
        round: RoundResponse {
            number: context.round.number,
            stage: context.round.stage,
            state: context.round.state,
            timer: running_timer(&grant.tournament, &context.round, now),
            matches: vec![match_response(&context.names, context.played)],
        },
        server_time: SchemaDateTime(now),
    }))
}
