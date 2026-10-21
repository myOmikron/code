//! Login: an OpenID provider vouching for a person

use galvyn::core::Module;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::session::Session;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use openidconnect::AuthenticationFlow;
use openidconnect::AuthorizationCode;
use openidconnect::ClaimsVerificationError;
use openidconnect::CsrfToken;
use openidconnect::Nonce;
use openidconnect::PkceCodeChallenge;
use openidconnect::PkceCodeVerifier;
use openidconnect::Scope;
use openidconnect::SignatureVerificationError;
use openidconnect::core::CoreIdTokenClaims;
use openidconnect::core::CoreResponseType;
use serde::Deserialize;
use tracing::warn;
use url::Url;

use super::OpenIdProvider;
use super::error::BeginOidcLoginError;
use super::error::BindError;
use super::error::FinishOidcLoginError;
use super::models::ExternalIdentity;
use super::models::ISSUER_SUBJECT_UNIQUE;
use super::provider::DiscoveredClient;
use super::provider::send;
use super::session;
use super::session::LoginState;
use super::session::Pending;
use crate::IdentityModule;
use crate::models::Identity;
use crate::models::IdentityUuid;
use crate::session::set_logged_in;

/// What the provider sends the browser back to the callback with
///
/// Deserializes from the callback's query.
#[derive(Debug, Clone, Deserialize)]
pub struct OidcCallback {
    /// The `state` the Login began with, if the provider kept it
    pub state: String,
    /// The authorization code, if the provider vouched for the person
    pub code: Option<String>,
    /// The provider's error code, if it did not
    pub error: Option<String>,
}

/// How a finished OIDC login ended
#[derive(Debug, Clone)]
pub enum OidcLoginOutcome {
    /// The External identity is bound to this Identity, now logged in
    LoggedIn(IdentityUuid),
    /// The External identity is unknown and now pending in the session
    ///
    /// Nothing is stored yet: the service creates its Account and binds the
    /// External identity to a fresh Identity in one transaction with
    /// [`IdentityModule::bind_pending_external_identity`].
    Pending(PendingExternalIdentity),
}

/// An unknown External identity, held in the session until it is bound or expires
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingExternalIdentity {
    /// The id of the provider that vouched for the person
    pub provider: String,
    /// The provider's issuer
    pub issuer: String,
    /// The email the provider stated, if any
    pub email: Option<String>,
    /// Whether the provider verified that email
    pub email_verified: bool,
}

/// The session's pending External identity, bound to a fresh Identity in the caller's transaction
///
/// Hand it to [`IdentityModule::log_in_bound`] once that transaction is committed.
#[derive(Debug)]
#[must_use = "the session is only logged in by `log_in_bound`"]
pub struct BoundExternalIdentity {
    /// The fresh Identity
    identity: IdentityUuid,
    /// Whether the session survives the browser session once logged in
    remember_me: bool,
}

impl BoundExternalIdentity {
    /// The fresh Identity, for the service's Account to reference
    pub fn identity(&self) -> IdentityUuid {
        self.identity
    }
}

impl IdentityModule {
    /// The OpenID providers people may log in through, in configuration order
    pub fn openid_providers(&self) -> &[OpenIdProvider] {
        &self.oidc.providers
    }

    /// Begin an OIDC login through the provider named `provider`
    ///
    /// Returns the provider's authorization url to send the browser to. The
    /// provider sends it back to the configured callback path, whose query
    /// goes to [`IdentityModule::finish_oidc_login`]. Starting a Login
    /// replaces any running one of the session.
    pub async fn begin_oidc_login(
        &self,
        session: &Session,
        provider: &str,
        remember_me: bool,
    ) -> Result<Url, BeginOidcLoginError> {
        let Some(provider) = self.oidc.get(provider) else {
            return Err(BeginOidcLoginError::UnknownProvider);
        };
        let client = self
            .discovered_client(provider, false)
            .await
            .ok_or(BeginOidcLoginError::ProviderUnavailable)?;

        let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
        let (url, csrf_state, nonce) = client
            .authorize_url(
                AuthenticationFlow::<CoreResponseType>::AuthorizationCode,
                CsrfToken::new_random,
                Nonce::new_random,
            )
            .add_scope(Scope::new("email".to_string()))
            .set_pkce_challenge(challenge)
            .url();

        session::start_login(
            session,
            LoginState {
                provider: provider.id().to_string(),
                csrf_state: csrf_state.into_secret(),
                nonce: nonce.secret().clone(),
                pkce_verifier: verifier.into_secret(),
                remember_me,
            },
        )
        .await?;

        Ok(url)
    }

