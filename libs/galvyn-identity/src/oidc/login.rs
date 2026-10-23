//! Login: an OpenID provider vouching for a person

use galvyn::core::Module;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::core::CoreApiError;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use openidconnect::AccessTokenHash;
use openidconnect::AuthenticationFlow;
use openidconnect::AuthorizationCode;
use openidconnect::ClaimsVerificationError;
use openidconnect::CsrfToken;
use openidconnect::Nonce;
use openidconnect::OAuth2TokenResponse;
use openidconnect::PkceCodeChallenge;
use openidconnect::PkceCodeVerifier;
use openidconnect::Scope;
use openidconnect::SignatureVerificationError;
use openidconnect::core::CoreIdToken;
use openidconnect::core::CoreResponseType;
use openidconnect::core::CoreTokenResponse;
use serde::Deserialize;
use serde_json::Map;
use serde_json::Value;
use tracing::warn;
use url::Url;

use super::AdmissionHook;
use super::ExternalClaims;
use super::FirstLoginDecision;
use super::OpenAdmission;
use super::claims::claims;
use super::claims::identifying_value;
use super::error::BeginOidcLoginError;
use super::error::BindError;
use super::error::FinishOidcLoginError;
use super::models::ExternalIdentity;
use super::models::PROVIDER_VALUE_UNIQUE;
use super::provider::Admission;
use super::provider::DiscoveredClient;
use super::provider::OpenIdProvider;
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
#[derive(Debug)]
pub enum OidcLoginOutcome {
    /// The External identity is bound to an Identity, not logged in yet
    ///
    /// The service decides whether that Identity may log in, e.g. that its
    /// Account is not locked, and then hands it to
    /// [`IdentityModule::log_in_bound`].
    Known(BoundExternalIdentity),
    /// The External identity is unknown and now pending in the session
    ///
    /// Only with [`OpenAdmission::PendingInSession`]. Nothing is stored yet:
    /// the service creates its Account and binds the External identity to a
    /// fresh Identity in one transaction with
    /// [`IdentityModule::bind_pending_external_identity`].
    Pending(PendingExternalIdentity),
    /// The External identity was unknown, and the service's [`AdmissionHook`]
    /// created its Account
    ///
    /// Only with [`OpenAdmission::Hook`]. Everything is committed; hand it to
    /// [`IdentityModule::log_in_bound`] to log in.
    Admitted(BoundExternalIdentity),
}

/// An unknown External identity, held in the session until it is bound or expires
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingExternalIdentity {
    /// The slug of the provider that vouched for the person
    pub provider: String,
    /// The provider's issuer
    pub issuer: String,
    /// The email the provider stated, if any
    pub email: Option<String>,
    /// Whether the provider verified that email
    pub email_verified: bool,
}

/// An External identity bound to an Identity the session is not logged in as yet
///
/// A known one or a freshly admitted one, from
/// [`IdentityModule::finish_oidc_login`], or the session's pending one,
/// bound to a fresh Identity in the caller's transaction by
/// [`IdentityModule::bind_pending_external_identity`]. Hand it to
/// [`IdentityModule::log_in_bound`] to log in, once that transaction is
/// committed.
#[derive(Debug)]
#[must_use = "the session is only logged in by `log_in_bound`"]
pub struct BoundExternalIdentity {
    /// The Identity
    identity: IdentityUuid,
    /// Whether the session survives the browser session once logged in
    remember_me: bool,
}

impl BoundExternalIdentity {
    /// The Identity, for the service to find its Account by
    pub fn identity(&self) -> IdentityUuid {
        self.identity
    }
}

