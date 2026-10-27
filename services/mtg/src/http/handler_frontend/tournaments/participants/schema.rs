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
    /// Whether it is checked in, which it has to be before it is paired
    ///
    /// Only Organizers and the Participant itself learn it, `null` for every
    /// other reader. Always `true` while the Tournament takes no check-in.
    pub checked_in: Option<bool>,
}

impl ParticipantResponse {
    /// The Participant as its Tournament's Organizers see it, with the paid
    /// and check-in flags
    pub fn for_organizers(value: Participant) -> Self {
        let unpaid = value.unpaid;
        Self {
            unpaid: Some(unpaid),
            ..Self::for_itself(value)
        }
    }

    /// The Participant as it sees itself, with its check-in flag
    pub fn for_itself(value: Participant) -> Self {
        let checked_in = !value.awaits_check_in;
        Self {
            checked_in: Some(checked_in),
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
            checked_in: None,
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

/// Whether a Participant is checked in
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct SetCheckedInRequest {
    /// `true` to check it in, `false` to take that back before the first Round
    pub checked_in: bool,
}

/// Why a Participant could not be checked in or out
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct SetCheckedInErrors {
    /// The Tournament takes no check-in
    pub no_check_in: bool,
    /// The Tournament is Finished or Cancelled
    pub tournament_over: bool,
    /// The first Round started, so a Participant is no longer checked out
    pub round_started: bool,
    /// The Tournament takes check-in with a deck and the Account has no Registered deck
    pub no_registered_deck: bool,
    /// The Participant dropped
    pub dropped: bool,
}

/// What checking everybody in did
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CheckInEveryoneResponse {
    /// The Accounts left out for want of a Registered deck
    pub no_registered_deck: Vec<ParticipantUuid>,
}

/// Why nobody could be checked in
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct CheckInEveryoneErrors {
    /// The Tournament takes no check-in
    pub no_check_in: bool,
    /// The Tournament is Finished or Cancelled
    pub tournament_over: bool,
}
