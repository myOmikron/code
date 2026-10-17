//! Adjustments to the WebAuthn ceremonies and reading their results

use galvyn::core::stuff::api_error::core::CoreApiError;
use galvyn::rorm::fields::types::MaxStr;
use serde::Serialize;
use uuid::Uuid;
use webauthn_rs::prelude::CreationChallengeResponse;
use webauthn_rs::prelude::CredentialID;
use webauthn_rs::prelude::RegisterPublicKeyCredential;
use webauthn_rs_proto::AttestationConveyancePreference;
use webauthn_rs_proto::ResidentKeyRequirement;

use super::aaguid::authenticator_name;

/// Ask the authenticator to store the credential as discoverable
///
/// `start_passkey_registration` requests `residentKey: discouraged`, which leaves
/// discoverability to the authenticator's discretion. A non-discoverable credential is bound to
/// the device that made it: no syncing through iCloud Keychain, Google Password Manager or the
/// Windows passkey store, and it never shows up in their passkey managers.
///
/// `Required` rather than `Preferred` on webauthn-rs' own advice: the two behave identically in
/// every major browser, so the weaker wording only obscures the intent. `require_resident_key`
/// is the pre-webauthn-2 spelling of the same request, which clients still read.
pub(super) fn require_discoverable_credential(challenge: &mut CreationChallengeResponse) {
    let Some(selection) = challenge.public_key.authenticator_selection.as_mut() else {
        return;
    };
    selection.resident_key = Some(ResidentKeyRequirement::Required);
    selection.require_resident_key = true;
}

/// Ask the authenticator to identify its model
///
/// `start_passkey_registration` requests no attestation, which is the privacy-preserving
/// default. But it also means the AAGUID is not reported, and the AAGUID is the only thing
/// that says whether a passkey lives in Windows Hello or on a YubiKey.
///
/// Nothing is verified against it: the attestation statement is parsed but no CA chain is
/// enforced, so this buys a name for the device list and no security property.
pub(super) fn request_attestation(challenge: &mut CreationChallengeResponse) {
    challenge.public_key.attestation = Some(AttestationConveyancePreference::Direct);
}

/// Offsets into `authData`: rpIdHash(32) | flags(1) | signCount(4) | aaguid(16) | ...
const AAGUID_OFFSET: usize = 37;
/// Length of an AAGUID in bytes
const AAGUID_LEN: usize = 16;
/// Index of the `flags` byte in `authData`
const FLAGS_OFFSET: usize = 32;
/// `flags` bit marking that attested credential data, and with it the AAGUID, is present
///
/// Without it the offsets above point at whatever follows instead.
const FLAG_ATTESTED_CREDENTIAL_DATA: u8 = 0b0100_0000;

/// The AAGUID the authenticator reported when the credential was created
///
/// Read out of the raw `authData` rather than the credential webauthn-rs returns: it only keeps
/// the AAGUID for packed and TPM attestation and drops it for the `none` format, which is what
/// every synchronised passkey provider (Google, Apple, 1Password) uses. The AAGUID is in
/// `authData` either way.
///
/// `None` when the authenticator sent no attested credential data, or the all-zero AAGUID that
/// platforms use when they would rather not identify the model.
pub(super) fn registration_aaguid(registration: &RegisterPublicKeyCredential) -> Option<Uuid> {
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

    let flags = auth_data.get(FLAGS_OFFSET)?;
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

/// The label a freshly enrolled Passkey is stored with
///
/// A label the person asked for wins. Otherwise the Passkey is named after the authenticator
/// that made it, falling back to numbering when the AAGUID is missing or unknown: a security
/// key that is not in the list, or a platform that declines to identify itself. "Passkey N"
/// (N counting the Identity's existing Passkeys) is enough to tell devices apart.
pub(super) fn choose_label(
    requested: Option<MaxStr<255>>,
    aaguid: Option<Uuid>,
    existing: usize,
) -> MaxStr<255> {
    requested
        .or_else(|| {
            aaguid
                .and_then(authenticator_name)
                .and_then(|name| MaxStr::new(name.to_string()).ok())
        })
        .unwrap_or_else(|| {
            MaxStr::new(format!("Passkey {}", existing + 1))
                .unwrap_or_else(|_| unreachable!("short label fits"))
        })
}

/// The base64url credential id of a passkey
///
/// Fails if webauthn-rs ever stops serializing it as a string, or it outgrows the column.
pub(super) fn credential_id_string(cred_id: &CredentialID) -> Result<MaxStr<1024>, CoreApiError> {
    serde_json::to_value(cred_id)
        .ok()
        .and_then(|value| MaxStr::new(value.as_str()?.to_string()).ok())
        .ok_or(CoreApiError::server_error("Unreadable credential id"))
}

/// A ceremony's challenge as the JSON handed to the browser
pub(super) fn challenge_json(challenge: impl Serialize) -> Result<serde_json::Value, CoreApiError> {
    serde_json::to_value(challenge).map_err(CoreApiError::map_server_error(
        "Failed to serialize challenge",
    ))
}

#[cfg(test)]
mod tests {
    use webauthn_rs::prelude::Base64UrlSafeData;
    use webauthn_rs_proto::AuthenticatorAttestationResponseRaw;
    use webauthn_rs_proto::RegisterPublicKeyCredential;

    use super::*;

    const YUBIKEY: &str = "ee882879-721c-4913-9775-3dfcce97072a";

    /// Build a registration whose `authData` carries the given aaguid
    fn registration(aaguid: [u8; 16], attested: bool) -> RegisterPublicKeyCredential {
        let rp_id_hash = [0u8; 32];
        let flags = if attested {
            FLAG_ATTESTED_CREDENTIAL_DATA
        } else {
            0
        };
        let sign_count = [0, 0, 0, 1];
        let credential_id_length = [0, 0];

        let mut auth_data = rp_id_hash.to_vec();
        auth_data.push(flags);
        auth_data.extend_from_slice(&sign_count);
        auth_data.extend_from_slice(&aaguid);
        auth_data.extend_from_slice(&credential_id_length);

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
        let yubikey = Uuid::parse_str(YUBIKEY).unwrap();
        let found = registration_aaguid(&registration(yubikey.into_bytes(), true));
        assert_eq!(found, Some(yubikey));
    }

    #[test]
    fn ignores_the_nil_aaguid() {
        assert_eq!(registration_aaguid(&registration([0; 16], true)), None);
    }

    #[test]
    fn ignores_registrations_without_attested_credential_data() {
        let yubikey = Uuid::parse_str(YUBIKEY).unwrap();
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

    #[test]
    fn a_known_authenticator_names_the_passkey() {
        let yubikey = Uuid::parse_str(YUBIKEY).unwrap();
        assert_eq!(&*choose_label(None, Some(yubikey), 2), "YubiKey 5 Series");
    }

    #[test]
    fn an_unknown_or_missing_authenticator_gets_the_numbered_default() {
        let unknown = Uuid::parse_str("ffffffff-ffff-ffff-ffff-ffffffffffff").unwrap();
        assert_eq!(&*choose_label(None, Some(unknown), 0), "Passkey 1");
        assert_eq!(&*choose_label(None, None, 2), "Passkey 3");
    }

    #[test]
    fn a_requested_label_wins_over_the_authenticator_name() {
        let yubikey = Uuid::parse_str(YUBIKEY).unwrap();
        let requested = MaxStr::new("Work laptop".to_string()).unwrap();
        assert_eq!(
            &*choose_label(Some(requested), Some(yubikey), 0),
            "Work laptop"
        );
    }
}
