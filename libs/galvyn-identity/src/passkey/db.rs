//! Database model of a Passkey

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;
use webauthn_rs::prelude::Passkey as WebauthnPasskey;

use crate::db::IdentityModel;

/// A WebAuthn passkey bound to an [`IdentityModel`]
#[derive(Model)]
#[rorm(rename = "passkey")]
pub struct PasskeyModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The identity this passkey belongs to
    ///
    /// Indexed: login and the passkey list filter on it, and Postgres does
    /// not index a foreign key on its own.
    #[rorm(index, on_delete = "Cascade", on_update = "Cascade")]
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
