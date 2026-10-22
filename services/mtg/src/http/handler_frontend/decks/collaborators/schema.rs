use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::http::handler_frontend::decks::schema::DeckOverviewResponse;
use crate::models::account::AccountUuid;
use crate::models::deck::collaborator::CollaboratorLevel;
use crate::models::deck::collaborator::DeckCollaborator;

/// One Account named on a deck
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DeckCollaboratorResponse {
    /// The Account, which is what removing it names
    pub account: AccountUuid,
    /// The Account's username as it is now
    pub username: String,
    /// What the owner lets it do
    pub level: CollaboratorLevel,
}

/// The Collaborators of a deck, alphabetically by username
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListDeckCollaboratorsResponse {
    /// The Collaborators
    pub collaborators: Vec<DeckCollaboratorResponse>,
}

/// A deck another Account named the caller on
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SharedWithMeDeckResponse {
    /// The deck as the list of decks shows it, without the owner's share link and folder
    pub overview: DeckOverviewResponse,
    /// The owner's username as it is now
    pub owner_username: String,
    /// What the owner lets the caller do
    pub level: CollaboratorLevel,
}

/// The decks other Accounts named the caller on, alphabetically by name
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListSharedWithMeResponse {
    /// The decks
    pub decks: Vec<SharedWithMeDeckResponse>,
}

/// Request to name an Account on a deck, or to change its level
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct PutDeckCollaboratorRequest {
    /// Username of the Account, case ignored
    pub username: MaxStr<255>,
    /// What the owner lets it do
    pub level: CollaboratorLevel,
}

/// Why an Account could not be named on a deck
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct PutDeckCollaboratorErrors {
    /// No Account goes by this username
    pub unknown_username: bool,
    /// The username is the caller's own, which owns the deck
    pub own_account: bool,
}

impl From<DeckCollaborator> for DeckCollaboratorResponse {
    fn from(collaborator: DeckCollaborator) -> Self {
        Self {
            account: collaborator.account,
            username: collaborator.username.as_str().to_string(),
            level: collaborator.level,
        }
    }
}
