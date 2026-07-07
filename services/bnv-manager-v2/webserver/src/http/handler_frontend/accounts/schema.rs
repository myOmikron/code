use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use url::Url;

use crate::models::account::AccountUuid;
use crate::models::account::AdministrativeAccount;
use crate::models::account::ClubAccount;
use crate::models::account::ClubAdminAccount;
use crate::models::credential_reset::CredentialReset;
use crate::models::credential_reset::CredentialResetUuid;

/// Simple representation of an account.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SimpleAccountSchema {
    /// The account's UUID.
    pub uuid: AccountUuid,
    /// The account's username.
    pub username: MaxStr<255>,
    /// The account's display name.
    pub display_name: MaxStr<255>,
}

/// Simple representation of an account.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SimpleMemberAccountSchema {
    /// The account's UUID.
    pub uuid: AccountUuid,
    /// The account's username.
    pub username: MaxStr<255>,
    /// The account's display name.
    pub display_name: MaxStr<255>,
    /// The account's email
    pub email: MaxStr<255>,
}

/// Instance of the credential reset
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CredentialResetSchema {
    /// Identifier
    pub uuid: CredentialResetUuid,
    /// The 6-digit code for the reset
    pub code: String,
    /// Point in time the code expires
    pub code_expires_at: SchemaDateTime,
    /// Point in time the link expires
    pub link_expires_at: SchemaDateTime,
    /// The link to give to the user
    pub link: Url,
}

impl From<CredentialReset> for CredentialResetSchema {
    fn from(value: CredentialReset) -> Self {
        let link = value.link();
        Self {
            uuid: value.uuid,
            code: value.code,
            code_expires_at: SchemaDateTime(value.code_expires_at),
            link_expires_at: SchemaDateTime(value.link_expires_at),
            link,
        }
    }
}

impl From<AdministrativeAccount> for SimpleAccountSchema {
    fn from(value: AdministrativeAccount) -> Self {
        Self {
            uuid: value.uuid(),
            username: value.username,
            display_name: value.display_name,
        }
    }
}

impl From<ClubAdminAccount> for SimpleAccountSchema {
    fn from(value: ClubAdminAccount) -> Self {
        Self {
            uuid: value.uuid(),
            username: value.username,
            display_name: value.display_name,
        }
    }
}

impl From<ClubAccount> for SimpleMemberAccountSchema {
    fn from(value: ClubAccount) -> Self {
        Self {
            uuid: value.uuid(),
            username: value.username,
            display_name: value.display_name,
            email: value.email,
        }
    }
}
