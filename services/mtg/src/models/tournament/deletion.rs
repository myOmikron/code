//! What a Deletion of an Account does to the Tournaments it is part of
//!
//! Runs before the Account's identity is deleted: its Participants would go
//! with the cascade, and the Tournaments it owns hold the Account back.

use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;

use crate::models::account::AccountUuid;
use crate::models::account::Username;
use crate::models::tournament::Tournament;
use crate::models::tournament::db::TournamentCoOrganizerModel;
use crate::models::tournament::db::TournamentModel;
use crate::models::tournament::db::TournamentParticipantModel;
use crate::models::visibility::Visibility;

impl Tournament {
    /// Let the Tournaments `account` plays in or owns go on without it
    ///
    /// Its Participants become Guests named `username`, its last one, and
    /// keep their primary keys, so whatever points at them stays. Each
    /// Tournament it owns passes to its longest-standing Co-organizer, else to
    /// `tombstone` when public or unlisted, else it is deleted; `tombstone` is
    /// `None` for a full Deletion. A pending handover of an owned Tournament
    /// is dropped with the old Owner. Its places as Co-organizer and the
    /// handovers offered to it go with the cascade. Runs before the Account
    /// row is deleted, whose cascade would take the Participants along.
    #[instrument(name = "Tournament::part_with_account", skip(tx))]
    pub(in crate::models) async fn part_with_account(
        tx: &mut Transaction,
        account: AccountUuid,
        username: &Username,
        tombstone: Option<AccountUuid>,
    ) -> Result<(), rorm::Error> {
        let guest_name = MaxStr::new(username.as_str().to_owned())
            .unwrap_or_else(|_| unreachable!("a username is shorter than a Guest name"));
        rorm::update(&mut *tx, TournamentParticipantModel)
            .set(TournamentParticipantModel.account, None)
            .set(TournamentParticipantModel.guest_name, Some(guest_name))
            .condition(
                TournamentParticipantModel
                    .account
                    .equals(Some(account.into_inner())),
            )
            .await?;

        let owned = rorm::query(&mut *tx, TournamentModel)
            .condition(TournamentModel.owner.equals(account.into_inner()))
            .all()
            .await?;
        for tournament in owned.into_iter().map(Tournament::from) {
            let co_organizer = tournament.longest_standing_co_organizer(tx).await?;
            match successor(co_organizer, tournament.visibility, tombstone) {
                Successor::CoOrganizer(heir) => {
                    tournament.remove_co_organizer(tx, heir).await?;
                    tournament.pass_to(tx, heir).await?;
                }
                Successor::Tombstone(tombstone) => tournament.pass_to(tx, tombstone).await?,
                Successor::Nobody => tournament.delete(tx).await?,
            }
        }
        Ok(())
    }

    /// The Co-organizer named first, `None` when there is none
    async fn longest_standing_co_organizer(
        &self,
        tx: &mut Transaction,
    ) -> Result<Option<AccountUuid>, rorm::Error> {
        let first = rorm::query(&mut *tx, TournamentCoOrganizerModel.account)
            .condition(
                TournamentCoOrganizerModel
                    .tournament
                    .equals(self.uuid.into_inner()),
            )
            .order_asc(TournamentCoOrganizerModel.created_at)
            .order_asc(TournamentCoOrganizerModel.uuid)
            .optional()
            .await?;
        Ok(first.map(AccountUuid::new_from_field))
    }

    /// Make `owner` the Owner, dropping a pending handover
    async fn pass_to(&self, tx: &mut Transaction, owner: AccountUuid) -> Result<(), rorm::Error> {
        self.withdraw_handover(tx).await?;
        rorm::update(&mut *tx, TournamentModel)
            .set(
                TournamentModel.owner,
                ForeignModelByField(owner.into_inner()),
            )
            .condition(TournamentModel.uuid.equals(self.uuid.into_inner()))
            .await?;
        Ok(())
    }
}

/// Who takes over a Tournament whose Owner's Account goes
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::models) enum Successor {
    /// The Co-organizer becomes the Owner
    CoOrganizer(AccountUuid),
    /// The Tombstone holds it, so links to it keep working
    Tombstone(AccountUuid),
    /// Nobody: the Tournament is deleted
    Nobody,
}

/// Who takes over a Tournament at `visibility` from a deleted Owner
///
/// `co_organizer` is the Co-organizer next in line, `tombstone` the Tombstone
/// unless it is a full Deletion.
pub(in crate::models) fn successor(
    co_organizer: Option<AccountUuid>,
    visibility: Visibility,
    tombstone: Option<AccountUuid>,
) -> Successor {
    if let Some(co_organizer) = co_organizer {
        return Successor::CoOrganizer(co_organizer);
    }
    match (visibility, tombstone) {
        (Visibility::Public | Visibility::Unlisted, Some(tombstone)) => {
            Successor::Tombstone(tombstone)
        }
        (Visibility::Private, _) | (_, None) => Successor::Nobody,
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::Successor;
    use super::successor;
    use crate::models::account::AccountUuid;
    use crate::models::visibility::Visibility;

    fn account(n: u128) -> AccountUuid {
        AccountUuid::new(Uuid::from_u128(n))
    }

    #[test]
    fn a_co_organizer_takes_over_whatever_the_visibility() {
        for visibility in [
            Visibility::Public,
            Visibility::Unlisted,
            Visibility::Private,
        ] {
            assert_eq!(
                successor(Some(account(1)), visibility, Some(account(9))),
                Successor::CoOrganizer(account(1)),
                "{visibility:?}"
            );
        }
    }

    #[test]
    fn without_a_co_organizer_a_public_or_unlisted_one_goes_to_the_tombstone() {
        for visibility in [Visibility::Public, Visibility::Unlisted] {
            assert_eq!(
                successor(None, visibility, Some(account(9))),
                Successor::Tombstone(account(9)),
                "{visibility:?}"
            );
        }
    }

    #[test]
    fn without_a_co_organizer_a_private_one_is_deleted() {
        assert_eq!(
            successor(None, Visibility::Private, Some(account(9))),
            Successor::Nobody
        );
    }

    #[test]
    fn a_full_deletion_takes_what_would_go_to_the_tombstone() {
        assert_eq!(successor(None, Visibility::Public, None), Successor::Nobody);
        assert_eq!(
            successor(Some(account(1)), Visibility::Public, None),
            Successor::CoOrganizer(account(1))
        );
    }
}
