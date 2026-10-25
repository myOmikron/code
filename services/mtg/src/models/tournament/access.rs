//! Who may see a Tournament and who runs it
//!
//! Reading goes through [`Tournament::get_visible`] (by id) and
//! [`Tournament::get_by_share_token`] (by link). Running it goes through
//! [`Tournament::get_as_organizer`], deleting and the other Owner-only
//! operations through [`Tournament::get_as_owner`]: a handler fetches the
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
use crate::models::tournament::db::TournamentModel;
use crate::models::visibility::Visibility;

/// The part an Account plays in running a Tournament
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum OrganizerRole {
    /// The Account the Tournament belongs to
    Owner,
}

impl Tournament {
    /// The part `account` plays in running this Tournament, `None` for none
    pub fn organizer_role(&self, account: AccountUuid) -> Option<OrganizerRole> {
        (self.owner == account).then_some(OrganizerRole::Owner)
    }

    /// Fetch a Tournament if `viewer` may see it by its id
    ///
    /// Everybody sees a public one; its Organizers and Participants see it
    /// whatever its Visibility. An unlisted one is otherwise reached through
    /// its share link only, see [`Self::get_by_share_token`].
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
        let visible = tournament.organizer_role(viewer).is_some()
            || tournament.participant_of(tx, viewer).await?.is_some();
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
        let tournament = Self::get(tx, uuid).await?;
        Ok(tournament.filter(|tournament| tournament.organizer_role(account).is_some()))
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
    async fn get(
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
