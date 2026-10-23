//! The OpenID providers in the module's tables, outside of a Login

use galvyn::rorm;
use galvyn::rorm::db::executor::Executor;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::db::transaction::TransactionError;

use super::error::AddOpenIdProviderError;
use super::error::DeleteOpenIdProviderError;
use super::error::EditOpenIdProviderError;
use super::models::SLUG_UNIQUE;
use super::provider::NewOpenIdProvider;
use super::provider::OpenIdProvider;
use super::provider::OpenIdProviderEdit;
use super::provider::issuer_of;
use crate::IdentityModule;

impl IdentityModule {
    /// Add `provider` to the module's tables
    ///
    /// Needs no running module, so a cli subcommand can bootstrap a service
    /// whose only login is OIDC, see
    /// [`AddOpenIdProviderCommand`](crate::AddOpenIdProviderCommand).
    pub async fn add_openid_provider(
        exe: impl Executor<'_>,
        provider: &NewOpenIdProvider,
    ) -> Result<(), AddOpenIdProviderError> {
        provider
            .validate()
            .map_err(AddOpenIdProviderError::Invalid)?;
        OpenIdProvider::insert(exe, provider)
            .await
            .map_err(|error| match slug_taken(&error) {
                true => AddOpenIdProviderError::SlugTaken,
                false => AddOpenIdProviderError::Internal(error.into()),
            })
    }

    /// Add `provider`, or overwrite the provider of its slug with it
    ///
    /// For a provider a service configures outside the module's tables,
    /// e.g. from env vars at startup. An overwritten provider keeps its
    /// issuer and its External identities.
    pub async fn put_openid_provider(
        exe: impl Executor<'_>,
        provider: &NewOpenIdProvider,
    ) -> Result<(), AddOpenIdProviderError> {
        provider
            .validate()
            .map_err(AddOpenIdProviderError::Invalid)?;
        let mut tx = exe.ensure_transaction().await?;
        let put = put(&mut tx, provider).await;
        match put {
            Ok(()) => tx.commit_if_owned().await.map_err(|error| match error {
                TransactionError::Database(error) => AddOpenIdProviderError::from(error),
                TransactionError::Hook(_) => {
                    unreachable!("a transaction started here has no hooks")
                }
            }),
            Err(error) => {
                tx.rollback_if_owned().await?;
                Err(error.into())
            }
        }
    }

    /// Every OpenID provider people may log in through, by slug
    ///
    /// Empty while OIDC login is off; a deactivated provider is left out.
    pub async fn openid_providers(
        &self,
        exe: impl Executor<'_>,
    ) -> Result<Vec<OpenIdProvider>, rorm::Error> {
        if !self.oidc.enabled() {
            return Ok(Vec::new());
        }
        let mut providers = OpenIdProvider::all(exe).await?;
        providers.retain(OpenIdProvider::is_active);
        Ok(providers)
    }

    /// The OpenID provider named `slug`, if there is one, it is active and OIDC login is on
    pub async fn openid_provider(
        &self,
        exe: impl Executor<'_>,
        slug: &str,
    ) -> Result<Option<OpenIdProvider>, rorm::Error> {
        if !self.oidc.enabled() {
            return Ok(None);
        }
        let provider = OpenIdProvider::get_by_slug(exe, slug).await?;
        Ok(provider.filter(OpenIdProvider::is_active))
    }

    /// Every OpenID provider in the module's tables, deactivated ones included, by slug
    ///
    /// For the service's admins.
    pub async fn all_openid_providers(
        exe: impl Executor<'_>,
    ) -> Result<Vec<OpenIdProvider>, rorm::Error> {
        OpenIdProvider::all(exe).await
    }

