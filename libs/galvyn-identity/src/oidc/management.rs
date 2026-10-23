//! External identities outside of a Login

use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;

use super::error::EnrollExternalIdentityError;
use super::login::unique_violation;
use super::login::violates;
use super::models::ExternalIdentity;
use super::models::IDENTITY_UNIQUE;
use super::provider::OpenIdProvider;
use crate::IdentityModule;
use crate::models::IdentityUuid;

impl IdentityModule {
    /// Enroll the External identity `value` of the provider `provider` for `identity` without a Login
    ///
    /// Only for a service's tests, e.g. to set up an external Account without
    /// running an OIDC login. The provider needs to be discovered once, for
    /// its issuer. Refused for a local Identity, like every Enrollment of an
    /// External identity, and for an external one, which holds exactly one.
    pub async fn enroll_external_identity_without_ceremony(
        &self,
        tx: &mut Transaction,
        identity: IdentityUuid,
        provider: &str,
        value: &str,
    ) -> Result<(), EnrollExternalIdentityError> {
        let Ok(value) = MaxStr::new(value.to_string()) else {
            return Err(EnrollExternalIdentityError::TooLong);
        };
        let Some(provider) = OpenIdProvider::get_by_slug(&mut *tx, provider).await? else {
            return Err(EnrollExternalIdentityError::UnknownProvider);
        };
        let Some(issuer) = provider.issuer.and_then(|issuer| MaxStr::new(issuer).ok()) else {
            return Err(EnrollExternalIdentityError::UndiscoveredProvider);
        };

        #[cfg(feature = "passkey")]
        if self.count_passkeys(&mut *tx, identity).await? > 0 {
            return Err(EnrollExternalIdentityError::LocalIdentity);
        }

        ExternalIdentity {
            provider: provider.uuid,
            issuer,
            value,
        }
        .insert(&mut *tx, identity)
        .await
        .map_err(|error| {
            if unique_violation(&error) {
                EnrollExternalIdentityError::AlreadyBound
            } else if violates(&error, IDENTITY_UNIQUE) {
                EnrollExternalIdentityError::ExternalIdentity
            } else {
                EnrollExternalIdentityError::Internal(error.into())
            }
        })
    }
}
