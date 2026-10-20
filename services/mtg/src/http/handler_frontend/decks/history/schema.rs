use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use uuid::Uuid;

use crate::models::deck::DeckZone;
use crate::models::deck::history::CHECKPOINT_LENGTH;
use crate::models::deck::history::ChangedEntry;
use crate::models::deck::history::DeckChange;
use crate::models::deck::history::DeckChangeKind;
use crate::models::deck::history::DeckChangeUuid;
use crate::models::deck::history::DeckPoint;
use crate::models::deck::history::DeckSettings;
use crate::models::deck::history::FieldDifference;
use crate::models::deck::history::PointEntry;
use crate::models::deck::history::UndoState;

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
    /// What undo and redo can do now
    #[serde(flatten)]
    pub undo: DeckUndoResponse,
}

/// What undo and redo can do
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, JsonSchema)]
pub struct DeckUndoResponse {
    /// Whether there is a Deck change to undo
    pub can_undo: bool,
    /// Whether there is an undone Deck change to redo
    pub can_redo: bool,
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
    /// The Deck change an undo takes back, a redo applies again or a reset
    /// returns to, `None` for any other kind
    pub reference: Option<DeckChangeUuid>,
    /// Whether an undo took it back and no redo applied it again since
    pub undone: bool,
    /// The Deck checkpoint the owner named it with, `None` when unnamed
    pub checkpoint: Option<String>,
}

/// The name of a Deck checkpoint
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct SetDeckCheckpointRequest {
    /// The name, never blank; surrounding whitespace is dropped
    pub name: MaxStr<CHECKPOINT_LENGTH>,
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
            reference: value.reference,
            undone: value.undone,
            checkpoint: value.checkpoint,
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

impl From<UndoState> for DeckUndoResponse {
    fn from(state: UndoState) -> Self {
        Self {
            can_undo: state.undo.is_some(),
            can_redo: state.redo.is_some(),
        }
    }
}

/// A deck as it was right after one of its Deck changes, read-only
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct DeckPointResponse {
    /// The Deck change
    pub change: DeckChangeResponse,
    /// The Deck entries the deck held then
    pub entries: Vec<DeckPointEntryResponse>,
    /// The recorded deck fields as they were then
    pub settings: DeckSettingsResponse,
}

/// One Deck entry a deck held at an earlier point
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct DeckPointEntryResponse {
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// The card's printed name, `None` while the catalog does not know the printing
    pub name: Option<String>,
    /// Which zone the entry sat in
    pub zone: DeckZone,
    /// Whether the copies were the foil ones
    pub foil: bool,
    /// Whether the copies were stand-ins rather than the real cards
    pub proxy: bool,
    /// How many copies it held
    pub quantity: i32,
}

/// The recorded deck fields at an earlier point
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct DeckSettingsResponse {
    /// The deck's name
    pub name: String,
    /// The deck's description, `None` for none
    pub description: Option<String>,
    /// The format the deck was built for
    pub format: String,
    /// The colours the deck could play, `None` for whatever the commander allows
    pub allowed_color_identity: Option<String>,
    /// The Commander bracket the deck was built to, `None` when unset
    pub bracket: Option<i16>,
    /// Whether the table agreed to more commanders than the format allows
    pub allow_extra_commanders: bool,
    /// Whether the table agreed to more copies of a card than the format allows
    pub allow_duplicates: bool,
    /// Whether the table agreed to cards the format bans
    pub allow_banned: bool,
    /// How many cards the deck was built to, `None` for the format's rule
    pub deck_size: Option<i16>,
}

impl From<DeckPoint> for DeckPointResponse {
    fn from(point: DeckPoint) -> Self {
        Self {
            change: DeckChangeResponse::from(point.change),
            entries: point
                .entries
                .into_iter()
                .map(DeckPointEntryResponse::from)
                .collect(),
            settings: DeckSettingsResponse::from(point.settings),
        }
    }
}

impl From<PointEntry> for DeckPointEntryResponse {
    fn from(
        PointEntry {
            key,
            quantity,
            name,
        }: PointEntry,
    ) -> Self {
        Self {
            printing: key.printing,
            name,
            zone: key.zone,
            foil: key.foil,
            proxy: key.proxy,
            quantity,
        }
    }
}

impl From<DeckSettings> for DeckSettingsResponse {
    fn from(settings: DeckSettings) -> Self {
        Self {
            name: settings.name.into_inner(),
            description: settings
                .description
                .map(|description| description.into_inner()),
            format: settings.format.into_inner(),
            allowed_color_identity: settings
                .allowed_color_identity
                .map(|colors| colors.into_inner()),
            bracket: settings.bracket,
            allow_extra_commanders: settings.allow_extra_commanders,
            allow_duplicates: settings.allow_duplicates,
            allow_banned: settings.allow_banned,
            deck_size: settings.deck_size,
        }
    }
}
