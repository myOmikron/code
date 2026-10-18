//! Accounts as the admin dashboard sees them
//!
//! Every count here is read through an index leading with `owner`, so a page
//! of the list costs what its rows own and never a scan of a whole table.

use galvyn::core::Module;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::row::Row;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use galvyn_identity::IdentityModule;
use galvyn_identity::IdentityUuid;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::account::Role;
use crate::models::account::Username;

/// An Account in the admin list
#[derive(Debug, Clone)]
pub struct AccountOverview {
    /// Primary key
    pub uuid: AccountUuid,
    /// Login handle and display name
    pub username: Username,
    /// Email address
    pub email: MaxStr<255>,
    /// What the account may do
    pub role: Role,
    /// When the account was created
    pub created_at: OffsetDateTime,
    /// Collections on the shelf, without the ones standing for a deck
    pub collections: i64,
    /// Decks of the account
    pub decks: i64,
    /// The account's Lock, `None` while it is not locked
    pub lock: Option<AccountLock>,
}

/// An Account's Lock as Admins see it
#[derive(Debug, Clone)]
pub struct AccountLock {
    /// When the account was locked
    pub locked_at: OffsetDateTime,
    /// Why it was locked
    pub reason: String,
}

/// An Account on the admin detail page
#[derive(Debug, Clone)]
pub struct AccountDetail {
    /// What the list shows
    pub overview: AccountOverview,
    /// Cards the account owns, on the shelf and sleeved in decks
    pub cards: i64,
    /// Passkeys of the account's Identity
    pub passkeys: u64,
}

/// What the admin list is narrowed to
#[derive(Debug, Clone, Default)]
pub struct AccountFilter {
    /// Prefix of the username or the email, case ignored
    pub search: Option<String>,
    /// Only Accounts with this Role
    pub role: Option<Role>,
    /// Only locked Accounts (`true`) or only Accounts that are not (`false`)
    pub locked: Option<bool>,
    /// Continue after this Account, newest first
    pub after: Option<AccountUuid>,
    /// How many Accounts to return
    pub limit: u32,
}

/// One page of the admin list
#[derive(Debug, Clone)]
pub struct AccountPage {
    /// The Accounts, newest first
    pub accounts: Vec<AccountOverview>,
    /// Pass as [`AccountFilter::after`] for the next page, `None` on the last
    pub next_cursor: Option<AccountUuid>,
}

/// The columns both reads select
const COLUMNS: &str = "\
    a.uuid, a.username, a.email, a.role, a.created_at, a.locked_at, a.lock_reason, \
    (SELECT count(*) FROM collection c WHERE c.owner = a.uuid AND c.deck IS NULL) AS collections, \
    (SELECT count(*) FROM deck d WHERE d.owner = a.uuid) AS decks";

impl AccountOverview {
    /// One page of Accounts, newest first, the tombstone left out
    ///
    /// Paged by uuid, which is a v7 and so creation-ordered: a page is a range
    /// scan of the primary key, or of `account_role` with a Role filter, or of
    /// the partial `account_locked` when only locked Accounts are asked for. A
    /// search reads the Accounts matching the prefix through the
    /// `account_username_prefix` and `account_email_prefix` indexes.
    #[instrument(name = "AccountOverview::page", skip(tx))]
    pub async fn page(
        tx: &mut Transaction,
        filter: &AccountFilter,
    ) -> Result<AccountPage, rorm::Error> {
        let mut values = Vec::new();
        let mut conditions = vec!["NOT a.tombstone".to_string()];
        if let Some(role) = filter.role {
            values.push(Value::String(role.as_str()));
            conditions.push(format!("a.role = ${}", values.len()));
        }
        match filter.locked {
            Some(true) => conditions.push("a.locked_at IS NOT NULL".to_string()),
            Some(false) => conditions.push("a.locked_at IS NULL".to_string()),
            None => {}
        }
        if let Some(after) = filter.after {
            values.push(Value::Uuid(after.0));
            conditions.push(format!("a.uuid < ${}", values.len()));
        }
        let pattern = filter
            .search
            .as_deref()
            .map(str::trim)
            .filter(|search| !search.is_empty())
            .map(prefix_pattern);
        if let Some(pattern) = &pattern {
            values.push(Value::String(pattern));
            conditions.push(format!(
                "(a.username_normalized LIKE ${n} OR lower(a.email) LIKE ${n})",
                n = values.len()
            ));
        }
        let limit = i64::from(filter.limit);
        values.push(Value::I64(limit + 1));

        let statement = format!(
            "SELECT {COLUMNS} FROM account a WHERE {} ORDER BY a.uuid DESC LIMIT ${}",
            conditions.join(" AND "),
            values.len()
        );
        let rows = (&mut *tx).execute::<All>(statement, values).await?;

        let mut accounts = rows
            .iter()
            .map(decode_overview)
            .collect::<Result<Vec<_>, _>>()?;
        let next_cursor = if accounts.len() > filter.limit as usize {
            accounts.truncate(filter.limit as usize);
            accounts.last().map(|account| account.uuid)
        } else {
            None
        };
        Ok(AccountPage {
            accounts,
            next_cursor,
        })
    }
}

