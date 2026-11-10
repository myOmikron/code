//! The Admin log: what Admins did to Accounts

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::stuff::schema::SchemaDateTime;
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

use crate::models::account::ADMIN_REASON_MAX_LEN;
use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::account::DeletionMode;
use crate::models::account::Role;
use crate::models::account::Username;
use crate::models::admin_log::db::AdminLogEntryInsertPatch;
use crate::models::admin_log::db::AdminLogEntryModel;
use crate::models::row::decode;

pub(in crate::models) mod db;

/// The name the log gives the acting Admin of a change made through the cli
pub const CLI_ADMIN_USERNAME: &str = "cli";

/// What an Admin did to an Account, with what the action needs to be read
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(tag = "kind")]
pub enum AdminLogAction {
    /// Locked the Account
    Lock {
        /// Why the Account was locked
        reason: MaxStr<ADMIN_REASON_MAX_LEN>,
    },
    /// Lifted the Account's Lock
    Unlock {
        /// Why the Lock was lifted, if the Admin said
        reason: Option<MaxStr<ADMIN_REASON_MAX_LEN>>,
    },
    /// Gave the Account another Role
    RoleChange {
        /// The Role the Account has now
        role: Role,
    },
    /// Deleted the Account
    Deletion {
        /// What happened to the Account's public decks
        mode: DeletionMode,
    },
    /// Gave the Account another username
    Rename {
        /// The username the Account has now
        new_username: Username,
        /// Why the Account was renamed
        reason: MaxStr<ADMIN_REASON_MAX_LEN>,
    },
    /// Started an Impersonation of the Account
    ImpersonationStart {
        /// Why the Admin impersonates the Account
        reason: MaxStr<ADMIN_REASON_MAX_LEN>,
        /// When the Impersonation ends at the latest
        expires_at: SchemaDateTime,
    },
    /// Ended an Impersonation of the Account, explicitly or by logging out
    ImpersonationEnd,
}

/// The `action` column: which [`AdminLogAction`] an entry records
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum AdminAction {
    /// [`AdminLogAction::Lock`]
    Lock,
    /// [`AdminLogAction::Unlock`]
    Unlock,
    /// [`AdminLogAction::RoleChange`]
    RoleChange,
    /// [`AdminLogAction::Deletion`]
    Deletion,
    /// [`AdminLogAction::Rename`]
    Rename,
    /// [`AdminLogAction::ImpersonationStart`]
    ImpersonationStart,
    /// [`AdminLogAction::ImpersonationEnd`]
    ImpersonationEnd,
}
custom_db_enum! {
    enum: AdminAction,
    variants: [Lock, Unlock, RoleChange, Deletion, Rename, ImpersonationStart, ImpersonationEnd],
    decoder: AdminActionDecoder,
}

/// Who made a change the Admin log records
#[derive(Debug, Clone, Copy)]
pub enum AdminActor<'a> {
    /// An Admin, through the admin dashboard
    Admin(&'a Account),
    /// Somebody with access to the server, through the cli
    Cli,
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
    /// The acting Admin, `None` once it is deleted or for a change made through the cli
    pub admin: Option<AccountUuid>,
    /// The acting Admin's username at the time, [`CLI_ADMIN_USERNAME`] for the cli
    pub admin_username: String,
    /// The affected Account, `None` once it is deleted
    pub account: Option<AccountUuid>,
    /// The affected Account's username at the time
    pub account_username: String,
    /// What the Admin did
    pub action: AdminLogAction,
}

