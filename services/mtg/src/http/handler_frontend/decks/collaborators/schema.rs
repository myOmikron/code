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

/// The Account owning a deck
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DeckOwnerResponse {
    /// The Account
    pub account: AccountUuid,
    /// The Account's username as it is now
    pub username: String,
}

/// The owner and the Collaborators of a deck, the latter alphabetically by username
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListDeckCollaboratorsResponse {
    /// The owner, which the list leaves out
    pub owner: DeckOwnerResponse,
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

/// What the owner typed while looking for an Account to name on a deck
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct SearchCollaboratorCandidatesQuery {
    /// The start of a username, case ignored
    pub query: MaxStr<32>,
}

/// An Account whose username starts with what the owner typed
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CollaboratorCandidateResponse {
    /// The Account
    pub account: AccountUuid,
    /// The Account's username as it is now
    pub username: String,
}

/// The Accounts whose username starts with what the owner typed
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CollaboratorCandidatesResponse {
    /// Up to ten Accounts, alphabetically by username
    pub accounts: Vec<CollaboratorCandidateResponse>,
    /// The caller searched too often lately, so nothing was searched
    pub too_many_searches: bool,
}

/// Why an Account could not be named on a deck
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct PutDeckCollaboratorErrors {
    /// No Account goes by this username
    pub unknown_username: bool,
    /// The username is the caller's own, which owns the deck
    pub own_account: bool,
    /// The caller named too many unknown usernames lately, so this one was
    /// not looked up
    pub too_many_unknown_usernames: bool,
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
