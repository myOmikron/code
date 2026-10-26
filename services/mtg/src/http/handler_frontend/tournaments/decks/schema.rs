use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;

use crate::http::handler_frontend::decks::schema::DeckCardResponse;
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
    /// Whether its Participant lets others see the list once the Tournament is Finished
    pub shared: bool,
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
            shared: value.shared,
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
    /// Whether others may see the list once the Tournament is Finished,
    /// `null` for the default: shared for a public deck, not for any other
    pub shared: Option<bool>,
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

/// Whether others may see the reader's list once the Tournament is Finished
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct SetListSharingRequest {
    /// `true` to show it next to the standings once the Tournament is Finished
    pub shared: bool,
}

/// One Registered deck's list, with what the format warnings read
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RegisteredListResponse {
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
    /// The colours the table agreed it may play, `null` for the commander's
    pub allowed_color_identity: Option<String>,
    /// Whether the table agreed to more commanders than the format allows
    pub allow_extra_commanders: bool,
    /// Whether the table agreed to more copies of a card than the format allows
    pub allow_duplicates: bool,
    /// Whether the table agreed to cards the format bans
    pub allow_banned: bool,
    /// How many cards the table agreed it is built to, `null` for the format's rule
    pub deck_size: Option<i16>,
    /// Whether its Participant lets others see it once the Tournament is Finished
    pub shared: bool,
    /// Whether it is a copy that no longer changes with the deck
    pub pinned: bool,
    /// Its Deck entries, joined against the card catalog
    pub cards: Vec<DeckCardResponse>,
}

impl RegisteredListResponse {
    /// Put a Registered deck and its list together
    pub fn new(deck: RegisteredDeck, cards: Vec<DeckCardResponse>) -> Self {
        let settings = deck.settings;
        Self {
            participant: deck.participant,
            deck: deck.deck,
            name: settings.name.to_string(),
            format: settings.format.to_string(),
            bracket: settings.bracket,
            allowed_color_identity: settings
                .allowed_color_identity
                .map(|colors| colors.to_string()),
            allow_extra_commanders: settings.allow_extra_commanders,
            allow_duplicates: settings.allow_duplicates,
            allow_banned: settings.allow_banned,
            deck_size: settings.deck_size,
            shared: deck.shared,
            pinned: deck.pinned_at.is_some(),
            cards,
        }
    }
}

/// The Registered decks' lists a reader may see
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RegisteredListsResponse {
    /// Every list for Organizers; for everybody else the shared ones once the
    /// Tournament is Finished and none before; in the order the Participants joined
    pub decks: Vec<RegisteredListResponse>,
}
