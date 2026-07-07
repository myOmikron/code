use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModelByField;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::account::ClubAccount;
use crate::models::account::CreateManualClubMember;
use crate::models::account::db::ClubAccountModel;
use crate::models::account::db::ClubAccountModelInsert;
use crate::models::account::db::UsernameModel;
use crate::models::club::ClubUuid;

impl ClubAccount {
    /// Get the account by its uuid
    #[instrument(name = "ClubAccount::get_by_uuid", skip(exe))]
    pub async fn get_by_uuid(
        exe: impl Executor<'_>,
        uuid: AccountUuid,
    ) -> anyhow::Result<Option<Self>> {
        Ok(rorm::query(exe, ClubAccountModel)
            .condition(ClubAccountModel.uuid.equals(uuid.0))
            .optional()
            .await?
            .map(Self::from))
    }

    /// Get the account by its username
    #[instrument(name = "ClubAccount::get_by_username", skip(exe))]
    pub async fn get_by_username(
        exe: impl Executor<'_>,
        username: &MaxStr<255>,
    ) -> anyhow::Result<Option<Self>> {
        Ok(rorm::query(exe, ClubAccountModel)
            .condition(ClubAccountModel.username.equals(username))
            .optional()
            .await?
            .map(Self::from))
    }

    /// Get the account by its email
    #[instrument(name = "ClubAccount::get_by_email", skip(exe))]
    pub async fn get_by_email(
        exe: impl Executor<'_>,
        email: &MaxStr<255>,
    ) -> anyhow::Result<Option<Self>> {
        Ok(rorm::query(exe, ClubAccountModel)
            .condition(ClubAccountModel.email.equals(email))
            .optional()
            .await?
            .map(Self::from))
    }

    /// Create a new club account from the provided input
    ///
    /// This should only be called from maintenance features like data imports.
    /// It also creates a new `UsernameModel`. It fails when the username or email is taken.
    #[instrument(
        name = "ClubAccount::create_raw",
        skip_all,
        fields(username=%new_member.username, display_name=%new_member.display_name, email=%new_member.email)
    )]
    pub async fn create_raw(
        exe: impl Executor<'_>,
        new_member: CreateManualClubMember,
    ) -> anyhow::Result<Self> {
        let mut guard = exe.ensure_transaction().await?;

        let username = rorm::insert(guard.get_transaction(), UsernameModel)
            .single(&UsernameModel {
                username: new_member.username,
            })
            .await?;

        let model = rorm::insert(guard.get_transaction(), ClubAccountModel)
            .single(&ClubAccountModelInsert {
                uuid: Uuid::new_v4(),
                username: ForeignModelByField(username.username),
                display_name: new_member.display_name,
                hashed_password: new_member.hashed_password,
                email: new_member.email,
                club: ForeignModelByField(new_member.club.0),
            })
            .await?;

        guard.commit().await?;
        Ok(Self::from(model))
    }
}

impl ClubAccount {
    /// Retrieve the uuid
    pub fn uuid(&self) -> AccountUuid {
        self.uuid
    }

    /// Delete a club member account
    #[instrument(name = "ClubAccount::delete", skip(self, exe))]
    pub async fn delete(self, exe: impl Executor<'_>) -> anyhow::Result<()> {
        rorm::delete(exe, ClubAccountModel)
            .condition(ClubAccountModel.uuid.equals(self.uuid.0))
            .await?;
        Ok(())
    }

    /// Retrieve the hashed password of the account
    pub fn hashed_password(&self) -> MaxStr<255> {
        self.hashed_password.clone()
    }

    /// Update the has_app_password flag of the account
    #[instrument(name = "ClubAccount::update_has_app_password_set", skip(self, exe))]
    pub async fn update_has_app_password_set(
        &mut self,
        exe: impl Executor<'_>,
        has_password: bool,
    ) -> anyhow::Result<()> {
        rorm::update(exe, ClubAccountModel)
            .set(ClubAccountModel.has_app_password, has_password)
            .condition(ClubAccountModel.uuid.equals(self.uuid.0))
            .await?;

        self.has_app_password = has_password;

        Ok(())
    }
}

impl From<ClubAccountModel> for ClubAccount {
    fn from(value: ClubAccountModel) -> Self {
        Self {
            uuid: AccountUuid(value.uuid),
            display_name: value.display_name,
            username: value.username.0,
            email: value.email,
            club: ClubUuid(value.club.0),
            modified_at: value.modified_at,
            created_at: value.created_at,
            has_app_password: value.has_app_password,
            hashed_password: value.hashed_password,
        }
    }
}
