//! Schema for the currently logged-in user.

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::account::AccountUuid;
use crate::models::club::ClubUuid;

/// Representation of the currently logged-in user.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MeSchema {
    /// The user's UUID.
    pub uuid: AccountUuid,
    /// The user's username.
    pub username: MaxStr<255>,
    /// The user's display name.
    pub display_name: MaxStr<255>,
    /// The user's roles.
    pub role: RoleSchema,
}

/// The roles of a user.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(missing_docs)]
#[serde(tag = "type")]
pub enum RoleSchema {
    SuperAdmin,
    ClubAdmin {
        club: ClubUuid,
        club_name: MaxStr<255>,
    },
    ClubMember {
        club: ClubUuid,
        club_name: MaxStr<255>,
        email: MaxStr<255>,
    },
}

/// A club membership role.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ClubMemberRole {
    /// The club's UUID.
    pub club_uuid: ClubUuid,
    /// The club's name.
    pub club_name: MaxStr<255>,
    /// Primary mail in the club
    pub email: MaxStr<255>,
}

/// A club membership role.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ClubAdminRole {
    /// The club's UUID.
    pub club_uuid: ClubUuid,
    /// The club's name.
    pub club_name: MaxStr<255>,
}

/// Request to update the currently logged-in user
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateMeRequest {
    /// The display name of the user
    pub display_name: MaxStr<255>,
}

/// Request to update the currently logged-in user
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SetPasswordRequest {
    /// The current password of the user
    pub old_password: MaxStr<72>,
    /// The new password
    pub password: MaxStr<72>,
}

/// Errors that may occur while setting a new password
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SetPasswordErrors {
    /// Entropy is too low
    pub low_entropy: bool,
    /// The old password was invalid
    pub invalid_old_password: bool,
}
