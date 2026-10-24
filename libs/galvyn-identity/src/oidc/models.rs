//! The OpenID providers and the External identities of an Identity

use std::collections::HashMap;

use galvyn::rorm;
use galvyn::rorm::db::executor::Executor;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;
use uuid::Uuid;

use super::db::ExternalIdentityInsertPatch;
use super::db::ExternalIdentityModel;
use super::db::OpenIdProviderInsertPatch;
use super::db::OpenIdProviderModel;
use super::provider::Admission;
use super::provider::NewOpenIdProvider;
use super::provider::OpenIdProvider;
use crate::models::IdentityUuid;

/// Postgres' name for the unique constraint on an External identity's provider and value
pub(super) const PROVIDER_VALUE_UNIQUE: &str = "external_identity_provider_value_key";

/// Postgres' name for the unique constraint on an External identity's Identity
#[cfg(feature = "test-support")]
pub(super) const IDENTITY_UNIQUE: &str = "external_identity_identity_key";

/// Postgres' name for the unique constraint on an OpenID provider's slug
pub(super) const SLUG_UNIQUE: &str = "openid_provider_slug_key";

/// A person as one OpenID provider knows them
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExternalIdentity {
    /// The primary key of the OpenID provider
    pub provider: Uuid,
    /// The provider's issuer
    pub issuer: MaxStr<255>,
    /// The value of the provider's identifying claim
    pub value: MaxStr<255>,
}

/// The OpenID provider an external Identity logs in through
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExternalLogin {
    /// The provider's slug
    pub provider: String,
    /// What the frontend calls the provider
    pub display_name: String,
    /// The provider's issuer when the External identity was bound
    pub issuer: String,
}

impl ExternalIdentity {
    /// The unique key of the pair
    fn provider_value(&self) -> MaxStr<292> {
        MaxStr::new(format!("{} {}", self.provider, self.value))
            .unwrap_or_else(|_| unreachable!("a uuid, a space and 255 bytes fit into 292"))
    }

    /// The Identity this External identity is bound to, if any
    #[instrument(name = "ExternalIdentity::identity", skip(exe))]
    pub(super) async fn identity(
        &self,
        exe: impl Executor<'_>,
    ) -> Result<Option<IdentityUuid>, rorm::Error> {
        let provider_value = self.provider_value();
        let identity = rorm::query(exe, ExternalIdentityModel.identity)
            .condition(
                ExternalIdentityModel
                    .provider_value
                    .equals(&*provider_value),
            )
            .optional()
            .await?;
        Ok(identity.map(IdentityUuid::new_from_field))
    }

    /// Bind this External identity to `identity`
    ///
    /// Fails with a unique violation on [`PROVIDER_VALUE_UNIQUE`] if it is
    /// bound already, and on [`IDENTITY_UNIQUE`] if `identity` holds one.
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
                provider: ForeignModelByField(self.provider),
                issuer: self.issuer.clone(),
                value: self.value.clone(),
                provider_value: self.provider_value(),
            })
            .await?;
        Ok(())
    }

    /// The login of `identity`'s External identity, if it has one
    #[instrument(name = "ExternalIdentity::login_of", skip(exe))]
    pub(crate) async fn login_of(
        exe: impl Executor<'_>,
        identity: IdentityUuid,
    ) -> Result<Option<ExternalLogin>, rorm::Error> {
        let mut logins = Self::logins_of(exe, &[identity]).await?;
        Ok(logins.remove(&identity))
    }

    /// [`ExternalIdentity::login_of`] for each of `identities`, in one query
    ///
    /// An Identity without an External identity has no entry.
    #[instrument(name = "ExternalIdentity::logins_of", skip(exe))]
    pub(crate) async fn logins_of(
        exe: impl Executor<'_>,
        identities: &[IdentityUuid],
    ) -> Result<HashMap<IdentityUuid, ExternalLogin>, rorm::Error> {
        if identities.is_empty() {
            return Ok(HashMap::new());
        }
        let uuids = identities.iter().map(|uuid| uuid.into_inner());
        let rows = rorm::query(
            exe,
            (
                ExternalIdentityModel.identity,
                ExternalIdentityModel.issuer,
                ExternalIdentityModel.provider.slug,
                ExternalIdentityModel.provider.display_name,
            ),
        )
        .condition(ExternalIdentityModel.identity.r#in(uuids))
        .order_asc(ExternalIdentityModel.created_at)
        .all()
        .await?;

        let mut logins = HashMap::new();
        for (identity, issuer, slug, display_name) in rows {
            logins
                .entry(IdentityUuid::new_from_field(identity))
                .or_insert(ExternalLogin {
                    provider: slug.into_inner(),
                    display_name: display_name.into_inner(),
                    issuer: issuer.into_inner(),
                });
        }
        Ok(logins)
    }
}

