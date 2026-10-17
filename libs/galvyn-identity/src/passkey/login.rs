//! Login: proving control of one of an Identity's Passkeys

use galvyn::core::Module;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::core::CoreApiError;
use galvyn::rorm::Database;
use webauthn_rs::prelude::Passkey as WebauthnPasskey;
use webauthn_rs::prelude::PublicKeyCredential;

use super::ceremony::challenge_json;
use super::ceremony::credential_id_string;
use super::error::BeginLoginError;
use super::error::FinishLoginError;
use super::models::Passkey;
use super::session;
use crate::IdentityModule;
use crate::models::Identity;
use crate::models::IdentityUuid;
use crate::session::set_logged_in;

impl IdentityModule {
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

        Ok(challenge_json(challenge)?)
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
    /// Without such a Passkey of the Identity nobody is logged in.
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

        let used = credential_id_string(result.cred_id())?;

        let mut tx = Database::global().start_transaction().await?;

        let Some(identity) = Identity::get_by_uuid(&mut tx, identity).await? else {
            tx.rollback().await?;
            return Err(FinishLoginError::UnknownIdentity);
        };
        let identity = identity.uuid;

        let Some(passkey) = Passkey::get_by_identity(&mut tx, identity)
            .await?
            .into_iter()
            .find(|passkey| passkey.credential_id == used)
        else {
            tx.rollback().await?;
            return Err(FinishLoginError::UnknownPasskey);
        };
        let mut updated = passkey.credential;
        updated.update_credential(&result);
        Passkey::update_credential(&mut tx, passkey.uuid, updated).await?;

        Identity::record_login(&mut tx, identity).await?;
        tx.commit().await?;

        set_logged_in(session, identity).await?;
        session.set_expiry(Some(self.settings.login_expiry(remember_me)));

        Ok(identity)
    }
}
