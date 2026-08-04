//! Accounts are the login-related models of this platform.
//!
//! They are attached to the related models that grant access to clubs or the super administrative
//! users.

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModel;
use galvyn::rorm::prelude::ForeignModelByField;
use serde::Deserialize;
use serde::Serialize;
use time::Duration;
use time::OffsetDateTime;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::db::AdministrativeAccountModel;
use crate::models::account::db::ClubAccountModel;
use crate::models::account::db::ClubAdminAccountModel;
use crate::models::club::ClubUuid;
use crate::models::club::db::ClubModel;
use crate::models::credential_reset::CredentialReset;
use crate::models::credential_reset::CredentialResetUuid;
use crate::models::credential_reset::db::CredentialResetClubAccountModel;
use crate::models::credential_reset::db::CredentialResetClubAdminModel;
use crate::models::credential_reset::db::CredentialResetSuperadminModel;
use crate::models::credential_reset::generate_code;

mod club_admin;
mod club_member;
pub(in crate::models) mod db;
mod superadmin;

/// Helper for unifying the different account types
pub enum Account {
    /// Member of a club
    ClubMember(ClubAccount),
    /// Admin of a club
    ClubAdmin(ClubAdminAccount),
    /// Superadmin
    Superadmin(AdministrativeAccount),
}

/// Representation of the login data without any permission attached to it
pub struct AdministrativeAccount {
    /// Primary key of the account
    uuid: AccountUuid,
    /// Name to be used for displaying purposes
    pub display_name: MaxStr<255>,
    /// The username that should be used for logging in
    pub username: MaxStr<255>,
    /// The last point in time the account was modified
    pub modified_at: time::OffsetDateTime,
    /// The point in time the account was created
    pub created_at: time::OffsetDateTime,
    hashed_password: MaxStr<255>,
}

/// Representation of the login data without any permission attached to it
pub struct ClubAdminAccount {
    /// Primary key of the account
    uuid: AccountUuid,
    /// Name to be used for displaying purposes
    pub display_name: MaxStr<255>,
    /// The username that should be used for logging in
    pub username: MaxStr<255>,
    /// The club this account is an admin for
    pub club: ClubUuid,
    /// The last point in time the account was modified
    pub modified_at: time::OffsetDateTime,
    /// The point in time the account was created
    pub created_at: time::OffsetDateTime,
    hashed_password: MaxStr<255>,
}

/// Representation of the login data without any permission attached to it
pub struct ClubAccount {
    /// Primary key of the account
    uuid: AccountUuid,
    /// Name to be used for displaying purposes
    pub display_name: MaxStr<255>,
    /// The username that should be used for logging in
    pub username: MaxStr<255>,
    /// Email of the account
    pub email: MaxStr<255>,
    /// The club this account is part of
    pub club: ClubUuid,
    /// The last point in time the account was modified
    pub modified_at: OffsetDateTime,
    /// The point in time the account was created
    pub created_at: OffsetDateTime,
    /// Whether the account already has an app password set.
    pub has_app_password: bool,
    hashed_password: MaxStr<255>,
}

/// New-type for the account's primary key
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema)]
pub struct AccountUuid(pub Uuid);

/// Helper to create new club members, used for [`ClubAccountModelInsert`].
/// It should only be necessary to use this in maintenance features like data imports.
#[derive(Debug, Clone)]
pub struct CreateManualClubMember {
    /// Username of the new club member
    pub username: MaxStr<255>,
    /// Display name of the new club member
    pub display_name: MaxStr<255>,
    /// Hashed password of the new club member, must be in bcrypt format
    pub hashed_password: MaxStr<255>,
    /// E-mail address of the new club member, must end with the primary domain of the club
    pub email: MaxStr<255>,
    /// Referenced club the new user should belong to
    pub club: ForeignModel<ClubModel>,
}

impl Account {
    /// Retrieve the account by its uuid
    #[instrument(name = "Account::get_by_uuid", skip(exe))]
    pub async fn get_by_uuid(
        exe: impl Executor<'_>,
        uuid: AccountUuid,
    ) -> anyhow::Result<Option<Self>> {
        let mut guard = exe.ensure_transaction().await?;

        let mut account = None;

        if let Some(club_member) = ClubAccount::get_by_uuid(guard.get_transaction(), uuid).await? {
            account = Some(Account::ClubMember(club_member));
        } else if let Some(club_admin) =
            ClubAdminAccount::get_by_uuid(guard.get_transaction(), uuid).await?
        {
            account = Some(Account::ClubAdmin(club_admin));
        } else if let Some(admin) =
            AdministrativeAccount::get_by_uuid(guard.get_transaction(), uuid).await?
        {
            account = Some(Account::Superadmin(admin));
        }

        guard.commit().await?;

        Ok(account)
    }

