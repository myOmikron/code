//! Who may see a Tournament and who runs it
//!
//! Reading goes through [`Tournament::get_visible`] (by id) and
//! [`Tournament::get_by_share_token`] (by link). Running it goes through
//! [`Tournament::get_as_organizer`] (the Owner and its Co-organizers),
//! deleting and the other Owner-only operations through
//! [`Tournament::get_as_owner`]: a handler fetches the
//! Tournament with the check its operation needs, then acts on what came back.
//! `None` covers "no such Tournament" and "not yours" alike, so a refusal says
//! nothing about whether a private Tournament exists.

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;

use crate::models::account::AccountUuid;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::db::TournamentCoOrganizerModel;
use crate::models::tournament::db::TournamentHandoverModel;
use crate::models::tournament::db::TournamentModel;
use crate::models::tournament::db::co_organizer_key;
use crate::models::visibility::Visibility;

/// The part an Account plays in running a Tournament
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum OrganizerRole {
    /// The Account the Tournament belongs to
    Owner,
    /// An Account named to run it with the Owner
    CoOrganizer,
}

impl OrganizerRole {
    /// Whether `caller`, an Organizer in this role, may take `co_organizer` off
    ///
    /// The Owner removes any Co-organizer, a Co-organizer only itself.
    pub fn may_remove(self, caller: AccountUuid, co_organizer: AccountUuid) -> bool {
        match self {
            Self::Owner => true,
            Self::CoOrganizer => caller == co_organizer,
        }
    }
}

impl Tournament {
    /// The part `account` plays in running this Tournament, `None` for none
    #[instrument(name = "Tournament::organizer_role", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn organizer_role(
        &self,
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Option<OrganizerRole>, rorm::Error> {
        if self.owner == account {
            return Ok(Some(OrganizerRole::Owner));
        }
        let named = rorm::query(&mut *tx, TournamentCoOrganizerModel.uuid)
            .condition(TournamentCoOrganizerModel.uuid.equals(co_organizer_key(
                self.uuid.into_inner(),
                account.into_inner(),
            )))
            .optional()
            .await?;
        Ok(named.map(|_| OrganizerRole::CoOrganizer))
    }

    /// Whether this Tournament is offered to `account` to take over
    #[instrument(name = "Tournament::is_offered_to", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn is_offered_to(
        &self,
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<bool, rorm::Error> {
        let offer = rorm::query(&mut *tx, TournamentHandoverModel.uuid)
            .condition(rorm::and![
                TournamentHandoverModel
                    .tournament
                    .equals(self.uuid.into_inner()),
                TournamentHandoverModel
                    .offered_to
                    .equals(account.into_inner()),
            ])
            .optional()
            .await?;
        Ok(offer.is_some())
    }

    /// Fetch a Tournament if `viewer` may see it by its id
    ///
    /// Everybody sees a public one; its Organizers, its Participants and the
    /// Account it is offered to see it whatever its Visibility. An unlisted
    /// one is otherwise reached through its share link only, see
    /// [`Self::get_by_share_token`].
    #[instrument(name = "Tournament::get_visible", skip(tx))]
    pub async fn get_visible(
        tx: &mut Transaction,
        uuid: TournamentUuid,
        viewer: Option<AccountUuid>,
    ) -> Result<Option<Tournament>, rorm::Error> {
        let Some(tournament) = Self::get(tx, uuid).await? else {
            return Ok(None);
        };
        if tournament.visibility == Visibility::Public {
            return Ok(Some(tournament));
        }
        let Some(viewer) = viewer else {
            return Ok(None);
        };
        let visible = tournament.organizer_role(tx, viewer).await?.is_some()
            || tournament.participant_of(tx, viewer).await?.is_some()
            || tournament.is_offered_to(tx, viewer).await?;
        Ok(visible.then_some(tournament))
    }

    /// Fetch a Tournament by the secret in its share link
    ///
    /// The Visibility is part of the condition, so a token left on a
    /// Tournament that is no longer Unlisted does not resolve.
    #[instrument(name = "Tournament::get_by_share_token", skip(tx, token))]
    pub async fn get_by_share_token(
        tx: &mut Transaction,
        token: &MaxStr<64>,
    ) -> Result<Option<Tournament>, rorm::Error> {
        let tournament = rorm::query(&mut *tx, TournamentModel)
            .condition(rorm::and![
                TournamentModel.share_token.equals(Some(token)),
                TournamentModel.visibility.equals(Visibility::Unlisted),
            ])
            .optional()
            .await?;
        Ok(tournament.map(Tournament::from))
    }

    /// Fetch a Tournament if `account` is one of its Organizers
    #[instrument(name = "Tournament::get_as_organizer", skip(tx))]
    pub async fn get_as_organizer(
        tx: &mut Transaction,
        uuid: TournamentUuid,
        account: AccountUuid,
    ) -> Result<Option<Tournament>, rorm::Error> {
        Ok(Self::get_with_role(tx, uuid, account)
            .await?
            .map(|(tournament, _)| tournament))
    }

    /// Fetch a Tournament with the part `account` plays in running it, if any
    #[instrument(name = "Tournament::get_with_role", skip(tx))]
    pub async fn get_with_role(
        tx: &mut Transaction,
        uuid: TournamentUuid,
        account: AccountUuid,
    ) -> Result<Option<(Tournament, OrganizerRole)>, rorm::Error> {
        let Some(tournament) = Self::get(tx, uuid).await? else {
            return Ok(None);
        };
        let role = tournament.organizer_role(tx, account).await?;
        Ok(role.map(|role| (tournament, role)))
    }

    /// Fetch a Tournament if `account` is its Owner
    #[instrument(name = "Tournament::get_as_owner", skip(tx))]
    pub async fn get_as_owner(
        tx: &mut Transaction,
        uuid: TournamentUuid,
        account: AccountUuid,
    ) -> Result<Option<Tournament>, rorm::Error> {
        let tournament = Self::get(tx, uuid).await?;
        Ok(tournament.filter(|tournament| tournament.owner == account))
    }

    /// Fetch a Tournament without asking who wants it
    pub(in crate::models::tournament) async fn get(
        tx: &mut Transaction,
        uuid: TournamentUuid,
    ) -> Result<Option<Tournament>, rorm::Error> {
        let tournament = rorm::query(&mut *tx, TournamentModel)
            .condition(TournamentModel.uuid.equals(uuid.into_inner()))
            .optional()
            .await?;
        Ok(tournament.map(Tournament::from))
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::OrganizerRole;
    use crate::models::account::AccountUuid;

    fn account() -> AccountUuid {
        AccountUuid::new(Uuid::new_v4())
    }

    #[test]
    fn the_owner_removes_any_co_organizer() {
        let (owner, co_organizer) = (account(), account());
        assert!(OrganizerRole::Owner.may_remove(owner, co_organizer));
    }

    #[test]
    fn a_co_organizer_removes_itself() {
        let co_organizer = account();
        assert!(OrganizerRole::CoOrganizer.may_remove(co_organizer, co_organizer));
    }

    #[test]
    fn a_co_organizer_removes_no_other_co_organizer() {
        let (co_organizer, other) = (account(), account());
        assert!(!OrganizerRole::CoOrganizer.may_remove(co_organizer, other));
    }
}
