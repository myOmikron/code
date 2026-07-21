//! Staff accounts, their passkeys and registration invites

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModel;
use rand::distr::Alphanumeric;
use rand::distr::SampleString;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use time::Duration;
use time::OffsetDateTime;
use tracing::instrument;
use uuid::Uuid;
use webauthn_rs::prelude::Passkey;

use crate::models::account::db::AccountInsertPatch;
use crate::models::account::db::AccountModel;
use crate::models::account::db::AccountPasskeyInsertPatch;
use crate::models::account::db::AccountPasskeyModel;
use crate::models::account::db::RegistrationTokenInsertPatch;
use crate::models::account::db::RegistrationTokenModel;

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
/// Authentication is passkey-only: an account has no password,
/// only [`AccountPasskey`]s registered through invite links.
#[derive(Debug, Clone)]
pub struct Account {
    /// Primary key
    pub uuid: AccountUuid,

    /// The username of the account
    pub username: MaxStr<255>,

    /// The account's role
    pub role: Role,

    /// The point in time when the account logged in recently
    pub last_login_at: Option<OffsetDateTime>,

    /// The point in time the account was created
    pub created_at: OffsetDateTime,
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

    /// Create a new `AccountUuid` from a `ForeignModel<AccountModel>`
    pub(in crate::models) fn new_from_field(field: ForeignModel<AccountModel>) -> Self {
        Self(field.0)
    }
}

impl Account {
    /// Fetch all accounts
    #[instrument(name = "Account::get_all", skip(exe))]
    pub async fn get_all(exe: impl Executor<'_>) -> Result<Vec<Account>, rorm::Error> {
        let accounts = rorm::query(exe, AccountModel).all().await?;
        Ok(accounts.into_iter().map(Account::from).collect())
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

    /// Check whether an account exists
    #[instrument(name = "Account::exists", skip(exe))]
    pub async fn exists(exe: impl Executor<'_>, uuid: AccountUuid) -> Result<bool, rorm::Error> {
        Ok(rorm::query(exe, (AccountModel.uuid,))
            .condition(AccountModel.uuid.equals(uuid.0))
            .optional()
            .await?
            .is_some())
    }

    /// Insert a new account and return its primary key
    ///
    /// Fails with a unique violation if the username is already taken.
    #[instrument(name = "Account::insert", skip(exe))]
    pub async fn insert(
        exe: impl Executor<'_>,
        username: MaxStr<255>,
        role: Role,
    ) -> Result<AccountUuid, rorm::Error> {
        let uuid = rorm::insert(exe, AccountModel)
            .return_primary_key()
            .single(&AccountInsertPatch {
                uuid: Uuid::new_v4(),
                username,
                role,
            })
            .await?;
        Ok(AccountUuid(uuid))
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

    /// Delete an account
    ///
    /// Returns `false` if the account does not exist.
    #[instrument(name = "Account::delete", skip(exe))]
    pub async fn delete(exe: impl Executor<'_>, uuid: AccountUuid) -> Result<bool, rorm::Error> {
        let affected = rorm::delete(exe, AccountModel)
            .condition(AccountModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Store that the account just logged in
    #[instrument(name = "Account::record_login", skip(exe))]
    pub async fn record_login(
        exe: impl Executor<'_>,
        uuid: AccountUuid,
    ) -> Result<(), rorm::Error> {
        rorm::update(exe, AccountModel)
            .set(AccountModel.last_login_at, Some(OffsetDateTime::now_utc()))
            .condition(AccountModel.uuid.equals(uuid.0))
            .await?;
        Ok(())
    }
}

/// A WebAuthn passkey registered to an [`Account`]
pub struct AccountPasskey {
    /// Primary key
    pub uuid: AccountPasskeyUuid,

    /// The account this passkey belongs to
    pub account: AccountUuid,

    /// Human-readable device label shown in the passkey management UI
    pub label: MaxStr<255>,

    /// The passkey (public key, counter, ...)
    pub credential: Passkey,

    /// The point in time this passkey was last used for a login
    pub last_used_at: Option<OffsetDateTime>,

    /// The point in time this passkey was registered
    pub created_at: OffsetDateTime,
}

/// Wrapper for the primary key of the [`AccountPasskey`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct AccountPasskeyUuid(Uuid);

impl AccountPasskeyUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }
}

/// Data for inserting a new [`AccountPasskey`]
pub struct AccountPasskeyInsert {
    /// The account this passkey belongs to
    pub account: AccountUuid,
    /// Human-readable device label
    pub label: MaxStr<255>,
    /// The credential id (base64url)
    pub credential_id: MaxStr<1024>,
    /// The passkey returned by the finished registration ceremony
    pub credential: Passkey,
}

impl AccountPasskey {
    /// Fetch all passkeys of an account
    #[instrument(name = "AccountPasskey::get_by_account", skip(exe))]
    pub async fn get_by_account(
        exe: impl Executor<'_>,
        account: AccountUuid,
    ) -> Result<Vec<AccountPasskey>, rorm::Error> {
        let passkeys = rorm::query(exe, AccountPasskeyModel)
            .condition(AccountPasskeyModel.account.equals(account.0))
            .all()
            .await?;
        Ok(passkeys.into_iter().map(AccountPasskey::from).collect())
    }

    /// Insert a freshly registered passkey
    ///
    /// Fails with a unique violation if the credential is already registered.
    #[instrument(name = "AccountPasskey::insert", skip(exe, insert))]
    pub async fn insert(
        exe: impl Executor<'_>,
        insert: AccountPasskeyInsert,
    ) -> Result<(), rorm::Error> {
        rorm::insert(exe, AccountPasskeyModel)
            .single(&AccountPasskeyInsertPatch {
                uuid: Uuid::new_v4(),
                account: ForeignModelByField(insert.account.0),
                label: insert.label,
                credential_id: insert.credential_id,
                credential: Json(insert.credential),
            })
            .await?;
        Ok(())
    }

    /// Persist an updated credential (counter, backup state)
    /// and stamp `last_used_at`
    #[instrument(name = "AccountPasskey::update_credential", skip(exe, credential))]
    pub async fn update_credential(
        exe: impl Executor<'_>,
        uuid: AccountPasskeyUuid,
        credential: Passkey,
    ) -> Result<(), rorm::Error> {
        rorm::update(exe, AccountPasskeyModel)
            .set(AccountPasskeyModel.credential, Json(credential))
            .set(
                AccountPasskeyModel.last_used_at,
                Some(OffsetDateTime::now_utc()),
            )
            .condition(AccountPasskeyModel.uuid.equals(uuid.0))
            .await?;
        Ok(())
    }

    /// Delete a passkey
    ///
    /// Returns `false` if the passkey does not exist.
    #[instrument(name = "AccountPasskey::delete", skip(exe))]
    pub async fn delete(
        exe: impl Executor<'_>,
        uuid: AccountPasskeyUuid,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::delete(exe, AccountPasskeyModel)
            .condition(AccountPasskeyModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }
}

/// One-time invite token allowing an account to register its first passkey
///
/// Created together with the account (cli or admin UI) and consumed by the
/// public registration endpoint. Also the "lost device" recovery mechanism:
/// an admin simply issues a new token.
pub struct RegistrationToken {
    /// Primary key
    pub uuid: RegistrationTokenUuid,

    /// The account this token registers a passkey for
    pub account: AccountUuid,

    /// The secret token contained in the invite link
    pub token: MaxStr<64>,

    /// The point in time this token stops being valid
    pub expires_at: OffsetDateTime,

    /// Whether this token has already been used
    pub used: bool,

    /// The point in time this token was created
    pub created_at: OffsetDateTime,
}

/// Wrapper for the primary key of the [`RegistrationToken`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct RegistrationTokenUuid(Uuid);

impl RegistrationTokenUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }
}

impl RegistrationToken {
    /// How long a freshly issued registration token stays valid
    pub const VALIDITY: Duration = Duration::days(7);

