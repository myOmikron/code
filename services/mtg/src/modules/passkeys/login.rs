//! Login: proving control of one of an Identity's Passkeys

use galvyn::core::Module;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::core::CoreApiError;
use galvyn::rorm::Database;
use tower_sessions::Expiry;
use webauthn_rs::prelude::Passkey as WebauthnPasskey;
use webauthn_rs::prelude::PublicKeyCredential;

use super::Passkeys;
use super::ceremony::credential_id_string;
use super::error::BeginLoginError;
use super::error::FinishLoginError;
use super::models::Identity;
use super::models::IdentityUuid;
use super::models::Passkey;
use super::session;

impl Passkeys {
    /// Begin a Login for `identity`
    ///
    /// The service resolves whatever the person typed (a username) to the
    /// Identity itself. The Identity's Passkeys are sent as the credential
    /// allow-list. Returns the challenge for `navigator.credentials.get`.
    pub async fn begin_login(
        &self,
        session: &Session,
        identity: IdentityUuid,
    ) -> Result<serde_json::Value, BeginLoginError> {
        let passkeys: Vec<WebauthnPasskey> = Passkey::get_by_identity(Database::global(), identity)
            .await?
            .into_iter()
            .map(|passkey| passkey.credential)
            .collect();
        if passkeys.is_empty() {
            return Err(BeginLoginError::NoPasskey);
        }

        let (challenge, state) = self
            .webauthn
            .start_passkey_authentication(&passkeys)
            .map_err(CoreApiError::map_server_error(
                "Failed to start authentication",
            ))?;

        session::start_login(session, state, identity).await?;

        Ok(
            serde_json::to_value(challenge).map_err(CoreApiError::map_server_error(
                "Failed to serialize challenge",
            ))?,
        )
    }

    /// Finish the session's Login with the authenticator's response
    ///
    /// Updates the used Passkey and the Identity's last login, logs the
    /// session in and keeps it alive for the configured remember-me duration
    /// of inactivity, or until the browser session ends without `remember_me`.
    ///
    /// The used Passkey is found by its stored credential id rather than by
    /// the credential blob beside it, so the row is found even where the two
    /// have drifted apart. Its signature counter and backup state are what let
    /// a cloned authenticator be spotted later, and its last-used time is
    /// stamped even though most authenticators keep their counter at zero.
    pub async fn finish_login(
        &self,
        session: &Session,
        credential: serde_json::Value,
        remember_me: bool,
    ) -> Result<IdentityUuid, FinishLoginError> {
        let Some((state, identity)) = session::take_login(session).await? else {
            return Err(FinishLoginError::NoLoginInProgress);
        };

        let Ok(credential) = serde_json::from_value::<PublicKeyCredential>(credential) else {
            return Err(FinishLoginError::MalformedCredential);
        };

        let Ok(result) = self
            .webauthn
            .finish_passkey_authentication(&credential, &state)
        else {
            return Err(FinishLoginError::VerificationFailed);
        };

        let used = credential_id_string(result.cred_id())
            .ok_or(CoreApiError::server_error("Unreadable credential id"))?;

        let mut tx = Database::global().start_transaction().await?;

        let Some(identity) = Identity::get_by_uuid(&mut tx, identity).await? else {
            tx.rollback().await?;
            return Err(FinishLoginError::UnknownIdentity);
        };
        let identity = identity.uuid;

        for passkey in Passkey::get_by_identity(&mut tx, identity).await? {
            if passkey.credential_id != used {
                continue;
            }
            let mut credential = passkey.credential.clone();
            credential.update_credential(&result);
            Passkey::update_credential(&mut tx, passkey.uuid, credential).await?;
            break;
        }

        Identity::record_login(&mut tx, identity).await?;
        tx.commit().await?;

        session::set_logged_in(session, identity).await?;
        session.set_expiry(Some(if remember_me {
            Expiry::OnInactivity(self.settings.remember_me)
        } else {
            Expiry::OnSessionEnd
        }));

        Ok(identity)
    }
}
