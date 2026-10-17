//! Identities, their passkeys and registration links
//!
//! An identity is the anchor a person's passkeys hang off. The [`Account`]
//! referencing it carries everything else (username, email, ...).
//!
//! [`Account`]: crate::models::account::Account

use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModel;
use rand::distr::Alphanumeric;
use rand::distr::SampleString;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;
use uuid::Uuid;
use webauthn_rs::prelude::Passkey as WebauthnPasskey;

use crate::models::identity::db::IdentityInsertPatch;
use crate::models::identity::db::IdentityModel;
use crate::models::identity::db::PasskeyInsertPatch;
use crate::models::identity::db::PasskeyModel;
use crate::models::identity::db::RegistrationLinkInsertPatch;
use crate::models::identity::db::RegistrationLinkModel;

pub(in crate::models) mod db;
mod session;

/// The anchor a person's passkeys hang off
#[derive(Debug, Clone)]
pub struct Identity {
    /// Primary key
    pub uuid: IdentityUuid,

    /// The point in time the identity was created
    pub created_at: OffsetDateTime,

    /// The point in time of the identity's most recent login
    pub last_login_at: Option<OffsetDateTime>,
}

/// Wrapper for the primary key of the [`Identity`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Hash, Eq, PartialEq)]
pub struct IdentityUuid(Uuid);

impl IdentityUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Create a new `IdentityUuid` from a `ForeignModel<IdentityModel>`
    pub(in crate::models) fn new_from_field(field: ForeignModel<IdentityModel>) -> Self {
        Self(field.0)
    }
}

impl Identity {
    /// Fetch an identity by its primary key
    #[instrument(name = "Identity::get_by_uuid", skip(tx))]
    pub async fn get_by_uuid(
        tx: &mut Transaction,
        uuid: IdentityUuid,
    ) -> Result<Option<Identity>, rorm::Error> {
        let identity = rorm::query(tx, IdentityModel)
            .condition(IdentityModel.uuid.equals(uuid.0))
            .optional()
            .await?;
        Ok(identity.map(Identity::from))
    }

    /// Insert a new identity and return its primary key
    #[instrument(name = "Identity::insert", skip(tx))]
    pub async fn insert(tx: &mut Transaction) -> Result<IdentityUuid, rorm::Error> {
        let uuid = rorm::insert(tx, IdentityModel)
            .return_primary_key()
            .single(&IdentityInsertPatch {
                uuid: Uuid::now_v7(),
            })
            .await?;
        Ok(IdentityUuid(uuid))
    }

    /// Delete an identity
    ///
    /// The cascades take its passkeys, its registration links and the account
    /// referencing it along.
    ///
    /// Returns `false` if the identity does not exist.
    #[instrument(name = "Identity::delete", skip(tx))]
    pub async fn delete(tx: &mut Transaction, uuid: IdentityUuid) -> Result<bool, rorm::Error> {
        let affected = rorm::delete(tx, IdentityModel)
            .condition(IdentityModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Store that the identity just logged in
    #[instrument(name = "Identity::record_login", skip(tx))]
    pub async fn record_login(tx: &mut Transaction, uuid: IdentityUuid) -> Result<(), rorm::Error> {
        rorm::update(tx, IdentityModel)
            .set(IdentityModel.last_login_at, Some(OffsetDateTime::now_utc()))
            .condition(IdentityModel.uuid.equals(uuid.0))
            .await?;
        Ok(())
    }
}

/// A WebAuthn passkey bound to an [`Identity`]
pub struct Passkey {
    /// Primary key
    pub uuid: PasskeyUuid,

    /// The identity this passkey belongs to
    pub identity: IdentityUuid,

    /// Human-readable device label shown in the passkey management UI
    pub label: MaxStr<255>,

    /// The credential id (base64url), which is what a login names to say which passkey answered
    pub credential_id: MaxStr<1024>,

    /// The passkey (public key, counter, ...)
    pub credential: WebauthnPasskey,

    /// The point in time this passkey was last used for a login
    pub last_used_at: Option<OffsetDateTime>,

    /// The point in time this passkey was enrolled
    pub created_at: OffsetDateTime,
}

/// Wrapper for the primary key of the [`Passkey`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Hash, Eq, PartialEq)]
pub struct PasskeyUuid(Uuid);

impl PasskeyUuid {
    /// Wrap a primary key that came from outside, e.g. a path parameter
    pub fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }
}

/// Data for inserting a new [`Passkey`]
pub struct PasskeyInsert {
    /// The identity this passkey belongs to
    pub identity: IdentityUuid,
    /// Human-readable device label
    pub label: MaxStr<255>,
    /// The credential id (base64url)
    pub credential_id: MaxStr<1024>,
    /// The passkey returned by the finished enrollment ceremony
    pub credential: WebauthnPasskey,
}

impl Passkey {
    /// Fetch all passkeys of an identity
    ///
    /// Oldest enrollment first, with the primary key breaking ties: without
    /// it a passkey jumps position the moment a login stamps `last_used_at`.
    #[instrument(name = "Passkey::get_by_identity", skip(tx))]
    pub async fn get_by_identity(
        tx: &mut Transaction,
        identity: IdentityUuid,
    ) -> Result<Vec<Passkey>, rorm::Error> {
        let passkeys = rorm::query(tx, PasskeyModel)
            .condition(PasskeyModel.identity.equals(identity.0))
            .order_asc(PasskeyModel.created_at)
            .order_asc(PasskeyModel.uuid)
            .all()
            .await?;
        Ok(passkeys.into_iter().map(Passkey::from).collect())
    }