impl IdentityModule {
    /// Begin an OIDC login through the provider named `provider`
    ///
    /// Returns the provider's authorization url to send the browser to. The
    /// provider sends it back to the callback path followed by its slug, whose
    /// query goes to [`IdentityModule::finish_oidc_login`]. Starting a Login
    /// replaces any running one of the session.
    pub async fn begin_oidc_login(
        &self,
        session: &Session,
        provider: &str,
        remember_me: bool,
    ) -> Result<Url, BeginOidcLoginError> {
        let Some(provider) = self.provider_by_slug(provider).await? else {
            return Err(BeginOidcLoginError::UnknownProvider);
        };
        let (client, _) = self
            .discovered_client(&provider, false)
            .await?
            .ok_or(BeginOidcLoginError::ProviderUnavailable)?;

        let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
        let (url, csrf_state, nonce) = client
            .authorize_url(
                AuthenticationFlow::<CoreResponseType>::AuthorizationCode,
                CsrfToken::new_random,
                Nonce::new_random,
            )
            .add_scope(Scope::new("profile".to_string()))
            .add_scope(Scope::new("email".to_string()))
            .set_pkce_challenge(challenge)
            .url();

        session::start_login(
            session,
            LoginState {
                provider: provider.slug().to_string(),
                csrf_state: csrf_state.into_secret(),
                nonce: nonce.secret().clone(),
                pkce_verifier: verifier.into_secret(),
                remember_me,
            },
        )
        .await?;

        Ok(url)
    }

