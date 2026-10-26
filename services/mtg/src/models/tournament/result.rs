//! Results reported and disputed by the Participants of a Match
//!
//! The rules are the engine's, see [`crate::tournament::reporting`]; this
//! reads the Match they are weighed against and stores what they answer.
//! An Organizer sets a Result through [`Tournament::set_result`] instead.
//!
//! Every operation that changes a Result answers a [`ResultChange`]: the one
//! place later work (live updates, Web Push) learns that a Result was
//! reported, disputed or set.

use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use tracing::instrument;

use crate::models::tournament::Tournament;
use crate::models::tournament::db::TournamentMatchModel;
use crate::models::tournament::db::TournamentSeatModel;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::round::MatchUuid;
use crate::models::tournament::round::RoundStage;
use crate::models::tournament::round::RoundState;
use crate::tournament::reporting::Dispute;
use crate::tournament::reporting::DisputeRefusal;
use crate::tournament::reporting::Report;
use crate::tournament::reporting::ReportRefusal;
use crate::tournament::reporting::ResultState;
use crate::tournament::reporting::StoredResult;
use crate::tournament::reporting::dispute;
use crate::tournament::reporting::report;

/// A Result that was reported, disputed or set
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResultChange {
    /// The number of the Round the Match is played in
    pub round: i16,
    /// The Match
    pub played: MatchUuid,
    /// What happened to its Result
    pub kind: ResultChangeKind,
    /// The Participant who acted, `None` for an Organizer
    pub by: Option<ParticipantUuid>,
    /// Every Participant of the Match, by Seat number
    pub seats: Vec<ParticipantUuid>,
}

/// What happened to a Result
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResultChangeKind {
    /// A Participant reported it; it counts
    Reported,
    /// Another Participant disputed it; an Organizer settles it
    Disputed,
    /// An Organizer set or corrected it
    Set,
}

/// Why a Participant's report was refused
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReportResultRefusal {
    /// The Match is none of this Tournament's, or a Bye
    NoSuchMatch,
    /// Its Round is not running, or the Tournament is over
    NotRunning,
    /// The game score does not fit the Match
    InvalidScore,
    /// The rules of reporting refuse it
    Refused(ReportRefusal),
}

/// Why a Participant's dispute was refused
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DisputeResultRefusal {
    /// The Match is none of this Tournament's, or a Bye
    NoSuchMatch,
    /// Its Round is not running, or the Tournament is over
    NotRunning,
    /// The rules of reporting refuse it
    Refused(DisputeRefusal),
}

/// A Match as reporting reads it
struct ReportedMatch {
    /// The number of its Round
    round: i16,
    /// Whether its Round is a Swiss or a Top cut one
    stage: RoundStage,
    /// Where its Round is
    round_state: RoundState,
    /// The Result it has, if any
    stored: Option<StoredResult>,
    /// Games nobody won, `None` while it has no Result
    games_drawn: Option<i16>,
    /// Its Participants and the games each won, by Seat number
    seats: Vec<(ParticipantUuid, Option<i16>)>,
}

impl ReportedMatch {
    /// Its Participants by Seat number
    fn participants(&self) -> Vec<ParticipantUuid> {
        self.seats
            .iter()
            .map(|(participant, _)| *participant)
            .collect()
    }
}