    /// Retrieve the account by its username
    #[instrument(name = "Account::get_by_username", skip(exe))]
    pub async fn get_by_username(
        exe: impl Executor<'_>,
        username: &MaxStr<255>,
    ) -> anyhow::Result<Option<Self>> {
        let mut guard = exe.ensure_transaction().await?;

        let mut account = None;

        if let Some(club_member) =
            ClubAccount::get_by_username(guard.get_transaction(), username).await?
        {
            account = Some(Account::ClubMember(club_member));
        } else if let Some(club_admin) =
            ClubAdminAccount::get_by_username(guard.get_transaction(), username).await?
        {
            account = Some(Account::ClubAdmin(club_admin));
        } else if let Some(admin) =
            AdministrativeAccount::get_by_username(guard.get_transaction(), username).await?
        {
            account = Some(Account::Superadmin(admin));
        }

        guard.commit().await?;

        Ok(account)
    }

    /// Hash a password
    #[instrument(name = "Account::hash_password", skip_all)]
    pub fn hash_password(password: &MaxStr<72>) -> anyhow::Result<String> {
        Ok(bcrypt::hash(password.as_bytes(), 12)?)
    }

    /// Update the display name of an account
    #[instrument(name = "Account::update_display_name", skip(self, exe))]
    pub async fn update_display_name(
        &mut self,
        exe: impl Executor<'_>,
        display_name: MaxStr<255>,
    ) -> anyhow::Result<()> {
        match self {
            Account::ClubMember(club_member) => {
                rorm::update(exe, ClubAccountModel)
                    .set(ClubAccountModel.display_name, display_name)
                    .condition(ClubAccountModel.uuid.equals(club_member.uuid.0))
                    .await?;
            }
            Account::ClubAdmin(club_admin) => {
                rorm::update(exe, ClubAdminAccountModel)
                    .set(ClubAdminAccountModel.display_name, display_name)
                    .condition(ClubAdminAccountModel.uuid.equals(club_admin.uuid.0))
                    .await?;
            }
            Account::Superadmin(super_admin) => {
                rorm::update(exe, AdministrativeAccountModel)
                    .set(AdministrativeAccountModel.display_name, display_name)
                    .condition(AdministrativeAccountModel.uuid.equals(super_admin.uuid.0))
                    .await?;
            }
        }

        Ok(())
    }

    /// Check a password
    #[instrument(name = "Account::check_password", skip_all)]
    pub fn check_password(&self, password: &MaxStr<72>) -> anyhow::Result<bool> {
        let hashed_password = match self {
            Account::ClubMember(club_member) => &*club_member.hashed_password,
            Account::ClubAdmin(club_admin) => &*club_admin.hashed_password,
            Account::Superadmin(superadmin) => &*superadmin.hashed_password,
        };

        Ok(bcrypt::verify(&**password, hashed_password)?)
    }

    /// Set a new password for an account
    #[instrument(name = "Account::check_password", skip_all)]
    pub async fn set_password(
        &mut self,
        exe: impl Executor<'_>,
        password: &MaxStr<72>,
    ) -> anyhow::Result<()> {
        let hashed = MaxStr::new(Account::hash_password(password)?)?;

        match self {
            Account::ClubMember(club_member) => {
                rorm::update(exe, ClubAccountModel)
                    .set(ClubAccountModel.hashed_password, hashed.clone())
                    .condition(ClubAccountModel.uuid.equals(club_member.uuid.0))
                    .await?;

                club_member.hashed_password = hashed;
            }
            Account::ClubAdmin(club_admin) => {
                rorm::update(exe, ClubAdminAccountModel)
                    .set(ClubAdminAccountModel.hashed_password, hashed.clone())
                    .condition(ClubAdminAccountModel.uuid.equals(club_admin.uuid.0))
                    .await?;

                club_admin.hashed_password = hashed;
            }
            Account::Superadmin(superadmin) => {
                rorm::update(exe, AdministrativeAccountModel)
                    .set(AdministrativeAccountModel.hashed_password, hashed.clone())
                    .condition(AdministrativeAccountModel.uuid.equals(superadmin.uuid.0))
                    .await?;

                superadmin.hashed_password = hashed;
            }
        }

        Ok(())
    }

