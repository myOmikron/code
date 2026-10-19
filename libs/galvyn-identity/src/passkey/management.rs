//! Passkeys outside of a ceremony

use galvyn::core::Module;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::db::executor::Executor;
use galvyn::rorm::fields::types::MaxStr;

use super::error::RemovalRefused;
use super::error::RemovePasskeyError;
use super::models::Passkey;
#[cfg(feature = "test-support")]
use super::models::PasskeyInsert;
use super::models::PasskeyUuid;
use crate::IdentityModule;
use crate::models::IdentityUuid;

impl IdentityModule {
    /// List an Identity's Passkeys, oldest Enrollment first
    pub async fn list_passkeys(
        &self,
        exe: impl Executor<'_>,
        identity: IdentityUuid,
    ) -> Result<Vec<Passkey>, rorm::Error> {
        Passkey::get_by_identity(exe, identity).await
    }

    /// Count an Identity's Passkeys
    pub async fn count_passkeys(
        &self,
        exe: impl Executor<'_>,
        identity: IdentityUuid,
    ) -> Result<u64, rorm::Error> {
        Passkey::count_by_identity(exe, identity).await
    }

    /// Change the Label of one of `identity`'s Passkeys
    ///
    /// Returns `false` if the Identity holds no Passkey with this uuid,
    /// which includes a Passkey of another Identity.
    pub async fn rename_passkey(
        &self,
        exe: impl Executor<'_>,
        identity: IdentityUuid,
        passkey: PasskeyUuid,
        label: MaxStr<255>,
    ) -> Result<bool, rorm::Error> {
        Passkey::set_label(exe, identity, passkey, label).await
    }

    /// Enroll a Passkey for `identity` without a ceremony
    ///
    /// Only for a service's tests, which have no authenticator to run one with.
    /// The Passkey cannot log in: its public key is no valid curve point.
    #[cfg(feature = "test-support")]
    pub async fn enroll_passkey_without_ceremony(
        &self,
        exe: impl Executor<'_>,
        identity: IdentityUuid,
        label: MaxStr<255>,
    ) -> Result<(), rorm::Error> {
        let zeros = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        let credential = serde_json::from_value(serde_json::json!({
            "cred": {
                "cred_id": "AAECAw",
                "cred": {
                    "type_": "ES256",
                    "key": { "EC_EC2": { "curve": "SECP256R1", "x": zeros, "y": zeros } },
                },
                "counter": 0,
                "transports": null,
                "user_verified": true,
                "backup_eligible": false,
                "backup_state": false,
                "registration_policy": "required",
                "extensions": {
                    "cred_protect": "NotRequested",
                    "hmac_create_secret": "NotRequested",
                    "appid": "NotRequested",
                    "cred_props": "Ignored",
                },
                "attestation": { "data": "None", "metadata": "None" },
                "attestation_format": "none",
            }
        }))
        .unwrap_or_else(|error| panic!("the fixture is a webauthn passkey: {error}"));
        Passkey::insert(
            exe,
            PasskeyInsert {
                identity,
                label,
                credential_id: MaxStr::new(uuid::Uuid::new_v4().to_string())
                    .unwrap_or_else(|_| unreachable!("a uuid fits")),
                credential,
            },
        )
        .await
    }

    /// Remove one of `identity`'s Passkeys
    ///
    /// Refuses the last one: with no Passkey left there is no way back in.
    /// A Passkey of another Identity reads as unknown.
    pub async fn remove_passkey(
        &self,
        identity: IdentityUuid,
        passkey: PasskeyUuid,
    ) -> Result<(), RemovePasskeyError> {
        let mut tx = Database::global().start_transaction().await?;

        let owned: Vec<PasskeyUuid> = Passkey::get_by_identity(&mut tx, identity)
            .await?
            .into_iter()
            .map(|passkey| passkey.uuid)
            .collect();
        if let Some(refused) = removal_refused(&owned, passkey) {
            tx.rollback().await?;
            return Err(RemovePasskeyError::Refused(refused));
        }

        Passkey::delete(&mut tx, passkey).await?;

        tx.commit().await?;
        Ok(())
    }
}

/// Why `passkey` must not be removed from an Identity owning `owned`, if at all
fn removal_refused(owned: &[PasskeyUuid], passkey: PasskeyUuid) -> Option<RemovalRefused> {
    let last_passkey = owned.len() <= 1;
    if !owned.contains(&passkey) {
        return Some(RemovalRefused::UnknownPasskey { last_passkey });
    }
    last_passkey.then_some(RemovalRefused::LastPasskey)
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;

    fn passkey(n: u128) -> PasskeyUuid {
        PasskeyUuid::new(Uuid::from_u128(n))
    }

    #[test]
    fn one_of_several_passkeys_may_be_removed() {
        assert_eq!(removal_refused(&[passkey(1), passkey(2)], passkey(2)), None);
    }

    #[test]
    fn the_last_passkey_is_refused() {
        assert_eq!(
            removal_refused(&[passkey(1)], passkey(1)),
            Some(RemovalRefused::LastPasskey)
        );
    }

    #[test]
    fn a_passkey_the_identity_does_not_own_is_unknown() {
        assert_eq!(
            removal_refused(&[passkey(1), passkey(2)], passkey(3)),
            Some(RemovalRefused::UnknownPasskey {
                last_passkey: false
            })
        );
    }

    #[test]
    fn an_unknown_passkey_also_reports_when_only_one_is_left() {
        assert_eq!(
            removal_refused(&[passkey(1)], passkey(3)),
            Some(RemovalRefused::UnknownPasskey { last_passkey: true })
        );
    }
}
