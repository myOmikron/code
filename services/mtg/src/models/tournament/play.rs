//! Authorized Match context for counting and reading Match Life history.

use std::collections::HashMap;

use galvyn::rorm;
use galvyn::rorm::conditions::DynamicCollection;
use galvyn::rorm::db::transaction::Transaction;

use crate::models::account::db::AccountModel;
use crate::models::tournament::access::TournamentGrant;
use crate::models::tournament::db::TournamentMatchModel;
use crate::models::tournament::db::TournamentParticipantModel;
use crate::models::tournament::db::TournamentRoundModel;
use crate::models::tournament::db::TournamentSeatModel;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::round::Match;
use crate::models::tournament::round::MatchUuid;
use crate::models::tournament::round::Round;
use crate::models::tournament::round::RoundState;
use crate::models::tournament::round::Seat;
use crate::models::tournament::round::round_timer;

/// An authorized table and its original Round timer.
pub struct MatchPlay {
    /// The containing Round, without other Matches.
    pub round: Round,
    /// The selected Match in Seat order.
    pub played: Match,
    /// Display names and Guest flags for this Match's Participants only.
    pub names: HashMap<ParticipantUuid, (String, bool)>,
}

impl TournamentGrant {
    /// Reads a started, non-Bye Match only for its Participants or the Tournament's Organizers.
    pub async fn match_play(
        &self,
        tx: &mut Transaction,
        played: MatchUuid,
    ) -> Result<Option<MatchPlay>, rorm::Error> {
        let Some(row) = rorm::query(&mut *tx, TournamentMatchModel)
            .condition(rorm::and![
                TournamentMatchModel.uuid.equals(played.into_inner()),
                TournamentMatchModel
                    .round
                    .tournament
                    .equals(self.tournament.uuid.into_inner())
            ])
            .optional()
            .await?
        else {
            return Ok(None);
        };
        if row.table_number.is_none() {
            return Ok(None);
        }
        let round = rorm::query(&mut *tx, TournamentRoundModel)
            .condition(TournamentRoundModel.uuid.equals(row.round.0))
            .one()
            .await?;
        if round.state == RoundState::Previewed {
            return Ok(None);
        }
        let seats = rorm::query(&mut *tx, TournamentSeatModel)
            .condition(TournamentSeatModel.tournament_match.equals(row.uuid))
            .order_asc(TournamentSeatModel.seat)
            .all()
            .await?;
        if self.role.is_none()
            && !seats
                .iter()
                .any(|seat| Some(ParticipantUuid::new(seat.participant.0)) == self.participant)
        {
            return Ok(None);
        }
        if seats.is_empty() {
            return Ok(None);
        }
        let participants = rorm::query(&mut *tx, TournamentParticipantModel)
            .condition(DynamicCollection::or_unchecked(
                seats
                    .iter()
                    .map(|seat| TournamentParticipantModel.uuid.equals(seat.participant.0))
                    .collect(),
            ))
            .all()
            .await?;
        let account_ids: Vec<_> = participants
            .iter()
            .filter_map(|participant| participant.account.as_ref().map(|account| account.0))
            .collect();
        let usernames: HashMap<_, _> = if account_ids.is_empty() {
            HashMap::new()
        } else {
            rorm::query(&mut *tx, (AccountModel.uuid, AccountModel.username))
                .condition(DynamicCollection::or_unchecked(
                    account_ids
                        .into_iter()
                        .map(|id| AccountModel.uuid.equals(id))
                        .collect(),
                ))
                .all()
                .await?
                .into_iter()
                .collect()
        };
        let names = participants
            .into_iter()
            .map(|participant| {
                let guest = participant.account.is_none();
                let name = participant
                    .account
                    .and_then(|account| usernames.get(&account.0).map(|name| name.to_string()))
                    .or_else(|| participant.guest_name.map(|name| name.to_string()))
                    .unwrap_or_default();
                (ParticipantUuid::new(participant.uuid), (name, guest))
            })
            .collect();
        Ok(Some(MatchPlay {
            round: Round {
                number: round.number,
                stage: round.stage,
                state: round.state,
                matches: Vec::new(),
                timer: round_timer(&round),
            },
            played: Match {
                uuid: played,
                table_number: row.table_number,
                seats: seats
                    .into_iter()
                    .map(|seat| Seat {
                        participant: ParticipantUuid::new(seat.participant.0),
                        seat: seat.seat,
                        games_won: seat.games_won,
                    })
                    .collect(),
                games_drawn: row.games_drawn,
                result_state: row.result_state,
                reported_by: row.reported_by.map(|id| ParticipantUuid::new(id.0)),
                disputed_by: row.disputed_by.map(|id| ParticipantUuid::new(id.0)),
                rematch: false,
            },
            names,
        }))
    }
}
