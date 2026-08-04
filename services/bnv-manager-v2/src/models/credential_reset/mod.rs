//! Models for credential resets

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::fields::types::MaxStr;
use rand::RngExt;
use serde::Deserialize;
use serde::Serialize;
use time::OffsetDateTime;
use tracing::instrument;
use url::Url;
use uuid::Uuid;

use crate::models::account::Account;
use crate::models::account::AdministrativeAccount;
use crate::models::account::ClubAccount;
use crate::models::account::ClubAdminAccount;
use crate::models::account::db::AdministrativeAccountModel;
use crate::models::account::db::ClubAccountModel;
use crate::models::account::db::ClubAdminAccountModel;
use crate::models::credential_reset::db::CredentialResetClubAccountModel;
use crate::models::credential_reset::db::CredentialResetClubAdminModel;
use crate::models::credential_reset::db::CredentialResetSuperadminModel;
use crate::utils::links::Link;

pub(in crate::models) mod db;

/// Data model for handle credential resets
pub struct CredentialReset {
    /// UUID of the reset
    pub uuid: CredentialResetUuid,
    /// The 6-digit code for the reset
    pub code: String,
    /// Point in time the code expires
    pub code_expires_at: time::OffsetDateTime,
    /// Point in time the link expires
    pub link_expires_at: time::OffsetDateTime,
}

/// Wrapper for uuid
#[derive(Debug, Copy, Clone, Deserialize, Serialize, JsonSchema)]
pub struct CredentialResetUuid(pub Uuid);

/// Generate a random 6-digit code
pub(in crate::models) fn generate_code() -> String {
    let n: u32 = rand::rng().random_range(0..1_000_000);
    format!("{n:06}")
}

impl CredentialReset {
    /// Provide the constructed link the reset can be used at
    pub fn link(&self) -> Url {
        Link::reset_credentials(self.uuid)
    }

    /// Find a credential reset by its code, returning the reset and associated account
    #[instrument(name = "CredentialReset::find_by_code", skip(exe))]
    pub async fn find_by_code(
        exe: impl Executor<'_>,
        code: &MaxStr<6>,
    ) -> anyhow::Result<Option<(CredentialReset, Account)>> {
        let mut guard = exe.ensure_transaction().await?;
        let now = OffsetDateTime::now_utc();

        if let Some(reset) = rorm::query(guard.get_transaction(), CredentialResetClubAccountModel)
            .condition(rorm::and![
                CredentialResetClubAccountModel.code.equals(code),
                CredentialResetClubAccountModel
                    .code_expires_at
                    .greater_than(now),
            ])
            .optional()
            .await?
            && let Some(account) = rorm::query(guard.get_transaction(), ClubAccountModel)
                .condition(ClubAccountModel.uuid.equals(reset.account.0))
                .optional()
                .await?
        {
            guard.commit().await?;
            return Ok(Some((
                CredentialReset::from_club_account_model(reset),
                Account::ClubMember(ClubAccount::from(account)),
            )));
        }

        if let Some(reset) = rorm::query(guard.get_transaction(), CredentialResetClubAdminModel)
            .condition(rorm::and![
                CredentialResetClubAdminModel.code.equals(code),
                CredentialResetClubAdminModel
                    .code_expires_at
                    .greater_than(now),
            ])
            .optional()
            .await?
            && let Some(account) = rorm::query(guard.get_transaction(), ClubAdminAccountModel)
                .condition(ClubAdminAccountModel.uuid.equals(reset.account.0))
                .optional()
                .await?
        {
            guard.commit().await?;
            return Ok(Some((
                CredentialReset::from_club_admin_model(reset),
                Account::ClubAdmin(ClubAdminAccount::from(account)),
            )));
        }

        if let Some(reset) = rorm::query(guard.get_transaction(), CredentialResetSuperadminModel)
            .condition(rorm::and![
                CredentialResetSuperadminModel.code.equals(code),
                CredentialResetSuperadminModel
                    .code_expires_at
                    .greater_than(now),
            ])
            .optional()
            .await?
            && let Some(account) = rorm::query(guard.get_transaction(), AdministrativeAccountModel)
                .condition(AdministrativeAccountModel.uuid.equals(reset.account.0))
                .optional()
                .await?
        {
            guard.commit().await?;
            return Ok(Some((
                CredentialReset::from_superadmin_model(reset),
                Account::Superadmin(AdministrativeAccount::from(account)),
            )));
        }

        guard.commit().await?;
        Ok(None)
    }

