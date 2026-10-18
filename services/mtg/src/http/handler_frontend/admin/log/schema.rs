use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use serde::Deserialize;
use serde::Serialize;

use crate::models::account::AccountUuid;
use crate::models::admin_log::AdminLogAction;
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
    #[serde(default = "crate::http::handler_frontend::admin::default_limit")]
    pub limit: u32,
}

/// One entry of the Admin log
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminLogEntryResponse {
    /// Primary key
    pub uuid: AdminLogEntryUuid,
    /// When the Admin acted
    pub created_at: SchemaDateTime,
    /// The acting Admin, `None` once it is deleted or for a change made through the cli
    pub admin: Option<AccountUuid>,
    /// The acting Admin's username at the time
    pub admin_username: String,
    /// The affected Account, `None` once it is deleted
    pub account: Option<AccountUuid>,
    /// The affected Account's username at the time
    pub account_username: String,
    /// What the Admin did
    pub action: AdminLogAction,
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
