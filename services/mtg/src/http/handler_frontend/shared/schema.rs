use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::http::handler_frontend::collections::schema::CollectionStatisticsResponse;
use crate::http::handler_frontend::collections::schema::ListedCardResponse;
use crate::http::handler_frontend::collections::schema::ListedEntryResponse;
use crate::http::handler_frontend::decks::schema::DeckCardResponse;
use crate::models::tournament::ParticipantStatus;
use crate::models::tournament::TournamentStatus;
use crate::models::tournament::participant::TournamentParticipant;

/// A collection as the holder of its share link sees it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SharedCollectionResponse {
    /// Name of the collection
    pub name: MaxStr<255>,
    /// Description shown above the card list
    pub description: MaxStr<1024>,
    /// Display name of the account the collection belongs to
    pub owner: String,
    /// The point in time the collection was created
    pub created_at: SchemaDateTime,
}

/// A deck as the holder of its share link sees it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SharedDeckResponse {
    /// Name of the deck
    pub name: MaxStr<255>,
    /// Optional description, e.g. the deck's game plan
    pub description: Option<MaxStr<1024>>,
    /// The format the deck is built for
    pub format: MaxStr<32>,
    /// The colours the deck may play, `null` for whatever the commander allows
    pub allowed_color_identity: Option<MaxStr<8>>,
    /// Display name of the account the deck belongs to
    pub owner: String,
    /// The point in time the deck was created
    pub created_at: SchemaDateTime,
}

/// A tournament as the holder of its share link sees it
///
/// Event header and roster only: no decklists (`decklist_audience`/
/// `decklist_reveal` stay for a milestone that actually has rounds to hide),
/// no standings (M3), no room display (M2), and none of the organizer-only
/// fields [`crate::models::tournament::Tournament`] carries — a type of its
/// own rather than a redacted [`crate::http::handler_frontend::tournaments::schema::TournamentResponse`],
/// the same reasoning as [`SharedParticipantResponse`]. `participant_count`
/// is the true count and is never redacted by the roster view — an event may
/// advertise its size while keeping names to itself; `roster_available` says
/// whether [`super::handler::list_shared_tournament_participants`] has
/// anything to answer for this link at all.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SharedTournamentResponse {
    /// Name of the tournament
    pub name: MaxStr<128>,
    /// Optional description
    pub description: Option<MaxStr<1024>>,
    /// The format being played
    pub format: MaxStr<32>,
    /// How many players sit at one table
    pub pod_size: i16,
    /// Where the event stands in its lifecycle
    pub status: TournamentStatus,
    /// Where the event takes place
    pub venue: Option<MaxStr<255>>,
    /// The venue's address, meaningful only alongside [`Self::venue`]
    pub venue_address: Option<MaxStr<512>>,
    /// How to actually get in — shown to everyone who can see this link,
    /// same as the address
    pub venue_instructions: Option<MaxStr<1024>>,
    /// When the event is announced to start
    pub starts_at: Option<SchemaDateTime>,
    /// How many people are on the roster, regardless of `roster_available`
    pub participant_count: i64,
    /// Whether the roster view is not `Hidden` — tells the client whether to
    /// offer the players tab at all
    pub roster_available: bool,
}

/// One redacted row of a shared tournament's roster
///
/// No uuid, no notes, no timestamps, no `has_decklist` — a type of its own
/// rather than a redacted reuse of
/// [`crate::http::handler_frontend::tournaments::schema::TournamentParticipantResponse`],
/// so this public surface cannot grow such a field by accident: adding one
/// here is a deliberate, visible edit to this struct, never a forgotten
/// redaction somewhere else.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SharedParticipantResponse {
    /// The name the player appears under — a guest's real name or a
    /// "Gast {n}" pseudonym, depending on the tournament's roster view
    pub display_name: MaxStr<64>,
    /// Where the player stands in the event
    pub status: ParticipantStatus,
    /// Whether this row has no account behind it
    pub is_guest: bool,
}

impl From<TournamentParticipant> for SharedParticipantResponse {
    fn from(participant: TournamentParticipant) -> Self {
        Self {
            display_name: participant.display_name,
            status: participant.status,
            is_guest: participant.is_guest,
        }
    }
}

/// A shared tournament's redacted roster
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListSharedParticipantsResponse {
    /// The roster, redacted the same way the ordinary authed read is
    pub participants: Vec<SharedParticipantResponse>,
}

/// Take what somebody else's deck is not meant to reveal out of a slot
///
/// Only the proxy flag, and it goes for the same reason the purchase price
/// goes out of a collection stack: it is a fact about the owner's shelf, not
/// about the deck. Which slots the owner plays a stand-in for says what they
/// do and do not own — collection bookkeeping that happens to be stored next
/// to the decklist, and a decklist is the thing on show here.
///
/// What is left is the list itself: the cards, the counts, the zones, which is
/// what a reader came for. Reported as `false`, the honest answer to "is this
/// a proxy" for a reader who is not entitled to ask.
pub fn redact_slot(slot: DeckCardResponse) -> DeckCardResponse {
    DeckCardResponse {
        proxy: false,
        ..slot
    }
}

/// Take what somebody else's collection is not meant to reveal out of a stack
///
/// Money first: neither what was paid nor what the cards fetch today. A price
/// per card reads as a catalog figure, but a collection is a list of cards
/// somebody owns, and a listing that prices every row of it prices the shelf —
/// which is a thing about its owner, not about the cards. The tags go for the
/// same reason: they say how the owner sorts, not what the card is.
///
/// What is left is the cards themselves, which is what a reader came for.
pub fn redact_entry(entry: ListedEntryResponse) -> ListedEntryResponse {
    ListedEntryResponse {
        purchase_price_cents: None,
        tags: Vec::new(),
        card: entry.card.map(|card| ListedCardResponse {
            price_eur_cents: None,
            price_eur_foil_cents: None,
            ..card
        }),
        ..entry
    }
}

/// Take every figure in money out of a collection's statistics, see [`redact_entry`]
///
/// The counts stay: how the collection is spread over colours, types, rarities
/// and years says what kind of collection it is without saying what it is worth.
pub fn redact_statistics(mut stats: CollectionStatisticsResponse) -> CollectionStatisticsResponse {
    // The timeline is two series sharing a month, and only one of them is
    // money — emptying it would take the copy count with it.
    for point in &mut stats.timeline {
        point.value_cents = 0;
    }

    CollectionStatisticsResponse {
        market_value_cents: 0,
        priced_cards: 0,
        purchase_total_cents: 0,
        purchased_cards: 0,
        market_of_purchased_cents: 0,
        average_value_cents: 0,
        reserved_value_cents: 0,
        value_buckets: Vec::new(),
        top_cards: Vec::new(),
        price_points: Vec::new(),
        ..stats
    }
}
