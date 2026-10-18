use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDate;
use galvyn::core::stuff::schema::SchemaDateTime;
use serde::Serialize;
use uuid::Uuid;

use crate::models::catalog::CatalogSync;
use crate::models::price::PriceGuideSync;
use crate::models::sync_run::SyncRun;
use crate::models::sync_run::SyncRunOutcome;
use crate::models::sync_run::SyncStatus;

/// The state of both syncs
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminSyncsResponse {
    /// The catalog sync from Scryfall
    pub catalog: AdminCatalogSync,
    /// The price guide sync from Cardmarket
    pub price_guide: AdminPriceGuideSync,
}

/// The catalog sync
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminCatalogSync {
    /// The file the catalog was last read from, `None` before the first read
    pub stamp: Option<AdminCatalogStamp>,
    /// Its Sync runs
    pub runs: AdminSyncRuns,
}

/// The file the catalog was last read from
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminCatalogStamp {
    /// The `updated_at` Scryfall stamped the bulk file with
    pub bulk_updated_at: String,
    /// When it was read
    pub synced_at: SchemaDateTime,
}

/// The price guide sync
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminPriceGuideSync {
    /// The file the prices were last read from, `None` before the first read
    pub stamp: Option<AdminPriceGuideStamp>,
    /// Its Sync runs
    pub runs: AdminSyncRuns,
}

/// The file the prices were last read from
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminPriceGuideStamp {
    /// The etag the file was served under
    pub etag: String,
    /// The day it quoted prices for
    pub day: SchemaDate,
}

/// The Sync runs of one sync
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminSyncRuns {
    /// The newest run
    pub last_attempt: Option<AdminSyncRun>,
    /// The newest run that did not fail
    pub last_success: Option<AdminSyncRun>,
    /// The newest run that failed, with its error
    pub last_failure: Option<AdminSyncRun>,
    /// The newest runs, newest first
    pub recent: Vec<AdminSyncRun>,
}

/// One Sync run
#[derive(Debug, Clone, PartialEq, Serialize, JsonSchema)]
pub struct AdminSyncRun {
    /// Primary key
    pub uuid: Uuid,
    /// When it started
    pub started_at: SchemaDateTime,
    /// How long it took, in milliseconds
    pub duration_ms: i64,
    /// What it came to
    pub outcome: SyncRunOutcome,
    /// Why it failed
    pub error: Option<String>,
}

impl From<SyncRun> for AdminSyncRun {
    fn from(value: SyncRun) -> Self {
        Self {
            uuid: value.uuid,
            started_at: SchemaDateTime(value.started_at),
            duration_ms: value.duration_ms,
            outcome: value.outcome,
            error: value.error,
        }
    }
}

impl From<SyncStatus> for AdminSyncRuns {
    fn from(value: SyncStatus) -> Self {
        Self {
            last_attempt: value.last_attempt.map(AdminSyncRun::from),
            last_success: value.last_success.map(AdminSyncRun::from),
            last_failure: value.last_failure.map(AdminSyncRun::from),
            recent: value.recent.into_iter().map(AdminSyncRun::from).collect(),
        }
    }
}

impl From<CatalogSync> for AdminCatalogStamp {
    fn from(value: CatalogSync) -> Self {
        Self {
            bulk_updated_at: value.bulk_updated_at.to_string(),
            synced_at: SchemaDateTime(value.synced_at),
        }
    }
}

impl From<PriceGuideSync> for AdminPriceGuideStamp {
    fn from(value: PriceGuideSync) -> Self {
        Self {
            etag: value.etag,
            day: SchemaDate(value.day),
        }
    }
}
