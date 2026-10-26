use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;

use crate::models::deck::DeckUuid;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::registered_deck::RegisterDeckRefusal;
use crate::models::tournament::registered_deck::RegisteredDeck;

/// The deck a Participant plays in a Tournament
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RegisteredDeckResponse {
    /// The Participant playing it
    pub participant: ParticipantUuid,
    /// The deck it was made from, `null` once that deck is deleted
    pub deck: Option<DeckUuid>,
    /// The deck's name: as it is now until pinned, as it was when pinned afterwards
    pub name: String,
    /// The format the deck is built for, a Scryfall slug
    pub format: String,
    /// The Commander bracket it is built to, `null` when unset
    pub bracket: Option<i16>,
    /// Whether it is a copy that no longer changes with the deck
    pub pinned: bool,
}

impl From<RegisteredDeck> for RegisteredDeckResponse {
    fn from(value: RegisteredDeck) -> Self {
        Self {
            participant: value.participant,
            deck: value.deck,
            name: value.settings.name.to_string(),
            format: value.settings.format.to_string(),
            bracket: value.settings.bracket,
            pinned: value.pinned_at.is_some(),
        }
    }
}

/// The reader's own Registered deck in a Tournament
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MyRegisteredDeckResponse {
    /// The Registered deck, `null` while the reader plays without one
    pub deck: Option<RegisteredDeckResponse>,
    /// Whether the reader may still register, swap or remove it itself
    pub changeable: bool,
}

/// Every Registered deck of a Tournament, for its Organizers
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListRegisteredDecksResponse {
    /// One per Participant that registered one, in the order they joined
    pub decks: Vec<RegisteredDeckResponse>,
}

/// One deck a Participant's Account owns
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ParticipantDeckResponse {
    /// The deck
    pub uuid: DeckUuid,
    /// Its name
    pub name: String,
    /// The format it is built for, a Scryfall slug
    pub format: String,
}

/// The decks a Participant's Account owns, for an Organizer to register one
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListParticipantDecksResponse {
    /// Alphabetically by name; empty for a Guest
    pub decks: Vec<ParticipantDeckResponse>,
}

/// The deck to register
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct RegisterDeckRequest {
    /// One of the Participant's Account's decks
    pub deck: DeckUuid,
}

/// Why a Registered deck could not be registered, swapped or removed
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct RegisterDeckErrors {
    /// The first Round started, so only Organizers change it
    pub registration_over: bool,
    /// The Participant is a Guest, which has no decks
    pub guest: bool,
    /// The deck does not exist or the Participant's Account does not own it
    pub not_their_deck: bool,
}

impl RegisterDeckErrors {
    /// The form error a refusal stands for, `None` for a missing Participant
    pub fn from_refusal(refusal: RegisterDeckRefusal) -> Option<Self> {
        let mut errors = Self::default();
        match refusal {
            RegisterDeckRefusal::RegistrationOver => errors.registration_over = true,
            RegisterDeckRefusal::Guest => errors.guest = true,
            RegisterDeckRefusal::NotTheirDeck => errors.not_their_deck = true,
            RegisterDeckRefusal::NoParticipant => return None,
        }
        Some(errors)
    }
}