impl OpenIdProvider {
    /// The provider named `slug`, if there is one
    #[instrument(name = "OpenIdProvider::get_by_slug", skip(exe))]
    pub(crate) async fn get_by_slug(
        exe: impl Executor<'_>,
        slug: &str,
    ) -> Result<Option<OpenIdProvider>, rorm::Error> {
        let provider = rorm::query(exe, OpenIdProviderModel)
            .condition(OpenIdProviderModel.slug.equals(slug))
            .optional()
            .await?;
        Ok(provider.map(OpenIdProvider::from))
    }

    /// Every provider, by slug
    #[instrument(name = "OpenIdProvider::all", skip(exe))]
    pub(crate) async fn all(exe: impl Executor<'_>) -> Result<Vec<OpenIdProvider>, rorm::Error> {
        let providers = rorm::query(exe, OpenIdProviderModel)
            .order_asc(OpenIdProviderModel.slug)
            .all()
            .await?;
        Ok(providers.into_iter().map(OpenIdProvider::from).collect())
    }

    /// Insert `provider`, checked by [`NewOpenIdProvider::validate`]
    ///
    /// Fails with a unique violation on [`SLUG_UNIQUE`] if its slug is taken.
    #[instrument(name = "OpenIdProvider::insert", skip(exe))]
    pub(crate) async fn insert(
        exe: impl Executor<'_>,
        provider: &NewOpenIdProvider,
    ) -> Result<(), rorm::Error> {
        rorm::insert(exe, OpenIdProviderModel)
            .single(&OpenIdProviderInsertPatch {
                uuid: Uuid::now_v7(),
                slug: valid(&provider.slug),
                display_name: valid(&provider.display_name),
                discovery_url: valid(&provider.discovery_url),
                issuer: None,
                client_id: valid(&provider.client_id),
                client_secret: valid(&provider.client_secret),
                identifying_claim: valid(&provider.identifying_claim),
                admission: valid(provider.admission.encode()),
                active: true,
            })
            .await?;
        Ok(())
    }

    /// Overwrite the provider named like `provider` with it, checked by [`NewOpenIdProvider::validate`]
    ///
    /// Its issuer stays. Returns `false` if there is no such provider.
    #[instrument(name = "OpenIdProvider::overwrite", skip(exe))]
    pub(crate) async fn overwrite(
        exe: impl Executor<'_>,
        provider: &NewOpenIdProvider,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(exe, OpenIdProviderModel)
            .set(
                OpenIdProviderModel.display_name,
                valid(&provider.display_name),
            )
            .set(
                OpenIdProviderModel.discovery_url,
                valid(&provider.discovery_url),
            )
            .set(OpenIdProviderModel.client_id, valid(&provider.client_id))
            .set(
                OpenIdProviderModel.client_secret,
                valid(&provider.client_secret),
            )
            .set(
                OpenIdProviderModel.identifying_claim,
                valid(&provider.identifying_claim),
            )
            .set(
                OpenIdProviderModel.admission,
                valid(provider.admission.encode()),
            )
            .condition(OpenIdProviderModel.slug.equals(&*provider.slug))
            .await?;
        Ok(affected > 0)
    }

    /// Overwrite the provider `uuid` with `provider`, checked by [`NewOpenIdProvider::validate`]
    ///
    /// Its slug stays. Its issuer stays unless `forget_issuer` is set, which
    /// has the next discovery store the issuer anew.
    #[instrument(name = "OpenIdProvider::edit", skip(exe))]
    pub(crate) async fn edit(
        exe: impl Executor<'_>,
        uuid: Uuid,
        provider: &NewOpenIdProvider,
        forget_issuer: bool,
    ) -> Result<(), rorm::Error> {
        let update = rorm::update(exe, OpenIdProviderModel)
            .set(
                OpenIdProviderModel.display_name,
                valid(&provider.display_name),
            )
            .set(
                OpenIdProviderModel.discovery_url,
                valid(&provider.discovery_url),
            )
            .set(OpenIdProviderModel.client_id, valid(&provider.client_id))
            .set(
                OpenIdProviderModel.client_secret,
                valid(&provider.client_secret),
            )
            .set(
                OpenIdProviderModel.identifying_claim,
                valid(&provider.identifying_claim),
            )
            .set(
                OpenIdProviderModel.admission,
                valid(provider.admission.encode()),
            );
        let update = match forget_issuer {
            true => update.set(OpenIdProviderModel.issuer, None),
            false => update,
        };
        update
            .condition(OpenIdProviderModel.uuid.equals(uuid))
            .await?;
        Ok(())
    }

