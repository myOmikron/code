//! Invite related code lives in this module

use anyhow::Context;
use futures_util::TryStreamExt;
use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModelByField;
use serde::Deserialize;
use serde::Serialize;
use thiserror::Error;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::Account;
use crate::models::account::AdministrativeAccount;
use crate::models::account::ClubAccount;
use crate::models::account::ClubAdminAccount;
use crate::models::account::db::AdministrativeAccountModel;
use crate::models::account::db::AdministrativeAccountModelInsert;
use crate::models::account::db::ClubAccountModel;
use crate::models::account::db::ClubAccountModelInsert;
use crate::models::account::db::ClubAdminAccountModel;
use crate::models::account::db::ClubAdminAccountModelInsert;
use crate::models::account::db::UsernameModel;
use crate::models::club::ClubUuid;
use crate::models::invite::db::InviteModel;
use crate::models::invite::db::InviteModelInsert;

pub(in crate::models) mod db;

/// An invitation to the platform.
///
/// When an invitation is created, the username used in it is reserved and may not be used
/// to issue another again.
#[derive(Debug, Clone)]
pub struct Invite {
    /// Primary key of the invite
    pub uuid: InviteUuid,
    /// Reserved username
    pub username: MaxStr<255>,
    /// Display-name of the user
    pub display_name: MaxStr<255>,
    /// When the club is set, the invite is either a ClubMember or a ClubAdmin
    pub club: Option<ClubUuid>,
    /// When the mail is set, the invite is a ClubMember
    pub email: Option<MaxStr<255>>,
    /// The point in time the invite expires
    expires_at: time::OffsetDateTime,
    /// The point in time the invite was created
    pub created_at: time::OffsetDateTime,
}

/// Wrapper for the primary key of the [Invite]
#[derive(Debug, Copy, Clone, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct InviteUuid(pub Uuid);

impl Invite {
    /// Find an invitation by its uuid
    #[instrument(skip(exe))]
    pub async fn find_by_uuid(
        exe: impl Executor<'_>,
        InviteUuid(invite_uuid): InviteUuid,
    ) -> anyhow::Result<Option<Invite>> {
        Ok(rorm::query(exe, InviteModel)
            .condition(InviteModel.uuid.equals(invite_uuid))
            .optional()
            .await?
            .map(Invite::from))
    }

    /// Find all invites for a given club
    ///
    /// This includes members and admins.
    /// Superadmins aren't selected as they are not associated with a club
    #[instrument(name = "Invite::find_by_club", skip(exe))]
    pub async fn find_by_club(
        exe: impl Executor<'_>,
        ClubUuid(club_uuid): ClubUuid,
    ) -> anyhow::Result<Vec<Self>> {
        Ok(rorm::query(exe, InviteModel)
            .condition(InviteModel.club.equals(Some(club_uuid)))
            .stream()
            .map_ok(Invite::from)
            .try_collect()
            .await?)
    }

    /// Get the point in time the invite expires
    pub fn expires_at(&self) -> time::OffsetDateTime {
        self.expires_at
    }

    /// Delete the invitation
    #[instrument(skip(self, exe))]
    pub async fn delete(self, exe: impl Executor<'_>) -> anyhow::Result<()> {
        rorm::delete(exe, InviteModel)
            .condition(InviteModel.uuid.equals(self.uuid.0))
            .await?;

        Ok(())
    }

    /// Migrate an [Invite] instance to an actual account.
    #[instrument(skip(exe))]
    pub async fn accept_invite(
        self,
        exe: impl Executor<'_>,
        AcceptInviteParams { password }: AcceptInviteParams,
    ) -> anyhow::Result<Result<Account, AcceptInviteError>> {
        if self.expires_at < time::OffsetDateTime::now_utc() {
            return Ok(Err(AcceptInviteError::Expired));
        }

        let mut guard = exe.ensure_transaction().await?;

        #[allow(clippy::expect_used)]
        let hashed_password =
            MaxStr::new(Account::hash_password(&password).context("Hashing password failed")?)
                .expect("Resulting hash must be <255 bytes");

        // Club Member
        let account = if let Some(email) = self.email
            && let Some(club) = self.club
        {
            Account::ClubMember(ClubAccount::from(
                rorm::insert(guard.get_transaction(), ClubAccountModel)
                    .single(&ClubAccountModelInsert {
                        uuid: Uuid::new_v4(),
                        username: ForeignModelByField(self.username),
                        display_name: self.display_name,
                        hashed_password,
                        email,
                        club: ForeignModelByField(club.0),
                    })
                    .await?,
            ))
        }
        // Club admin
        else if let Some(club) = self.club {
            Account::ClubAdmin(ClubAdminAccount::from(
                rorm::insert(guard.get_transaction(), ClubAdminAccountModel)
                    .single(&ClubAdminAccountModelInsert {
                        uuid: Uuid::new_v4(),
                        username: ForeignModelByField(self.username),
                        display_name: self.display_name,
                        hashed_password,
                        club: ForeignModelByField(club.0),
                    })
                    .await?,
            ))
        }
        // Superadmin
        else {
            Account::Superadmin(AdministrativeAccount::from(
                rorm::insert(guard.get_transaction(), AdministrativeAccountModel)
                    .single(&AdministrativeAccountModelInsert {
                        uuid: Uuid::new_v4(),
                        username: ForeignModelByField(self.username),
                        display_name: self.display_name,
                        hashed_password,
                    })
                    .await?,
            ))
        };

        // Delete invite, the related invited roles will be deleted by cascade
        rorm::delete(guard.get_transaction(), InviteModel)
            .condition(InviteModel.uuid.equals(self.uuid.0))
            .await?;

        guard.commit().await?;

        Ok(Ok(account))
    }