    /// Overwrite the OpenID provider named `slug` with `edit` in `tx`
    ///
    /// Once an External identity references the provider, its identifying
    /// claim and the issuer its discovery url names are frozen. An
    /// unreferenced provider moved to another issuer has it stored anew by
    /// its next discovery.
    pub async fn edit_openid_provider(
        tx: &mut Transaction,
        slug: &str,
        edit: &OpenIdProviderEdit,
    ) -> Result<(), EditOpenIdProviderError> {
        let Some(stored) = OpenIdProvider::get_by_slug(&mut *tx, slug).await? else {
            return Err(EditOpenIdProviderError::UnknownProvider);
        };
        let edited = NewOpenIdProvider {
            slug: stored.slug.clone(),
            display_name: edit.display_name.clone(),
            discovery_url: edit.discovery_url.clone(),
            client_id: edit.client_id.clone(),
            client_secret: edit
                .client_secret
                .clone()
                .unwrap_or_else(|| stored.client_secret.clone()),
            identifying_claim: edit.identifying_claim.clone(),
            admission: edit.admission,
        };
        edited
            .validate()
            .map_err(EditOpenIdProviderError::Invalid)?;

        let issuer = stored
            .issuer
            .as_deref()
            .unwrap_or_else(|| issuer_of(&stored.discovery_url));
        let issuer_changes = issuer_of(&edited.discovery_url) != issuer;
        if OpenIdProvider::is_referenced(&mut *tx, stored.uuid).await? {
            if edited.identifying_claim != stored.identifying_claim {
                return Err(EditOpenIdProviderError::IdentifyingClaimFrozen);
            }
            if issuer_changes {
                return Err(EditOpenIdProviderError::IssuerFrozen);
            }
        }

        OpenIdProvider::edit(&mut *tx, stored.uuid, &edited, issuer_changes).await?;
        Ok(())
    }

    /// Deactivate the OpenID provider named `slug`: nobody logs in through it
    ///
    /// Its External identities are kept. Returns `false` if there is no such provider.
    pub async fn deactivate_openid_provider(
        exe: impl Executor<'_>,
        slug: &str,
    ) -> Result<bool, rorm::Error> {
        OpenIdProvider::set_active(exe, slug, false).await
    }

    /// Reactivate the OpenID provider named `slug`, with all its External identities
    ///
    /// Returns `false` if there is no such provider.
    pub async fn reactivate_openid_provider(
        exe: impl Executor<'_>,
        slug: &str,
    ) -> Result<bool, rorm::Error> {
        OpenIdProvider::set_active(exe, slug, true).await
    }

    /// Delete the OpenID provider named `slug` in `tx`, refused while an External identity references it
    ///
    /// On [`DeleteOpenIdProviderError::Referenced`] `tx` may be aborted and has to be rolled back.
    pub async fn delete_openid_provider(
        tx: &mut Transaction,
        slug: &str,
    ) -> Result<(), DeleteOpenIdProviderError> {
        let Some(stored) = OpenIdProvider::get_by_slug(&mut *tx, slug).await? else {
            return Err(DeleteOpenIdProviderError::UnknownProvider);
        };
        if OpenIdProvider::is_referenced(&mut *tx, stored.uuid).await? {
            return Err(DeleteOpenIdProviderError::Referenced);
        }
        OpenIdProvider::delete(&mut *tx, stored.uuid)
            .await
            .map_err(|error| match still_referenced(&error) {
                true => DeleteOpenIdProviderError::Referenced,
                false => DeleteOpenIdProviderError::Internal(error.into()),
            })
    }
}

/// Overwrite or insert `provider` in `tx`
async fn put(
    tx: &mut galvyn::rorm::db::transaction::Transaction,
    provider: &NewOpenIdProvider,
) -> Result<(), rorm::Error> {
    if !OpenIdProvider::overwrite(&mut *tx, provider).await? {
        OpenIdProvider::insert(&mut *tx, provider).await?;
    }
    Ok(())
}

/// Whether `error` is an External identity referencing a deleted OpenID provider
fn still_referenced(error: &rorm::Error) -> bool {
    match error {
        rorm::Error::SqlxError(error) => error
            .as_database_error()
            .is_some_and(|error| error.is_foreign_key_violation()),
        _ => false,
    }
}

/// Whether `error` is a clash on an OpenID provider's slug
fn slug_taken(error: &rorm::Error) -> bool {
    match error {
        rorm::Error::SqlxError(error) => error.as_database_error().is_some_and(|error| {
            error.is_unique_violation() && error.constraint() == Some(SLUG_UNIQUE)
        }),
        _ => false,
    }
}
