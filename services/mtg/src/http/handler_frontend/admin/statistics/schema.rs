use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use serde::Serialize;
use uuid::Uuid;

use crate::models::statistics::StatisticsSnapshot;

/// The newest Statistics snapshot and the ones of the last 30 days
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminStatisticsResponse {
    /// The most recent snapshot, `None` before the first one was taken
    pub newest: Option<AdminStatisticsSnapshot>,
    /// Snapshots of the last 30 days, oldest first
    pub history: Vec<AdminStatisticsSnapshot>,
}

/// Service-wide counts at one point in time
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminStatisticsSnapshot {
    /// Primary key
    pub uuid: Uuid,
    /// When the counts were taken
    pub taken_at: SchemaDateTime,
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
    /// Scanner sessions holding at least one card not yet filed
    pub open_scanner_sessions: i64,
    /// Tournaments in any state; zero before Tournaments were counted
    pub tournaments: i64,
    /// Finished Tournaments; zero before Tournaments were counted
    pub finished_tournaments: i64,
}

impl From<StatisticsSnapshot> for AdminStatisticsSnapshot {
    fn from(value: StatisticsSnapshot) -> Self {
        Self {
            uuid: value.uuid,
            taken_at: SchemaDateTime(value.taken_at),
            accounts: value.accounts,
            new_accounts: value.new_accounts,
            collections: value.collections,
            decks: value.decks,
            public_decks: value.public_decks,
            cards: value.cards,
            open_scanner_sessions: value.open_scanner_sessions,
            tournaments: value.tournaments,
            finished_tournaments: value.finished_tournaments,
        }
    }
}
