use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;

use crate::models::account::AccountUuid;
use crate::models::account::ClubAdminAccount;
use crate::models::account::db::ClubAdminAccountModel;
use crate::models::club::ClubUuid;

impl ClubAdminAccount {
    /// Retrieve the account by its uuid
    #[instrument(name = "ClubAdminAccount::get_by_uuid", skip(exe))]
    pub async fn get_by_uuid(
        exe: impl Executor<'_>,
        uuid: AccountUuid,
    ) -> anyhow::Result<Option<Self>> {
        Ok(rorm::query(exe, ClubAdminAccountModel)
            .condition(ClubAdminAccountModel.uuid.equals(uuid.0))
            .optional()
            .await?
            .map(Self::from))
    }

    /// Retrieve the account by its username
    #[instrument(name = "ClubAdminAccount::get_by_username", skip(exe))]
    pub async fn get_by_username(
        exe: impl Executor<'_>,
        username: &MaxStr<255>,
    ) -> anyhow::Result<Option<Self>> {
        Ok(rorm::query(exe, ClubAdminAccountModel)
            .condition(ClubAdminAccountModel.username.equals(username))
            .optional()
            .await?
            .map(Self::from))
    }
}

impl ClubAdminAccount {
    /// Retrieve the uuid
    pub fn uuid(&self) -> AccountUuid {
        self.uuid
    }

    /// Delete the club admin
    #[instrument(skip(self, exe), name = "ClubAdminAccount::delete")]
    pub async fn delete(self, exe: impl Executor<'_>) -> anyhow::Result<()> {
        rorm::delete(exe, ClubAdminAccountModel)
            .condition(ClubAdminAccountModel.uuid.equals(self.uuid.0))
            .await?;

        Ok(())
    }
}

impl From<ClubAdminAccountModel> for ClubAdminAccount {
    fn from(value: ClubAdminAccountModel) -> Self {
        Self {
            uuid: AccountUuid(value.uuid),
            display_name: value.display_name,
            username: value.username.0,
            club: ClubUuid(value.club.0),
            modified_at: value.modified_at,
            created_at: value.created_at,
            hashed_password: value.hashed_password,
        }
    }
}
