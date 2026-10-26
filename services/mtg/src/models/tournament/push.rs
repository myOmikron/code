//! Who a Tournament pushes, and with what
//!
//! Account Participants get pushes about their Rounds, Results and the Top
//! cut, Organizers about disputed Results; Guests have no devices. A
//! Tournament entered afterwards sends none, see [`Tournament::sends_pushes`].

use galvyn::core::Module;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;
use tracing::warn;

use crate::models::account::AccountUuid;
use crate::models::push::PushSubscription;
use crate::models::push::message::DisputeRecipient;
use crate::models::push::message::RoundPlace;
use crate::models::push::message::TournamentPush;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::participant::Participant;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::participant::Player;
use crate::models::tournament::result::ResultChange;
use crate::models::tournament::result::ResultChangeKind;
use crate::models::tournament::round::Round;
use crate::models::tournament::round::RoundStage;

impl Tournament {
    /// Whether anything that happens in this Tournament pushes anybody
    ///
    /// Only a Tournament run live does; one entered afterwards was played
    /// already. Every push trigger asks this first.
    pub fn sends_pushes(&self) -> bool {
        !self.entered_afterwards
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
    ///
    /// The first Round of the Top cut also tells each of them it reached the Top cut.
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
        let first_cut_round = round.stage == RoundStage::TopCut
            && !rounds
                .iter()
                .any(|other| other.stage == RoundStage::TopCut && other.number < number);
        let mut pushes = Vec::new();
        if first_cut_round {
            pushes.extend(reached_top_cut(self, round, &participants));
        }
        pushes.extend(round_paired(self, round, &participants));
        Ok(pushes)
    }

    /// Push the Match's other Participants and the Organizers that `change` disputed its Result
    ///
    /// Called once the dispute is committed; any other change pushes nobody.
    /// A push that cannot go out is logged.
    #[instrument(name = "Tournament::push_result_disputed", skip(self, change), fields(tournament = ?self.uuid))]
    pub async fn push_result_disputed(&self, change: &ResultChange) {
        if let Err(error) = self.send_result_disputed(change).await {
            warn!(%error, "Could not push the disputed Result");
        }
    }

    /// Hand the pushes for the disputed Result to [`crate::modules::web_push::WebPush`]
    async fn send_result_disputed(&self, change: &ResultChange) -> anyhow::Result<()> {
        if !self.sends_pushes() || change.kind != ResultChangeKind::Disputed {
            return Ok(());
        }
        let mut tx = Database::global().start_transaction().await?;
        let rounds = self.rounds(&mut tx, false).await?;
        let Some(table) = rounds
            .iter()
            .filter(|round| round.number == change.round)
            .flat_map(|round| &round.matches)
            .find(|played| played.uuid == change.played)
            .and_then(|played| played.table_number)
        else {
            tx.rollback().await?;
            return Ok(());
        };
        let participants = self.participants(&mut tx).await?;
        let mut organizers = vec![self.owner];
        organizers.extend(
            self.co_organizers(&mut tx)
                .await?
                .into_iter()
                .map(|co_organizer| co_organizer.account),
        );
        let pushes = result_disputed(
            (self.uuid, &self.name),
            change,
            table,
            &participants,
            &organizers,
        );
        PushSubscription::push_tournament(&mut tx, &pushes).await?;
        tx.commit().await?;
        Ok(())
    }
}

/// The Account of `participant`, `None` for a Guest
fn account_of(participants: &[Participant], participant: ParticipantUuid) -> Option<AccountUuid> {
    participants
        .iter()
        .find(|candidate| candidate.uuid == participant)
        .and_then(|candidate| match &candidate.player {
            Player::Account { account, .. } => Some(*account),
            Player::Guest { .. } => None,
        })
}

/// The push each Account Participant seated in the first Round of the Top cut gets
///
/// One with a Bye in it reached the Top cut too.
fn reached_top_cut(
    tournament: &Tournament,
    round: &Round,
    participants: &[Participant],
) -> Vec<(AccountUuid, TournamentPush)> {
    round
        .matches
        .iter()
        .flat_map(|played| &played.seats)
        .filter_map(|seat| account_of(participants, seat.participant))
        .map(|account| {
            (
                account,
                TournamentPush::ReachedTopCut {
                    tournament: tournament.uuid,
                    name: tournament.name.to_string(),
                },
            )
        })
        .collect()
}

