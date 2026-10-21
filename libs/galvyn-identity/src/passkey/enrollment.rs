//! Enrollment: adding a Passkey to an Identity
//!
//! Either through a Registration link or by the logged-in Identity adding a
//! device. The two keep their ceremony state under separate session keys, so
//! an Enrollment started for one can never be finished through the other.

use galvyn::core::Module;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::core::CoreApiError;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use webauthn_rs::prelude::CredentialID;
use webauthn_rs::prelude::Passkey as WebauthnPasskey;
use webauthn_rs::prelude::PasskeyRegistration;
use webauthn_rs::prelude::RegisterPublicKeyCredential;

use super::ceremony::challenge_json;
use super::ceremony::choose_label;
use super::ceremony::credential_id_string;
use super::ceremony::registration_aaguid;
use super::ceremony::request_attestation;
use super::ceremony::require_discoverable_credential;
use super::error::FinishDeviceEnrollmentError;
use super::error::FinishEnrollmentError;
use super::models::Passkey;
use super::models::PasskeyInsert;
use super::session;
use super::session::EnrollmentKind;
use crate::IdentityModule;
use crate::LinkError;
use crate::management::OpenLink;
use crate::management::usable_link;
use crate::models::IdentityUuid;
use crate::models::RegistrationLink;

/// Postgres' name for the unique constraint on a Passkey's credential id
const CREDENTIAL_ID_UNIQUE: &str = "passkey_credential_id_key";

impl IdentityModule {
    /// Begin an Enrollment through an opened Registration link
    ///
    /// `user_name` is what the authenticator shows for the new Passkey.
    /// Returns the challenge for `navigator.credentials.create`.
    pub async fn begin_link_enrollment(
        &self,
        session: &Session,
        link: &OpenLink,
        user_name: &str,
    ) -> Result<serde_json::Value, CoreApiError> {
        self.begin_enrollment(
            session,
            EnrollmentKind::Link(link.link),
            link.identity,
            user_name,
        )
        .await
    }

    /// Finish the session's Enrollment through the Registration link carrying `token`
    ///
    /// Only an Enrollment begun through that same link is finished, and none
    /// for an external Identity. Marking
    /// the link used checks again that it is unused and unexpired, together
    /// with storing the Passkey, so it enrolls exactly one, even when two
    /// Enrollments race for it.
    pub async fn finish_link_enrollment(
        &self,
        session: &Session,
        token: &str,
        credential: serde_json::Value,
        label: Option<MaxStr<255>>,
    ) -> Result<(), FinishEnrollmentError> {
        let mut tx = Database::global().start_transaction().await?;
        let link = usable_link(&mut tx, token).await?;
        tx.commit().await?;
        let link = link.map_err(FinishEnrollmentError::Link)?;

        let Some(state) =
            session::take_enrollment(session, EnrollmentKind::Link(link.uuid)).await?
        else {
            return Err(FinishEnrollmentError::NoEnrollmentInProgress);
        };
        refuse_external(link.identity).await?;
        let credential = parse_registration(credential)?;
        let passkey = self.verify_registration(&credential, &state)?;

        let mut tx = Database::global().start_transaction().await?;
        if !RegistrationLink::mark_used(&mut tx, link.uuid, OffsetDateTime::now_utc()).await? {
            tx.rollback().await?;
            return Err(FinishEnrollmentError::Link(LinkError::LinkUsed));
        }
        store_passkey(&mut tx, link.identity, &credential, passkey, label).await?;

        tx.commit().await?;
        Ok(())
    }

    /// Begin an Enrollment of an additional device for the logged-in `identity`
    ///
    /// Needs no Registration link: the logged-in session is proof enough.
    /// `user_name` is what the authenticator shows for the new Passkey.
    /// Returns the challenge for `navigator.credentials.create`.
    pub async fn begin_device_enrollment(
        &self,
        session: &Session,
        identity: IdentityUuid,
        user_name: &str,
    ) -> Result<serde_json::Value, CoreApiError> {
        self.begin_enrollment(
            session,
            EnrollmentKind::Device(identity),
            identity,
            user_name,
        )
        .await
    }