impl Tournament {
    /// `by` reports the Result of `played`: `games_won` per Seat and `games_drawn`
    ///
    /// It counts at once. `None` if the Match has that Result already.
    /// The caller made sure `by` is the acting Account's Participant and holds
    /// [`Tournament::get_visible_for_update`]'s lock.
    #[instrument(name = "Tournament::report_result", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn report_result(
        &self,
        tx: &mut Transaction,
        played: MatchUuid,
        by: ParticipantUuid,
        games_won: &[i16],
        games_drawn: i16,
    ) -> Result<Result<Option<ResultChange>, ReportResultRefusal>, rorm::Error> {
        let Some(reported) = self.reported_match(tx, played).await? else {
            return Ok(Err(ReportResultRefusal::NoSuchMatch));
        };
        if self.over() || reported.round_state != RoundState::Running {
            return Ok(Err(ReportResultRefusal::NotRunning));
        }
        if !self.admits(reported.stage, games_won, games_drawn) {
            return Ok(Err(ReportResultRefusal::InvalidScore));
        }
        let same_score = reported.games_drawn == Some(games_drawn)
            && reported.seats.len() == games_won.len()
            && reported
                .seats
                .iter()
                .zip(games_won)
                .all(|((_, stored), won)| *stored == Some(*won));
        let seats = reported.participants();
        let entrants: Vec<_> = seats.iter().map(|seat| seat.into_inner()).collect();
        match report(&entrants, reported.stored, by.into_inner(), same_score) {
            Err(refusal) => Ok(Err(ReportResultRefusal::Refused(refusal))),
            Ok(Report::Unchanged) => Ok(Ok(None)),
            Ok(Report::Store) => {
                store_result(
                    tx,
                    played,
                    games_won,
                    games_drawn,
                    ResultState::Reported,
                    Some(by),
                )
                .await?;
                Ok(Ok(Some(ResultChange {
                    round: reported.round,
                    played,
                    kind: ResultChangeKind::Reported,
                    by: Some(by),
                    seats,
                })))
            }
        }
    }

    /// `by` disputes the Result of `played`, holding its Round open for an Organizer
    ///
    /// `None` if it is disputed already. The caller made sure `by` is the
    /// acting Account's Participant and holds
    /// [`Tournament::get_visible_for_update`]'s lock.
    #[instrument(name = "Tournament::dispute_result", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn dispute_result(
        &self,
        tx: &mut Transaction,
        played: MatchUuid,
        by: ParticipantUuid,
    ) -> Result<Result<Option<ResultChange>, DisputeResultRefusal>, rorm::Error> {
        let Some(reported) = self.reported_match(tx, played).await? else {
            return Ok(Err(DisputeResultRefusal::NoSuchMatch));
        };
        if self.over() || reported.round_state != RoundState::Running {
            return Ok(Err(DisputeResultRefusal::NotRunning));
        }
        let seats = reported.participants();
        let entrants: Vec<_> = seats.iter().map(|seat| seat.into_inner()).collect();
        match dispute(&entrants, reported.stored, by.into_inner()) {
            Err(refusal) => Ok(Err(DisputeResultRefusal::Refused(refusal))),
            Ok(Dispute::Unchanged) => Ok(Ok(None)),
            Ok(Dispute::Store) => {
                rorm::update(&mut *tx, TournamentMatchModel)
                    .set(
                        TournamentMatchModel.result_state,
                        Some(ResultState::Disputed),
                    )
                    .set(
                        TournamentMatchModel.disputed_by,
                        Some(ForeignModelByField(by.into_inner())),
                    )
                    .condition(TournamentMatchModel.uuid.equals(played.into_inner()))
                    .await?;
                Ok(Ok(Some(ResultChange {
                    round: reported.round,
                    played,
                    kind: ResultChangeKind::Disputed,
                    by: Some(by),
                    seats,
                })))
            }
        }
    }

    /// The Match `played` of this Tournament with its Result, `None` for a Bye or another Tournament's
    async fn reported_match(
        &self,
        tx: &mut Transaction,
        played: MatchUuid,
    ) -> Result<Option<ReportedMatch>, rorm::Error> {
        let Some((round, stage, round_state, table_number, games_drawn, result_state, reported_by)) =
            rorm::query(
                &mut *tx,
                (
                    TournamentMatchModel.round.number,
                    TournamentMatchModel.round.stage,
                    TournamentMatchModel.round.state,
                    TournamentMatchModel.table_number,
                    TournamentMatchModel.games_drawn,
                    TournamentMatchModel.result_state,
                    TournamentMatchModel.reported_by,
                ),
            )
            .condition(rorm::and![
                TournamentMatchModel.uuid.equals(played.into_inner()),
                TournamentMatchModel
                    .round
                    .tournament
                    .equals(self.uuid.into_inner()),
            ])
            .optional()
            .await?
        else {
            return Ok(None);
        };
        if table_number.is_none() {
            return Ok(None);
        }
        let seats = rorm::query(
            &mut *tx,
            (
                TournamentSeatModel.participant,
                TournamentSeatModel.games_won,
            ),
        )
        .condition(
            TournamentSeatModel
                .tournament_match
                .equals(played.into_inner()),
        )
        .order_asc(TournamentSeatModel.seat)
        .all()
        .await?;
        Ok(Some(ReportedMatch {
            round,
            stage,
            round_state,
            stored: result_state.map(|state| StoredResult {
                state,
                reported_by: reported_by.map(|participant| participant.0),
            }),
            games_drawn,
            seats: seats
                .into_iter()
                .map(|(participant, won)| (ParticipantUuid::new(participant.0), won))
                .collect(),
        }))
    }
}

/// Store `games_won` per Seat and `games_drawn` as the Result of `played`
///
/// In `state`, reported by `reported_by`; a dispute is cleared. Answers the
/// Match's Participants by Seat number.
pub(in crate::models::tournament) async fn store_result(
    tx: &mut Transaction,
    played: MatchUuid,
    games_won: &[i16],
    games_drawn: i16,
    state: ResultState,
    reported_by: Option<ParticipantUuid>,
) -> Result<Vec<ParticipantUuid>, rorm::Error> {
    rorm::update(&mut *tx, TournamentMatchModel)
        .set(TournamentMatchModel.games_drawn, Some(games_drawn))
        .set(TournamentMatchModel.result_state, Some(state))
        .set(
            TournamentMatchModel.reported_by,
            reported_by.map(|participant| ForeignModelByField(participant.into_inner())),
        )
        .set(TournamentMatchModel.disputed_by, None)
        .condition(TournamentMatchModel.uuid.equals(played.into_inner()))
        .await?;
    let seats = rorm::query(
        &mut *tx,
        (TournamentSeatModel.uuid, TournamentSeatModel.participant),
    )
    .condition(
        TournamentSeatModel
            .tournament_match
            .equals(played.into_inner()),
    )
    .order_asc(TournamentSeatModel.seat)
    .all()
    .await?;
    for ((seat, _), won) in seats.iter().zip(games_won) {
        rorm::update(&mut *tx, TournamentSeatModel)
            .set(TournamentSeatModel.games_won, Some(*won))
            .condition(TournamentSeatModel.uuid.equals(*seat))
            .await?;
    }
    Ok(seats
        .into_iter()
        .map(|(_, participant)| ParticipantUuid::new(participant.0))
        .collect())
}
