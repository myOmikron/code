use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::account::AccountUuid;
use crate::models::account::Username;
use crate::models::tournament::handover::Handover;
use crate::models::tournament::organizer::CoOrganizer;

/// One Organizer of a Tournament, or the Account it is offered to
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OrganizerResponse {
    /// The Account, which is what removing a Co-organizer names
    pub account: AccountUuid,
    /// The Account's username as it is now
    pub username: String,
}

impl OrganizerResponse {
    /// An Account with its username
    pub fn new(account: AccountUuid, username: &Username) -> Self {
        Self {
            account,
            username: username.as_str().to_string(),
        }
    }
}

impl From<CoOrganizer> for OrganizerResponse {
    fn from(value: CoOrganizer) -> Self {
        Self::new(value.account, &value.username)
    }
}

impl From<Handover> for OrganizerResponse {
    fn from(value: Handover) -> Self {
        Self::new(value.offered_to, &value.username)
    }
}

/// Who runs a Tournament, and whom its Owner offered it to
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListOrganizersResponse {
    /// The Owner, `null` while the Tombstone holds it
    pub owner: Option<OrganizerResponse>,
    /// The Co-organizers, alphabetically by username
    pub co_organizers: Vec<OrganizerResponse>,
    /// The Account the Tournament is offered to, `null` without a pending offer
    pub handover: Option<OrganizerResponse>,
}

/// Request naming an Account by its username
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct NameAccountRequest {
    /// Username of the Account, case ignored
    pub username: MaxStr<255>,
}

/// Why an Account could not be named a Co-organizer
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct AddCoOrganizerErrors {
    /// No Account goes by this username
    pub unknown_username: bool,
    /// The Account is the Owner
    pub owner: bool,
    /// The Account is a Co-organizer already
    pub already_co_organizer: bool,
    /// The caller named too many unknown usernames lately, so this one was
    /// not looked up
    pub too_many_unknown_usernames: bool,
}

/// Why a Tournament could not be offered to an Account
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct OfferHandoverErrors {
    /// No Account goes by this username
    pub unknown_username: bool,
    /// The username is the caller's own, which owns the Tournament
    pub own_account: bool,
    /// The caller named too many unknown usernames lately, so this one was
    /// not looked up
    pub too_many_unknown_usernames: bool,
}
