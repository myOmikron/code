use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use serde::Deserialize;
use serde::Serialize;

use crate::models::account::AccountUuid;
use crate::models::account::Role;
use crate::models::admin_log::AdminAction;
use crate::models::admin_log::AdminLogEntry;
use crate::models::admin_log::AdminLogEntryUuid;

/// How to page and narrow the Admin log
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct AdminListLogQuery {
    /// Only the entries about this Account
    #[serde(default)]
    pub account: Option<AccountUuid>,
    /// Continue after this entry, from a previous page's `next_cursor`
    #[serde(default)]
    pub after: Option<AdminLogEntryUuid>,
    /// How many entries to return, capped server-side
    #[serde(default = "default_limit")]
    pub limit: u32,
}

/// The page size a client gets without asking for one
fn default_limit() -> u32 {
    50
}

/// One entry of the Admin log
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminLogEntryResponse {
    /// Primary key
    pub uuid: AdminLogEntryUuid,
    /// When the Admin acted
    pub created_at: SchemaDateTime,
    /// The acting Admin, `None` once it is deleted
    pub admin: Option<AccountUuid>,
    /// The acting Admin's username at the time
    pub admin_username: String,
    /// The affected Account, `None` once it is deleted
    pub account: Option<AccountUuid>,
    /// The affected Account's username at the time
    pub account_username: String,
    /// What the Admin did
    pub action: AdminAction,
    /// The Role a Role change gave the Account
    pub role: Option<Role>,
    /// The reason the Admin gave
    pub reason: Option<String>,
}

impl From<AdminLogEntry> for AdminLogEntryResponse {
    fn from(value: AdminLogEntry) -> Self {
        Self {
            uuid: value.uuid,
            created_at: SchemaDateTime(value.created_at),
            admin: value.admin,
            admin_username: value.admin_username,
            account: value.account,
            account_username: value.account_username,
            action: value.action,
            role: value.role,
            reason: value.reason,
        }
    }
}

/// One page of the Admin log, newest first
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminListLogResponse {
    /// The entries
    pub entries: Vec<AdminLogEntryResponse>,
    /// Pass as `after` for the next page, `None` on the last one
    pub next_cursor: Option<AdminLogEntryUuid>,
}