impl AccountDetail {
    /// An Account with its card and passkey counts, `None` for an unknown one or the tombstone
    #[instrument(name = "AccountDetail::get", skip(tx))]
    pub async fn get(
        tx: &mut Transaction,
        uuid: AccountUuid,
    ) -> Result<Option<AccountDetail>, rorm::Error> {
        let statement = format!(
            "SELECT {COLUMNS}, a.identity, \
               (SELECT COALESCE(SUM(s.free + s.sleeved), 0)::bigint \
                FROM collection_stock s WHERE s.owner = a.uuid) AS cards \
             FROM account a WHERE a.uuid = $1 AND NOT a.tombstone"
        );
        let rows = (&mut *tx)
            .execute::<All>(statement, vec![Value::Uuid(uuid.0)])
            .await?;
        let Some(row) = rows.first() else {
            return Ok(None);
        };

        let overview = decode_overview(row)?;
        let cards = row.get("cards").map_err(decode)?;
        let identity: Uuid = row.get("identity").map_err(decode)?;
        let passkeys = IdentityModule::global()
            .count_passkeys(&mut *tx, IdentityUuid::new(identity))
            .await?;

        Ok(Some(AccountDetail {
            overview,
            cards,
            passkeys,
        }))
    }
}

/// A `LIKE` pattern matching everything starting with `search`, case ignored
fn prefix_pattern(search: &str) -> String {
    let mut pattern = String::with_capacity(search.len() + 1);
    for char in search.to_lowercase().chars() {
        if matches!(char, '%' | '_' | '\\') {
            pattern.push('\\');
        }
        pattern.push(char);
    }
    pattern.push('%');
    pattern
}

/// Turns a row error into the error the reads return
fn decode(error: rorm::db::row::RowError<'_>) -> rorm::Error {
    rorm::Error::RowError(error.into_owned())
}

/// Reads the [`COLUMNS`] of a row
fn decode_overview(row: &Row) -> Result<AccountOverview, rorm::Error> {
    let role: String = row.get("role").map_err(decode)?;
    let username: String = row.get("username").map_err(decode)?;
    let email: String = row.get("email").map_err(decode)?;
    let locked_at: Option<OffsetDateTime> = row.get("locked_at").map_err(decode)?;
    let lock_reason: Option<String> = row.get("lock_reason").map_err(decode)?;
    Ok(AccountOverview {
        uuid: AccountUuid(row.get("uuid").map_err(decode)?),
        username: Username::new_from_field(
            MaxStr::new(username)
                .unwrap_or_else(|_| unreachable!("the column holds at most 32 characters")),
        ),
        email: MaxStr::new(email)
            .unwrap_or_else(|_| unreachable!("the column holds at most 255 characters")),
        role: Role::from_str(&role)
            .unwrap_or_else(|| unreachable!("only the Role's own encoding is written")),
        created_at: row.get("created_at").map_err(decode)?,
        collections: row.get("collections").map_err(decode)?,
        decks: row.get("decks").map_err(decode)?,
        lock: locked_at.map(|locked_at| AccountLock {
            locked_at,
            reason: lock_reason.unwrap_or_default(),
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::prefix_pattern;

    #[test]
    fn the_prefix_pattern_lowercases_and_appends_a_wildcard() {
        assert_eq!(prefix_pattern("Alice"), "alice%");
    }

    #[test]
    fn like_wildcards_in_the_search_match_only_themselves() {
        assert_eq!(prefix_pattern("a_b%c\\"), "a\\_b\\%c\\\\%");
    }
}
