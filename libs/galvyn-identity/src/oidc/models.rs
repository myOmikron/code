//! External identities of an Identity

use std::collections::HashMap;

use galvyn::rorm;
use galvyn::rorm::db::executor::Executor;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;
use uuid::Uuid;

use super::db::ExternalIdentityInsertPatch;
use super::db::ExternalIdentityModel;
use crate::models::IdentityUuid;

/// Postgres' name for the unique constraint on an External identity's issuer and subject
pub(super) const ISSUER_SUBJECT_UNIQUE: &str = "external_identity_issuer_subject_key";

/// A person as one OpenID provider knows them
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExternalIdentity {
    /// The issuer of the OpenID provider
    pub issuer: MaxStr<255>,
    /// The subject the provider identifies the person by
    pub subject: MaxStr<255>,
}

impl ExternalIdentity {
    /// The unique key of the pair
    fn issuer_subject(&self) -> MaxStr<511> {
        MaxStr::new(format!("{} {}", self.issuer, self.subject))
            .unwrap_or_else(|_| unreachable!("two strings of 255 bytes and a space fit into 511"))
    }

    /// The Identity this External identity is bound to, if any
    #[instrument(name = "ExternalIdentity::identity", skip(exe))]
    pub(super) async fn identity(
        &self,
        exe: impl Executor<'_>,
    ) -> Result<Option<IdentityUuid>, rorm::Error> {
        let issuer_subject = self.issuer_subject();
        let identity = rorm::query(exe, ExternalIdentityModel.identity)
            .condition(
                ExternalIdentityModel
                    .issuer_subject
                    .equals(&*issuer_subject),
            )
            .optional()
            .await?;
        Ok(identity.map(IdentityUuid::new_from_field))
    }

    /// Bind this External identity to `identity`
    ///
    /// Fails with a unique violation on [`ISSUER_SUBJECT_UNIQUE`] if it is
    /// bound already.
    #[instrument(name = "ExternalIdentity::insert", skip(exe))]
    pub(super) async fn insert(
        &self,
        exe: impl Executor<'_>,
        identity: IdentityUuid,
    ) -> Result<(), rorm::Error> {
        rorm::insert(exe, ExternalIdentityModel)
            .single(&ExternalIdentityInsertPatch {
                uuid: Uuid::now_v7(),
                identity: ForeignModelByField(identity.into_inner()),
                issuer: self.issuer.clone(),
                subject: self.subject.clone(),
                issuer_subject: self.issuer_subject(),
            })
            .await?;
        Ok(())
    }

    /// The issuer of one of `identity`'s External identities, if it has any
    #[instrument(name = "ExternalIdentity::issuer_of", skip(exe))]
    pub(crate) async fn issuer_of(
        exe: impl Executor<'_>,
        identity: IdentityUuid,
    ) -> Result<Option<MaxStr<255>>, rorm::Error> {
        rorm::query(exe, ExternalIdentityModel.issuer)
            .condition(ExternalIdentityModel.identity.equals(identity.into_inner()))
            .order_asc(ExternalIdentityModel.created_at)
            .optional()
            .await
    }

    /// [`ExternalIdentity::issuer_of`] for each of `identities`, in one query
    ///
    /// An Identity without an External identity has no entry.
    #[instrument(name = "ExternalIdentity::issuers_of", skip(exe))]
    pub(crate) async fn issuers_of(
        exe: impl Executor<'_>,
        identities: &[IdentityUuid],
    ) -> Result<HashMap<IdentityUuid, MaxStr<255>>, rorm::Error> {
        if identities.is_empty() {
            return Ok(HashMap::new());
        }
        let uuids = identities.iter().map(|uuid| uuid.into_inner());
        let rows = rorm::query(
            exe,
            (ExternalIdentityModel.identity, ExternalIdentityModel.issuer),
        )
        .condition(ExternalIdentityModel.identity.r#in(uuids))
        .order_asc(ExternalIdentityModel.created_at)
        .all()
        .await?;

        let mut issuers = HashMap::new();
        for (identity, issuer) in rows {
            issuers
                .entry(IdentityUuid::new_from_field(identity))
                .or_insert(issuer);
        }
        Ok(issuers)
    }
}