/// The pushes for the dispute `change` of the Match at `table`
///
/// Every Account Participant of the Match but the disputer is told an
/// Organizer settles it; every Organizer who is not one of them is asked
/// to. Nobody is pushed about its own dispute.
fn result_disputed(
    (tournament, name): (TournamentUuid, &str),
    change: &ResultChange,
    table: i16,
    participants: &[Participant],
    organizers: &[AccountUuid],
) -> Vec<(AccountUuid, TournamentPush)> {
    let disputer = change
        .by
        .and_then(|participant| account_of(participants, participant));
    let players = change
        .seats
        .iter()
        .filter_map(|seat| account_of(participants, *seat))
        .filter(|account| Some(*account) != disputer)
        .collect::<Vec<_>>();
    let push = |to| TournamentPush::ResultDisputed {
        tournament,
        name: name.to_string(),
        round: change.round,
        table,
        to,
    };
    let mut pushes = Vec::new();
    for account in &players {
        pushes.push((*account, push(DisputeRecipient::Player)));
    }
    for account in organizers {
        if Some(*account) != disputer && !players.contains(account) {
            pushes.push((*account, push(DisputeRecipient::Organizer)));
        }
    }
    pushes
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
            let Some(account) = account_of(participants, seat.participant) else {
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

#[cfg(test)]
mod tests {
    use galvyn::rorm::fields::types::MaxStr;
    use uuid::Uuid;

    use super::*;
    use crate::models::account::Username;

    fn account(n: u128) -> AccountUuid {
        AccountUuid::new(Uuid::from_u128(n))
    }

    fn participant(n: u128, player: Player) -> Participant {
        Participant {
            uuid: ParticipantUuid::new(Uuid::from_u128(n)),
            player,
            late_from_round: None,
            dropped_after_round: None,
            unpaid: false,
        }
    }

    fn of_account(n: u128, owner: u128) -> Participant {
        participant(
            n,
            Player::Account {
                account: account(owner),
                username: Username::new(format!("player{n}")).expect("a username"),
            },
        )
    }

    fn guest(n: u128) -> Participant {
        participant(
            n,
            Player::Guest {
                name: MaxStr::new(format!("Guest {n}")).expect("short"),
            },
        )
    }

    fn dispute(by: u128, seats: &[u128]) -> ResultChange {
        ResultChange {
            round: 2,
            played: serde_json::from_str("\"00000000-0000-0000-0000-000000000009\"")
                .expect("a match uuid"),
            kind: ResultChangeKind::Disputed,
            by: Some(ParticipantUuid::new(Uuid::from_u128(by))),
            seats: seats
                .iter()
                .map(|seat| ParticipantUuid::new(Uuid::from_u128(*seat)))
                .collect(),
        }
    }

    fn recipients(
        change: &ResultChange,
        participants: &[Participant],
        organizers: &[AccountUuid],
    ) -> Vec<(AccountUuid, DisputeRecipient)> {
        result_disputed(
            (TournamentUuid(Uuid::nil()), "Friday Night Magic"),
            change,
            4,
            participants,
            organizers,
        )
        .into_iter()
        .map(|(to, push)| match push {
            TournamentPush::ResultDisputed {
                round,
                table,
                to: recipient,
                ..
            } => {
                assert_eq!((round, table), (2, 4));
                (to, recipient)
            }
            other => panic!("not a dispute push: {other:?}"),
        })
        .collect()
    }

    #[test]
    fn a_dispute_reaches_the_other_seats_and_the_organizers_but_not_the_disputer() {
        let participants = [of_account(1, 11), of_account(2, 12), of_account(3, 13)];
        assert_eq!(
            recipients(
                &dispute(2, &[1, 2, 3]),
                &participants,
                &[account(20), account(21)]
            ),
            [
                (account(11), DisputeRecipient::Player),
                (account(13), DisputeRecipient::Player),
                (account(20), DisputeRecipient::Organizer),
                (account(21), DisputeRecipient::Organizer),
            ]
        );
    }

    #[test]
    fn guests_get_no_dispute_push() {
        let participants = [guest(1), of_account(2, 12)];
        assert_eq!(
            recipients(&dispute(2, &[1, 2]), &participants, &[account(20)]),
            [(account(20), DisputeRecipient::Organizer)]
        );
    }

    #[test]
    fn an_organizer_at_the_table_is_pushed_once_as_a_player() {
        let participants = [of_account(1, 20), of_account(2, 12)];
        assert_eq!(
            recipients(&dispute(2, &[1, 2]), &participants, &[account(20)]),
            [(account(20), DisputeRecipient::Player)]
        );
    }

    #[test]
    fn an_organizer_who_disputes_hears_nothing_of_it() {
        let participants = [of_account(1, 11), of_account(2, 20)];
        assert_eq!(
            recipients(
                &dispute(2, &[1, 2]),
                &participants,
                &[account(20), account(21)]
            ),
            [
                (account(11), DisputeRecipient::Player),
                (account(21), DisputeRecipient::Organizer),
            ]
        );
    }
}