    /// Finish the session's OIDC login with what the provider sent the browser back with
    ///
    /// Exchanges the code and checks the ID token's issuer, audience, expiry,
    /// nonce and signature. A known External identity logs its Identity in
    /// and keeps the session alive like a Passkey login with the
    /// `remember_me` the Login began with. An unknown one becomes the
    /// session's pending External identity, if the provider admits people on
    /// their first OIDC login.
    ///
    /// The running Login is used up either way.
    pub async fn finish_oidc_login(
        &self,
        session: &Session,
        callback: OidcCallback,
    ) -> Result<OidcLoginOutcome, FinishOidcLoginError> {
        let Some(state) = session::take_login(session).await? else {
            return Err(FinishOidcLoginError::NoLoginInProgress);
        };
        if CsrfToken::new(callback.state) != CsrfToken::new(state.csrf_state) {
            return Err(FinishOidcLoginError::StateMismatch);
        }
        if let Some(error) = callback.error {
            return Err(FinishOidcLoginError::Denied { error });
        }
        let Some(code) = callback.code else {
            return Err(FinishOidcLoginError::MissingCode);
        };
        let Some(provider) = self.oidc.get(&state.provider) else {
            return Err(FinishOidcLoginError::UnknownProvider);
        };

        let claims = self
            .exchange_code(
                provider,
                code,
                state.pkce_verifier,
                &Nonce::new(state.nonce),
            )
            .await?;
        let Ok(subject) = MaxStr::new(claims.subject().to_string()) else {
            return Err(FinishOidcLoginError::InvalidIdToken);
        };
        let external = ExternalIdentity {
            issuer: MaxStr::new(provider.issuer().to_string())
                .unwrap_or_else(|_| unreachable!("issuers are checked to fit at setup")),
            subject,
        };

        let mut tx = Database::global().start_transaction().await?;
        let Some(identity) = external.identity(&mut tx).await? else {
            tx.commit().await?;
            if !provider.admits_on_first_login() {
                return Err(FinishOidcLoginError::NotAdmitted);
            }
            let pending = Pending {
                provider: provider.id().to_string(),
                issuer: external.issuer.to_string(),
                subject: external.subject.to_string(),
                email: claims.email().map(|email| email.to_string()),
                email_verified: claims.email_verified().unwrap_or(false),
                remember_me: state.remember_me,
                finished_at: OffsetDateTime::now_utc().unix_timestamp(),
            };
            session::set_pending(session, pending.clone()).await?;
            return Ok(OidcLoginOutcome::Pending(pending.into()));
        };
        Identity::record_login(&mut tx, identity).await?;
        tx.commit().await?;

        session::forget_pending(session).await?;
        set_logged_in(session, identity).await?;
        session.set_expiry(Some(self.settings.login_expiry(state.remember_me)));

        Ok(OidcLoginOutcome::LoggedIn(identity))
    }

    /// The session's pending External identity, unless it expired
    pub async fn pending_external_identity(
        &self,
        session: &Session,
    ) -> Result<Option<PendingExternalIdentity>, tower_sessions::session::Error> {
        let pending = session::pending(session, OffsetDateTime::now_utc()).await?;
        Ok(pending.map(PendingExternalIdentity::from))
    }

    /// Drop the session's pending External identity, e.g. because the service refuses it
    pub async fn discard_pending_external_identity(
        &self,
        session: &Session,
    ) -> Result<(), tower_sessions::session::Error> {
        session::forget_pending(session).await
    }

