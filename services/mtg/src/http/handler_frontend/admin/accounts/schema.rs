use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use serde::Deserialize;
use serde::Serialize;

use crate::models::account::AccountUuid;
use crate::models::account::Role;
use crate::models::account::overview::AccountOverview;

/// How to page and narrow the Account list
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct AdminListAccountsQuery {
    /// Prefix of the username or the email, case ignored
    #[serde(default)]
    pub search: Option<String>,
    /// Only Accounts with this Role
    #[serde(default)]
    pub role: Option<Role>,
    /// Continue after this Account, from a previous page's `next_cursor`
    #[serde(default)]
    pub after: Option<AccountUuid>,
    /// How many Accounts to return, capped server-side
    #[serde(default = "default_limit")]
    pub limit: u32,
}

/// The page size a client gets without asking for one
fn default_limit() -> u32 {
    50
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