    /// Create a new invite.
    ///
    /// Checks also if the chosen username is still available.
    #[instrument(skip(exe))]
    pub async fn create(
        exe: impl Executor<'_>,
        CreateInviteParams {
            username,
            display_name,
            expires_at,
            invite_type,
        }: CreateInviteParams,
    ) -> anyhow::Result<Result<Invite, CreateInviteError>> {
        let mut guard = exe.ensure_transaction().await?;
        let username = MaxStr::new(username.to_lowercase())?;

        let existing = rorm::query(guard.get_transaction(), UsernameModel)
            .condition(UsernameModel.username.equals(&username))
            .optional()
            .await?;
        if existing.is_some() {
            return Ok(Err(CreateInviteError::UsernameTaken));
        }

        let username = rorm::insert(guard.get_transaction(), UsernameModel)
            .single(&UsernameModel { username })
            .await?;

        let invite = rorm::insert(guard.get_transaction(), InviteModel)
            .single(&InviteModelInsert {
                uuid: Uuid::new_v4(),
                username: ForeignModelByField(username.username),
                display_name,
                club: match &invite_type {
                    InviteType::SuperAdmin => None,
                    InviteType::ClubAdmin { club } => Some(ForeignModelByField(club.0)),
                    InviteType::ClubMember { club, .. } => Some(ForeignModelByField(club.0)),
                },
                email: match invite_type {
                    InviteType::ClubMember { email, .. } => Some(email),
                    _ => None,
                },
                expires_at,
            })
            .await?;

        guard.commit().await?;

        Ok(Ok(Invite::from(invite)))
    }

    /// Clear expired invites
    #[instrument(name = "Invite::clear_expired", skip(exe))]
    pub async fn clear_expired(exe: impl Executor<'_>) -> anyhow::Result<()> {
        rorm::delete(exe, InviteModel)
            .condition(
                InviteModel
                    .expires_at
                    .less_than(time::OffsetDateTime::now_utc()),
            )
            .await?;

        Ok(())
    }
}

/// Type of the invite
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type")]
pub enum InviteType {
    /// Superadmin
    SuperAdmin,
    /// Club admin
    ClubAdmin {
        /// Club the invite is linked to
        club: ClubUuid,
    },
    /// Club member
    ClubMember {
        /// Club the invite is linked to
        club: ClubUuid,
        /// Primary mail of the user
        email: MaxStr<255>,
    },
}

/// Parameters to create a new invite
#[derive(Debug, Clone)]
pub struct CreateInviteParams {
    /// The username to use
    pub username: MaxStr<255>,
    /// Name to be displayed, should be a legal name
    pub display_name: MaxStr<255>,
    /// The point in time the invite expires
    pub expires_at: time::OffsetDateTime,
    /// Type of the invitation
    pub invite_type: InviteType,
}

/// Parameters to accept an invitation
#[derive(Debug, Clone)]
pub struct AcceptInviteParams {
    /// The cleartext password of the user
    pub password: MaxStr<72>,
}

/// Errors that can be handled
#[derive(Debug, Clone, Error)]
#[allow(missing_docs)]
pub enum CreateInviteError {
    #[error("Username is already taken")]
    UsernameTaken,
}

#[derive(Debug, Clone, Error)]
#[allow(missing_docs)]
pub enum AcceptInviteError {
    #[error("Invite expired")]
    Expired,
}

impl From<InviteModel> for Invite {
    fn from(value: InviteModel) -> Self {
        Self {
            uuid: InviteUuid(value.uuid),
            username: value.username.0,
            display_name: value.display_name,
            club: value.club.map(|x| ClubUuid(x.0)),
            email: value.email,
            expires_at: value.expires_at,
            created_at: value.created_at,
        }
    }
}
