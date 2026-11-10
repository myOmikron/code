//! An Admin's Impersonation of a Member Account
//!
//! Lives in the Admin's session only, never in the database as live state: the
//! session names the impersonated Account, the Admin log entry of the start and
//! the expiry. The [`Caller`](super::extractor::Caller) extractor resolves it
//! on every request, so the Admin log is the only lasting trace of it.

use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::session;
use galvyn::core::session::Session;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;

use crate::models::account::ADMIN_REASON_MAX_LEN;
use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::admin_log::AdminActor;
use crate::models::admin_log::AdminLogAction;
use crate::models::admin_log::AdminLogEntry;
use crate::models::admin_log::AdminLogEntryUuid;
use crate::models::admin_log::NewAdminLogEntry;

/// How long an Impersonation lasts from its start, fixed and never extended
pub const IMPERSONATION_DURATION: Duration = Duration::hours(1);

/// Session key holding the session's [`Impersonation`]
const SESSION_KEY: &str = "impersonation";

/// An Admin's session acting as a Member Account, as the session stores it
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Impersonation {
    /// The impersonated Account
    pub account: AccountUuid,
    /// The Admin log entry that records the start
    pub start_entry: AdminLogEntryUuid,
    /// When the Impersonation ends at the latest
    pub expires_at: SchemaDateTime,
}

impl Impersonation {
    /// Start an Impersonation of `account` by `admin`, writing the start entry
    ///
    /// The checks whether `admin` may impersonate `account` are the caller's.
    /// Takes effect once [`Impersonation::put_into`] stored it in the session.
    #[instrument(name = "Impersonation::start", skip(tx))]
    pub async fn start(
        tx: &mut Transaction,
        admin: &Account,
        account: &Account,
        reason: MaxStr<ADMIN_REASON_MAX_LEN>,
    ) -> Result<Self, rorm::Error> {
        let expires_at = SchemaDateTime(OffsetDateTime::now_utc() + IMPERSONATION_DURATION);
        let start_entry = AdminLogEntry::record(
            tx,
            NewAdminLogEntry {
                admin: AdminActor::Admin(admin),
                account,
                action: AdminLogAction::ImpersonationStart { reason, expires_at },
            },
        )
        .await?;
        Ok(Self {
            account: account.uuid,
            start_entry,
            expires_at,
        })
    }

    /// End the Impersonation of `account` by `admin`, writing the end entry
    ///
    /// Only for an explicit end and a logout, never for an expiry. Takes effect
    /// once [`Impersonation::remove_from`] dropped it from the session.
    #[instrument(name = "Impersonation::end", skip(tx))]
    pub async fn end(
        tx: &mut Transaction,
        admin: &Account,
        account: &Account,
    ) -> Result<(), rorm::Error> {
        AdminLogEntry::record(
            tx,
            NewAdminLogEntry {
                admin: AdminActor::Admin(admin),
                account,
                action: AdminLogAction::ImpersonationEnd,
            },
        )
        .await?;
        Ok(())
    }

    /// The Impersonation `session` is in, if any
    pub async fn read(session: &Session) -> Result<Option<Self>, session::Error> {
        session.get(SESSION_KEY).await
    }

    /// Put the Impersonation into `session`: from its next request on, it acts as the Account
    pub async fn put_into(&self, session: &Session) -> Result<(), session::Error> {
        session.insert(SESSION_KEY, self).await
    }

    /// Drop any Impersonation from `session`: it acts as its own Account again
    pub async fn remove_from(session: &Session) -> Result<(), session::Error> {
        session.remove_value(SESSION_KEY).await?;
        Ok(())
    }
}
