use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

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
    /// The first Round it plays if it was added late, `null` if it was there before Round 1
    pub late_from_round: Option<i16>,
    /// The last Round started before it Dropped, `null` while it plays on
    pub dropped_after_round: Option<i16>,
    /// Whether it still owes the entry fee, which keeps it out of the pairing
    ///
    /// Only Organizers learn it, `null` for every other reader. Always
    /// `false` while the Tournament has no entry fee.
    pub unpaid: Option<bool>,
}

impl ParticipantResponse {
    /// The Participant as its Tournament's Organizers see it, with the paid flag
    pub fn for_organizers(value: Participant) -> Self {
        let unpaid = value.unpaid;
        Self {
            unpaid: Some(unpaid),
            ..Self::from(value)
        }
    }
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
            late_from_round: value.late_from_round,
            dropped_after_round: value.dropped_after_round,
            unpaid: None,
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
    /// The Swiss Rounds are over, so nobody is added any more
    pub roster_closed: bool,
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
    /// The Swiss Rounds are over, so nobody is added any more
    pub roster_closed: bool,
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

/// Why a Participant could not Drop
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct DropErrors {
    /// No Round started yet: before the first Round a Participant withdraws
    /// or is removed instead
    pub not_started: bool,
    /// The Tournament is Finished or Cancelled
    pub tournament_over: bool,
}

/// Whether a Participant paid the entry fee
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct SetPaidRequest {
    /// `true` once it paid, `false` to take that back
    pub paid: bool,
}

/// Why a Participant could not be marked paid or unpaid
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct SetPaidErrors {
    /// The Tournament has no entry fee, so nobody is unpaid
    pub no_entry_fee: bool,
    /// The Tournament is Finished or Cancelled
    pub tournament_over: bool,
}