    /// Create and persist a new one-time token for `account`
    ///
    /// Returns the secret to embed in the invite link.
    #[instrument(name = "RegistrationToken::create", skip(exe))]
    pub async fn create(
        exe: impl Executor<'_>,
        account: AccountUuid,
    ) -> Result<MaxStr<64>, rorm::Error> {
        let token = MaxStr::new(Alphanumeric.sample_string(&mut rand::rng(), 43))
            .unwrap_or_else(|_| unreachable!("43 alphanumeric chars fit into 64"));
        rorm::insert(exe, RegistrationTokenModel)
            .single(&RegistrationTokenInsertPatch {
                uuid: Uuid::new_v4(),
                account: ForeignModelByField(account.0),
                token: token.clone(),
                expires_at: OffsetDateTime::now_utc() + Self::VALIDITY,
                used: false,
            })
            .await?;
        Ok(token)
    }

    /// Fetch a token by its secret
    #[instrument(name = "RegistrationToken::get_by_token", skip(exe, token))]
    pub async fn get_by_token(
        exe: impl Executor<'_>,
        token: &MaxStr<64>,
    ) -> Result<Option<RegistrationToken>, rorm::Error> {
        let registration_token = rorm::query(exe, RegistrationTokenModel)
            .condition(RegistrationTokenModel.token.equals(token))
            .optional()
            .await?;
        Ok(registration_token.map(RegistrationToken::from))
    }

    /// Mark a token as used
    #[instrument(name = "RegistrationToken::mark_used", skip(exe))]
    pub async fn mark_used(
        exe: impl Executor<'_>,
        uuid: RegistrationTokenUuid,
    ) -> Result<(), rorm::Error> {
        rorm::update(exe, RegistrationTokenModel)
            .set(RegistrationTokenModel.used, true)
            .condition(RegistrationTokenModel.uuid.equals(uuid.0))
            .await?;
        Ok(())
    }
}

impl From<AccountModel> for Account {
    fn from(value: AccountModel) -> Self {
        Self {
            uuid: AccountUuid(value.uuid),
            username: value.username,
            role: value.role,
            last_login_at: value.last_login_at,
            created_at: value.created_at,
        }
    }
}

impl From<AccountPasskeyModel> for AccountPasskey {
    fn from(value: AccountPasskeyModel) -> Self {
        Self {
            uuid: AccountPasskeyUuid(value.uuid),
            account: AccountUuid::new_from_field(value.account),
            label: value.label,
            credential: value.credential.0,
            last_used_at: value.last_used_at,
            created_at: value.created_at,
        }
    }
}

impl From<RegistrationTokenModel> for RegistrationToken {
    fn from(value: RegistrationTokenModel) -> Self {
        Self {
            uuid: RegistrationTokenUuid(value.uuid),
            account: AccountUuid::new_from_field(value.account),
            token: value.token,
            expires_at: value.expires_at,
            used: value.used,
            created_at: value.created_at,
        }
    }
}
