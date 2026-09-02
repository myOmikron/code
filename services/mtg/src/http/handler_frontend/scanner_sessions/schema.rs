//! Wire schemas for persisted scanner sessions

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use uuid::Uuid;

use crate::http::handler_frontend::collections::schema::double_option;
use crate::models::card_attributes::CardFinish;
use crate::models::collection::CollectionUuid;
use crate::models::scanner_session::ScannerSession;
use crate::models::scanner_session::ScannerSessionEntry;
use crate::models::scanner_session::ScannerSessionEntryUuid;
use crate::models::scanner_session::ScannerSessionUuid;

/// Scanner session metadata
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ScannerSessionResponse {
    /// Primary key
    pub uuid: ScannerSessionUuid,
    /// Display name
    pub name: MaxStr<255>,
    /// Marker colour
    pub color: MaxStr<16>,
    /// Marker icon
    pub icon: MaxStr<32>,
    /// Preferred destination collection
    pub collection: Option<CollectionUuid>,
    /// Number of distinct staged stacks
    pub stacks: i64,
    /// Number of staged copies
    pub copies: i64,
    /// Creation time
    pub created_at: SchemaDateTime,
}

impl ScannerSessionResponse {
    /// Build a response with its staging counts
    pub fn new(session: ScannerSession, entries: &[ScannerSessionEntry]) -> Self {
        Self {
            uuid: session.uuid,
            name: session.name,
            color: session.color,
            icon: session.icon,
            collection: session.collection,
            stacks: entries.len() as i64,
            copies: entries.iter().map(|entry| i64::from(entry.quantity)).sum(),
            created_at: SchemaDateTime(session.created_at),
        }
    }
}

/// All scanner sessions owned by the account
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListScannerSessionsResponse {
    /// Sessions, newest first
    pub sessions: Vec<ScannerSessionResponse>,
}

/// Start a persisted scanner session
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateScannerSessionRequest {
    /// Display name
    pub name: MaxStr<255>,
    /// Marker colour
    pub color: MaxStr<16>,
    /// Marker icon
    pub icon: MaxStr<32>,
    /// Optional preferred destination collection
    pub collection: Option<CollectionUuid>,
}

/// Rename or reorganise a scanner session
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateScannerSessionRequest {
    /// Display name
    pub name: MaxStr<255>,
    /// Marker colour
    pub color: MaxStr<16>,
    /// Marker icon
    pub icon: MaxStr<32>,
    /// Optional preferred destination collection
    pub collection: Option<CollectionUuid>,
}

/// One editable staged stack
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ScannerSessionEntryResponse {
    /// Primary key
    pub uuid: ScannerSessionEntryUuid,
    /// Scryfall printing id
    pub printing: Uuid,
    /// Number of copies
    pub quantity: i32,
    /// Physical finish
    pub finish: CardFinish,
    /// Whether the cards carry an artist's signature
    pub signed: bool,
    /// Paid price per copy in euro cents
    pub purchase_price_cents: Option<i64>,
    /// When this stack was first staged
    pub created_at: SchemaDateTime,
}

impl From<ScannerSessionEntry> for ScannerSessionEntryResponse {
    fn from(entry: ScannerSessionEntry) -> Self {
        Self {
            uuid: entry.uuid,
            printing: entry.printing,
            quantity: entry.quantity,
            finish: entry.finish,
            signed: entry.signed,
            purchase_price_cents: entry.purchase_price_cents,
            created_at: SchemaDateTime(entry.created_at),
        }
    }
}

/// One session together with its staging area
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ScannerSessionDetailResponse {
    /// Session metadata and counts
    pub session: ScannerSessionResponse,
    /// Staged stacks, newest first
    pub entries: Vec<ScannerSessionEntryResponse>,
}

/// Add a stack to a session
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AddScannerSessionEntryRequest {
    /// Scryfall printing id
    pub printing: Uuid,
    /// Number of copies
    pub quantity: i32,
    /// Physical finish
    pub finish: CardFinish,
    /// Whether the cards are signed
    #[serde(default)]
    pub signed: bool,
    /// Paid price per copy in euro cents
    pub purchase_price_cents: Option<i64>,
}

/// Change selected fields of a staged stack
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateScannerSessionEntryRequest {
    /// Corrected printing
    #[serde(default)]
    pub printing: Option<Uuid>,
    /// New number of copies
    #[serde(default)]
    pub quantity: Option<i32>,
    /// New finish
    #[serde(default)]
    pub finish: Option<CardFinish>,
    /// New signed state
    #[serde(default)]
    pub signed: Option<bool>,
    /// Paid price per copy; `null` clears it
    #[serde(default, deserialize_with = "double_option")]
    pub purchase_price_cents: Option<Option<i64>>,
}

/// File a session's staging area into a collection
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FileScannerSessionRequest {
    /// Destination; omitted to use the session's preferred collection
    pub collection: Option<CollectionUuid>,
}

/// Result of filing and clearing a staging area
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FileScannerSessionResponse {
    /// Destination collection
    pub collection: CollectionUuid,
    /// Distinct stacks filed
    pub stacks: i64,
    /// Copies filed
    pub copies: i64,
}
