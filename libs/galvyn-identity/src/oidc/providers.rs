//! The OpenID providers in the module's tables, outside of a Login

use galvyn::rorm;
use galvyn::rorm::db::executor::Executor;
use galvyn::rorm::db::transaction::TransactionError;

use super::error::AddOpenIdProviderError;
use super::models::SLUG_UNIQUE;
use super::provider::NewOpenIdProvider;
use super::provider::OpenIdProvider;
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
    /// Empty while OIDC login is off.
    pub async fn openid_providers(
        &self,
        exe: impl Executor<'_>,
    ) -> Result<Vec<OpenIdProvider>, rorm::Error> {
        if !self.oidc.enabled() {
            return Ok(Vec::new());
        }
        OpenIdProvider::all(exe).await
    }

    /// The OpenID provider named `slug`, if there is one and OIDC login is on
    pub async fn openid_provider(
        &self,
        exe: impl Executor<'_>,
        slug: &str,
    ) -> Result<Option<OpenIdProvider>, rorm::Error> {
        if !self.oidc.enabled() {
            return Ok(None);
        }
        OpenIdProvider::get_by_slug(exe, slug).await
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

/// Whether `error` is a clash on an OpenID provider's slug
fn slug_taken(error: &rorm::Error) -> bool {
    match error {
        rorm::Error::SqlxError(error) => error.as_database_error().is_some_and(|error| {
            error.is_unique_violation() && error.constraint() == Some(SLUG_UNIQUE)
        }),
        _ => false,
    }
}
