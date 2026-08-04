use std::num::NonZeroU8;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::invite::Invite;
use crate::models::invite::InviteType;
use crate::models::invite::InviteUuid;
use crate::utils::links::Link;

/// API representation of an invitation
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GetInvite {
    /// Primary key of the invite
    pub uuid: InviteUuid,
    /// Reserved username
    pub username: MaxStr<255>,
    /// Display-name of the user
    pub display_name: MaxStr<255>,
    /// The point in time the invite expires
    pub expires_at: SchemaDateTime,
    /// The point in time the invite was created
    pub created_at: SchemaDateTime,
    /// Public link for accessing the invite
    pub link: String,
}

/// Accept an open invite
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AcceptInvite {
    /// The new password to set
    pub password: MaxStr<72>,
}

/// Errors that can occur while accepting an invitation
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, Default)]
pub struct AcceptInviteError {
    /// Empty password was supplied
    pub empty_password: bool,
    /// Invite has expired
    pub expired: bool,
}

/// Request to create an invitation
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateInviteRequestAdmin {
    /// Reserved username
    pub username: MaxStr<255>,
    /// Display-name of the user
    pub display_name: MaxStr<255>,
    /// The point in time the invite expires
    pub valid_days: NonZeroU8,
    /// Type of the invite
    pub invite_type: InviteType,
}

/// Request to create an invitation
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateMemberInviteRequest {
    /// Reserved username
    pub username: MaxStr<255>,
    /// Display-name of the user
    pub display_name: MaxStr<255>,
    /// Email of the user
    pub email: MaxStr<255>,
    /// The point in time the invite expires
    pub valid_days: NonZeroU8,
}

/// Errors that can occur while creating an invitation
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateInviteError {
    /// Username is already taken
    pub username_already_occupied: bool,
}

impl From<Invite> for GetInvite {
    fn from(value: Invite) -> Self {
        Self {
            expires_at: SchemaDateTime(value.expires_at()),
            uuid: value.uuid,
            username: value.username,
            display_name: value.display_name,
            created_at: SchemaDateTime(value.created_at),
            link: Link::invite(value.uuid).to_string(),
        }
    }
}
