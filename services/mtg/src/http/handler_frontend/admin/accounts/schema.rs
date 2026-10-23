use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::account::ADMIN_REASON_MAX_LEN;
use crate::models::account::AccountUuid;
use crate::models::account::DeletionMode;
use crate::models::account::Role;
use crate::models::account::Username;
use crate::models::account::overview::AccountOverview;
use crate::utils::mail::MailLanguage;

/// How to page and narrow the Account list
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct AdminListAccountsQuery {
    /// Prefix of the username or the email, case ignored
    #[serde(default)]
    pub search: Option<MaxStr<255>>,
    /// Only Accounts with this Role
    #[serde(default)]
    pub role: Option<Role>,
    /// Only locked Accounts (`true`) or only Accounts that are not (`false`)
    #[serde(default)]
    pub locked: Option<bool>,
    /// Continue after this Account, from a previous page's `next_cursor`
    #[serde(default)]
    pub after: Option<AccountUuid>,
    /// How many Accounts to return, capped server-side
    #[serde(default = "crate::http::handler_frontend::admin::default_limit")]
    pub limit: u32,
}

/// An Account in the admin list
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminAccount {
    /// Primary key
    pub uuid: AccountUuid,
    /// Login handle and display name
    pub username: String,
    /// Email address
    pub email: String,
    /// What the Account may do
    pub role: Role,
    /// When the Account was created
    pub created_at: SchemaDateTime,
    /// Collections on the shelf, without the ones standing for a deck
    pub collections: i64,
    /// Decks of the Account
    pub decks: i64,
    /// The Account's Lock, `None` while it is not locked
    pub lock: Option<AdminAccountLock>,
    /// The OpenID provider an External Account logs in through, `None` for a Local Account
    pub openid_provider: Option<AdminOpenIdProvider>,
}

/// The OpenID provider an External Account logs in through
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminOpenIdProvider {
    /// The provider's issuer
    pub issuer: String,
    /// What the frontend calls the provider
    pub display_name: String,
}

/// An Account's Lock
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminAccountLock {
    /// When the Account was locked
    pub locked_at: SchemaDateTime,
    /// Why it was locked
    pub reason: String,
}

impl From<AccountOverview> for AdminAccount {
    fn from(value: AccountOverview) -> Self {
        Self {
            uuid: value.uuid,
            username: value.username.as_str().to_string(),
            email: value.email.to_string(),
            role: value.role,
            created_at: SchemaDateTime(value.created_at),
            collections: value.collections,
            decks: value.decks,
            lock: value.lock.map(|lock| AdminAccountLock {
                locked_at: SchemaDateTime(lock.locked_at),
                reason: lock.reason,
            }),
            openid_provider: value.openid_provider.map(|provider| AdminOpenIdProvider {
                issuer: provider.issuer,
                display_name: provider.display_name,
            }),
        }
    }
}

/// One page of the Account list, newest first
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminListAccountsResponse {
    /// The Accounts
    pub accounts: Vec<AdminAccount>,
    /// Pass as `after` for the next page, `None` on the last one
    pub next_cursor: Option<AccountUuid>,
}

/// An Account on the admin detail page
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminAccountDetail {
    /// What the list shows
    pub account: AdminAccount,
    /// Cards the Account owns, on the shelf and sleeved in decks
    pub cards: i64,
    /// Passkeys the Account can log in with
    pub passkeys: u64,
}

/// Request to change an Account's Role
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct AdminSetRoleRequest {
    /// The new Role
    pub role: Role,
}

/// Why a Role could not be changed
#[derive(Debug, Default, Serialize, JsonSchema)]
pub struct AdminSetRoleErrors {
    /// The Account is the Admin's own, which it cannot demote
    pub own_account: bool,
}

/// Request to Lock an Account
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct AdminLockAccountRequest {
    /// Why the Account is locked, shown to Admins only
    pub reason: MaxStr<ADMIN_REASON_MAX_LEN>,
}

/// Why an Account could not be locked
#[derive(Debug, Default, Serialize, JsonSchema)]
pub struct AdminLockAccountErrors {
    /// The Account is the Admin's own, which it cannot Lock
    pub own_account: bool,
    /// No reason was given
    pub reason_missing: bool,
    /// The Account is locked already
    pub already_locked: bool,
}

/// Request to lift an Account's Lock
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct AdminUnlockAccountRequest {
    /// Why the Lock is lifted, shown to Admins only
    #[serde(default)]
    pub reason: Option<MaxStr<ADMIN_REASON_MAX_LEN>>,
}

/// Why an Account's Lock could not be lifted
#[derive(Debug, Default, Serialize, JsonSchema)]
pub struct AdminUnlockAccountErrors {
    /// The Account is not locked
    pub not_locked: bool,
}

/// Request to delete an Account
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct AdminDeleteAccountRequest {
    /// The Account's username, typed out by the Admin
    pub username: MaxStr<{ Username::MAX_LEN }>,
    /// What happens to the Account's public decks
    #[serde(default)]
    pub mode: DeletionMode,
}

/// Why an Account could not be deleted
#[derive(Debug, Default, Serialize, JsonSchema)]
pub struct AdminDeleteAccountErrors {
    /// The Account is the Admin's own, which it cannot delete
    pub own_account: bool,
    /// The typed username is not the Account's
    pub username_mismatch: bool,
}

/// Request to Rename an Account
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct AdminRenameAccountRequest {
    /// The new username, held to the same rules as at signup
    pub username: Username,
    /// Why the Account is renamed, shown to Admins only
    pub reason: MaxStr<ADMIN_REASON_MAX_LEN>,
    /// The language of the mail that tells the Account its new username
    ///
    /// The client sends the language its UI is showing; left out, the mail
    /// falls back to German, the app's primary language.
    #[serde(default)]
    pub language: MailLanguage,
}

/// Why an Account could not be renamed
#[derive(Debug, Default, Serialize, JsonSchema)]
pub struct AdminRenameAccountErrors {
    /// The Account is the Admin's own, which it renames through its own settings
    pub own_account: bool,
    /// No reason was given
    pub reason_missing: bool,
    /// Another Account goes by this username already, case ignored
    pub username_taken: bool,
}
