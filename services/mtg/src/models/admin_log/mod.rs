//! The Admin log: what Admins did to Accounts

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::row::Row;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::account::DeletionMode;
use crate::models::account::LOCK_REASON_MAX_LEN;
use crate::models::account::Role;
use crate::models::admin_log::db::AdminLogEntryInsertPatch;
use crate::models::admin_log::db::AdminLogEntryModel;

pub(in crate::models) mod db;

/// What an Admin did to an Account
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum AdminAction {
    /// Locked the Account
    Lock,
    /// Lifted the Account's Lock
    Unlock,
    /// Gave the Account another Role
    RoleChange,
    /// Deleted the Account
    Deletion,
}
custom_db_enum! {
    enum: AdminAction,
    variants: [Lock, Unlock, RoleChange, Deletion],
    decoder: AdminActionDecoder,
}

/// Primary key of an [`AdminLogEntry`]
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct AdminLogEntryUuid(Uuid);

/// One entry of the Admin log
#[derive(Debug, Clone)]
pub struct AdminLogEntry {
    /// Primary key
    pub uuid: AdminLogEntryUuid,
    /// When the Admin acted
    pub created_at: OffsetDateTime,
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
    /// What a Deletion did with the Account's public decks
    pub deletion: Option<DeletionMode>,
}

/// What a new [`AdminLogEntry`] records
#[derive(Debug, Clone)]
pub struct NewAdminLogEntry<'a> {
    /// The acting Admin
    pub admin: &'a Account,
    /// The affected Account
    pub account: &'a Account,
    /// What the Admin did
    pub action: AdminAction,
    /// The Role a Role change gave the Account
    pub role: Option<Role>,
    /// The reason the Admin gave
    pub reason: Option<MaxStr<LOCK_REASON_MAX_LEN>>,
    /// What a Deletion did with the Account's public decks
    pub deletion: Option<DeletionMode>,
}

/// What a page of the Admin log is narrowed to
#[derive(Debug, Clone, Default)]
pub struct AdminLogFilter {
    /// Only the entries about this Account
    pub account: Option<AccountUuid>,
    /// Continue after this entry, newest first
    pub after: Option<AdminLogEntryUuid>,
    /// How many entries to return
    pub limit: u32,
}

/// One page of the Admin log
#[derive(Debug, Clone)]
pub struct AdminLogPage {
    /// The entries, newest first
    pub entries: Vec<AdminLogEntry>,
    /// Pass as [`AdminLogFilter::after`] for the next page, `None` on the last
    pub next_cursor: Option<AdminLogEntryUuid>,
}

impl AdminLogEntry {
    /// Write an entry, in the transaction that made the change it records
    #[instrument(name = "AdminLogEntry::record", skip(tx))]
    pub async fn record(
        tx: &mut Transaction,
        entry: NewAdminLogEntry<'_>,
    ) -> Result<(), rorm::Error> {
        rorm::insert(tx, AdminLogEntryModel)
            .return_nothing()
            .single(&AdminLogEntryInsertPatch {
                uuid: Uuid::now_v7(),
                admin: Some(ForeignModelByField(entry.admin.uuid.into_inner())),
                admin_username: username_field(entry.admin),
                account: Some(ForeignModelByField(entry.account.uuid.into_inner())),
                account_username: username_field(entry.account),
                action: entry.action,
                role: entry.role,
                reason: entry.reason,
                deletion: entry.deletion,
            })
            .await
    }

    /// One page of the Admin log, newest first
    ///
    /// Paged by uuid, a v7 and so time-ordered: the whole log is a range scan
    /// of the primary key, one Account's entries one of `admin_log_affected`.
    #[instrument(name = "AdminLogEntry::page", skip(tx))]
    pub async fn page(
        tx: &mut Transaction,
        filter: &AdminLogFilter,
    ) -> Result<AdminLogPage, rorm::Error> {
        let mut values = Vec::new();
        let mut conditions = Vec::new();
        if let Some(account) = filter.account {
            values.push(Value::Uuid(account.into_inner()));
            conditions.push(format!("account = ${}", values.len()));
        }
        if let Some(after) = filter.after {
            values.push(Value::Uuid(after.0));
            conditions.push(format!("uuid < ${}", values.len()));
        }
        values.push(Value::I64(i64::from(filter.limit) + 1));
        let condition = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };
        let statement = format!(
            "SELECT uuid, created_at, admin, admin_username, account, account_username, \
               action, role, reason, deletion \
             FROM admin_log_entry {condition} ORDER BY uuid DESC LIMIT ${}",
            values.len()
        );
        let rows = (&mut *tx).execute::<All>(statement, values).await?;

        let mut entries = rows
            .iter()
            .map(decode_entry)
            .collect::<Result<Vec<_>, _>>()?;
        let next_cursor = if entries.len() > filter.limit as usize {
            entries.truncate(filter.limit as usize);
            entries.last().map(|entry| entry.uuid)
        } else {
            None
        };
        Ok(AdminLogPage {
            entries,
            next_cursor,
        })
    }
}

/// An Account's username as the log's column stores it
fn username_field(account: &Account) -> MaxStr<32> {
    MaxStr::new(account.username.as_str().to_string())
        .unwrap_or_else(|_| unreachable!("a username has at most 32 characters"))
}

/// Turns a row error into the error the reads return
fn decode(error: rorm::db::row::RowError<'_>) -> rorm::Error {
    rorm::Error::RowError(error.into_owned())
}

/// Reads an entry from a row of [`AdminLogEntry::page`]
fn decode_entry(row: &Row) -> Result<AdminLogEntry, rorm::Error> {
    let action: String = row.get("action").map_err(decode)?;
    let role: Option<String> = row.get("role").map_err(decode)?;
    let admin: Option<Uuid> = row.get("admin").map_err(decode)?;
    let account: Option<Uuid> = row.get("account").map_err(decode)?;
    let deletion: Option<String> = row.get("deletion").map_err(decode)?;
    Ok(AdminLogEntry {
        uuid: AdminLogEntryUuid(row.get("uuid").map_err(decode)?),
        created_at: row.get("created_at").map_err(decode)?,
        admin: admin.map(AccountUuid::new),
        admin_username: row.get("admin_username").map_err(decode)?,
        account: account.map(AccountUuid::new),
        account_username: row.get("account_username").map_err(decode)?,
        action: AdminAction::from_str(&action)
            .unwrap_or_else(|| unreachable!("only the action's own encoding is written")),
        role: role.map(|role| {
            Role::decode(&role)
                .unwrap_or_else(|| unreachable!("only the Role's own encoding is written"))
        }),
        reason: row.get("reason").map_err(decode)?,
        deletion: deletion.map(|deletion| {
            DeletionMode::decode(&deletion)
                .unwrap_or_else(|| unreachable!("only the mode's own encoding is written"))
        }),
    })
}
