//! The standings, read out of the rounds behind them
//!
//! The arithmetic is [`crate::tournament::standings`], which is pure. This is
//! the part that assembles a field and its settled tables and hands them over.
//!
//! Everybody who played is computed, including players who have since dropped:
//! their final record is what their past opponents' percentages are built from,
//! so removing them would quietly move the standings of people still in the
//! event. Who may *see* a row is a separate question, answered by the same
//! [`super::public::roster_view`] the roster itself goes through — which is
//! also what keeps a guest's pseudonym the same number on both screens.

use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;
use uuid::Uuid;

use crate::models::tournament::MatchStatus;
use crate::models::tournament::ParticipantStatus;
use crate::models::tournament::RoundKind;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentParticipantUuid;
use crate::models::tournament::db::TournamentMatchModel;
use crate::models::tournament::db::TournamentParticipantModel;
use crate::models::tournament::db::TournamentRoundModel;
use crate::models::tournament::db::TournamentSeatModel;
use crate::tournament::standings::Entrant;
use crate::tournament::standings::MatchRecord;
use crate::tournament::standings::SeatRecord;
use crate::tournament::standings::Standing;
use crate::tournament::standings::StandingsSnapshot;
use crate::tournament::standings::standings;

/// One row of the standings, with the name to print beside it
#[derive(Debug, Clone)]
pub struct StandingRow {
    /// Whose row this is
    pub participant: TournamentParticipantUuid,
    /// The name they appear under, before any view is applied
    pub display_name: MaxStr<64>,
    /// Whether they have since left the event
    pub dropped: bool,
    /// Everything the engine worked out about them
    pub standing: Standing,
}

/// The standings of a tournament, best first
///
/// Unguarded, like the rest of this module tree's reads: the caller has already
/// resolved the tournament for its viewer, and deciding whose rows they may see
/// is the caller's job too.
///
/// @param tx the transaction to read in
/// @param event the tournament, for its scoring table and pod size
///
/// @returns one row per player who is in the event
#[instrument(name = "standings::table", skip(tx, event))]
pub async fn table(
    tx: &mut Transaction,
    event: &Tournament,
) -> Result<Vec<StandingRow>, rorm::Error> {
    let tournament = event.uuid;

    let roster = rorm::query(
        &mut *tx,
        (
            TournamentParticipantModel.uuid,
            TournamentParticipantModel.display_name,
            TournamentParticipantModel.status,
            TournamentParticipantModel.entered_round,
            TournamentParticipantModel.dropped_after_round,
            TournamentParticipantModel.seed,
        ),
    )
    .condition(TournamentParticipantModel.tournament.equals(tournament.0))
    .all()
    .await?;

    // Everybody who is or was in the event. `dropped_after_round = 0` is the
    // roster's own "never played a round", which is what somebody dropped at
    // the start for never checking in carries — they are not in the standings
    // because they were never in the tournament.
    let field: Vec<_> = roster
        .into_iter()
        .filter(|(_, _, status, _, dropped_after, _)| match status {
            ParticipantStatus::CheckedIn => true,
            ParticipantStatus::Dropped | ParticipantStatus::Disqualified => {
                *dropped_after != Some(0)
            }
            _ => false,
        })
        .collect();
    if field.is_empty() {
        return Ok(Vec::new());
    }

    let scored: Vec<(Uuid, Option<i16>, Option<i16>)> = rorm::query(
        &mut *tx,
        (
            TournamentRoundModel.uuid,
            TournamentRoundModel.number,
            TournamentRoundModel.pod_size,
        ),
    )
    .condition(rorm::and![
        TournamentRoundModel.tournament.equals(tournament.0),
        TournamentRoundModel.kind.equals(RoundKind::Swiss),
    ])
    .all()
    .await?;

    // Only settled tables are results. A pending or disputed one is an argument
    // in progress, and putting it in the standings would move ranks every time
    // somebody taps their phone.
    let played = rorm::query(
        &mut *tx,
        (
            TournamentMatchModel.uuid,
            TournamentMatchModel.round,
            TournamentMatchModel.is_bye,
            TournamentMatchModel.winner_participant,
            TournamentMatchModel.is_draw,
            TournamentMatchModel.games_drawn,
            TournamentMatchModel.status,
        ),
    )
    .condition(TournamentMatchModel.tournament.equals(tournament.0))
    .all()
    .await?;

    let seats = rorm::query(
        &mut *tx,
        (
            TournamentSeatModel.tournament_match,
            TournamentSeatModel.participant,
            TournamentSeatModel.seat,
            TournamentSeatModel.games_won,
        ),
    )
    .condition(TournamentSeatModel.tournament.equals(tournament.0))
    .all()
    .await?;

    let mut at_table: std::collections::HashMap<Uuid, Vec<(i16, Uuid, i16)>> =
        std::collections::HashMap::new();
    for (table, participant, seat, games_won) in seats {
        at_table
            .entry(table.0)
            .or_default()
            .push((seat, participant.0, games_won));
    }

    let mut matches = Vec::new();
    for (uuid, round, is_bye, winner, is_draw, games_drawn, status) in played {
        if status != MatchStatus::Confirmed {
            continue;
        }
        let Some((_, number, pod_size)) = scored.iter().find(|(scored, _, _)| *scored == round.0)
        else {
            continue;
        };
        let mut seated = at_table.remove(&uuid).unwrap_or_default();
        seated.sort_by_key(|(seat, _, _)| *seat);

        matches.push(MatchRecord {
            round_number: number.unwrap_or(0),
            is_bye,
            short_pod: pod_size
                .is_some_and(|size| seated.len() < usize::try_from(size).unwrap_or(0)),
            seats: seated
                .into_iter()
                .map(|(_, id, games_won)| SeatRecord { id, games_won })
                .collect(),
            winner: winner.map(|winner| winner.0),
            draw: is_draw,
            games_drawn,
        });
    }

    let rows = standings(&StandingsSnapshot {
        pod_size: usize::try_from(event.pod_size).unwrap_or(2),
        games_per_match: event.games_per_match,
        points_win: i32::from(event.points_win),
        points_draw: i32::from(event.points_draw),
        points_loss: i32::from(event.points_loss),
        points_bye: i32::from(event.points_bye),
        entrants: field
            .iter()
            .map(|(uuid, _, _, entered_round, dropped_after, seed)| Entrant {
                id: *uuid,
                entered_round: *entered_round,
                dropped_after_round: *dropped_after,
                seed: *seed,
            })
            .collect(),
        matches,
    });

    Ok(rows
        .into_iter()
        .filter_map(|standing| {
            let (_, display_name, status, _, _, _) =
                field.iter().find(|(uuid, ..)| *uuid == standing.id)?;
            Some(StandingRow {
                participant: TournamentParticipantUuid(standing.id),
                display_name: display_name.clone(),
                dropped: matches!(
                    status,
                    ParticipantStatus::Dropped | ParticipantStatus::Disqualified
                ),
                standing,
            })
        })
        .collect())
}
