use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::http::handler_frontend::auth::schema::WebauthnJson;
use crate::models::account::AccountPasskeyUuid;
use crate::models::account::AccountUuid;

/// The account the current session belongs to
#[derive(Serialize, JsonSchema)]
pub struct MeResponse {
    /// The account's primary key
    pub uuid: AccountUuid,
    /// The account's login handle and display name
    pub username: String,
}

/// A passkey registered on the account
#[derive(Serialize, JsonSchema)]
pub struct SimplePasskey {
    /// The passkey's primary key
    pub uuid: AccountPasskeyUuid,
    /// Human-readable device label
    pub label: String,
    /// When the passkey was registered
    pub created_at: SchemaDateTime,
    /// When the passkey was last used to log in, if ever
    pub last_used_at: Option<SchemaDateTime>,
}

/// The passkeys of the logged-in account
#[derive(Serialize, JsonSchema)]
pub struct ListPasskeysResponse {
    /// One entry per registered device
    pub passkeys: Vec<SimplePasskey>,
}

/// Response to a started add-passkey ceremony
#[derive(Serialize, JsonSchema)]
pub struct StartAddPasskeyResponse {
    /// `PublicKeyCredentialCreationOptions` to pass to the browser
    pub options: WebauthnJson,
}

/// Request to finish adding a passkey
#[derive(Deserialize, JsonSchema)]
pub struct FinishAddPasskeyRequest {
    /// The browser's `RegisterPublicKeyCredential` response
    pub credential: WebauthnJson,
    /// What to call the device, or `None` to number it
    pub label: Option<MaxStr<255>>,
}

/// Why a passkey could not be added
#[derive(Default, Serialize, JsonSchema)]
pub struct AddPasskeyErrors {
    /// No ceremony is in progress — the session expired, or `passkeys/start` was never called
    pub no_ceremony: bool,
    /// The browser's response was not a credential
    pub malformed_credential: bool,
    /// The credential did not check out
    pub registration_failed: bool,
    /// This authenticator already holds a passkey for this account
    pub already_registered: bool,
}

/// Why a passkey could not be deleted
#[derive(Default, Serialize, JsonSchema)]
pub struct DeletePasskeyErrors {
    /// No passkey with that id belongs to this account
    pub unknown_passkey: bool,
    /// It is the account's only passkey — deleting it would lock the account out for good
    pub last_passkey: bool,
}
