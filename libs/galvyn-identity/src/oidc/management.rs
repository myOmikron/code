//! External identities outside of a Login

use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;

use super::error::EnrollExternalIdentityError;
use super::login::unique_violation;
use super::models::ExternalIdentity;
use crate::IdentityModule;
use crate::models::IdentityUuid;

impl IdentityModule {
    /// Enroll the External identity `issuer` + `subject` for `identity` without a Login
    ///
    /// Only for a service's tests, e.g. to set up an external Account without
    /// running an OIDC login. Refused for a local Identity, like every
    /// Enrollment of an External identity.
    pub async fn enroll_external_identity_without_ceremony(
        &self,
        tx: &mut Transaction,
        identity: IdentityUuid,
        issuer: &str,
        subject: &str,
    ) -> Result<(), EnrollExternalIdentityError> {
        let (Ok(issuer), Ok(subject)) = (
            MaxStr::new(issuer.to_string()),
            MaxStr::new(subject.to_string()),
        ) else {
            return Err(EnrollExternalIdentityError::TooLong);
        };

        #[cfg(feature = "passkey")]
        if self.count_passkeys(&mut *tx, identity).await? > 0 {
            return Err(EnrollExternalIdentityError::LocalIdentity);
        }

        ExternalIdentity { issuer, subject }
            .insert(&mut *tx, identity)
            .await
            .map_err(|error| {
                if unique_violation(&error) {
                    EnrollExternalIdentityError::AlreadyBound
                } else {
                    EnrollExternalIdentityError::Internal(error.into())
                }
            })
    }
}
