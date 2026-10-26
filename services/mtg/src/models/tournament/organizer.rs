//! Co-organizers: Accounts named to run a Tournament with its Owner
//!
//! What a Co-organizer may do is decided by the route group a route sits in,
//! see [`super::access`]: [`TournamentAccess::Organizer`] lets it in,
//! [`TournamentAccess::Owner`] does not. An Account is at most one of Owner
//! and Co-organizer of a Tournament.
//!
//! [`TournamentAccess::Organizer`]: super::access::TournamentAccess::Organizer
//! [`TournamentAccess::Owner`]: super::access::TournamentAccess::Owner

use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use tracing::instrument;

use crate::models::account::AccountUuid;
use crate::models::account::Username;
use crate::models::tournament::Tournament;
use crate::models::tournament::db::TournamentCoOrganizerInsertPatch;
use crate::models::tournament::db::TournamentCoOrganizerModel;
use crate::models::tournament::db::co_organizer_key;

/// An Account named to run a Tournament with its Owner
#[derive(Debug, Clone)]
pub struct CoOrganizer {
    /// The Account
    pub account: AccountUuid,
    /// The Account's username as it is now
    pub username: Username,
}

/// Why an Account could not be named a Co-organizer
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AddCoOrganizerRefusal {
    /// The Account is the Owner
    Owner,
    /// The Account is a Co-organizer already
    AlreadyCoOrganizer,
}

impl Tournament {
    /// The Co-organizers of this Tournament, alphabetically by username
    #[instrument(name = "Tournament::co_organizers", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn co_organizers(
        &self,
        tx: &mut Transaction,
    ) -> Result<Vec<CoOrganizer>, rorm::Error> {
        let rows = rorm::query(
            &mut *tx,
            (
                TournamentCoOrganizerModel.account,
                TournamentCoOrganizerModel.account.username,
            ),
        )
        .condition(
            TournamentCoOrganizerModel
                .tournament
                .equals(self.uuid.into_inner()),
        )
        .order_asc(TournamentCoOrganizerModel.account.username_normalized)
        .all()
        .await?;
        Ok(rows
            .into_iter()
            .map(|(account, username)| CoOrganizer {
                account: AccountUuid::new_from_field(account),
                username: Username::new_from_field(username),
            })
            .collect())
    }

    /// Name `account` a Co-organizer of this Tournament
    #[instrument(name = "Tournament::add_co_organizer", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn add_co_organizer(
        &self,
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Result<(), AddCoOrganizerRefusal>, rorm::Error> {
        if self.owner == account {
            return Ok(Err(AddCoOrganizerRefusal::Owner));
        }
        if self.organizer_role(tx, account).await?.is_some() {
            return Ok(Err(AddCoOrganizerRefusal::AlreadyCoOrganizer));
        }
        insert_co_organizer(tx, self, account).await?;
        Ok(Ok(()))
    }

    /// Take `account` off this Tournament's Co-organizers
    ///
    /// Taking off an Account that is not one changes nothing.
    #[instrument(name = "Tournament::remove_co_organizer", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn remove_co_organizer(
        &self,
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<(), rorm::Error> {
        rorm::delete(&mut *tx, TournamentCoOrganizerModel)
            .condition(TournamentCoOrganizerModel.uuid.equals(co_organizer_key(
                self.uuid.into_inner(),
                account.into_inner(),
            )))
            .await?;
        Ok(())
    }
}

/// Insert the row naming `account` a Co-organizer of `tournament`
pub(in crate::models::tournament) async fn insert_co_organizer(
    tx: &mut Transaction,
    tournament: &Tournament,
    account: AccountUuid,
) -> Result<(), rorm::Error> {
    rorm::insert(&mut *tx, TournamentCoOrganizerModel)
        .return_nothing()
        .single(&TournamentCoOrganizerInsertPatch {
            uuid: co_organizer_key(tournament.uuid.into_inner(), account.into_inner()),
            tournament: ForeignModelByField(tournament.uuid.into_inner()),
            account: ForeignModelByField(account.into_inner()),
        })
        .await
}
