use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use time::OffsetDateTime;
use uuid::Uuid;
use webauthn_rs::prelude::Passkey;

use crate::models::account::Role;

/// A staff account (Admin or Verkauf)
///
/// Authentication is passkey-only: an account has no password,
/// only passkeys registered through invite links.
#[derive(Model, Debug, Clone)]
#[rorm(rename = "account")]
pub struct AccountModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The username of the account
    #[rorm(unique)]
    pub username: MaxStr<255>,

    /// The account's role
    pub role: Role,

    /// The point in time when the account logged in recently
    pub last_login_at: Option<OffsetDateTime>,

    /// The point in time the account was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`AccountModel`]
#[derive(Patch)]
#[rorm(model = "AccountModel")]
pub struct AccountInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The username of the account
    pub username: MaxStr<255>,
    /// The account's role
    pub role: Role,
}

/// A WebAuthn passkey registered to an [`AccountModel`]
#[derive(Model)]
#[rorm(rename = "accountpasskey")]
pub struct AccountPasskeyModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The account this passkey belongs to
    #[rorm(on_delete = "Cascade", on_update = "Cascade")]
    pub account: ForeignModel<AccountModel>,

    /// Human-readable device label shown in the passkey management UI
    pub label: MaxStr<255>,

    /// The credential id (base64url) for fast lookup and duplicate detection
    #[rorm(unique)]
    pub credential_id: MaxStr<1024>,

    /// The serialized passkey (public key, counter, ...)
    pub credential: Json<Passkey>,

    /// The point in time this passkey was last used for a login
    pub last_used_at: Option<OffsetDateTime>,

    /// The point in time this passkey was registered
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
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

/// One-time invite token allowing an account to register its first passkey
///
/// Created together with the account (cli or admin UI) and consumed by the
/// public registration endpoint. Also the "lost device" recovery mechanism:
/// an admin simply issues a new token.
#[derive(Model)]
#[rorm(rename = "registrationtoken")]
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
