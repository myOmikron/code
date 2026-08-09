//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;
use webauthn_rs::prelude::Passkey;

/// An account
///
/// Authentication is passkey-only: an account has no password, only
/// [`AccountPasskeyModel`]s registered through invite links.
///
/// Login is username-first: the client sends the username, the server looks
/// the account up by [`Self::username_normalized`] and answers with that
/// account's credential ids. The credentials therefore don't have to be
/// discoverable and don't occupy one of the few resident-key slots a hardware
/// token has.
#[derive(Model, Debug, Clone)]
#[rorm(rename = "account")]
pub struct AccountModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The username, spelled the way the account chose it
    pub username: MaxStr<32>,

    /// The lowercased [`Self::username`], used for lookup and uniqueness
    #[rorm(unique)]
    pub username_normalized: MaxStr<32>,

    /// The email address used to reach the account's owner
    #[rorm(unique)]
    pub email: MaxStr<255>,

    /// The point in time the account was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,

    /// The point in time when the account logged in recently
    pub last_login_at: Option<OffsetDateTime>,
}

/// Insert patch for [`AccountModel`]
#[derive(Patch)]
#[rorm(model = "AccountModel")]
pub struct AccountInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The username, spelled the way the account chose it
    pub username: MaxStr<32>,
    /// The lowercased username
    pub username_normalized: MaxStr<32>,
    /// The email address used to reach the account's owner
    pub email: MaxStr<255>,
}

/// A WebAuthn passkey registered to an [`AccountModel`]
#[derive(Model)]
#[rorm(rename = "account_passkey")]
pub struct AccountPasskeyModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The account this passkey belongs to
    #[rorm(on_delete = "Cascade", on_update = "Cascade")]
    pub account: ForeignModel<AccountModel>,

    /// Human-readable device label shown in the passkey management UI
    pub label: MaxStr<255>,

    /// The credential id (base64url)
    ///
    /// Sent to the client as `allowCredentials` once the username is known.
    #[rorm(unique)]
    pub credential_id: MaxStr<1024>,

    /// The serialized passkey (public key, counter, ...)
    pub credential: Json<Passkey>,

    /// The point in time this passkey was registered
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,

    /// The point in time this passkey was last used for a login
    pub last_used_at: Option<OffsetDateTime>,
}

/// Insert patch for [`AccountPasskeyModel`]
#[derive(Patch)]
#[rorm(model = "AccountPasskeyModel")]
pub struct AccountPasskeyInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The account this passkey belongs to
    pub account: ForeignModel<AccountModel>,
    /// Human-readable device label
    pub label: MaxStr<255>,
    /// The credential id (base64url)
    pub credential_id: MaxStr<1024>,
    /// The serialized passkey
    pub credential: Json<Passkey>,
}

/// One-time invite token allowing an account to register another passkey
///
/// Created together with the account and consumed by the public registration
/// endpoint. Also the "lost device" recovery mechanism: issue a new token.
#[derive(Model)]
#[rorm(rename = "registration_token")]
pub struct RegistrationTokenModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The account this token registers a passkey for
    #[rorm(on_delete = "Cascade", on_update = "Cascade")]
    pub account: ForeignModel<AccountModel>,

    /// The secret token contained in the invite link
    #[rorm(unique)]
    pub token: MaxStr<64>,

    /// The point in time this token stops being valid
    pub expires_at: OffsetDateTime,

    /// Whether this token has already been used
    pub used: bool,

    /// The point in time this token was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`RegistrationTokenModel`]
#[derive(Patch)]
#[rorm(model = "RegistrationTokenModel")]
pub struct RegistrationTokenInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The account this token registers a passkey for
    pub account: ForeignModel<AccountModel>,
    /// The secret token contained in the invite link
    pub token: MaxStr<64>,
    /// The point in time this token stops being valid
    pub expires_at: OffsetDateTime,
    /// Whether this token has already been used
    pub used: bool,
}
