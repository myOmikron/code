//! Database model backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use uuid::Uuid;

/// One Statistics snapshot, kept forever
#[derive(Model, Debug)]
#[rorm(rename = "statistics_snapshot")]
pub struct StatisticsSnapshotModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,
    /// When the counts were taken
    #[rorm(index)]
    pub taken_at: OffsetDateTime,
    /// Accounts, without the Tombstone
    pub accounts: i64,
    /// Accounts created in the 7 days before `taken_at`
    pub new_accounts: i64,
    /// Collections on a shelf, without the ones standing for a deck
    pub collections: i64,
    /// Decks
    pub decks: i64,
    /// Public decks
    pub public_decks: i64,
    /// Cards, on the shelf and sleeved in decks
    pub cards: i64,
    /// Open scanner sessions
    pub open_scanner_sessions: i64,
}

/// Insert patch for [`StatisticsSnapshotModel`]
#[derive(Patch)]
#[rorm(model = "StatisticsSnapshotModel")]
pub struct StatisticsSnapshotInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// When the counts were taken
    pub taken_at: OffsetDateTime,
    /// Accounts
    pub accounts: i64,
    /// New Accounts
    pub new_accounts: i64,
    /// Collections
    pub collections: i64,
    /// Decks
    pub decks: i64,
    /// Public decks
    pub public_decks: i64,
    /// Cards
    pub cards: i64,
    /// Open scanner sessions
    pub open_scanner_sessions: i64,
}
