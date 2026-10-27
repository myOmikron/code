//! Who may see a Tournament and who runs it
//!
//! A route on one Tournament sits in a group named after the part its caller
//! has to play there, a [`TournamentAccess`]; the group's middleware fetches
//! the Tournament with [`Tournament::get_granted`] and hands the handler the
//! [`TournamentGrant`]. Reading by share link goes through
//! [`Tournament::get_by_share_token`]. `None` covers "no such Tournament" and
//! "not yours" alike, so a refusal says nothing about whether a private
//! Tournament exists.

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value;
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
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::visibility::Visibility;

/// The part a caller has to play in a Tournament to pass a route group
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum TournamentAccess {
    /// Be its Owner
    Owner,
    /// Be one of its Organizers: the Owner or a Co-organizer
    Organizer,
    /// Play in it: an Account Participant
    Participant,
    /// Play in it or organize it, with Match membership checked by the model.
    MatchHistory,
    /// See it, see [`Tournament::get_visible`]
    Viewer,
}

/// What a caller is to one Tournament
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct Standing {
    /// The part it plays in running the Tournament, `None` for none
    pub role: Option<OrganizerRole>,
    /// Whether it plays in the Tournament
    pub participant: bool,
    /// Whether it sees the Tournament by its id
    pub sees: bool,
}

impl TournamentAccess {
    /// Whether a caller of `standing` passes
    pub fn grants(self, standing: Standing) -> bool {
        match self {
            Self::Owner => standing.role == Some(OrganizerRole::Owner),
            Self::Organizer => standing.role.is_some(),
            Self::Participant => standing.participant,
            Self::MatchHistory => standing.participant || standing.role.is_some(),
            Self::Viewer => standing.sees,
        }
    }
}

/// A Tournament as a route group's middleware let its caller through to it
///
/// Read once before the handler runs; a handler that writes takes the
/// Tournament afresh under its lock, see [`Tournament::lock_for_update`].
#[derive(Clone, Debug)]
pub struct TournamentGrant {
    /// The Tournament
    pub tournament: Tournament,
    /// The part the caller plays in running it, `None` for none
    pub role: Option<OrganizerRole>,
    /// The caller's Participant, `None` if it plays in it not, or nobody is logged in
    pub participant: Option<ParticipantUuid>,
}

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

    /// Fetch a Tournament for `caller` through a route group that needs `access`, `None` if refused
    ///
    /// `caller` is `None` for nobody logged in, who only sees a public
    /// Tournament.
    #[instrument(name = "Tournament::get_granted", skip(tx))]
    pub async fn get_granted(
        tx: &mut Transaction,
        uuid: TournamentUuid,
        caller: Option<AccountUuid>,
        access: TournamentAccess,
    ) -> Result<Option<TournamentGrant>, rorm::Error> {
        let Some(tournament) = Self::get(tx, uuid).await? else {
            return Ok(None);
        };
        let (role, participant) = match caller {
            Some(account) => (
                tournament.organizer_role(tx, account).await?,
                tournament.participant_of(tx, account).await?,
            ),
            None => (None, None),
        };
        let mut sees =
            tournament.visibility == Visibility::Public || role.is_some() || participant.is_some();
        if !sees
            && access == TournamentAccess::Viewer
            && let Some(account) = caller
        {
            sees = tournament.is_offered_to(tx, account).await?;
        }
        let standing = Standing {
            role,
            participant: participant.is_some(),
            sees,
        };
        Ok(access.grants(standing).then_some(TournamentGrant {
            tournament,
            role,
            participant,
        }))
    }

    /// Lock this Tournament's row until the transaction ends and read it afresh, `None` once it is gone
    ///
    /// For running it: pairing, starting and ending Rounds, Results, the
    /// roster. The lock comes first, so what is read afterwards is what the
    /// last writer left, and a second writer acting at once waits for this one.
    #[instrument(name = "Tournament::lock_for_update", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn lock_for_update(
        &self,
        tx: &mut Transaction,
    ) -> Result<Option<Tournament>, rorm::Error> {
        (&mut *tx)
            .execute::<All>(
                "SELECT uuid FROM tournament WHERE uuid = $1 FOR NO KEY UPDATE".to_string(),
                vec![Value::Uuid(self.uuid.into_inner())],
            )
            .await?;
        Self::get(tx, self.uuid).await
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
    use super::Standing;
    use super::TournamentAccess;
    use crate::models::account::AccountUuid;

    fn account() -> AccountUuid {
        AccountUuid::new(Uuid::new_v4())
    }

    fn standing(role: Option<OrganizerRole>, participant: bool, sees: bool) -> Standing {
        Standing {
            role,
            participant,
            sees,
        }
    }

    #[test]
    fn only_the_owner_is_granted_the_owner_routes() {
        let access = TournamentAccess::Owner;
        assert!(access.grants(standing(Some(OrganizerRole::Owner), false, true)));
        assert!(!access.grants(standing(Some(OrganizerRole::CoOrganizer), true, true)));
        assert!(!access.grants(standing(None, true, true)));
    }

    #[test]
    fn the_owner_and_its_co_organizers_are_granted_the_organizer_routes() {
        let access = TournamentAccess::Organizer;
        assert!(access.grants(standing(Some(OrganizerRole::Owner), false, true)));
        assert!(access.grants(standing(Some(OrganizerRole::CoOrganizer), false, true)));
        assert!(!access.grants(standing(None, true, true)));
    }

    #[test]
    fn only_an_account_that_plays_is_granted_the_participant_routes() {
        let access = TournamentAccess::Participant;
        assert!(access.grants(standing(None, true, true)));
        assert!(access.grants(standing(Some(OrganizerRole::Owner), true, true)));
        assert!(!access.grants(standing(Some(OrganizerRole::Owner), false, true)));
        assert!(!access.grants(standing(None, false, true)));
    }

    #[test]
    fn whoever_sees_the_tournament_is_granted_the_viewer_routes() {
        let access = TournamentAccess::Viewer;
        assert!(access.grants(standing(None, false, true)));
        assert!(!access.grants(standing(None, false, false)));
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