    /// Finish the session's OIDC login with what `provider` sent the browser back with
    ///
    /// `provider` is the slug the callback path ends with. Exchanges the code
    /// and checks the ID token's issuer, audience, expiry, nonce, signature
    /// and `at_hash`. A known External identity comes back for the service to
    /// log in with [`IdentityModule::log_in_bound`]: nothing is logged in or
    /// recorded before. An unknown one is refused by an invite-only provider
    /// and admitted by an open one as [`OpenAdmission`] says.
    ///
    /// The running Login is used up either way.
    pub async fn finish_oidc_login(
        &self,
        session: &Session,
        provider: &str,
        callback: OidcCallback,
    ) -> Result<OidcLoginOutcome, FinishOidcLoginError> {
        let Some(state) = session::take_login(session).await? else {
            return Err(FinishOidcLoginError::NoLoginInProgress);
        };
        if CsrfToken::new(callback.state) != CsrfToken::new(state.csrf_state)
            || provider != state.provider
        {
            return Err(FinishOidcLoginError::StateMismatch);
        }
        if let Some(error) = callback.error {
            return Err(FinishOidcLoginError::Denied { error });
        }
        let Some(code) = callback.code else {
            return Err(FinishOidcLoginError::MissingCode);
        };
        let Some(provider) = self.provider_by_slug(&state.provider).await? else {
            return Err(FinishOidcLoginError::UnknownProvider);
        };

        let (claims, issuer) = self
            .exchange_code(
                &provider,
                code,
                state.pkce_verifier,
                &Nonce::new(state.nonce),
            )
            .await?;
        let value = identifying_value(&claims, provider.identifying_claim())
            .and_then(|value| MaxStr::new(value).ok())
            .ok_or(FinishOidcLoginError::MissingIdentifyingClaim)?;
        let external = ExternalIdentity {
            provider: provider.uuid,
            issuer,
            value,
        };

        let mut tx = Database::global().start_transaction().await?;
        let identity = external.identity(&mut tx).await?;
        tx.commit().await?;
        if let Some(identity) = identity {
            return Ok(OidcLoginOutcome::Known(BoundExternalIdentity {
                identity,
                remember_me: state.remember_me,
            }));
        }
        if provider.admission() == Admission::InviteOnly {
            return Err(FinishOidcLoginError::NotAdmitted);
        }

        let claims = ExternalClaims {
            provider: provider.slug().to_string(),
            issuer: external.issuer.to_string(),
            value: external.value.to_string(),
            email: claims
                .get("email")
                .and_then(Value::as_str)
                .map(str::to_string),
            email_verified: email_verified(&claims),
            claims,
        };
        match &self.oidc.open_admission {
            OpenAdmission::PendingInSession => {
                let pending = Pending {
                    provider: claims.provider,
                    issuer: claims.issuer,
                    value: claims.value,
                    email: claims.email,
                    email_verified: claims.email_verified,
                    remember_me: state.remember_me,
                    finished_at: OffsetDateTime::now_utc().unix_timestamp(),
                };
                session::set_pending(session, pending.clone()).await?;
                Ok(OidcLoginOutcome::Pending(pending.into()))
            }
            OpenAdmission::Hook(hook) => {
                let identity = admit(&**hook, &external, &claims).await?;
                Ok(OidcLoginOutcome::Admitted(BoundExternalIdentity {
                    identity,
                    remember_me: state.remember_me,
                }))
            }
        }
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
        let (Ok(issuer), Ok(value)) = (MaxStr::new(pending.issuer), MaxStr::new(pending.value))
        else {
            return Err(BindError::NothingPending);
        };
        let Some(provider) = OpenIdProvider::get_by_slug(&mut *tx, &pending.provider).await? else {
            return Err(BindError::NothingPending);
        };
        let external = ExternalIdentity {
            provider: provider.uuid,
            issuer,
            value,
        };

        let identity = Identity::insert(&mut *tx).await?;
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

    /// Log the session in as the Identity an External identity is bound to
    ///
    /// Records the login and keeps the session alive like a Passkey login,
    /// with the `remember_me` the Login began with. Only call it once the
    /// transaction given to [`IdentityModule::bind_pending_external_identity`]
    /// is committed.
    pub async fn log_in_bound(
        &self,
        session: &Session,
        bound: BoundExternalIdentity,
    ) -> Result<(), CoreApiError> {
        Identity::record_login(Database::global(), bound.identity).await?;
        session::forget_pending(session).await?;
        set_logged_in(session, bound.identity).await?;
        session.set_expiry(Some(self.settings.login_expiry(bound.remember_me)));
        Ok(())
    }

    /// The provider named `slug`, if there is one and OIDC login is on
    async fn provider_by_slug(&self, slug: &str) -> Result<Option<OpenIdProvider>, CoreApiError> {
        if !self.oidc.enabled() {
            return Ok(None);
        }
        let mut tx = Database::global().start_transaction().await?;
        let provider = self.openid_provider(&mut tx, slug).await?;
        tx.commit().await?;
        Ok(provider)
    }

    /// A client for `provider` with its issuer, or `None` if it cannot be discovered
    ///
    /// The issuer of a provider's first discovery is stored for it.
    async fn discovered_client(
        &self,
        provider: &OpenIdProvider,
        refresh: bool,
    ) -> Result<Option<(DiscoveredClient, MaxStr<255>)>, rorm::Error> {
        let discovered = self
            .oidc
            .client(provider, refresh)
            .await
            .inspect_err(|error| warn!(provider = provider.slug(), "{}", error.0))
            .ok();
        let Some((client, issuer)) = discovered else {
            return Ok(None);
        };
        let Ok(issuer) = MaxStr::new(issuer) else {
            warn!(
                provider = provider.slug(),
                "the issuer is longer than 255 bytes"
            );
            return Ok(None);
        };
        if provider.issuer.is_none() {
            OpenIdProvider::store_issuer(Database::global(), provider.uuid, issuer.clone()).await?;
        }
        Ok(Some((client, issuer)))
    }

    /// Exchange `code` at `provider` and check the ID token it answers with
    ///
    /// Returns the token's claims and the issuer they were checked against.
    /// An ID token signed by a key the last discovery did not list is checked
    /// once more against a fresh discovery: the provider may have rotated its keys.
    async fn exchange_code(
        &self,
        provider: &OpenIdProvider,
        code: String,
        verifier: String,
        nonce: &Nonce,
    ) -> Result<(Map<String, Value>, MaxStr<255>), FinishOidcLoginError> {
        let (client, issuer) = self
            .discovered_client(provider, false)
            .await?
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
                warn!(provider = provider.slug(), "code exchange failed: {error}");
                FinishOidcLoginError::TokenExchangeFailed
            })?;
        let Some(id_token) = response.extra_fields().id_token() else {
            return Err(FinishOidcLoginError::InvalidIdToken);
        };

