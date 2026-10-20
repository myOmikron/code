//! The standings, read out of the rounds behind them

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

/// The standings of a tournament, best first (unguarded: the caller filters rows)
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

    // Dropped players stay in: their record feeds their opponents' tiebreakers.
    // `dropped_after_round = 0` means dropped at start without ever playing.
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
