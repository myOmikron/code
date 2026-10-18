//! Database model backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::models::sync_run::SyncKind;
use crate::models::sync_run::SyncRunOutcome;

/// One attempt of a sync
#[derive(Model, Debug)]
#[rorm(rename = "sync_run")]
pub struct SyncRunModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// Which sync ran
    ///
    /// Leads the `sync_run_started` index: every read asks for one sync's
    /// runs ordered by their start.
    #[rorm(index(name = "sync_run_started", priority = 1))]
    pub sync: SyncKind,

    /// When the run started
    #[rorm(index(name = "sync_run_started", priority = 2))]
    pub started_at: OffsetDateTime,

    /// How long the run took, in milliseconds
    pub duration_ms: i64,

    /// What the run came to
    pub outcome: SyncRunOutcome,

    /// Why the run failed, cut to fit
    pub error: Option<MaxStr<{ super::ERROR_MAX_LEN }>>,
}
