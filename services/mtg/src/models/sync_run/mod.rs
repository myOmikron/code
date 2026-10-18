//! Sync runs: every attempt of the catalog sync and the price guide sync
//!
//! The syncs run unattended in their own containers. A Sync run is what is
//! left of each attempt for the admin dashboard, kept for [`RETENTION`].

use std::future::Future;
use std::time::Instant;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::and;
use galvyn::rorm::conditions::Condition;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use tracing::error;
use tracing::instrument;
use uuid::Uuid;

use crate::models::sync_run::db::SyncRunModel;

pub(in crate::models) mod db;

/// How long a Sync run is kept
pub const RETENTION: Duration = Duration::days(90);

/// The longest error message a Sync run keeps
pub const ERROR_MAX_LEN: usize = 2048;

/// Which sync a run belongs to
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum SyncKind {
    /// The catalog sync from Scryfall's bulk data
    Catalog,
    /// The price guide sync from Cardmarket
    PriceGuide,
}
custom_db_enum! {
    enum: SyncKind,
    variants: [Catalog, PriceGuide],
    decoder: SyncKindDecoder,
}

/// What a Sync run came to
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum SyncRunOutcome {
    /// A new file was read
    Synced,
    /// The file on offer was the one already read
    Unchanged,
    /// The run failed
    Failed,
}
custom_db_enum! {
    enum: SyncRunOutcome,
    variants: [Synced, Unchanged, Failed],
    decoder: SyncRunOutcomeDecoder,
}

/// A sync's own result, as far as a Sync run cares
pub trait SyncResult {
    /// Whether the run read a new file or found the one it already had
    fn outcome(&self) -> SyncRunOutcome;
}

/// One attempt of a sync
#[derive(Debug, Clone)]
pub struct SyncRun {
    /// Primary key
    pub uuid: Uuid,
    /// Which sync ran
    pub sync: SyncKind,
    /// When it started
    pub started_at: OffsetDateTime,
    /// How long it took, in milliseconds
    pub duration_ms: i64,
    /// What it came to
    pub outcome: SyncRunOutcome,
    /// Why it failed
    pub error: Option<String>,
}

/// A Sync run to store
#[derive(Debug, Clone)]
pub struct NewSyncRun {
    /// Which sync ran
    pub sync: SyncKind,
    /// When it started
    pub started_at: OffsetDateTime,
    /// How long it took, in milliseconds
    pub duration_ms: i64,
    /// What it came to
    pub outcome: SyncRunOutcome,
    /// Why it failed, cut to [`ERROR_MAX_LEN`] bytes
    pub error: Option<String>,
}

/// What the admin dashboard shows of one sync
#[derive(Debug, Clone)]
pub struct SyncStatus {
    /// The newest run
    pub last_attempt: Option<SyncRun>,
    /// The newest run that did not fail
    pub last_success: Option<SyncRun>,
    /// The newest run that failed
    pub last_failure: Option<SyncRun>,
    /// The newest runs, newest first
    pub recent: Vec<SyncRun>,
}

impl SyncRun {
    /// Runs a sync and stores how it went, failures included
    ///
    /// Also removes the runs older than [`RETENTION`]. Storing the run never
    /// changes the sync's result: a failure to store is logged.
    pub async fn track<T: SyncResult>(
        database: &Database,
        sync: SyncKind,
        run: impl Future<Output = anyhow::Result<T>>,
    ) -> anyhow::Result<T> {
        let started_at = OffsetDateTime::now_utc();
        let clock = Instant::now();
        let result = run.await;
        let duration_ms = i64::try_from(clock.elapsed().as_millis()).unwrap_or(i64::MAX);

        let (outcome, error) = match &result {
            Ok(result) => (result.outcome(), None),
            Err(error) => (SyncRunOutcome::Failed, Some(format!("{error:#}"))),
        };
        let stored = Self::store(
            database,
            NewSyncRun {
                sync,
                started_at,
                duration_ms,
                outcome,
                error,
            },
        )
        .await;
        if let Err(error) = stored {
            error!(error.display = %error, ?sync, "Could not store the sync run");
        }
        result
    }