    /// Bind the session's pending External identity to a fresh Identity in `tx`
    ///
    /// Called by the service inside the transaction that creates its Account
    /// for the returned Identity: rolling `tx` back leaves nothing behind and
    /// the External identity pending. After committing, hand the result to
    /// [`IdentityModule::log_in_bound`].
    pub async fn bind_pending_external_identity(
        &self,
        session: &Session,
        tx: &mut Transaction,
    ) -> Result<BoundExternalIdentity, BindError> {
        let Some(pending) = session::pending(session, OffsetDateTime::now_utc()).await? else {
            return Err(BindError::NothingPending);
        };
        let (Ok(issuer), Ok(subject)) = (MaxStr::new(pending.issuer), MaxStr::new(pending.subject))
        else {
            return Err(BindError::NothingPending);
        };
        let external = ExternalIdentity { issuer, subject };

        let identity = Identity::insert(&mut *tx).await?;
        Identity::record_login(&mut *tx, identity).await?;
        external.insert(&mut *tx, identity).await.map_err(|error| {
            if unique_violation(&error) {
                BindError::AlreadyBound
            } else {
                BindError::Internal(error.into())
            }
        })?;

        Ok(BoundExternalIdentity {
            identity,
            remember_me: pending.remember_me,
        })
    }

    /// Log the session in as the Identity its pending External identity got bound to
    ///
    /// Only call it once the transaction given to
    /// [`IdentityModule::bind_pending_external_identity`] is committed.
    pub async fn log_in_bound(
        &self,
        session: &Session,
        bound: BoundExternalIdentity,
    ) -> Result<(), tower_sessions::session::Error> {
        session::forget_pending(session).await?;
        set_logged_in(session, bound.identity).await?;
        session.set_expiry(Some(self.settings.login_expiry(bound.remember_me)));
        Ok(())
    }

    /// A client for `provider`, or `None` if it cannot be discovered
    async fn discovered_client(
        &self,
        provider: &OpenIdProvider,
        refresh: bool,
    ) -> Option<DiscoveredClient> {
        self.oidc
            .client(provider, refresh)
            .await
            .inspect_err(|error| warn!(provider = provider.id(), "{}", error.0))
            .ok()
    }

    /// Exchange `code` at `provider` and check the ID token it answers with
    ///
    /// An ID token signed by a key the last discovery did not list is checked
    /// once more against a fresh discovery: the provider may have rotated its keys.
    async fn exchange_code(
        &self,
        provider: &OpenIdProvider,
        code: String,
        verifier: String,
        nonce: &Nonce,
    ) -> Result<CoreIdTokenClaims, FinishOidcLoginError> {
        let client = self
            .discovered_client(provider, false)
            .await
            .ok_or(FinishOidcLoginError::ProviderUnavailable)?;
        let http = self.oidc.http();
        let Ok(request) = client.exchange_code(AuthorizationCode::new(code)) else {
            return Err(FinishOidcLoginError::TokenExchangeFailed);
        };
        let response = request
            .set_pkce_verifier(PkceCodeVerifier::new(verifier))
            .request_async(&move |request| send(http.clone(), request))
            .await
            .map_err(|error| {
                warn!(provider = provider.id(), "code exchange failed: {error}");
                FinishOidcLoginError::TokenExchangeFailed
            })?;
        let Some(id_token) = response.extra_fields().id_token() else {
            return Err(FinishOidcLoginError::InvalidIdToken);
        };

        match id_token.claims(&client.id_token_verifier(), nonce) {
            Ok(claims) => return Ok(claims.clone()),
            Err(ClaimsVerificationError::SignatureVerification(
                SignatureVerificationError::NoMatchingKey,
            )) => {}
            Err(_) => return Err(FinishOidcLoginError::InvalidIdToken),
        }

        let client = self
            .discovered_client(provider, true)
            .await
            .ok_or(FinishOidcLoginError::ProviderUnavailable)?;
        id_token
            .claims(&client.id_token_verifier(), nonce)
            .cloned()
            .map_err(|_| FinishOidcLoginError::InvalidIdToken)
    }
}

/// Whether `error` is a clash on an External identity's issuer and subject
pub(super) fn unique_violation(error: &rorm::Error) -> bool {
    match error {
        rorm::Error::SqlxError(error) => error.as_database_error().is_some_and(|error| {
            error.is_unique_violation() && error.constraint() == Some(ISSUER_SUBJECT_UNIQUE)
        }),
        _ => false,
    }
}

impl From<Pending> for PendingExternalIdentity {
    fn from(value: Pending) -> Self {
        Self {
            provider: value.provider,
            issuer: value.issuer,
            email: value.email,
            email_verified: value.email_verified,
        }
    }
}
