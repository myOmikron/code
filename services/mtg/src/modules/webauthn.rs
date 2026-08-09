//! Global module providing the configured [`webauthn_rs::Webauthn`] instance

use galvyn::core::InitError;
use galvyn::core::Module;
use galvyn::core::PreInitError;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;
use webauthn_rs::Webauthn;
use webauthn_rs::WebauthnBuilder;
use webauthn_rs::prelude::CreationChallengeResponse;
use webauthn_rs::prelude::CredentialID;
use webauthn_rs::prelude::RegisterPublicKeyCredential;
use webauthn_rs_proto::AttestationConveyancePreference;
use webauthn_rs_proto::ResidentKeyRequirement;

use crate::modules::aaguid::authenticator_name;

/// Global module wrapping the WebAuthn ceremony engine
pub struct WebauthnModule {
    /// The configured engine (rp_id/rp_origin from `PUBLIC_ORIGIN`)
    pub webauthn: Webauthn,
    /// The public origin, used to construct registration links
    pub public_origin: url::Url,
}

impl WebauthnModule {
    /// Construct the one-time registration link for an invite token
    pub fn registration_link(&self, token: &str) -> url::Url {
        let mut link = self.public_origin.clone();
        link.set_path("/auth/register");
        link.set_query(Some(&format!("token={token}")));
        link
    }
}

/// Ask the authenticator to store the credential as discoverable
///
/// `start_passkey_registration` requests `residentKey: discouraged`, which leaves
/// discoverability to the authenticator's discretion. A non-discoverable credential is bound to
/// the device that made it: no syncing through iCloud Keychain, Google Password Manager or the
/// Windows passkey store, and it never shows up in their passkey managers.
///
/// `Required` rather than `Preferred` on webauthn-rs' own advice — the two behave identically in
/// every major browser, so the weaker wording only obscures the intent.
pub fn require_discoverable_credential(challenge: &mut CreationChallengeResponse) {
    let Some(selection) = challenge.public_key.authenticator_selection.as_mut() else {
        return;
    };
    selection.resident_key = Some(ResidentKeyRequirement::Required);
    // The pre-webauthn-2 spelling of the same request; clients still read it.
    selection.require_resident_key = true;
}

/// Ask the authenticator to identify its model
///
/// `start_passkey_registration` requests no attestation, which is the privacy-preserving
/// default — but it also means the AAGUID is not reported, and the AAGUID is the only thing
/// that says whether a passkey lives in Windows Hello or on a YubiKey.
///
/// Nothing is verified against it: the attestation statement is parsed but no CA chain is
/// enforced, so this buys a name for the device list and no security property.
pub fn request_attestation(challenge: &mut CreationChallengeResponse) {
    challenge.public_key.attestation = Some(AttestationConveyancePreference::Direct);
}

/// Offsets into `authData`: rpIdHash(32) | flags(1) | signCount(4) | aaguid(16) | ...
const AAGUID_OFFSET: usize = 37;
/// Length of an AAGUID in bytes
const AAGUID_LEN: usize = 16;
/// `flags` bit marking that attested credential data — and with it the AAGUID — is present
const FLAG_ATTESTED_CREDENTIAL_DATA: u8 = 0b0100_0000;

/// The AAGUID the authenticator reported when the credential was created
///
/// Read out of the raw `authData` rather than the credential webauthn-rs returns: it only keeps
/// the AAGUID for packed and TPM attestation and drops it for the `none` format — which is what
/// every synchronised passkey provider (Google, Apple, 1Password) uses. The AAGUID is in
/// `authData` either way.
///
/// `None` when the authenticator sent no attested credential data, or the all-zero AAGUID that
/// platforms use when they would rather not identify the model.
pub fn registration_aaguid(registration: &RegisterPublicKeyCredential) -> Option<Uuid> {
    let attestation: serde_cbor_2::Value =
        serde_cbor_2::from_slice(registration.response.attestation_object.as_ref()).ok()?;

    let serde_cbor_2::Value::Map(map) = attestation else {
        return None;
    };
    let auth_data = map
        .get(&serde_cbor_2::Value::Text("authData".to_string()))
        .and_then(|value| match value {
            serde_cbor_2::Value::Bytes(bytes) => Some(bytes),
            _ => None,
        })?;

    // Without the flag the attested credential data is absent and the offsets below point at
    // whatever follows instead.
    let flags = auth_data.get(32)?;
    if flags & FLAG_ATTESTED_CREDENTIAL_DATA == 0 {
        return None;
    }

    let bytes: [u8; AAGUID_LEN] = auth_data
        .get(AAGUID_OFFSET..AAGUID_OFFSET + AAGUID_LEN)?
        .try_into()
        .ok()?;
    let aaguid = Uuid::from_bytes(bytes);
    (!aaguid.is_nil()).then_some(aaguid)
}

/// Name a freshly registered passkey after the authenticator that made it
///
/// Falls back to numbering when the AAGUID is missing or unknown — a security key that is not
/// in the list, or a platform that declines to identify itself.
pub fn passkey_label(aaguid: Option<Uuid>, existing: usize) -> MaxStr<255> {
    aaguid
        .and_then(authenticator_name)
        .and_then(|name| MaxStr::new(name.to_string()).ok())
        .unwrap_or_else(|| default_passkey_label(existing))
}

