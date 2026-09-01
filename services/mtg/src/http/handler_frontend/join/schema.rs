//! Schemas for joining a tournament by its typed code

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::tournament::TournamentParticipantUuid;
use crate::models::tournament::TournamentStatus;
use crate::models::tournament::TournamentUuid;

/// What a typed code resolves to, before anybody has joined
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct JoinLookupResponse {
    /// The tournament the code names
    pub tournament: TournamentUuid,
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
    /// How many people are on the roster already
    pub participant_count: i64,
    /// Whether joining right now would actually register a player
    pub registration_open: bool,
    /// Always `false` here — this route has no session to check against.
    /// [`super::handler::join_tournament_by_code`] reports a stranded join
    /// attempt as a form error instead, once it has an account to check.
    pub already_registered: bool,
}

/// Request to join by code as a logged-in account
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct JoinTournamentRequest {
    /// The name to appear under; `None` defaults to the account's username
    #[serde(default)]
    pub display_name: Option<MaxStr<64>>,
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

/// Why a join attempt was refused
#[derive(Default, Serialize, JsonSchema)]
pub struct JoinErrors {
    /// The code did not resolve to a live tournament
    pub unknown_code: bool,
    /// The tournament is not accepting new registrations right now
    pub registration_closed: bool,
    /// The caller already has a row in this tournament
    pub already_registered: bool,
    /// The display name was empty or all whitespace
    pub empty_name: bool,
}
