//! Accounts, each signing in as one [`Identity`]

use galvyn::core::Module;
use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModel;
#[cfg(doc)]
use galvyn_identity::Identity;
use galvyn_identity::IdentityModule;
use galvyn_identity::IdentityUuid;
#[cfg(doc)]
use galvyn_identity::Passkey as AccountPasskey;
use galvyn_identity::PasskeyUuid;
use serde::Deserialize;
use serde::Deserializer;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use thiserror::Error;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::db::AccountInsertPatch;
use crate::models::account::db::AccountModel;
use crate::models::collection::Collection;
use crate::models::deck::Deck;
pub(in crate::models) mod db;
mod extractor;
pub mod overview;

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

/// What an [`Account`] may do beyond managing its own things
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum Role {
    /// Manages its own collections and decks
    #[default]
    Member,
    /// Also manages other Accounts in the admin dashboard
    Admin,
}
custom_db_enum! {
    enum: Role,
    variants: [Member, Admin],
    decoder: RoleDecoder,
}

impl Role {
    /// Parse the Role's database encoding, read by a raw query
    pub(in crate::models) fn decode(encoded: &str) -> Option<Role> {
        Self::from_str(encoded)
    }
}

/// The longest Lock reason or unlock reason an Admin may give
pub const LOCK_REASON_MAX_LEN: usize = 1024;

/// The username of the tombstone deleted accounts leave their public decks with
///
/// Not a username [`Username::new`] would ever accept, so no request can name
/// it: every endpoint that looks an account up by name parses the name first.
const TOMBSTONE_USERNAME: &str = "#deleted";

/// The email of the tombstone, spelled so that no signup can collide with it
const TOMBSTONE_EMAIL: &str = "#deleted";

