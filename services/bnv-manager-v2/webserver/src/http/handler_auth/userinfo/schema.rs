use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;

use crate::http::handler_auth::token::schema::EmailClaim;
use crate::http::handler_auth::token::schema::ProfileClaim;

/// Data for all claims
#[derive(Debug, Serialize, Deserialize, Default, JsonSchema)]
pub struct Claims {
    /// Identifier for the End-User
    pub sub: String,
    /// Optional email claims
    #[serde(flatten)]
    pub email_claim: Option<EmailClaim>,
    /// Optional profile claims
    #[serde(flatten)]
    pub profile_claim: Option<ProfileClaim>,
}
