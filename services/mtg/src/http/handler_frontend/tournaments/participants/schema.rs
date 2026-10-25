use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::account::AccountUuid;
use crate::models::tournament::participant::Participant;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::participant::Player;

/// One Participant of a Tournament
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ParticipantResponse {
    /// Primary key
    pub uuid: ParticipantUuid,
    /// The Account's username as it is now, or the Guest's name
    pub name: String,
    /// Whether it is a Guest rather than an Account
    pub guest: bool,
}

impl From<Participant> for ParticipantResponse {
    fn from(value: Participant) -> Self {
        let (name, guest) = match value.player {
            Player::Account { username, .. } => (username.as_str().to_string(), false),
            Player::Guest { name } => (name.to_string(), true),
        };
        Self {
            uuid: value.uuid,
            name,
            guest,
        }
    }
}

/// The Participants of a Tournament
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListParticipantsResponse {
    /// Every Participant, in the order they were added or signed up
    pub participants: Vec<ParticipantResponse>,
    /// The reader's own Participant, `null` if the reader is none
    pub me: Option<ParticipantUuid>,
}

/// The Account an Organizer adds as a Participant
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct AddAccountParticipantRequest {
    /// Username of the Account, case ignored
    pub username: MaxStr<255>,
}

/// Why an Account could not be added as a Participant
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct AddAccountParticipantErrors {
    /// No Account goes by this username
    pub unknown_username: bool,
    /// The caller named too many unknown usernames lately, so this one was
    /// not looked up
    pub too_many_unknown_usernames: bool,
    /// The Account already is a Participant
    pub already_participant: bool,
    /// The first Round started, so the Participants are settled
    pub registration_over: bool,
}

/// The Guest an Organizer adds as a Participant
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct AddGuestParticipantRequest {
    /// The name the Guest goes by in this Tournament
    pub name: MaxStr<64>,
}

/// Why a Guest could not be added
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct AddGuestParticipantErrors {
    /// The name is empty or only blanks
    pub empty_name: bool,
    /// The first Round started, so the Participants are settled
    pub registration_over: bool,
}

/// Why an Account could not sign up
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct SignUpErrors {
    /// Self sign-up is off, the Tournament is private or its first Round started
    pub closed: bool,
    /// The Account already is a Participant
    pub already_participant: bool,
    /// The participant limit is reached
    pub full: bool,
}

/// What an Organizer typed while looking for an Account to add
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct SearchPlayersQuery {
    /// The start of a username, case ignored
    pub query: MaxStr<32>,
}

/// An Account whose username starts with what the Organizer typed
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PlayerCandidateResponse {
    /// The Account
    pub account: AccountUuid,
    /// The Account's username as it is now
    pub username: String,
}

/// The Accounts whose username starts with what the Organizer typed
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PlayerCandidatesResponse {
    /// Up to ten Accounts, alphabetically by username
    pub accounts: Vec<PlayerCandidateResponse>,
    /// The caller searched too often lately, so nothing was searched
    pub too_many_searches: bool,
}