/// Auto-assigned device name for a passkey the user did not name
///
/// "Passkey N" (N counting the account's existing passkeys) is enough to tell devices apart.
pub fn default_passkey_label(existing: usize) -> MaxStr<255> {
    MaxStr::new(format!("Passkey {}", existing + 1))
        .unwrap_or_else(|_| unreachable!("short label fits"))
}

/// Extract the base64url credential id of a passkey
///
/// Generic over the form-error type so it composes with handlers that report typed errors.
pub fn credential_id_string<E>(cred_id: &CredentialID) -> ApiResult<MaxStr<1024>, E> {
    let value = serde_json::to_value(cred_id).map_err(ApiError::map_server_error(
        "Failed to serialize credential id",
    ))?;
    let string = value
        .as_str()
        .ok_or(ApiError::server_error("Credential id is not a string"))?;
    MaxStr::new(string.to_string()).map_err(|_| ApiError::server_error("Credential id too long"))
}

/// Setup for [`WebauthnModule`], the option must be filled
#[derive(Debug, Default)]
pub struct WebauthnSetup {
    /// The public origin the app is served from
    pub public_origin: Option<url::Url>,
}

impl Module for WebauthnModule {
    type Setup = WebauthnSetup;
    type PreInit = (Webauthn, url::Url);

    async fn pre_init(setup: Self::Setup) -> Result<Self::PreInit, PreInitError> {
        let origin = setup
            .public_origin
            .ok_or("public_origin must be set in WebauthnSetup")?;

        // Re-parse through webauthn-rs' url type to stay independent of
        // potential version skew between our `url` and webauthn's.
        let rp_origin = webauthn_rs::prelude::Url::parse(origin.as_str())
            .map_err(|e| format!("Invalid PUBLIC_ORIGIN: {e}"))?;
        let rp_id = rp_origin
            .host_str()
            .ok_or("PUBLIC_ORIGIN must contain a host")?
            .to_string();

        let webauthn = WebauthnBuilder::new(&rp_id, &rp_origin)
            .map_err(|e| format!("Invalid webauthn configuration: {e}"))?
            .rp_name("MTG")
            .build()
            .map_err(|e| format!("Failed to build webauthn: {e}"))?;

        Ok((webauthn, origin))
    }

    type Dependencies = ();

    async fn init(
        pre_init: Self::PreInit,
        _dependencies: &mut Self::Dependencies,
    ) -> Result<Self, InitError> {
        let (webauthn, public_origin) = pre_init;
        Ok(Self {
            webauthn,
            public_origin,
        })
    }
}

#[cfg(test)]
mod tests {
    use webauthn_rs::prelude::Base64UrlSafeData;
    use webauthn_rs_proto::AuthenticatorAttestationResponseRaw;
    use webauthn_rs_proto::RegisterPublicKeyCredential;

    use super::*;

    /// Build a registration whose `authData` carries the given aaguid
    fn registration(aaguid: [u8; 16], attested: bool) -> RegisterPublicKeyCredential {
        let mut auth_data = vec![0u8; 32]; // rpIdHash
        auth_data.push(if attested {
            FLAG_ATTESTED_CREDENTIAL_DATA
        } else {
            0
        });
        auth_data.extend_from_slice(&[0, 0, 0, 1]); // signCount
        auth_data.extend_from_slice(&aaguid);
        auth_data.extend_from_slice(&[0, 0]); // credentialIdLength

        let attestation = serde_cbor_2::Value::Map(
            [
                (
                    serde_cbor_2::Value::Text("fmt".into()),
                    serde_cbor_2::Value::Text("none".into()),
                ),
                (
                    serde_cbor_2::Value::Text("authData".into()),
                    serde_cbor_2::Value::Bytes(auth_data),
                ),
            ]
            .into_iter()
            .collect(),
        );

        RegisterPublicKeyCredential {
            id: String::new(),
            raw_id: Base64UrlSafeData::from(vec![]),
            type_: "public-key".into(),
            extensions: Default::default(),
            response: AuthenticatorAttestationResponseRaw {
                attestation_object: Base64UrlSafeData::from(
                    serde_cbor_2::to_vec(&attestation).unwrap(),
                ),
                client_data_json: Base64UrlSafeData::from(vec![]),
                transports: None,
            },
        }
    }

    #[test]
    fn reads_the_aaguid_from_auth_data() {
        let yubikey = Uuid::parse_str("ee882879-721c-4913-9775-3dfcce97072a").unwrap();
        let found = registration_aaguid(&registration(yubikey.into_bytes(), true));
        assert_eq!(found, Some(yubikey));
    }

    #[test]
    fn ignores_the_nil_aaguid() {
        assert_eq!(registration_aaguid(&registration([0; 16], true)), None);
    }

    #[test]
    fn ignores_registrations_without_attested_credential_data() {
        let yubikey = Uuid::parse_str("ee882879-721c-4913-9775-3dfcce97072a").unwrap();
        assert_eq!(
            registration_aaguid(&registration(yubikey.into_bytes(), false)),
            None
        );
    }

    #[test]
    fn survives_a_truncated_attestation_object() {
        let mut reg = registration([1; 16], true);
        reg.response.attestation_object = Base64UrlSafeData::from(vec![0xff, 0x00]);
        assert_eq!(registration_aaguid(&reg), None);
    }
}