    async fn store(database: &Database, run: NewSyncRun) -> anyhow::Result<()> {
        let mut tx = database.start_transaction().await?;
        Self::insert(&mut tx, run).await?;
        Self::remove_expired(&mut tx, OffsetDateTime::now_utc()).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Stores a run
    #[instrument(name = "SyncRun::insert", skip(tx))]
    pub async fn insert(tx: &mut Transaction, run: NewSyncRun) -> Result<Uuid, rorm::Error> {
        let uuid = Uuid::now_v7();
        rorm::insert(&mut *tx, SyncRunModel)
            .return_nothing()
            .single(&SyncRunModel {
                uuid,
                sync: run.sync,
                started_at: run.started_at,
                duration_ms: run.duration_ms,
                outcome: run.outcome,
                error: run.error.as_deref().map(bounded_error),
            })
            .await?;
        Ok(uuid)
    }

    /// Removes the runs started more than [`RETENTION`] before `now`
    #[instrument(name = "SyncRun::remove_expired", skip(tx))]
    pub async fn remove_expired(
        tx: &mut Transaction,
        now: OffsetDateTime,
    ) -> Result<u64, rorm::Error> {
        rorm::delete(&mut *tx, SyncRunModel)
            .condition(SyncRunModel.started_at.less_than(now - RETENTION))
            .await
    }

    /// The newest `limit` runs of a sync, newest first
    #[instrument(name = "SyncRun::recent", skip(tx))]
    pub async fn recent(
        tx: &mut Transaction,
        sync: SyncKind,
        limit: u64,
    ) -> Result<Vec<SyncRun>, rorm::Error> {
        let runs = rorm::query(&mut *tx, SyncRunModel)
            .condition(SyncRunModel.sync.equals(sync))
            .order_desc(SyncRunModel.started_at)
            .limit(limit)
            .all()
            .await?;
        Ok(runs.into_iter().map(SyncRun::from).collect())
    }

    async fn newest<'a>(
        tx: &mut Transaction,
        condition: impl Condition<'a>,
    ) -> Result<Option<SyncRun>, rorm::Error> {
        let run = rorm::query(&mut *tx, SyncRunModel)
            .condition(condition)
            .order_desc(SyncRunModel.started_at)
            .optional()
            .await?;
        Ok(run.map(SyncRun::from))
    }
}

impl SyncStatus {
    /// The status of a sync with its newest `recent` runs
    #[instrument(name = "SyncStatus::read", skip(tx))]
    pub async fn read(
        tx: &mut Transaction,
        sync: SyncKind,
        recent: u64,
    ) -> Result<SyncStatus, rorm::Error> {
        let recent = SyncRun::recent(tx, sync, recent).await?;
        let last_success = SyncRun::newest(
            tx,
            and![
                SyncRunModel.sync.equals(sync),
                SyncRunModel.outcome.not_equals(SyncRunOutcome::Failed)
            ],
        )
        .await?;
        let last_failure = SyncRun::newest(
            tx,
            and![
                SyncRunModel.sync.equals(sync),
                SyncRunModel.outcome.equals(SyncRunOutcome::Failed)
            ],
        )
        .await?;
        Ok(SyncStatus {
            last_attempt: recent.first().cloned(),
            last_success,
            last_failure,
            recent,
        })
    }
}

impl From<SyncRunModel> for SyncRun {
    fn from(value: SyncRunModel) -> Self {
        Self {
            uuid: value.uuid,
            sync: value.sync,
            started_at: value.started_at,
            duration_ms: value.duration_ms,
            outcome: value.outcome,
            error: value.error.map(|error| error.to_string()),
        }
    }
}

/// Cuts an error message to [`ERROR_MAX_LEN`] bytes, on a character boundary
fn bounded_error(message: &str) -> MaxStr<ERROR_MAX_LEN> {
    let end = (0..=message.len().min(ERROR_MAX_LEN))
        .rev()
        .find(|&end| message.is_char_boundary(end))
        .unwrap_or(0);
    MaxStr::new(message[..end].to_string())
        .unwrap_or_else(|_| unreachable!("cut to the maximum length"))
}
