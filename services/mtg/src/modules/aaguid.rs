//! Naming a passkey after the authenticator that created it
//!
//! Every authenticator reports an AAGUID identifying its model. Resolving it against a list of
//! known products turns "Passkey 2" into "Windows Hello", which is what lets someone tell their
//! devices apart in the passkey list.
//!
//! The list is vendored (`aaguid.json`, refreshed with `just update-aaguids`) rather than fetched
//! at runtime: it changes a few times a year and a failed download must not break registration.
//! It merges FIDO MDS3 (certified hardware keys) with the passkeydeveloper community list
//! (software credential managers) — neither covers the other's ground.

use std::collections::HashMap;
use std::sync::LazyLock;

use uuid::Uuid;

/// AAGUID to product name, as shipped in `aaguid.json`
static NAMES: LazyLock<HashMap<Uuid, &'static str>> = LazyLock::new(|| {
    let raw: HashMap<&str, &str> = serde_json::from_str(include_str!("../../aaguid.json"))
        .expect("aaguid.json is malformed, this is a build-time error");
    raw.into_iter()
        .filter_map(|(aaguid, name)| Uuid::parse_str(aaguid).ok().map(|uuid| (uuid, name)))
        .collect()
});

/// The product name of an authenticator, if its AAGUID is one we know
///
/// Unknown is the normal case for a security key that is not in the list, and for authenticators
/// that report the all-zero AAGUID — which platforms do whenever they would rather not identify
/// the model.
pub fn authenticator_name(aaguid: Uuid) -> Option<&'static str> {
    if aaguid.is_nil() {
        return None;
    }
    NAMES.get(&aaguid).copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_a_software_passkey_provider() {
        let google = Uuid::parse_str("ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4").unwrap();
        assert_eq!(authenticator_name(google), Some("Google Password Manager"));
    }

    #[test]
    fn resolves_a_hardware_key() {
        // Only in FIDO MDS3, not in the community list — this is what the merge buys.
        let yubikey = Uuid::parse_str("ee882879-721c-4913-9775-3dfcce97072a").unwrap();
        assert_eq!(authenticator_name(yubikey), Some("YubiKey 5 Series"));
    }

    #[test]
    fn unknown_and_nil_resolve_to_nothing() {
        assert_eq!(authenticator_name(Uuid::nil()), None);
        let unknown = Uuid::parse_str("ffffffff-ffff-ffff-ffff-ffffffffffff").unwrap();
        assert_eq!(authenticator_name(unknown), None);
    }
}
