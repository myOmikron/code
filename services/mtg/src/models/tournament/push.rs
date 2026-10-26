//! Who a Tournament pushes, and with what
//!
//! Only Account Participants get pushes; Guests have no devices. A
//! Tournament entered afterwards sends none, see [`Tournament::sends_pushes`].

use galvyn::core::Module;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;
use tracing::warn;

use crate::models::account::AccountUuid;
use crate::models::push::PushSubscription;
use crate::models::push::message::RoundPlace;
use crate::models::push::message::TournamentPush;
use crate::models::tournament::Tournament;
use crate::models::tournament::participant::Participant;
use crate::models::tournament::participant::Player;
use crate::models::tournament::round::Round;

impl Tournament {
    /// Whether anything that happens in this Tournament pushes its Participants
    ///
    /// Every Tournament is run live so far. One entered afterwards answers
    /// false here, and every push trigger asks this first.
    pub fn sends_pushes(&self) -> bool {
        true
    }

    /// Push every Account Participant of the just started Round `number` its table and Seat
    ///
    /// Called once the start is committed. A push that cannot go out is
    /// logged; the Round is started all the same.
    #[instrument(name = "Tournament::push_round_paired", skip(self), fields(tournament = ?self.uuid))]
    pub async fn push_round_paired(&self, number: i16) {
        if let Err(error) = self.send_round_paired(number).await {
            warn!(%error, "Could not push the paired Round");
        }
    }

    /// Hand the pushes for Round `number` to [`crate::modules::web_push::WebPush`]
    async fn send_round_paired(&self, number: i16) -> anyhow::Result<()> {
        let mut tx = Database::global().start_transaction().await?;
        let pushes = self.round_paired_pushes(&mut tx, number).await?;
        PushSubscription::push_tournament(&mut tx, &pushes).await?;
        tx.commit().await?;
        Ok(())
    }

    /// The pushes for Round `number` having started, one per Account Participant in it
    async fn round_paired_pushes(
        &self,
        tx: &mut Transaction,
        number: i16,
    ) -> Result<Vec<(AccountUuid, TournamentPush)>, rorm::Error> {
        if !self.sends_pushes() {
            return Ok(Vec::new());
        }
        let rounds = self.rounds(tx, false).await?;
        let Some(round) = rounds.iter().find(|round| round.number == number) else {
            return Ok(Vec::new());
        };
        let participants = self.participants(tx).await?;
        Ok(round_paired(self, round, &participants))
    }
}

/// The push each Account Participant seated in `round` gets, with its table and Seat
///
/// One with a Bye is told so.
fn round_paired(
    tournament: &Tournament,
    round: &Round,
    participants: &[Participant],
) -> Vec<(AccountUuid, TournamentPush)> {
    let mut pushes = Vec::new();
    for played in &round.matches {
        for seat in &played.seats {
            let Some(account) = participants
                .iter()
                .find(|participant| participant.uuid == seat.participant)
                .and_then(|participant| match &participant.player {
                    Player::Account { account, .. } => Some(*account),
                    Player::Guest { .. } => None,
                })
            else {
                continue;
            };
            let place = match played.table_number {
                Some(table) => RoundPlace::Table {
                    table,
                    seat: seat.seat,
                },
                None => RoundPlace::Bye,
            };
            pushes.push((
                account,
                TournamentPush::RoundPaired {
                    tournament: tournament.uuid,
                    name: tournament.name.to_string(),
                    round: round.number,
                    place,
                },
            ));
        }
    }
    pushes
}
