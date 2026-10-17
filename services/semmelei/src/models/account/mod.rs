//! Staff accounts, each logging in as one [`Identity`]

use galvyn::core::Module;
use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
#[cfg(doc)]
use galvyn_identity::Identity;
use galvyn_identity::IdentityModule;
use galvyn_identity::IdentityUuid;
#[cfg(doc)]
use galvyn_identity::Passkey as AccountPasskey;
use galvyn_identity::PasskeyUuid;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use time::OffsetDateTime;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::db::AccountInsertPatch;
use crate::models::account::db::AccountModel;

pub(in crate::models) mod db;
mod extractor;

/// Role of a staff account
///
/// `Admin` implies all permissions of `Verkauf`.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum Role {
    /// Manages items, prices, categories and staff accounts
    Admin,
    /// Processes incoming pre-orders in the shop
    Verkauf,
}
custom_db_enum! {
    enum: Role,
    variants: [Admin, Verkauf],
    decoder: RoleDecoder,
}

/// A staff account (Admin or Verkauf)
///
/// Authentication is passkey-only: an account has no password, its
/// [`Identity`] holds [`AccountPasskey`]s enrolled through Registration links.
#[derive(Debug, Clone)]
pub struct Account {
    /// Primary key
    pub uuid: AccountUuid,

    /// The username of the account
    pub username: MaxStr<255>,

    /// The account's role
    pub role: Role,

    /// The point in time the account was created
    pub created_at: OffsetDateTime,

    /// The Identity this account logs in as
    pub identity: IdentityUuid,
}

/// Wrapper for the primary key of the [`Account`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct AccountUuid(Uuid);

impl AccountUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }
}

impl Account {
    /// Fetch all accounts, each with its Identity's most recent login
    #[instrument(name = "Account::get_all", skip(exe))]
    pub async fn get_all(
        exe: impl Executor<'_>,
    ) -> Result<Vec<(Account, Option<OffsetDateTime>)>, rorm::Error> {
        let accounts = rorm::query(exe, (AccountModel, AccountModel.identity.last_login_at))
            .all()
            .await?;
        Ok(accounts
            .into_iter()
            .map(|(account, last_login_at)| (Account::from(account), last_login_at))
            .collect())
    }

    /// Fetch an account by its primary key
    #[instrument(name = "Account::get_by_uuid", skip(exe))]
    pub async fn get_by_uuid(
        exe: impl Executor<'_>,
        uuid: AccountUuid,
    ) -> Result<Option<Account>, rorm::Error> {
        let account = rorm::query(exe, AccountModel)
            .condition(AccountModel.uuid.equals(uuid.0))
            .optional()
            .await?;
        Ok(account.map(Account::from))
    }

    /// Fetch the account logging in as `identity`
    #[instrument(name = "Account::get_by_identity", skip(exe))]
    pub async fn get_by_identity(
        exe: impl Executor<'_>,
        identity: IdentityUuid,
    ) -> Result<Option<Account>, rorm::Error> {
        let account = rorm::query(exe, AccountModel)
            .condition(AccountModel.identity.equals(identity.into_inner()))
            .optional()
            .await?;
        Ok(account.map(Account::from))
    }

    /// Fetch an account by its username
    #[instrument(name = "Account::get_by_username", skip(exe))]
    pub async fn get_by_username(
        exe: impl Executor<'_>,
        username: &str,
    ) -> Result<Option<Account>, rorm::Error> {
        let account = rorm::query(exe, AccountModel)
            .condition(AccountModel.username.equals(username))
            .optional()
            .await?;
        Ok(account.map(Account::from))
    }

    /// Insert a new account with an Identity of its own
    ///
    /// Fails with a unique violation if the username is already taken.
    #[instrument(name = "Account::insert", skip(tx))]
    pub async fn insert(
        tx: &mut Transaction,
        username: MaxStr<255>,
        role: Role,
    ) -> Result<(AccountUuid, IdentityUuid), rorm::Error> {
        let identity = IdentityModule::global().create_identity(&mut *tx).await?;
        let uuid = rorm::insert(&mut *tx, AccountModel)
            .return_primary_key()
            .single(&AccountInsertPatch {
                uuid: Uuid::now_v7(),
                username,
                role,
                identity: ForeignModelByField(identity.into_inner()),
            })
            .await?;
        Ok((AccountUuid(uuid), identity))
    }

    /// Update an account's username and role
    ///
    /// Returns `false` if the account does not exist.
    /// Fails with a unique violation if the username is already taken.
    #[instrument(name = "Account::update", skip(exe))]
    pub async fn update(
        exe: impl Executor<'_>,
        uuid: AccountUuid,
        username: MaxStr<255>,
        role: Role,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(exe, AccountModel)
            .set(AccountModel.username, username)
            .set(AccountModel.role, role)
            .condition(AccountModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Delete an account by deleting its Identity
    ///
    /// The cascades take the account, its Passkeys and its Registration links
    /// along.
    ///
    /// Returns `false` if the account does not exist.
    #[instrument(name = "Account::delete", skip(tx))]
    pub async fn delete(tx: &mut Transaction, uuid: AccountUuid) -> Result<bool, rorm::Error> {
        let Some(account) = Self::get_by_uuid(&mut *tx, uuid).await? else {
            return Ok(false);
        };
        IdentityModule::global()
            .delete_identity(&mut *tx, account.identity)
            .await
    }
}

/// Wrapper for the primary key of the [`AccountPasskey`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct AccountPasskeyUuid(Uuid);

impl From<PasskeyUuid> for AccountPasskeyUuid {
    fn from(value: PasskeyUuid) -> Self {
        Self(value.into_inner())
    }
}

impl From<AccountPasskeyUuid> for PasskeyUuid {
    fn from(value: AccountPasskeyUuid) -> Self {
        PasskeyUuid::new(value.0)
    }
}

impl From<AccountModel> for Account {
    fn from(value: AccountModel) -> Self {
        Self {
            uuid: AccountUuid(value.uuid),
            username: value.username,
            role: value.role,
            created_at: value.created_at,
            identity: IdentityUuid::new_from_field(value.identity),
        }
    }
}
