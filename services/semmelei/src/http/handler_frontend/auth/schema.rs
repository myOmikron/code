//! Request/response schemas of the auth handlers

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::AccountPasskeyUuid;
use crate::models::AccountUuid;
use crate::models::Role;

/// WebAuthn protocol payload.
///
/// The inner JSON is produced/consumed by `webauthn-rs` on the server and
/// `@simplewebauthn/browser` on the client; it is deliberately not modeled
/// in the OpenAPI schema.
pub type WebauthnJson = serde_json::Value;

/// Request to start a login ceremony
#[derive(Deserialize, JsonSchema)]
pub struct StartLoginRequest {
    /// The username to authenticate
    pub username: MaxStr<255>,
}

/// Response to a started login ceremony
#[derive(Serialize, JsonSchema)]
pub struct StartLoginResponse {
    /// `PublicKeyCredentialRequestOptions` to pass to the browser
    pub options: WebauthnJson,
}

/// Request to finish a login ceremony
#[derive(Deserialize, JsonSchema)]
pub struct FinishLoginRequest {
    /// The browser's `PublicKeyCredential` response
    pub credential: WebauthnJson,
}

/// Request to start an invite-based registration ceremony
#[derive(Deserialize, JsonSchema)]
pub struct StartRegistrationRequest {
    /// The invite token from the registration link
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

/// Request to finish an invite-based registration ceremony
#[derive(Deserialize, JsonSchema)]
pub struct FinishRegistrationRequest {
    /// The invite token from the registration link
    pub token: MaxStr<64>,
    /// The browser's `RegisterPublicKeyCredential` response
    pub credential: WebauthnJson,
}

/// Response to a started add-passkey ceremony (logged-in user, new device)
#[derive(Serialize, JsonSchema)]
pub struct StartAddPasskeyResponse {
    /// `PublicKeyCredentialCreationOptions` to pass to the browser
    pub options: WebauthnJson,
}

/// Request to finish an add-passkey ceremony
#[derive(Deserialize, JsonSchema)]
pub struct FinishAddPasskeyRequest {
    /// The browser's `RegisterPublicKeyCredential` response
    pub credential: WebauthnJson,
}

/// The currently logged-in account
#[derive(Serialize, JsonSchema)]
pub struct MeResponse {
    /// Primary key of the account
    pub uuid: AccountUuid,
    /// The username of the account
    pub username: String,
    /// The account's role
    pub role: Role,
}

/// A passkey registered to the current account
#[derive(Serialize, JsonSchema)]
pub struct PasskeySchema {
    /// Primary key of the passkey
    pub uuid: AccountPasskeyUuid,
    /// Human-readable device label
    pub label: String,
    /// The point in time this passkey was last used for a login
    pub last_used_at: Option<SchemaDateTime>,
    /// The point in time this passkey was registered
    pub created_at: SchemaDateTime,
}

/// All passkeys of the current account
#[derive(Serialize, JsonSchema)]
pub struct ListPasskeysResponse {
    /// The passkeys
    pub passkeys: Vec<PasskeySchema>,
}