    /// Finish the session's Enrollment of an additional device for `identity`
    ///
    /// Only an Enrollment begun for that same Identity is finished, so one
    /// begun before another Identity logged in on the browser is refused, and
    /// none for an external Identity.
    pub async fn finish_device_enrollment(
        &self,
        session: &Session,
        identity: IdentityUuid,
        credential: serde_json::Value,
        label: Option<MaxStr<255>>,
    ) -> Result<(), FinishDeviceEnrollmentError> {
        let Some(state) =
            session::take_enrollment(session, EnrollmentKind::Device(identity)).await?
        else {
            return Err(FinishDeviceEnrollmentError::NoEnrollmentInProgress);
        };
        refuse_external(identity).await?;
        let credential = parse_registration(credential)?;
        let passkey = self.verify_registration(&credential, &state)?;

        let mut tx = Database::global().start_transaction().await?;
        store_passkey(&mut tx, identity, &credential, passkey, label).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Start the ceremony and keep its state under `kind`'s session key
    ///
    /// The Identity's existing Passkeys are excluded: enrolling the same
    /// authenticator twice would leave two entries for one device and no way
    /// to tell them apart. The user handle is the Identity's uuid.
    async fn begin_enrollment(
        &self,
        session: &Session,
        kind: EnrollmentKind,
        identity: IdentityUuid,
        user_name: &str,
    ) -> Result<serde_json::Value, CoreApiError> {
        let exclude: Vec<CredentialID> = Passkey::get_by_identity(Database::global(), identity)
            .await?
            .iter()
            .map(|passkey| passkey.credential.cred_id().clone())
            .collect();

        let (mut challenge, state) = self
            .webauthn
            .start_passkey_registration(
                identity.into_inner(),
                user_name,
                user_name,
                (!exclude.is_empty()).then_some(exclude),
            )
            .map_err(CoreApiError::map_server_error(
                "Failed to start registration",
            ))?;
        require_discoverable_credential(&mut challenge);
        request_attestation(&mut challenge);

        session::start_enrollment(session, kind, state).await?;

        challenge_json(challenge)
    }

    /// Check the authenticator's response against the ceremony state
    fn verify_registration(
        &self,
        credential: &RegisterPublicKeyCredential,
        state: &PasskeyRegistration,
    ) -> Result<WebauthnPasskey, FinishDeviceEnrollmentError> {
        self.webauthn
            .finish_passkey_registration(credential, state)
            .map_err(|_| FinishDeviceEnrollmentError::VerificationFailed)
    }
}

/// Refuse the Enrollment if `identity` is external
#[cfg_attr(
    not(feature = "oidc"),
    expect(
        unused_variables,
        reason = "Without OIDC login every Identity is local"
    )
)]
async fn refuse_external(identity: IdentityUuid) -> Result<(), FinishDeviceEnrollmentError> {
    #[cfg(feature = "oidc")]
    if crate::oidc::models::ExternalIdentity::issuer_of(Database::global(), identity)
        .await?
        .is_some()
    {
        return Err(FinishDeviceEnrollmentError::ExternalIdentity);
    }
    Ok(())
}

/// Parse the authenticator's response to an Enrollment
fn parse_registration(
    credential: serde_json::Value,
) -> Result<RegisterPublicKeyCredential, FinishDeviceEnrollmentError> {
    serde_json::from_value(credential).map_err(|_| FinishDeviceEnrollmentError::MalformedCredential)
}

/// Store a freshly enrolled Passkey for `identity`
async fn store_passkey(
    tx: &mut Transaction,
    identity: IdentityUuid,
    credential: &RegisterPublicKeyCredential,
    passkey: WebauthnPasskey,
    label: Option<MaxStr<255>>,
) -> Result<(), FinishDeviceEnrollmentError> {
    let existing = Passkey::get_by_identity(&mut *tx, identity).await?.len();
    let credential_id = credential_id_string(passkey.cred_id())?;

    Passkey::insert(
        &mut *tx,
        PasskeyInsert {
            identity,
            label: choose_label(label, registration_aaguid(credential), existing),
            credential_id,
            credential: passkey,
        },
    )
    .await
    .map_err(insert_failure)
}

/// What a failed insert of a Passkey means for the Enrollment
///
/// Only a clash on the credential id says the Passkey is already enrolled.
fn insert_failure(error: rorm::Error) -> FinishDeviceEnrollmentError {
    let clash = match &error {
        rorm::Error::SqlxError(error) => error.as_database_error().is_some_and(|error| {
            error.is_unique_violation() && error.constraint() == Some(CREDENTIAL_ID_UNIQUE)
        }),
        _ => false,
    };
    if clash {
        FinishDeviceEnrollmentError::AlreadyEnrolled
    } else {
        FinishDeviceEnrollmentError::Internal(error.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_failure_other_than_a_credential_id_clash_is_internal() {
        let error = rorm::Error::ConfigurationError("no database".to_string());
        assert!(matches!(
            insert_failure(error),
            FinishDeviceEnrollmentError::Internal(_)
        ));
    }
}
