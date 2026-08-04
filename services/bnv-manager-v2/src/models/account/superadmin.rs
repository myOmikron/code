use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;

use crate::models::account::AccountUuid;
use crate::models::account::AdministrativeAccount;
use crate::models::account::db::AdministrativeAccountModel;

impl AdministrativeAccount {
    /// Get the account by its uuid
    #[instrument(name = "AdministrativeAccount::get_by_uuid", skip(exe))]
    pub async fn get_by_uuid(
        exe: impl Executor<'_>,
        uuid: AccountUuid,
    ) -> anyhow::Result<Option<Self>> {
        Ok(rorm::query(exe, AdministrativeAccountModel)
            .condition(AdministrativeAccountModel.uuid.equals(uuid.0))
            .optional()
            .await?
            .map(Self::from))
    }

    /// Get the account by its username
    #[instrument(name = "AdministrativeAccount::get_by_username", skip(exe))]
    pub async fn get_by_username(
        exe: impl Executor<'_>,
        username: &MaxStr<255>,
    ) -> anyhow::Result<Option<Self>> {
        Ok(rorm::query(exe, AdministrativeAccountModel)
            .condition(AdministrativeAccountModel.username.equals(username))
            .optional()
            .await?
            .map(Self::from))
    }

    /// Retrieve all administrative accounts
    #[instrument(name = "AdministrativeAccount::get_all", skip(exe))]
    pub async fn get_all(exe: impl Executor<'_>) -> anyhow::Result<Vec<Self>> {
        Ok(rorm::query(exe, AdministrativeAccountModel)
            .all()
            .await?
            .into_iter()
            .map(Self::from)
            .collect())
    }
}

impl AdministrativeAccount {
    /// Get the uuid
    pub fn uuid(&self) -> AccountUuid {
        self.uuid
    }
}

impl From<AdministrativeAccountModel> for AdministrativeAccount {
    fn from(value: AdministrativeAccountModel) -> Self {
        Self {
            uuid: AccountUuid(value.uuid),
            display_name: value.display_name,
            username: value.username.0,
            modified_at: value.modified_at,
            created_at: value.created_at,
            hashed_password: value.hashed_password,
        }
    }
}
