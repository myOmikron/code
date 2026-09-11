//! Schemas for joining a tournament by its typed code

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::deck::DeckUuid;
use crate::models::tournament::DecklistPolicy;
use crate::models::tournament::TournamentParticipantUuid;
use crate::models::tournament::TournamentStatus;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::participant::ClaimTarget;

/// What a typed code resolves to, before anybody has joined
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct JoinLookupResponse {
    /// The tournament the code names
    pub tournament: TournamentUuid,
    /// The code itself, as stored — a typed one may have arrived lowercase or
    /// with a separator, and a screen showing it wants the canonical form
    pub join_code: MaxStr<8>,
    /// Name of the tournament
    pub name: MaxStr<128>,
    /// The format being played
    pub format: MaxStr<32>,
    /// How many players sit at one table
    pub pod_size: i16,
    /// Where the event stands in its lifecycle
    pub status: TournamentStatus,
    /// When the event is announced to start
    pub starts_at: Option<SchemaDateTime>,
    /// Where the event takes place
    pub venue: Option<MaxStr<255>>,
    /// The venue's address, meaningful only alongside [`Self::venue`]
    pub venue_address: Option<MaxStr<512>>,
    /// How to actually get in — shown to everyone who can see this lookup,
    /// same as the address
    pub venue_instructions: Option<MaxStr<1024>>,
    /// How the tournament requires its players to hand in a decklist
    pub decklist_policy: DecklistPolicy,
    /// How many people are on the roster already
    pub participant_count: i64,
    /// How many players fit, `None` for no limit
    pub max_participants: Option<i16>,
    /// Whether joining right now would actually register a player
    pub registration_open: bool,
    /// Always `false` here — this route has no session to check against.
    /// [`super::handler::join_tournament_by_code`] reports a stranded join
    /// attempt as a form error instead, once it has an account to check.
    pub already_registered: bool,
}

/// Request to join by code as a logged-in account
///
/// `deck` and `decklist_text` are mutually exclusive — both present answers
/// [`JoinErrors::invalid_decklist`]; both absent is fine unless the
/// tournament's [`Tournament::needs_decklist_to_register`](crate::models::tournament::Tournament::needs_decklist_to_register)
/// says otherwise.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct JoinTournamentRequest {
    /// The name to appear under; `None` defaults to the account's username
    #[serde(default)]
    pub display_name: Option<MaxStr<64>>,
    /// Link a Planarium deck — the caller must own it
    #[serde(default)]
    pub deck: Option<DeckUuid>,
    /// Paste a decklist directly
    #[serde(default)]
    pub decklist_text: Option<MaxStr<16384>>,
}

/// What a successful account join answers with
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct JoinTournamentResponse {
    /// The tournament joined
    pub tournament: TournamentUuid,
    /// The freshly registered participant row
    pub participant: TournamentParticipantUuid,
}

/// Request to join by code as a guest
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GuestJoinRequest {
    /// The name to appear under
    pub display_name: MaxStr<64>,
    /// Paste a decklist directly — a guest never links a Planarium deck
    #[serde(default)]
    pub decklist_text: Option<MaxStr<16384>>,
}

/// What a successful guest join answers with
///
/// The one place outside [`crate::models::tournament::participant::register_guest`]
/// itself a claim token is ever handed out — never repeated in a list
/// response afterwards.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GuestJoinResponse {
    /// The tournament joined
    pub tournament: TournamentUuid,
    /// The freshly registered participant row
    pub participant: TournamentParticipantUuid,
    /// The one-time secret that later claims this row for an account
    pub claim_token: MaxStr<64>,
}

/// What a claim token names, for the screen a scanned QR lands on before the
/// player has committed to anything
///
/// Mirrors [`ClaimTarget`] field for field — its own public type rather than
/// handing the model struct across the HTTP boundary directly, the same
/// reasoning as every other response type in this module tree.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ClaimTargetResponse {
    /// The tournament the row belongs to
    pub tournament: TournamentUuid,
    /// The participant row the token names
    pub participant: TournamentParticipantUuid,
    /// The tournament's name, to greet the player with
    pub tournament_name: MaxStr<128>,
    /// The row's current display name
    pub display_name: MaxStr<64>,
}

impl From<ClaimTarget> for ClaimTargetResponse {
    fn from(target: ClaimTarget) -> Self {
        Self {
            tournament: target.tournament,
            participant: target.participant,
            tournament_name: target.tournament_name,
            display_name: target.display_name,
        }
    }
}

/// Why a join attempt was refused
#[derive(Default, Serialize, JsonSchema)]
pub struct JoinErrors {
    /// The code did not resolve to a live tournament
    pub unknown_code: bool,
    /// The tournament is not accepting new registrations right now
    pub registration_closed: bool,
    /// The caller already has a row in this tournament
    pub already_registered: bool,
    /// Every seat the event offers is taken
    pub tournament_full: bool,
    /// The display name was empty or all whitespace
    pub empty_name: bool,
    /// The tournament's [`crate::models::tournament::DecklistPolicy::RequiredToRegister`]
    /// is set and neither `deck` nor `decklist_text` was given
    pub decklist_missing: bool,
    /// The named deck does not exist, is not the caller's, or rendered to
    /// nothing playable — an empty deck is not a list anybody can register
    pub unknown_deck: bool,
    /// The pasted text was blank once trimmed, or both `deck` and
    /// `decklist_text` were given in the same request
    pub invalid_decklist: bool,
}
