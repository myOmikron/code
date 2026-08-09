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

/// Response to an accepted signup request
#[derive(Serialize, JsonSchema)]
pub struct SignupResponse {
    /// The username the registration link is for
    ///
    /// Echoed back so the confirmation screen can name the account without claiming which
    /// address the mail went to — for a re-issued invite that is the address already on the
    /// account, not the one just typed.
    pub username: String,
}

/// Why a signup request was rejected, for the form to show on the offending field
///
/// Only the username is ever reported: profiles are reachable by name, so whether one is
/// taken is public anyway. Whether an *email address* is already in use stays unrevealable —
/// that request still answers `200` and simply sends no mail.
#[derive(Default, Serialize, JsonSchema)]
pub struct SignupErrors {
    /// The username belongs to an account that has already finished its registration
    pub username_taken: bool,
    /// The email address is not shaped like one
    pub email_malformed: bool,
}

/// Why a login could not be started
#[derive(Default, Serialize, JsonSchema)]
pub struct StartLoginErrors {
    /// No account by that name, or it has no passkey — deliberately the same flag, so the
    /// endpoint does not say which usernames are actually able to log in
    pub unknown_username: bool,
}

/// Why a login could not be completed
#[derive(Default, Serialize, JsonSchema)]
pub struct FinishLoginErrors {
    /// No ceremony is in progress — the session expired, or `login/start` was never called
    pub no_ceremony: bool,
    /// The browser's response was not a credential
    pub malformed_credential: bool,
    /// The signature did not check out
    pub authentication_failed: bool,
}

/// Why a passkey registration could not be started or completed
#[derive(Default, Serialize, JsonSchema)]
pub struct RegistrationErrors {
    /// No such registration token
    pub token_invalid: bool,
    /// The token was already used to register a passkey
    pub token_used: bool,
    /// The token is past its validity
    pub token_expired: bool,
    /// No ceremony is in progress — the session expired, or `register/start` was never called
    pub no_ceremony: bool,
    /// The browser's response was not a credential
    pub malformed_credential: bool,
    /// The credential did not check out
    pub registration_failed: bool,
    /// This authenticator already holds a passkey for this account
    pub already_registered: bool,
}

/// Request to start a login ceremony
#[derive(Deserialize, JsonSchema)]
pub struct StartLoginRequest {
    /// The username to log in as
    pub username: Username,
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
    /// Keep the session alive across browser restarts
    ///
    /// Off means the cookie is dropped when the browser closes — the sensible default on a
    /// machine somebody else also uses.
    pub remember_me: bool,
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
