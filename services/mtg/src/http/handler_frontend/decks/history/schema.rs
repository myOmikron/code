use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use serde::Deserialize;
use serde::Serialize;
use uuid::Uuid;

use crate::models::deck::DeckZone;
use crate::models::deck::history::ChangedEntry;
use crate::models::deck::history::DeckChange;
use crate::models::deck::history::DeckChangeKind;
use crate::models::deck::history::DeckChangeUuid;
use crate::models::deck::history::FieldDifference;

/// The page size of a Deck history for a client that does not ask for one
fn default_limit() -> u32 {
    50
}

/// How to page a Deck history
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct GetDeckHistoryQuery {
    /// Continue after this Deck change, from a previous page's `next_cursor`
    #[serde(default)]
    pub after: Option<DeckChangeUuid>,
    /// How many Deck changes to return, capped server-side
    #[serde(default = "default_limit")]
    pub limit: u32,
}

/// One page of a Deck history, newest first
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct DeckHistoryResponse {
    /// The Deck changes
    pub changes: Vec<DeckChangeResponse>,
    /// Pass as `after` for the next page, `None` on the last one
    pub next_cursor: Option<DeckChangeUuid>,
}

/// One Deck change
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct DeckChangeResponse {
    /// Primary key
    pub uuid: DeckChangeUuid,
    /// What the owner did
    pub kind: DeckChangeKind,
    /// When it happened
    pub changed_at: SchemaDateTime,
    /// The Deck entries it touched
    pub entries: Vec<DeckEntryChangeResponse>,
    /// The deck fields it changed
    pub fields: Vec<FieldDifference>,
}

/// How many copies one Deck entry held before and after a Deck change
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct DeckEntryChangeResponse {
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// The card's printed name, `None` while the catalog does not know the printing
    pub name: Option<String>,
    /// Which zone the entry sits in
    pub zone: DeckZone,
    /// Whether the copies are the foil ones
    pub foil: bool,
    /// Whether the copies are stand-ins rather than the real cards
    pub proxy: bool,
    /// How many copies it held before, zero for an entry that came into being
    pub before: i32,
    /// How many copies it holds after, zero for an entry that is gone
    pub after: i32,
}

impl From<DeckChange> for DeckChangeResponse {
    fn from(value: DeckChange) -> Self {
        Self {
            uuid: value.uuid,
            kind: value.kind,
            changed_at: SchemaDateTime(value.changed_at),
            entries: value
                .entries
                .into_iter()
                .map(DeckEntryChangeResponse::from)
                .collect(),
            fields: value.fields,
        }
    }
}

impl From<ChangedEntry> for DeckEntryChangeResponse {
    fn from(ChangedEntry { difference, name }: ChangedEntry) -> Self {
        Self {
            printing: difference.printing,
            name,
            zone: difference.zone,
            foil: difference.foil,
            proxy: difference.proxy,
            before: difference.before,
            after: difference.after,
        }
    }
}