/// What a new [`AdminLogEntry`] records
#[derive(Debug, Clone)]
pub struct NewAdminLogEntry<'a> {
    /// Who made the change
    pub admin: AdminActor<'a>,
    /// The affected Account
    pub account: &'a Account,
    /// What the Admin did
    pub action: AdminLogAction,
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
    ) -> Result<AdminLogEntryUuid, rorm::Error> {
        let (admin, admin_username) = match entry.admin {
            AdminActor::Admin(admin) => (
                Some(ForeignModelByField(admin.uuid.into_inner())),
                username_field(admin.username.as_str()),
            ),
            AdminActor::Cli => (None, username_field(CLI_ADMIN_USERNAME)),
        };
        let mut payload = Payload::default();
        let action = match entry.action {
            AdminLogAction::Lock { reason } => {
                payload.reason = Some(reason);
                AdminAction::Lock
            }
            AdminLogAction::Unlock { reason } => {
                payload.reason = reason;
                AdminAction::Unlock
            }
            AdminLogAction::RoleChange { role } => {
                payload.role = Some(role);
                AdminAction::RoleChange
            }
            AdminLogAction::Deletion { mode } => {
                payload.deletion = Some(mode);
                AdminAction::Deletion
            }
            AdminLogAction::Rename {
                new_username,
                reason,
            } => {
                payload.reason = Some(reason);
                payload.new_username = Some(username_field(new_username.as_str()));
                AdminAction::Rename
            }
            AdminLogAction::ImpersonationStart { reason, expires_at } => {
                payload.reason = Some(reason);
                payload.expires_at = Some(expires_at.0);
                AdminAction::ImpersonationStart
            }
            AdminLogAction::ImpersonationEnd => AdminAction::ImpersonationEnd,
        };
        let uuid = Uuid::now_v7();
        rorm::insert(tx, AdminLogEntryModel)
            .return_nothing()
            .single(&AdminLogEntryInsertPatch {
                uuid,
                admin,
                admin_username,
                account: Some(ForeignModelByField(entry.account.uuid.into_inner())),
                account_username: username_field(entry.account.username.as_str()),
                action,
                role: payload.role,
                reason: payload.reason,
                deletion: payload.deletion,
                new_username: payload.new_username,
                expires_at: payload.expires_at,
            })
            .await?;
        Ok(AdminLogEntryUuid(uuid))
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
               action, role, reason, deletion, new_username, expires_at \
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

/// The payload columns of an entry, each set only by the actions that carry it
#[derive(Default)]
struct Payload {
    /// The Role a Role change gave the Account
    role: Option<Role>,
    /// The reason the Admin gave
    reason: Option<MaxStr<ADMIN_REASON_MAX_LEN>>,
    /// What a Deletion did with the public decks
    deletion: Option<DeletionMode>,
    /// The username a Rename gave the Account
    new_username: Option<MaxStr<32>>,
    /// When an Impersonation ends at the latest
    expires_at: Option<OffsetDateTime>,
}

/// A username as the log's columns store it
fn username_field(username: &str) -> MaxStr<32> {
    MaxStr::new(username.to_string())
        .unwrap_or_else(|_| unreachable!("a username has at most 32 characters"))
}

/// Reads an entry from a row of [`AdminLogEntry::page`]
fn decode_entry(row: &Row) -> Result<AdminLogEntry, rorm::Error> {
    let admin: Option<Uuid> = row.get("admin").map_err(decode)?;
    let account: Option<Uuid> = row.get("account").map_err(decode)?;
    Ok(AdminLogEntry {
        uuid: AdminLogEntryUuid(row.get("uuid").map_err(decode)?),
        created_at: row.get("created_at").map_err(decode)?,
        admin: admin.map(AccountUuid::new),
        admin_username: row.get("admin_username").map_err(decode)?,
        account: account.map(AccountUuid::new),
        account_username: row.get("account_username").map_err(decode)?,
        action: decode_action(row)?,
    })
}

/// Reads the [`AdminLogAction`] of a row from its `action` and payload columns
///
/// Every row is written by [`AdminLogEntry::record`], so an action's payload
/// column is always set.
fn decode_action(row: &Row) -> Result<AdminLogAction, rorm::Error> {
    let action: String = row.get("action").map_err(decode)?;
    let role: Option<String> = row.get("role").map_err(decode)?;
    let reason: Option<String> = row.get("reason").map_err(decode)?;
    let deletion: Option<String> = row.get("deletion").map_err(decode)?;
    let new_username: Option<String> = row.get("new_username").map_err(decode)?;
    let expires_at: Option<OffsetDateTime> = row.get("expires_at").map_err(decode)?;
    let reason = reason.map(|reason| {
        MaxStr::new(reason).unwrap_or_else(|_| unreachable!("the column holds at most the limit"))
    });

    Ok(
        match AdminAction::from_str(&action)
            .unwrap_or_else(|| unreachable!("only the action's own encoding is written"))
        {
            AdminAction::Lock => AdminLogAction::Lock {
                reason: reason.unwrap_or_else(|| unreachable!("a Lock is written with a reason")),
            },
            AdminAction::Unlock => AdminLogAction::Unlock { reason },
            AdminAction::RoleChange => AdminLogAction::RoleChange {
                role: role
                    .as_deref()
                    .and_then(Role::decode)
                    .unwrap_or_else(|| unreachable!("a Role change is written with its Role")),
            },
            AdminAction::Deletion => AdminLogAction::Deletion {
                mode: deletion
                    .as_deref()
                    .and_then(DeletionMode::decode)
                    .unwrap_or_else(|| unreachable!("a Deletion is written with its mode")),
            },
            AdminAction::Rename => AdminLogAction::Rename {
                new_username: new_username
                    .and_then(|username| MaxStr::new(username).ok())
                    .map(Username::new_from_field)
                    .unwrap_or_else(|| unreachable!("a Rename is written with its username")),
                reason: reason.unwrap_or_else(|| unreachable!("a Rename is written with a reason")),
            },
            AdminAction::ImpersonationStart => AdminLogAction::ImpersonationStart {
                reason: reason.unwrap_or_else(|| {
                    unreachable!("an Impersonation start is written with a reason")
                }),
                expires_at: SchemaDateTime(expires_at.unwrap_or_else(|| {
                    unreachable!("an Impersonation start is written with its expiry")
                })),
            },
            AdminAction::ImpersonationEnd => AdminLogAction::ImpersonationEnd,
        },
    )
}
