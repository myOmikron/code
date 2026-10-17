//! Enrollment: adding a Passkey to an Identity
//!
//! Either through a Registration link or by the logged-in Identity adding a
//! device. The two keep their ceremony state under separate session keys, so
//! an Enrollment started for one can never be finished through the other.

use galvyn::core::Module;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::core::CoreApiError;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use webauthn_rs::prelude::CredentialID;
use webauthn_rs::prelude::Passkey as WebauthnPasskey;
use webauthn_rs::prelude::PasskeyRegistration;
use webauthn_rs::prelude::RegisterPublicKeyCredential;

use super::ceremony::choose_label;
use super::ceremony::credential_id_string;
use super::ceremony::registration_aaguid;
use super::ceremony::request_attestation;
use super::ceremony::require_discoverable_credential;
use super::error::FinishEnrollmentError;
use super::models::Passkey;
use super::models::PasskeyInsert;
use super::session;
use super::session::EnrollmentKind;
use crate::IdentityModule;
use crate::management::OpenLink;
use crate::management::usable_link;
use crate::models::IdentityUuid;
use crate::models::RegistrationLink;

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
        self.begin_enrollment(session, EnrollmentKind::Link, link.identity, user_name)
            .await
    }

    /// Finish the session's Enrollment through the Registration link carrying `token`
    ///
    /// The link is checked again and marked used together with storing the
    /// Passkey, so it enrolls exactly one.
    pub async fn finish_link_enrollment(
        &self,
        session: &Session,
        token: &str,
        credential: serde_json::Value,
        label: Option<MaxStr<255>>,
    ) -> Result<(), FinishEnrollmentError> {
        let Some(state) = session::take_enrollment(session, EnrollmentKind::Link).await? else {
            return Err(FinishEnrollmentError::NoEnrollmentInProgress);
        };
        let credential = parse_registration(credential)?;

        let mut tx = Database::global().start_transaction().await?;

        let link = usable_link(&mut tx, token)
            .await?
            .map_err(FinishEnrollmentError::Link)?;

        let passkey = self.verify_registration(&credential, &state)?;
        store_passkey(&mut tx, link.identity, &credential, passkey, label).await?;
        RegistrationLink::mark_used(&mut tx, link.uuid).await?;

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
        self.begin_enrollment(session, EnrollmentKind::Device, identity, user_name)
            .await
    }

    /// Finish the session's Enrollment of an additional device for `identity`
    pub async fn finish_device_enrollment(
        &self,
        session: &Session,
        identity: IdentityUuid,
        credential: serde_json::Value,
        label: Option<MaxStr<255>>,
    ) -> Result<(), FinishEnrollmentError> {
        let Some(state) = session::take_enrollment(session, EnrollmentKind::Device).await? else {
            return Err(FinishEnrollmentError::NoEnrollmentInProgress);
        };
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

        serde_json::to_value(challenge).map_err(CoreApiError::map_server_error(
            "Failed to serialize challenge",
        ))
    }

    /// Check the authenticator's response against the ceremony state
    fn verify_registration(
        &self,
        credential: &RegisterPublicKeyCredential,
        state: &PasskeyRegistration,
    ) -> Result<WebauthnPasskey, FinishEnrollmentError> {
        self.webauthn
            .finish_passkey_registration(credential, state)
            .map_err(|_| FinishEnrollmentError::VerificationFailed)
    }
}

/// Parse the authenticator's response to an Enrollment
fn parse_registration(
    credential: serde_json::Value,
) -> Result<RegisterPublicKeyCredential, FinishEnrollmentError> {
    serde_json::from_value(credential).map_err(|_| FinishEnrollmentError::MalformedCredential)
}

/// Store a freshly enrolled Passkey for `identity`
async fn store_passkey(
    tx: &mut Transaction,
    identity: IdentityUuid,
    credential: &RegisterPublicKeyCredential,
    passkey: WebauthnPasskey,
    label: Option<MaxStr<255>>,
) -> Result<(), FinishEnrollmentError> {
    let existing = Passkey::get_by_identity(&mut *tx, identity).await?.len();
    let credential_id = credential_id_string(passkey.cred_id())
        .ok_or(CoreApiError::server_error("Unreadable credential id"))?;

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
    .map_err(|_| FinishEnrollmentError::AlreadyEnrolled)
}
