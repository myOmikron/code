//! Accounts, their passkeys and registration invites

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModel;
use rand::distr::Alphanumeric;
use rand::distr::SampleString;
use serde::Deserialize;
use serde::Deserializer;
use serde::Serialize;
use thiserror::Error;
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

/// The login handle of an [`Account`]
///
/// Doubles as the account's display name. Since it is also the lookup key of
/// the username-first WebAuthn ceremony, it is restricted to a small ASCII
/// charset: that keeps normalization length-preserving and rules out
/// look-alike names pointing at somebody else's credentials.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, JsonSchema)]
pub struct Username(MaxStr<{ Username::MAX_LEN }>);

/// Reason a string was rejected by [`Username::new`]
#[derive(Debug, Clone, Copy, Error)]
pub enum InvalidUsername {
    /// The string was too short or too long
    #[error(
        "a username must be between {min} and {max} characters long",
        min = Username::MIN_LEN,
        max = Username::MAX_LEN,
    )]
    Length,

    /// The string contained a character outside the allowed charset
    #[error("a username may only contain a-z, A-Z, 0-9, '_', '-' and '.'")]
    Charset,

    /// The string did not start with a letter or digit
    #[error("a username must start with a letter or a digit")]
    Start,
}

impl Username {
    /// The shortest permitted username
    pub const MIN_LEN: usize = 3;

    /// The longest permitted username
    pub const MAX_LEN: usize = 32;

    /// Validate a string as a username
    pub fn new(username: impl Into<String>) -> Result<Self, InvalidUsername> {
        let username = username.into();

        if !username
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || matches!(char, '_' | '-' | '.'))
        {
            return Err(InvalidUsername::Charset);
        }
        // The charset is ascii-only, so `len` is also the number of characters
        if !(Self::MIN_LEN..=Self::MAX_LEN).contains(&username.len()) {
            return Err(InvalidUsername::Length);
        }
        if !username.starts_with(|char: char| char.is_ascii_alphanumeric()) {
            return Err(InvalidUsername::Start);
        }

        Ok(Self(MaxStr::new(username).unwrap_or_else(|_| {
            unreachable!("the length is checked above")
        })))
    }

    /// The username as its account spelled it
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// The lowercased form used for lookup and uniqueness
    pub fn normalized(&self) -> MaxStr<{ Self::MAX_LEN }> {
        MaxStr::new(self.0.to_ascii_lowercase())
            .unwrap_or_else(|_| unreachable!("lowercasing ascii preserves the length"))
    }

    /// Wrap a username read from the database
    ///
    /// It went through [`Username::new`] before it was stored.
    pub(in crate::models) fn new_from_field(field: MaxStr<{ Self::MAX_LEN }>) -> Self {
        Self(field)
    }
}