    /// Activate or deactivate the provider named `slug`
    ///
    /// Returns `false` if there is no such provider.
    #[instrument(name = "OpenIdProvider::set_active", skip(exe))]
    pub(crate) async fn set_active(
        exe: impl Executor<'_>,
        slug: &str,
        active: bool,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(exe, OpenIdProviderModel)
            .set(OpenIdProviderModel.active, active)
            .condition(OpenIdProviderModel.slug.equals(slug))
            .await?;
        Ok(affected > 0)
    }

    /// Whether an External identity references the provider `uuid`
    #[instrument(name = "OpenIdProvider::is_referenced", skip(exe))]
    pub(crate) async fn is_referenced(
        exe: impl Executor<'_>,
        uuid: Uuid,
    ) -> Result<bool, rorm::Error> {
        let reference = rorm::query(exe, ExternalIdentityModel.uuid)
            .condition(ExternalIdentityModel.provider.equals(uuid))
            .optional()
            .await?;
        Ok(reference.is_some())
    }

    /// The Identities whose External identity references the provider `uuid`
    #[instrument(name = "OpenIdProvider::identities", skip(exe))]
    pub(crate) async fn identities(
        exe: impl Executor<'_>,
        uuid: Uuid,
    ) -> Result<Vec<IdentityUuid>, rorm::Error> {
        let identities = rorm::query(exe, ExternalIdentityModel.identity)
            .condition(ExternalIdentityModel.provider.equals(uuid))
            .all()
            .await?;
        Ok(identities
            .into_iter()
            .map(IdentityUuid::new_from_field)
            .collect())
    }

    /// Delete every External identity referencing the provider `uuid`
    #[instrument(name = "OpenIdProvider::delete_external_identities", skip(exe))]
    pub(crate) async fn delete_external_identities(
        exe: impl Executor<'_>,
        uuid: Uuid,
    ) -> Result<(), rorm::Error> {
        rorm::delete(exe, ExternalIdentityModel)
            .condition(ExternalIdentityModel.provider.equals(uuid))
            .await?;
        Ok(())
    }

    /// Delete the provider `uuid`
    ///
    /// Fails with a foreign key violation while an External identity references it.
    #[instrument(name = "OpenIdProvider::delete", skip(exe))]
    pub(crate) async fn delete(exe: impl Executor<'_>, uuid: Uuid) -> Result<(), rorm::Error> {
        rorm::delete(exe, OpenIdProviderModel)
            .condition(OpenIdProviderModel.uuid.equals(uuid))
            .await?;
        Ok(())
    }

    /// Store the issuer the first discovery of the provider `uuid` stated
    ///
    /// A stored issuer is kept.
    #[instrument(name = "OpenIdProvider::store_issuer", skip(exe))]
    pub(crate) async fn store_issuer(
        exe: impl Executor<'_>,
        uuid: Uuid,
        issuer: MaxStr<255>,
    ) -> Result<(), rorm::Error> {
        rorm::update(exe, OpenIdProviderModel)
            .set(OpenIdProviderModel.issuer, Some(issuer))
            .condition(rorm::and![
                OpenIdProviderModel.uuid.equals(uuid),
                OpenIdProviderModel.issuer.is_none(),
            ])
            .await?;
        Ok(())
    }
}

/// A value [`NewOpenIdProvider::validate`] checked to fit its column
fn valid<const N: usize>(value: &str) -> MaxStr<N> {
    MaxStr::new(value.to_string())
        .unwrap_or_else(|_| unreachable!("validated providers fit their columns"))
}

impl From<OpenIdProviderModel> for OpenIdProvider {
    fn from(value: OpenIdProviderModel) -> Self {
        Self {
            uuid: value.uuid,
            slug: value.slug.into_inner(),
            display_name: value.display_name.into_inner(),
            discovery_url: value.discovery_url.into_inner(),
            issuer: value.issuer.map(MaxStr::into_inner),
            client_id: value.client_id.into_inner(),
            client_secret: value.client_secret.into_inner(),
            identifying_claim: value.identifying_claim.into_inner(),
            admission: Admission::decode(&value.admission)
                .unwrap_or_else(|| unreachable!("only the Admission's own encoding is written")),
            active: value.active,
        }
    }
}
