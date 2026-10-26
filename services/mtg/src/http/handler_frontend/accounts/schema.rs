use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::http::handler_frontend::auth::schema::WebauthnJson;
use crate::models::account::AccountPasskeyUuid;
use crate::models::account::AccountUuid;
use crate::models::account::Role;
use crate::models::account::Username;

/// The account the current session belongs to
#[derive(Serialize, JsonSchema)]
pub struct MeResponse {
    /// The account's primary key
    pub uuid: AccountUuid,
    /// The account's login handle and display name
    pub username: String,
    /// What the account may do, decides whether the admin dashboard is offered
    pub role: Role,
    /// Whether the account logs in through an OpenID provider (an External Account)
    ///
    /// An External Account has no Passkeys and cannot add one.
    pub external: bool,
}

/// Why the session has no account to answer with
#[derive(Debug, Default, Serialize, JsonSchema)]
pub struct MeErrors {
    /// An Admin locked the account; the session is logged out
    pub locked: bool,
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

/// Request to delete the logged-in account
#[derive(Deserialize, JsonSchema)]
pub struct DeleteAccountRequest {
    /// The account's own username, typed out
    ///
    /// Proof that the request means the account it is authenticated as, and not
    /// a stray click on a red button.
    pub username: String,
    /// Whether its Participants appear as "Gelöschter Spieler N" in Tournaments
    /// it does not own, `true` if left out; `false` keeps its last username there
    #[serde(default = "appear_anonymously_by_default")]
    pub appear_anonymously: bool,
}

/// Deleted accounts appear anonymously in other people's Tournaments unless they say otherwise
fn appear_anonymously_by_default() -> bool {
    true
}

/// Why an account could not be deleted
#[derive(Default, Serialize, JsonSchema)]
pub struct DeleteAccountErrors {
    /// The typed username is not the one the session belongs to
    pub username_mismatch: bool,
}

/// Request to rename the logged-in account
#[derive(Deserialize, JsonSchema)]
pub struct RenameAccountRequest {
    /// The new username, held to the same rules as at signup
    pub username: Username,
}

/// The renamed account, and what its passkeys' authenticators need to show the new name
#[derive(Serialize, JsonSchema)]
pub struct RenameAccountResponse {
    /// The new username, spelled the way it was requested
    pub username: String,
    /// The `rpId` to pass to `PublicKeyCredential.signalCurrentUserDetails`
    pub rp_id: String,
    /// The base64url `userId` to pass to `PublicKeyCredential.signalCurrentUserDetails`
    pub user_id: String,
}

/// Why an account could not be renamed
#[derive(Default, Serialize, JsonSchema)]
pub struct RenameAccountErrors {
    /// Another account goes by this username already, case ignored
    pub username_taken: bool,
}

/// Why a passkey could not be deleted
#[derive(Default, Serialize, JsonSchema)]
pub struct DeletePasskeyErrors {
    /// No passkey with that id belongs to this account
    pub unknown_passkey: bool,
    /// It is the account's only passkey — deleting it would lock the account out for good
    pub last_passkey: bool,
}

/// Request to rename one of the logged-in account's passkeys
#[derive(Deserialize, JsonSchema)]
pub struct RenamePasskeyRequest {
    /// The new label, trimmed before it is stored
    pub label: MaxStr<255>,
}

/// Why a passkey could not be renamed
#[derive(Default, Serialize, JsonSchema)]
pub struct RenamePasskeyErrors {
    /// Nothing is left of the label once trimmed
    pub empty_label: bool,
    /// No passkey with that id belongs to this account
    pub unknown_passkey: bool,
}