    /// Insert a freshly enrolled passkey
    ///
    /// Fails with a unique violation if the credential is already enrolled.
    #[instrument(name = "Passkey::insert", skip(tx, insert))]
    pub async fn insert(tx: &mut Transaction, insert: PasskeyInsert) -> Result<(), rorm::Error> {
        rorm::insert(tx, PasskeyModel)
            .single(&PasskeyInsertPatch {
                uuid: Uuid::now_v7(),
                identity: ForeignModelByField(insert.identity.0),
                label: insert.label,
                credential_id: insert.credential_id,
                credential: Json(insert.credential),
            })
            .await?;
        Ok(())
    }

    /// Persist an updated credential (counter, backup state)
    /// and stamp `last_used_at`
    #[instrument(name = "Passkey::update_credential", skip(tx, credential))]
    pub async fn update_credential(
        tx: &mut Transaction,
        uuid: PasskeyUuid,
        credential: WebauthnPasskey,
    ) -> Result<(), rorm::Error> {
        rorm::update(tx, PasskeyModel)
            .set(PasskeyModel.credential, Json(credential))
            .set(PasskeyModel.last_used_at, Some(OffsetDateTime::now_utc()))
            .condition(PasskeyModel.uuid.equals(uuid.0))
            .await?;
        Ok(())
    }

    /// Delete a passkey
    ///
    /// Returns `false` if the passkey does not exist.
    #[instrument(name = "Passkey::delete", skip(tx))]
    pub async fn delete(tx: &mut Transaction, uuid: PasskeyUuid) -> Result<bool, rorm::Error> {
        let affected = rorm::delete(tx, PasskeyModel)
            .condition(PasskeyModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }
}

/// A one-time, expiring link to enroll a passkey for one [`Identity`]
///
/// Issued on signup and consumed by the public enrollment endpoint. Also the
/// "lost device" recovery mechanism: issue a new link.
pub struct RegistrationLink {
    /// Primary key
    pub uuid: RegistrationLinkUuid,

    /// The identity this link enrolls a passkey for
    pub identity: IdentityUuid,

    /// The secret token contained in the link
    pub token: MaxStr<64>,

    /// The point in time this link stops being valid
    pub expires_at: OffsetDateTime,

    /// Whether this link has already been used
    pub used: bool,

    /// The point in time this link was created
    pub created_at: OffsetDateTime,
}

/// Wrapper for the primary key of the [`RegistrationLink`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Hash, Eq, PartialEq)]
pub struct RegistrationLinkUuid(Uuid);

impl RegistrationLinkUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }
}

impl RegistrationLink {
    /// How long a freshly issued registration link stays valid
    pub const VALIDITY: Duration = Duration::days(7);

    /// Create and persist a new one-time link for `identity`
    ///
    /// Returns the secret token to embed in the link.
    #[instrument(name = "RegistrationLink::create", skip(tx))]
    pub async fn create(
        tx: &mut Transaction,
        identity: IdentityUuid,
    ) -> Result<MaxStr<64>, rorm::Error> {
        let token = MaxStr::new(Alphanumeric.sample_string(&mut rand::rng(), 43))
            .unwrap_or_else(|_| unreachable!("43 alphanumeric chars fit into 64"));
        rorm::insert(tx, RegistrationLinkModel)
            .single(&RegistrationLinkInsertPatch {
                uuid: Uuid::now_v7(),
                identity: ForeignModelByField(identity.0),
                token: token.clone(),
                expires_at: OffsetDateTime::now_utc() + Self::VALIDITY,
                used: false,
            })
            .await?;
        Ok(token)
    }

    /// Fetch a link by its secret token
    #[instrument(name = "RegistrationLink::get_by_token", skip(tx, token))]
    pub async fn get_by_token(
        tx: &mut Transaction,
        token: &MaxStr<64>,
    ) -> Result<Option<RegistrationLink>, rorm::Error> {
        let link = rorm::query(tx, RegistrationLinkModel)
            .condition(RegistrationLinkModel.token.equals(token))
            .optional()
            .await?;
        Ok(link.map(RegistrationLink::from))
    }

    /// Mark a link as used
    #[instrument(name = "RegistrationLink::mark_used", skip(tx))]
    pub async fn mark_used(
        tx: &mut Transaction,
        uuid: RegistrationLinkUuid,
    ) -> Result<(), rorm::Error> {
        rorm::update(tx, RegistrationLinkModel)
            .set(RegistrationLinkModel.used, true)
            .condition(RegistrationLinkModel.uuid.equals(uuid.0))
            .await?;
        Ok(())
    }
}

impl From<IdentityModel> for Identity {
    fn from(value: IdentityModel) -> Self {
        Self {
            uuid: IdentityUuid(value.uuid),
            created_at: value.created_at,
            last_login_at: value.last_login_at,
        }
    }
}

impl From<PasskeyModel> for Passkey {
    fn from(value: PasskeyModel) -> Self {
        Self {
            uuid: PasskeyUuid(value.uuid),
            identity: IdentityUuid::new_from_field(value.identity),
            label: value.label,
            credential_id: value.credential_id,
            credential: value.credential.0,
            last_used_at: value.last_used_at,
            created_at: value.created_at,
        }
    }
}

impl From<RegistrationLinkModel> for RegistrationLink {
    fn from(value: RegistrationLinkModel) -> Self {
        Self {
            uuid: RegistrationLinkUuid(value.uuid),
            identity: IdentityUuid::new_from_field(value.identity),
            token: value.token,
            expires_at: value.expires_at,
            used: value.used,
            created_at: value.created_at,
        }
    }
}