impl<'de> Deserialize<'de> for Username {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::new(String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

/// An account
///
/// Authentication is passkey-only: an account has no password, only
/// [`AccountPasskey`]s registered through invite links.
#[derive(Debug, Clone)]
pub struct Account {
    /// Primary key
    pub uuid: AccountUuid,

    /// The account's login handle and display name
    pub username: Username,

    /// The email address used to reach the account's owner
    pub email: MaxStr<255>,

    /// The point in time the account was created
    pub created_at: OffsetDateTime,

    /// The point in time when the account logged in recently
    pub last_login_at: Option<OffsetDateTime>,
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
    /// Fetch all accounts, alphabetically by username
    ///
    /// The primary key breaks ties, so the order is total.
    #[instrument(name = "Account::get_all", skip(tx))]
    pub async fn get_all(tx: &mut Transaction) -> Result<Vec<Account>, rorm::Error> {
        let accounts = rorm::query(tx, AccountModel)
            .order_asc(AccountModel.username_normalized)
            .order_asc(AccountModel.uuid)
            .all()
            .await?;
        Ok(accounts.into_iter().map(Account::from).collect())
    }

    /// Fetch an account by its primary key
    #[instrument(name = "Account::get_by_uuid", skip(tx))]
    pub async fn get_by_uuid(
        tx: &mut Transaction,
        uuid: AccountUuid,
    ) -> Result<Option<Account>, rorm::Error> {
        let account = rorm::query(tx, AccountModel)
            .condition(AccountModel.uuid.equals(uuid.0))
            .optional()
            .await?;
        Ok(account.map(Account::from))
    }

    /// Fetch an account by its username
    ///
    /// The lookup ignores case. This is the first step of a login: the
    /// credential ids of the returned account become the ceremony's
    /// `allowCredentials`.
    #[instrument(name = "Account::get_by_username", skip(tx))]
    pub async fn get_by_username(
        tx: &mut Transaction,
        username: &Username,
    ) -> Result<Option<Account>, rorm::Error> {
        let account = rorm::query(tx, AccountModel)
            .condition(
                AccountModel
                    .username_normalized
                    .equals(&username.normalized()),
            )
            .optional()
            .await?;
        Ok(account.map(Account::from))
    }

    /// Fetch an account by its email address
    #[instrument(name = "Account::get_by_email", skip(tx))]
    pub async fn get_by_email(
        tx: &mut Transaction,
        email: &MaxStr<255>,
    ) -> Result<Option<Account>, rorm::Error> {
        let account = rorm::query(tx, AccountModel)
            .condition(AccountModel.email.equals(email))
            .optional()
            .await?;
        Ok(account.map(Account::from))
    }

    /// Check whether an account exists
    #[instrument(name = "Account::exists", skip(tx))]
    pub async fn exists(tx: &mut Transaction, uuid: AccountUuid) -> Result<bool, rorm::Error> {
        Ok(rorm::query(tx, (AccountModel.uuid,))
            .condition(AccountModel.uuid.equals(uuid.0))
            .optional()
            .await?
            .is_some())
    }

    /// Insert a new account and return its primary key
    ///
    /// Fails with a unique violation if the username or the email is already
    /// taken.
    #[instrument(name = "Account::insert", skip(tx))]
    pub async fn insert(
        tx: &mut Transaction,
        username: Username,
        email: MaxStr<255>,
    ) -> Result<AccountUuid, rorm::Error> {
        let uuid = rorm::insert(tx, AccountModel)
            .return_primary_key()
            .single(&AccountInsertPatch {
                uuid: Uuid::now_v7(),
                username_normalized: username.normalized(),
                username: username.0,
                email,
            })
            .await?;
        Ok(AccountUuid(uuid))
    }

    /// Update an account's username and email
    ///
    /// Returns `false` if the account does not exist.
    /// Fails with a unique violation if the username or the email is already
    /// taken.
    #[instrument(name = "Account::update", skip(tx))]
    pub async fn update(
        tx: &mut Transaction,
        uuid: AccountUuid,
        username: Username,
        email: MaxStr<255>,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(tx, AccountModel)
            .set(AccountModel.username_normalized, username.normalized())
            .set(AccountModel.username, username.0)
            .set(AccountModel.email, email)
            .condition(AccountModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Delete an account
    ///
    /// Returns `false` if the account does not exist.
    #[instrument(name = "Account::delete", skip(tx))]
    pub async fn delete(tx: &mut Transaction, uuid: AccountUuid) -> Result<bool, rorm::Error> {
        let affected = rorm::delete(tx, AccountModel)
            .condition(AccountModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Store that the account just logged in
    #[instrument(name = "Account::record_login", skip(tx))]
    pub async fn record_login(tx: &mut Transaction, uuid: AccountUuid) -> Result<(), rorm::Error> {
        rorm::update(tx, AccountModel)
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

    /// The point in time this passkey was registered
    pub created_at: OffsetDateTime,

    /// The point in time this passkey was last used for a login
    pub last_used_at: Option<OffsetDateTime>,
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
    /// Oldest registration first, with the primary key breaking ties — without
    /// it a passkey jumps position the moment a login stamps `last_used_at`.
    #[instrument(name = "AccountPasskey::get_by_account", skip(tx))]
    pub async fn get_by_account(
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<Vec<AccountPasskey>, rorm::Error> {
        let passkeys = rorm::query(tx, AccountPasskeyModel)
            .condition(AccountPasskeyModel.account.equals(account.0))
            .order_asc(AccountPasskeyModel.created_at)
            .order_asc(AccountPasskeyModel.uuid)
            .all()
            .await?;
        Ok(passkeys.into_iter().map(AccountPasskey::from).collect())
    }

    /// Insert a freshly registered passkey
    ///
    /// Fails with a unique violation if the credential is already registered.
    #[instrument(name = "AccountPasskey::insert", skip(tx, insert))]
    pub async fn insert(
        tx: &mut Transaction,
        insert: AccountPasskeyInsert,
    ) -> Result<(), rorm::Error> {
        rorm::insert(tx, AccountPasskeyModel)
            .single(&AccountPasskeyInsertPatch {
                uuid: Uuid::now_v7(),
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
    #[instrument(name = "AccountPasskey::update_credential", skip(tx, credential))]
    pub async fn update_credential(
        tx: &mut Transaction,
        uuid: AccountPasskeyUuid,
        credential: Passkey,
    ) -> Result<(), rorm::Error> {
        rorm::update(tx, AccountPasskeyModel)
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
    #[instrument(name = "AccountPasskey::delete", skip(tx))]
    pub async fn delete(
        tx: &mut Transaction,
        uuid: AccountPasskeyUuid,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::delete(tx, AccountPasskeyModel)
            .condition(AccountPasskeyModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }
}

/// One-time invite token allowing an account to register another passkey
///
/// Created together with the account and consumed by the public registration
/// endpoint. Also the "lost device" recovery mechanism: issue a new token.
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
    #[instrument(name = "RegistrationToken::create", skip(tx))]
    pub async fn create(
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<MaxStr<64>, rorm::Error> {
        let token = MaxStr::new(Alphanumeric.sample_string(&mut rand::rng(), 43))
            .unwrap_or_else(|_| unreachable!("43 alphanumeric chars fit into 64"));
        rorm::insert(tx, RegistrationTokenModel)
            .single(&RegistrationTokenInsertPatch {
                uuid: Uuid::now_v7(),
                account: ForeignModelByField(account.0),
                token: token.clone(),
                expires_at: OffsetDateTime::now_utc() + Self::VALIDITY,
                used: false,
            })
            .await?;
        Ok(token)
    }

    /// Fetch a token by its secret
    #[instrument(name = "RegistrationToken::get_by_token", skip(tx, token))]
    pub async fn get_by_token(
        tx: &mut Transaction,
        token: &MaxStr<64>,
    ) -> Result<Option<RegistrationToken>, rorm::Error> {
        let registration_token = rorm::query(tx, RegistrationTokenModel)
            .condition(RegistrationTokenModel.token.equals(token))
            .optional()
            .await?;
        Ok(registration_token.map(RegistrationToken::from))
    }

    /// Mark a token as used
    #[instrument(name = "RegistrationToken::mark_used", skip(tx))]
    pub async fn mark_used(
        tx: &mut Transaction,
        uuid: RegistrationTokenUuid,
    ) -> Result<(), rorm::Error> {
        rorm::update(tx, RegistrationTokenModel)
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
            username: Username::new_from_field(value.username),
            email: value.email,
            created_at: value.created_at,
            last_login_at: value.last_login_at,
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
            created_at: value.created_at,
            last_used_at: value.last_used_at,
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
