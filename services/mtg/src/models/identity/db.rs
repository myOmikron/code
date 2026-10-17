//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;
use webauthn_rs::prelude::Passkey as WebauthnPasskey;

/// The anchor a person's passkeys hang off
///
/// Carries no name, role or contact data: those live on the account that
/// references it.
#[derive(Model, Debug, Clone)]
#[rorm(rename = "identity")]
pub struct IdentityModel {
    /// Primary key, also the WebAuthn user handle of its passkeys
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The point in time the identity was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,

    /// The point in time of the identity's most recent login
    pub last_login_at: Option<OffsetDateTime>,
}

/// Insert patch for [`IdentityModel`]
#[derive(Patch)]
#[rorm(model = "IdentityModel")]
pub struct IdentityInsertPatch {
    /// Primary key
    pub uuid: Uuid,
}

/// A WebAuthn passkey bound to an [`IdentityModel`]
#[derive(Model)]
#[rorm(rename = "passkey")]
pub struct PasskeyModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The identity this passkey belongs to
    #[rorm(on_delete = "Cascade", on_update = "Cascade")]
    pub identity: ForeignModel<IdentityModel>,

    /// Human-readable device label shown in the passkey management UI
    pub label: MaxStr<255>,

    /// The credential id (base64url)
    ///
    /// Sent to the client as `allowCredentials` once the username is known.
    #[rorm(unique)]
    pub credential_id: MaxStr<1024>,

    /// The serialized passkey (public key, counter, ...)
    pub credential: Json<WebauthnPasskey>,

    /// The point in time this passkey was last used for a login
    pub last_used_at: Option<OffsetDateTime>,

    /// The point in time this passkey was enrolled
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`PasskeyModel`]
#[derive(Patch)]
#[rorm(model = "PasskeyModel")]
pub struct PasskeyInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The identity this passkey belongs to
    pub identity: ForeignModel<IdentityModel>,
    /// Human-readable device label
    pub label: MaxStr<255>,
    /// The credential id (base64url)
    pub credential_id: MaxStr<1024>,
    /// The serialized passkey
    pub credential: Json<WebauthnPasskey>,
}

/// A one-time, expiring link to enroll a passkey for one identity
///
/// Used for onboarding and for recovery alike.
#[derive(Model)]
#[rorm(rename = "registration_link")]
pub struct RegistrationLinkModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The identity this link enrolls a passkey for
    #[rorm(on_delete = "Cascade", on_update = "Cascade")]
    pub identity: ForeignModel<IdentityModel>,

    /// The secret token contained in the link
    #[rorm(unique)]
    pub token: MaxStr<64>,

    /// The point in time this link stops being valid
    pub expires_at: OffsetDateTime,

    /// Whether this link has already been used
    pub used: bool,

    /// The point in time this link was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`RegistrationLinkModel`]
#[derive(Patch)]
#[rorm(model = "RegistrationLinkModel")]
pub struct RegistrationLinkInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The identity this link enrolls a passkey for
    pub identity: ForeignModel<IdentityModel>,
    /// The secret token contained in the link
    pub token: MaxStr<64>,
    /// The point in time this link stops being valid
    pub expires_at: OffsetDateTime,
    /// Whether this link has already been used
    pub used: bool,
}
