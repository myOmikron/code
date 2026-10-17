//! Passkeys outside of a ceremony

use galvyn::core::Module;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::db::executor::Executor;

use super::error::RemovalRefused;
use super::error::RemovePasskeyError;
use super::models::Passkey;
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