    /// Find a credential reset by its UUID, returning the reset and associated account
    #[instrument(name = "CredentialReset::find_by_uuid", skip(exe))]
    pub async fn find_by_uuid(
        exe: impl Executor<'_>,
        CredentialResetUuid(uuid): CredentialResetUuid,
    ) -> anyhow::Result<Option<(CredentialReset, Account)>> {
        let mut guard = exe.ensure_transaction().await?;
        let now = OffsetDateTime::now_utc();

        if let Some(reset) = rorm::query(guard.get_transaction(), CredentialResetClubAccountModel)
            .condition(rorm::and![
                CredentialResetClubAccountModel.uuid.equals(uuid),
                CredentialResetClubAccountModel
                    .link_expires_at
                    .greater_than(now),
            ])
            .optional()
            .await?
            && let Some(account) = rorm::query(guard.get_transaction(), ClubAccountModel)
                .condition(ClubAccountModel.uuid.equals(reset.account.0))
                .optional()
                .await?
        {
            guard.commit().await?;
            return Ok(Some((
                CredentialReset::from_club_account_model(reset),
                Account::ClubMember(ClubAccount::from(account)),
            )));
        }

        if let Some(reset) = rorm::query(guard.get_transaction(), CredentialResetClubAdminModel)
            .condition(rorm::and![
                CredentialResetClubAdminModel.uuid.equals(uuid),
                CredentialResetClubAdminModel
                    .link_expires_at
                    .greater_than(now),
            ])
            .optional()
            .await?
            && let Some(account) = rorm::query(guard.get_transaction(), ClubAdminAccountModel)
                .condition(ClubAdminAccountModel.uuid.equals(reset.account.0))
                .optional()
                .await?
        {
            guard.commit().await?;
            return Ok(Some((
                CredentialReset::from_club_admin_model(reset),
                Account::ClubAdmin(ClubAdminAccount::from(account)),
            )));
        }

        if let Some(reset) = rorm::query(guard.get_transaction(), CredentialResetSuperadminModel)
            .condition(rorm::and![
                CredentialResetSuperadminModel.uuid.equals(uuid),
                CredentialResetSuperadminModel
                    .link_expires_at
                    .greater_than(now),
            ])
            .optional()
            .await?
            && let Some(account) = rorm::query(guard.get_transaction(), AdministrativeAccountModel)
                .condition(AdministrativeAccountModel.uuid.equals(reset.account.0))
                .optional()
                .await?
        {
            guard.commit().await?;
            return Ok(Some((
                CredentialReset::from_superadmin_model(reset),
                Account::Superadmin(AdministrativeAccount::from(account)),
            )));
        }

        guard.commit().await?;
        Ok(None)
    }

    fn from_club_account_model(model: CredentialResetClubAccountModel) -> Self {
        Self {
            uuid: CredentialResetUuid(model.uuid),
            code: model.code.into_inner(),
            code_expires_at: model.code_expires_at,
            link_expires_at: model.link_expires_at,
        }
    }

    fn from_club_admin_model(model: CredentialResetClubAdminModel) -> Self {
        Self {
            uuid: CredentialResetUuid(model.uuid),
            code: model.code.into_inner(),
            code_expires_at: model.code_expires_at,
            link_expires_at: model.link_expires_at,
        }
    }

    fn from_superadmin_model(model: CredentialResetSuperadminModel) -> Self {
        Self {
            uuid: CredentialResetUuid(model.uuid),
            code: model.code.into_inner(),
            code_expires_at: model.code_expires_at,
            link_expires_at: model.link_expires_at,
        }
    }

    /// Delete a credential reset by its UUID from all tables
    #[instrument(name = "CredentialReset::delete_by_uuid", skip(exe))]
    pub async fn delete_by_uuid(
        exe: impl Executor<'_>,
        CredentialResetUuid(uuid): CredentialResetUuid,
    ) -> anyhow::Result<()> {
        let mut guard = exe.ensure_transaction().await?;

        rorm::delete(guard.get_transaction(), CredentialResetClubAccountModel)
            .condition(CredentialResetClubAccountModel.uuid.equals(uuid))
            .await?;
        rorm::delete(guard.get_transaction(), CredentialResetClubAdminModel)
            .condition(CredentialResetClubAdminModel.uuid.equals(uuid))
            .await?;
        rorm::delete(guard.get_transaction(), CredentialResetSuperadminModel)
            .condition(CredentialResetSuperadminModel.uuid.equals(uuid))
            .await?;

        guard.commit().await?;
        Ok(())
    }

    /// Clear expired credential resets from all tables
    #[instrument(name = "CredentialReset::clear_expired", skip(exe))]
    pub async fn clear_expired(exe: impl Executor<'_>) -> anyhow::Result<()> {
        let mut guard = exe.ensure_transaction().await?;
        let now = OffsetDateTime::now_utc();

        rorm::delete(guard.get_transaction(), CredentialResetClubAccountModel)
            .condition(
                CredentialResetClubAccountModel
                    .link_expires_at
                    .less_than(now),
            )
            .await?;
        rorm::delete(guard.get_transaction(), CredentialResetClubAdminModel)
            .condition(CredentialResetClubAdminModel.link_expires_at.less_than(now))
            .await?;
        rorm::delete(guard.get_transaction(), CredentialResetSuperadminModel)
            .condition(
                CredentialResetSuperadminModel
                    .link_expires_at
                    .less_than(now),
            )
            .await?;

        guard.commit().await?;
        Ok(())
    }
}
