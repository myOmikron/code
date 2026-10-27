use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::http::handler_frontend::tournaments::participants::schema::ParticipantResponse;
use crate::models::tournament::participant::ParticipantUuid;

/// A visitor without an Account signing itself up as a Guest
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct GuestSignUpRequest {
    /// The name it goes by in this Tournament; blanks are trimmed and collapse
    pub name: MaxStr<64>,
    /// The Guest this device signed up as before, restored instead of signing up again
    #[serde(default)]
    pub recovery: Option<RecoverGuestSeatRequest>,
}

/// The Guest a visitor signed up as, and the Recovery code its device keeps
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GuestSignUpResponse {
    /// The Guest, as it sees itself
    pub participant: ParticipantResponse,
    /// Restores the Guest seat into a fresh session until the Tournament is over
    ///
    /// Answered this once; a new one replaces it whenever the sign-up is repeated.
    pub recovery_code: String,
}

/// Why a visitor could not sign up as a Guest
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct GuestSignUpErrors {
    /// The name is empty or only blanks
    pub empty_name: bool,
    /// Guest sign-up is off or the first Round started
    pub closed: bool,
    /// The participant limit is reached
    pub full: bool,
    /// The logged-in Account already plays in the Tournament
    pub already_participant: bool,
    /// Too many Guests signed up for the Tournament lately; try again in a few minutes
    pub busy: bool,
}

/// The Guest seat a device restores into a fresh session
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct RecoverGuestSeatRequest {
    /// The Guest's Participant
    pub participant: ParticipantUuid,
    /// The Recovery code the device kept from the sign-up
    pub code: MaxStr<64>,
}

/// Why a Guest seat could not be restored
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct RecoverGuestSeatErrors {
    /// No Guest of the Tournament has this Recovery code
    pub unknown_code: bool,
    /// The Tournament is Finished or Cancelled, so its Recovery codes are gone
    pub tournament_over: bool,
}
