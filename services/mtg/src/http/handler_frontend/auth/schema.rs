//! Request/response schemas of the auth handlers

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::accounts::Username;

/// WebAuthn protocol payload.
///
/// The inner JSON is produced/consumed by `webauthn-rs` on the server and
/// `@simplewebauthn/browser` on the client; it is deliberately not modeled
/// in the OpenAPI schema.
pub type WebauthnJson = serde_json::Value;

/// Request to sign up for a new account
#[derive(Deserialize, JsonSchema)]
pub struct SignupRequest {
    /// The desired username
    pub username: Username,
    /// The email address the registration link is sent to
    pub email: MaxStr<255>,
}

/// Request to start a registration ceremony
#[derive(Deserialize, JsonSchema)]
pub struct StartRegistrationRequest {
    /// The token from the registration link
    pub token: MaxStr<64>,
}

/// Response to a started registration ceremony
#[derive(Serialize, JsonSchema)]
pub struct StartRegistrationResponse {
    /// The username the passkey will be registered for
    pub username: String,
    /// `PublicKeyCredentialCreationOptions` to pass to the browser
    pub options: WebauthnJson,
}

/// Request to finish a registration ceremony
#[derive(Deserialize, JsonSchema)]
pub struct FinishRegistrationRequest {
    /// The token from the registration link
    pub token: MaxStr<64>,
    /// The browser's `RegisterPublicKeyCredential` response
    pub credential: WebauthnJson,
}