    /// Set a new display name for an account
    #[instrument(name = "Account::set_display_name", skip(self, exe))]
    pub async fn set_display_name(
        &mut self,
        exe: impl Executor<'_>,
        display_name: MaxStr<255>,
    ) -> anyhow::Result<()> {
        match self {
            Account::ClubMember(club_member) => {
                rorm::update(exe, ClubAccountModel)
                    .set(ClubAccountModel.display_name, display_name.clone())
                    .condition(ClubAccountModel.uuid.equals(club_member.uuid.0))
                    .await?;

                club_member.display_name = display_name;
            }
            Account::ClubAdmin(club_admin) => {
                rorm::update(exe, ClubAdminAccountModel)
                    .set(ClubAdminAccountModel.display_name, display_name.clone())
                    .condition(ClubAdminAccountModel.uuid.equals(club_admin.uuid.0))
                    .await?;

                club_admin.display_name = display_name;
            }
            Account::Superadmin(superadmin) => {
                rorm::update(exe, AdministrativeAccountModel)
                    .set(
                        AdministrativeAccountModel.display_name,
                        display_name.clone(),
                    )
                    .condition(AdministrativeAccountModel.uuid.equals(superadmin.uuid.0))
                    .await?;

                superadmin.display_name = display_name;
            }
        }

        Ok(())
    }

    /// Create a new request for resetting credentials
    ///
    /// The resulting instance can construct a link
    #[instrument(name = "Account::create_credential_reset", skip(self, exe))]
    pub async fn create_credential_reset(
        &self,
        exe: impl Executor<'_>,
    ) -> anyhow::Result<CredentialReset> {
        let mut guard = exe.ensure_transaction().await?;

        let now = OffsetDateTime::now_utc();
        let code_expires_at = now + Duration::minutes(10);
        let link_expires_at = now + Duration::days(7);
        let code = generate_code();

        #[allow(clippy::expect_used)]
        let code_field = MaxStr::new(code.clone()).expect("6-digit code is always <= 6 characters");

        let reset = match self {
            Account::ClubMember(club_member) => {
                let reset = rorm::insert(guard.get_transaction(), CredentialResetClubAccountModel)
                    .single(&CredentialResetClubAccountModel {
                        uuid: Uuid::new_v4(),
                        account: ForeignModelByField(club_member.uuid().0),
                        code: code_field,
                        code_expires_at,
                        link_expires_at,
                    })
                    .await?;

                CredentialReset {
                    uuid: CredentialResetUuid(reset.uuid),
                    code,
                    code_expires_at: reset.code_expires_at,
                    link_expires_at: reset.link_expires_at,
                }
            }
            Account::ClubAdmin(club_admin) => {
                let reset = rorm::insert(guard.get_transaction(), CredentialResetClubAdminModel)
                    .single(&CredentialResetClubAdminModel {
                        uuid: Uuid::new_v4(),
                        account: ForeignModelByField(club_admin.uuid().0),
                        code: code_field,
                        code_expires_at,
                        link_expires_at,
                    })
                    .await?;

                CredentialReset {
                    uuid: CredentialResetUuid(reset.uuid),
                    code,
                    code_expires_at: reset.code_expires_at,
                    link_expires_at: reset.link_expires_at,
                }
            }
            Account::Superadmin(superadmin) => {
                let reset = rorm::insert(guard.get_transaction(), CredentialResetSuperadminModel)
                    .single(&CredentialResetSuperadminModel {
                        uuid: Uuid::new_v4(),
                        account: ForeignModelByField(superadmin.uuid().0),
                        code: code_field,
                        code_expires_at,
                        link_expires_at,
                    })
                    .await?;

                CredentialReset {
                    uuid: CredentialResetUuid(reset.uuid),
                    code,
                    code_expires_at: reset.code_expires_at,
                    link_expires_at: reset.link_expires_at,
                }
            }
        };

        guard.commit().await?;

        Ok(reset)
    }
}