/// An account
///
/// Authentication is passkey-only: an account has no password, only the
/// passkeys of its [`Identity`].
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

    /// What the account may do
    pub role: Role,

    /// Whether an Admin locked the account
    pub locked: bool,

    /// The identity this account signs in as
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

    /// Wrap a primary key read from the database
    pub(in crate::models) fn new(uuid: Uuid) -> Self {
        Self(uuid)
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

    /// Fetch the account signing in as `identity`
    #[instrument(name = "Account::get_by_identity", skip(tx))]
    pub async fn get_by_identity(
        tx: &mut Transaction,
        identity: IdentityUuid,
    ) -> Result<Option<Account>, rorm::Error> {
        let account = rorm::query(tx, AccountModel)
            .condition(AccountModel.identity.equals(identity.into_inner()))
            .optional()
            .await?;
        Ok(account.map(Account::from))
    }

    /// Fetch an account by its username
    ///
    /// The lookup ignores case. This is the first step of a login: the
    /// credential ids of the returned account's identity become the
    /// ceremony's `allowCredentials`.
    ///
    /// The tombstone is never answered with. Its name is unspellable already,
    /// but this is the condition that matters: were it reachable by name, a
    /// stranger could sign up as it and walk into every deck it holds.
    #[instrument(name = "Account::get_by_username", skip(tx))]
    pub async fn get_by_username(
        tx: &mut Transaction,
        username: &Username,
    ) -> Result<Option<Account>, rorm::Error> {
        let account = rorm::query(tx, AccountModel)
            .condition(rorm::and![
                AccountModel
                    .username_normalized
                    .equals(&username.normalized()),
                AccountModel.tombstone.equals(false),
            ])
            .optional()
            .await?;
        Ok(account.map(Account::from))
    }

    /// Fetch an account by its email address
    ///
    /// Skips the tombstone for the same reason [`Self::get_by_username`] does.
    #[instrument(name = "Account::get_by_email", skip(tx))]
    pub async fn get_by_email(
        tx: &mut Transaction,
        email: &MaxStr<255>,
    ) -> Result<Option<Account>, rorm::Error> {
        let account = rorm::query(tx, AccountModel)
            .condition(rorm::and![
                AccountModel.email.equals(email),
                AccountModel.tombstone.equals(false),
            ])
            .optional()
            .await?;
        Ok(account.map(Account::from))
    }

    /// Insert a new account with an identity of its own and return that identity
    ///
    /// Fails with a unique violation if the username or the email is already
    /// taken.
    #[instrument(name = "Account::insert", skip(tx))]
    pub async fn insert(
        tx: &mut Transaction,
        username: Username,
        email: MaxStr<255>,
    ) -> Result<IdentityUuid, rorm::Error> {
        let identity = IdentityModule::global().create_identity(&mut *tx).await?;
        rorm::insert(&mut *tx, AccountModel)
            .single(&AccountInsertPatch {
                uuid: Uuid::now_v7(),
                username_normalized: username.normalized(),
                username: username.0,
                email,
                tombstone: false,
                role: Role::Member,
                identity: ForeignModelByField(identity.into_inner()),
            })
            .await?;
        Ok(identity)
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

    /// Change an account's Role
    ///
    /// Returns `false` if the account does not exist or is the tombstone.
    #[instrument(name = "Account::set_role", skip(tx))]
    pub async fn set_role(
        tx: &mut Transaction,
        uuid: AccountUuid,
        role: Role,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(tx, AccountModel)
            .set(AccountModel.role, role)
            .condition(rorm::and![
                AccountModel.uuid.equals(uuid.0),
                AccountModel.tombstone.equals(false),
            ])
            .await?;
        Ok(affected > 0)
    }

    /// Fetch an account an Admin may manage: any but the tombstone
    #[instrument(name = "Account::get_manageable", skip(tx))]
    pub async fn get_manageable(
        tx: &mut Transaction,
        uuid: AccountUuid,
    ) -> Result<Option<Account>, rorm::Error> {
        let account = rorm::query(tx, AccountModel)
            .condition(rorm::and![
                AccountModel.uuid.equals(uuid.0),
                AccountModel.tombstone.equals(false),
            ])
            .optional()
            .await?;
        Ok(account.map(Account::from))
    }

    /// Lock an account
    ///
    /// Returns `false` if the account does not exist, is the tombstone or is
    /// locked already.
    #[instrument(name = "Account::lock", skip(tx))]
    pub async fn lock(
        tx: &mut Transaction,
        uuid: AccountUuid,
        reason: MaxStr<LOCK_REASON_MAX_LEN>,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(tx, AccountModel)
            .set(AccountModel.locked_at, Some(OffsetDateTime::now_utc()))
            .set(AccountModel.lock_reason, Some(reason))
            .condition(rorm::and![
                AccountModel.uuid.equals(uuid.0),
                AccountModel.tombstone.equals(false),
                AccountModel.locked_at.is_none(),
            ])
            .await?;
        Ok(affected > 0)
    }

    /// Lift the Lock of an account
    ///
    /// Returns `false` if the account does not exist or is not locked.
    #[instrument(name = "Account::unlock", skip(tx))]
    pub async fn unlock(tx: &mut Transaction, uuid: AccountUuid) -> Result<bool, rorm::Error> {
        let affected = rorm::update(tx, AccountModel)
            .set(AccountModel.locked_at, None)
            .set(AccountModel.lock_reason, None)
            .condition(rorm::and![
                AccountModel.uuid.equals(uuid.0),
                AccountModel.locked_at.is_some(),
            ])
            .await?;
        Ok(affected > 0)
    }

    /// The account deleted accounts leave their public decks with
    ///
    /// Made on the first deletion rather than by a migration: an instance that
    /// has never lost an account has nothing to put on it. There is only ever
    /// one, which is what [`AccountModel::tombstone`] marks.
    ///
    /// [`AccountModel::tombstone`]: db::AccountModel::tombstone
    #[instrument(name = "Account::tombstone", skip(tx))]
    pub async fn tombstone(tx: &mut Transaction) -> Result<AccountUuid, rorm::Error> {
        let existing = rorm::query(&mut *tx, (AccountModel.uuid,))
            .condition(AccountModel.tombstone.equals(true))
            .optional()
            .await?;
        if let Some((uuid,)) = existing {
            return Ok(AccountUuid(uuid));
        }

        let username = MaxStr::new(TOMBSTONE_USERNAME.to_owned())
            .unwrap_or_else(|_| unreachable!("the tombstone's name is a few ascii characters"));
        let identity = IdentityModule::global().create_identity(&mut *tx).await?;
        let uuid = rorm::insert(&mut *tx, AccountModel)
            .return_primary_key()
            .single(&AccountInsertPatch {
                uuid: Uuid::now_v7(),
                username_normalized: username.clone(),
                username,
                email: MaxStr::new(TOMBSTONE_EMAIL.to_owned()).unwrap_or_else(|_| {
                    unreachable!("the tombstone's address is a few ascii characters")
                }),
                tombstone: true,
                role: Role::Member,
                identity: ForeignModelByField(identity.into_inner()),
            })
            .await?;
        Ok(AccountUuid(uuid))
    }

    /// Delete an account, leaving its public decks with the tombstone
    ///
    /// A decklist somebody linked to stays readable when its builder leaves,
    /// with nothing left of the builder but the tombstone. The account goes by
    /// deleting its identity, and everything else it owns goes with it through
    /// the cascades on the foreign keys: passkeys, registration links,
    /// collections, watch lists, folders, tags, and every deck it did not put
    /// on show.
    ///
    /// Returns `false` if the account does not exist.
    #[instrument(name = "Account::delete", skip(tx))]
    pub async fn delete(tx: &mut Transaction, uuid: AccountUuid) -> Result<bool, rorm::Error> {
        let Some(account) = Self::get_by_uuid(&mut *tx, uuid).await? else {
            return Ok(false);
        };

        // Before the delete, not after: the cascade would otherwise take the
        // decks along with everything else.
        let tombstone = Self::tombstone(&mut *tx).await?;
        Deck::hand_over_public(&mut *tx, uuid, tombstone).await?;

        // Also before the delete, see `Collection::delete_all_of_account`.
        Collection::delete_all_of_account(&mut *tx, uuid).await?;

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
            username: Username::new_from_field(value.username),
            email: value.email,
            created_at: value.created_at,
            role: value.role,
            locked: value.locked_at.is_some(),
            identity: IdentityUuid::new_from_field(value.identity),
        }
    }
}
