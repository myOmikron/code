//! Passkeys of an Identity

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::executor::Executor;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;
use uuid::Uuid;
use webauthn_rs::prelude::Passkey as WebauthnPasskey;

use super::db::PasskeyInsertPatch;
use super::db::PasskeyModel;
use crate::models::IdentityUuid;

/// A WebAuthn Passkey bound to an [`Identity`](crate::Identity)
pub struct Passkey {
    /// Primary key
    pub uuid: PasskeyUuid,

    /// The identity this passkey belongs to
    pub identity: IdentityUuid,

    /// Human-readable device label shown in the passkey management UI
    pub label: MaxStr<255>,

    /// The point in time this passkey was last used for a login
    pub last_used_at: Option<OffsetDateTime>,

    /// The point in time this passkey was enrolled
    pub created_at: OffsetDateTime,

    /// The credential id (base64url), which is what a login names to say which passkey answered
    pub(super) credential_id: MaxStr<1024>,

    /// The passkey (public key, counter, ...)
    pub(super) credential: WebauthnPasskey,
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
pub(super) struct PasskeyInsert {
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
    #[instrument(name = "Passkey::get_by_identity", skip(exe))]
    pub(super) async fn get_by_identity(
        exe: impl Executor<'_>,
        identity: IdentityUuid,
    ) -> Result<Vec<Passkey>, rorm::Error> {
        let passkeys = rorm::query(exe, PasskeyModel)
            .condition(PasskeyModel.identity.equals(identity.into_inner()))
            .order_asc(PasskeyModel.created_at)
            .order_asc(PasskeyModel.uuid)
            .all()
            .await?;
        Ok(passkeys.into_iter().map(Passkey::from).collect())
    }

    /// Count the passkeys of an identity
    #[instrument(name = "Passkey::count_by_identity", skip(exe))]
    pub(super) async fn count_by_identity(
        exe: impl Executor<'_>,
        identity: IdentityUuid,
    ) -> Result<u64, rorm::Error> {
        let count = rorm::query(exe, PasskeyModel.uuid.count())
            .condition(PasskeyModel.identity.equals(identity.into_inner()))
            .one()
            .await?;
        Ok(u64::try_from(count).unwrap_or_default())
    }

    /// Insert a freshly enrolled passkey
    ///
    /// Fails with a unique violation if the credential is already enrolled.
    #[instrument(name = "Passkey::insert", skip(exe, insert))]
    pub(super) async fn insert(
        exe: impl Executor<'_>,
        insert: PasskeyInsert,
    ) -> Result<(), rorm::Error> {
        rorm::insert(exe, PasskeyModel)
            .single(&PasskeyInsertPatch {
                uuid: Uuid::now_v7(),
                identity: ForeignModelByField(insert.identity.into_inner()),
                label: insert.label,
                credential_id: insert.credential_id,
                credential: Json(insert.credential),
            })
            .await?;
        Ok(())
    }

    /// Persist an updated credential (counter, backup state)
    /// and stamp `last_used_at`
    #[instrument(name = "Passkey::update_credential", skip(exe, credential))]
    pub(super) async fn update_credential(
        exe: impl Executor<'_>,
        uuid: PasskeyUuid,
        credential: WebauthnPasskey,
    ) -> Result<(), rorm::Error> {
        rorm::update(exe, PasskeyModel)
            .set(PasskeyModel.credential, Json(credential))
            .set(PasskeyModel.last_used_at, Some(OffsetDateTime::now_utc()))
            .condition(PasskeyModel.uuid.equals(uuid.0))
            .await?;
        Ok(())
    }

    /// Delete a passkey
    ///
    /// Returns `false` if the passkey does not exist.
    #[instrument(name = "Passkey::delete", skip(exe))]
    pub(super) async fn delete(
        exe: impl Executor<'_>,
        uuid: PasskeyUuid,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::delete(exe, PasskeyModel)
            .condition(PasskeyModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
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