        match verify(&client, id_token, &response, nonce) {
            Ok(claims) => return Ok((claims, issuer)),
            Err(Unverified::UnknownKey) => {}
            Err(Unverified::Invalid) => return Err(FinishOidcLoginError::InvalidIdToken),
        }

        let (client, issuer) = self
            .discovered_client(provider, true)
            .await?
            .ok_or(FinishOidcLoginError::ProviderUnavailable)?;
        verify(&client, id_token, &response, nonce)
            .map(|claims| (claims, issuer))
            .map_err(|_| FinishOidcLoginError::InvalidIdToken)
    }
}

/// Why an ID token did not check out
enum Unverified {
    /// It is signed by a key the discovery does not list
    UnknownKey,
    /// Anything else is wrong with it
    Invalid,
}

/// The claims of `id_token`, checked against `client` and `nonce`, and its
/// `at_hash` against the access token of `response`
fn verify(
    client: &DiscoveredClient,
    id_token: &CoreIdToken,
    response: &CoreTokenResponse,
    nonce: &Nonce,
) -> Result<Map<String, Value>, Unverified> {
    let verifier = client.id_token_verifier();
    let checked = match id_token.claims(&verifier, nonce) {
        Ok(checked) => checked,
        Err(ClaimsVerificationError::SignatureVerification(
            SignatureVerificationError::NoMatchingKey,
        )) => return Err(Unverified::UnknownKey),
        Err(_) => return Err(Unverified::Invalid),
    };
    if let Some(expected) = checked.access_token_hash() {
        let alg = id_token.signing_alg().map_err(|_| Unverified::Invalid)?;
        let key = id_token
            .signing_key(&verifier)
            .map_err(|_| Unverified::Invalid)?;
        let actual = AccessTokenHash::from_token(response.access_token(), alg, key)
            .map_err(|_| Unverified::Invalid)?;
        if actual != *expected {
            return Err(Unverified::Invalid);
        }
    }
    claims(&id_token.to_string()).ok_or(Unverified::Invalid)
}

/// Whether the claims state their email as verified
///
/// Some providers send the flag as a string.
fn email_verified(claims: &Map<String, Value>) -> bool {
    match claims.get("email_verified") {
        Some(Value::Bool(verified)) => *verified,
        Some(Value::String(verified)) => verified == "true",
        _ => false,
    }
}

/// Bind `external` to a fresh Identity and let `hook` create its Account, in one transaction
///
/// A decline or a failing hook leaves nothing behind.
async fn admit(
    hook: &dyn AdmissionHook,
    external: &ExternalIdentity,
    claims: &ExternalClaims,
) -> Result<IdentityUuid, FinishOidcLoginError> {
    let mut tx = Database::global().start_transaction().await?;
    let identity = Identity::insert(&mut tx).await?;
    external.insert(&mut tx, identity).await?;
    match hook.admit(&mut tx, identity, claims).await {
        Ok(FirstLoginDecision::Admit) => {
            tx.commit().await?;
            Ok(identity)
        }
        Ok(FirstLoginDecision::Decline) => {
            tx.rollback().await?;
            Err(FinishOidcLoginError::Declined)
        }
        Err(error) => {
            tx.rollback().await?;
            Err(FinishOidcLoginError::Internal(error))
        }
    }
}

/// Whether `error` is a clash on an External identity's provider and value
pub(super) fn unique_violation(error: &rorm::Error) -> bool {
    violates(error, PROVIDER_VALUE_UNIQUE)
}

/// Whether `error` is a clash on the unique constraint named `constraint`
pub(super) fn violates(error: &rorm::Error, constraint: &str) -> bool {
    match error {
        rorm::Error::SqlxError(error) => error.as_database_error().is_some_and(|error| {
            error.is_unique_violation() && error.constraint() == Some(constraint)
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
