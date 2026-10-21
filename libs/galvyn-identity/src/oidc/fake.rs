//! A fake OpenID provider for tests
//!
//! Serves discovery, keys and a token endpoint on a random loopback port,
//! so the module talks to it over HTTP exactly as to a real provider. The
//! browser's visit to the authorization endpoint is played by
//! [`FakeOpenIdProvider::authorize`], which tells the fake whom it vouches for.

use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::MutexGuard;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use galvyn::core::re_exports::axum::Form;
use galvyn::core::re_exports::axum::Json;
use galvyn::core::re_exports::axum::Router;
use galvyn::core::re_exports::axum::extract::State;
use galvyn::core::re_exports::axum::http::HeaderMap;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::http::header;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Response;
use galvyn::core::re_exports::axum::routing::get;
use galvyn::core::re_exports::axum::routing::post;
use galvyn::core::re_exports::axum::serve;
use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;
use openidconnect::AccessToken;
use openidconnect::AuthUrl;
use openidconnect::EmptyAdditionalProviderMetadata;
use openidconnect::EmptyExtraTokenFields;
use openidconnect::IssuerUrl;
use openidconnect::JsonWebKeyId;
use openidconnect::JsonWebKeySetUrl;
use openidconnect::PkceCodeChallenge;
use openidconnect::PkceCodeVerifier;
use openidconnect::PrivateSigningKey;
use openidconnect::ResponseTypes;
use openidconnect::TokenUrl;
use openidconnect::core::CoreIdToken;
use openidconnect::core::CoreIdTokenClaims;
use openidconnect::core::CoreIdTokenFields;
use openidconnect::core::CoreJsonWebKeySet;
use openidconnect::core::CoreJwsSigningAlgorithm;
use openidconnect::core::CoreProviderMetadata;
use openidconnect::core::CoreResponseType;
use openidconnect::core::CoreRsaPrivateSigningKey;
use openidconnect::core::CoreSubjectIdentifierType;
use openidconnect::core::CoreTokenResponse;
use openidconnect::core::CoreTokenType;
use serde::Deserialize;
use tokio::net::TcpListener;
use tokio::task::JoinHandle;
use url::Url;

use super::ClientSecret;
use super::OpenIdProviderSetup;

/// The RSA key the fake signs ID tokens with and publishes (test only)
const SIGNING_KEY: &str = include_str!("fake/signing-key.pem");

/// A second RSA key, for bad signatures and key rotation (test only)
const OTHER_KEY: &str = include_str!("fake/other-key.pem");

/// The key id of [`SIGNING_KEY`]
const SIGNING_KEY_ID: &str = "signing";

/// The key id [`OTHER_KEY`] is published under once the keys are rotated
const ROTATED_KEY_ID: &str = "rotated";

/// The client id the fake issued the service
const CLIENT_ID: &str = "fake-client";

/// The client secret the fake shares with the service
const CLIENT_SECRET: &str = "fake-client-secret";

/// A fake OpenID provider on a random loopback port
///
/// Stops serving when dropped. Tests running in parallel can share one: each
/// [`FakeOpenIdProvider::authorize`] call vouches for its own person.
pub struct FakeOpenIdProvider {
    /// The issuer, `http://127.0.0.1:<port>`
    issuer: String,
    /// What the endpoints share
    state: Arc<Fake>,
    /// The task serving the endpoints
    server: JoinHandle<()>,
}

/// A person the fake vouches for in one OIDC login
#[derive(Debug, Clone)]
pub struct FakePerson {
    /// The subject the fake identifies the person by
    pub subject: String,
    /// The email the ID token states, if any
    pub email: Option<String>,
    /// Whether the ID token states the email as verified
    pub email_verified: bool,
    /// How the ID token is spoiled, if at all
    pub tamper: Option<Tamper>,
}

/// A way to spoil the ID token the fake answers a code with
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tamper {
    /// The token is for another client
    WrongAudience,
    /// The token names another issuer
    WrongIssuer,
    /// The token expired ten minutes ago
    Expired,
    /// The token carries another nonce than the Login sent
    WrongNonce,
    /// The token is signed by another key under the published key's id
    BadSignature,
}

impl FakePerson {
    /// A person with a verified email
    pub fn new(subject: &str, email: &str) -> Self {
        Self {
            subject: subject.to_string(),
            email: Some(email.to_string()),
            email_verified: true,
            tamper: None,
        }
    }

    /// The same person, with the email stated as unverified
    pub fn unverified(self) -> Self {
        Self {
            email_verified: false,
            ..self
        }
    }

    /// The same person, with the ID token spoiled by `tamper`
    pub fn tampered(self, tamper: Tamper) -> Self {
        Self {
            tamper: Some(tamper),
            ..self
        }
    }
}

/// What the endpoints share
struct Fake {
    /// The issuer
    issuer: String,
    /// The keys the fake knows
    signing: CoreRsaPrivateSigningKey,
    /// [`OTHER_KEY`] under the published key's id
    forged: CoreRsaPrivateSigningKey,
    /// [`OTHER_KEY`] under its own id, published after a rotation
    rotated: CoreRsaPrivateSigningKey,
    /// What changes over the fake's life
    mutable: Mutex<Mutable>,
}

/// What changes over the fake's life
#[derive(Default)]
struct Mutable {
    /// Authorization codes handed out and not yet exchanged
    grants: HashMap<String, Grant>,
    /// Whether the keys were rotated
    rotated: bool,
}

/// What an authorization code was issued for
struct Grant {
    /// The person vouched for
    person: FakePerson,
    /// The `nonce` of the authorization request
    nonce: String,
    /// The PKCE `code_challenge` of the authorization request
    code_challenge: String,
    /// The `redirect_uri` of the authorization request
    redirect_uri: String,
}

impl FakeOpenIdProvider {
    /// Start serving on a random loopback port, on the current tokio runtime
    pub async fn start() -> Self {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .unwrap_or_else(|error| panic!("bind the fake OpenID provider: {error}"));
        let port = listener
            .local_addr()
            .unwrap_or_else(|error| panic!("read the fake's port: {error}"))
            .port();
        let issuer = format!("http://127.0.0.1:{port}");

        let key = |pem: &str, kid: &str| {
            CoreRsaPrivateSigningKey::from_pem(pem, Some(JsonWebKeyId::new(kid.to_string())))
                .unwrap_or_else(|error| panic!("parse the fake's key: {error}"))
        };
        let state = Arc::new(Fake {
            issuer: issuer.clone(),
            signing: key(SIGNING_KEY, SIGNING_KEY_ID),
            forged: key(OTHER_KEY, SIGNING_KEY_ID),
            rotated: key(OTHER_KEY, ROTATED_KEY_ID),
            mutable: Mutex::new(Mutable::default()),
        });

        let router = Router::new()
            .route("/.well-known/openid-configuration", get(discovery))
            .route("/jwks", get(jwks))
            .route("/token", post(token))
            .with_state(state.clone());
        let server = tokio::spawn(async move {
            if let Err(error) = serve(listener, router).await {
                panic!("the fake OpenID provider stopped: {error}");
            }
        });

        Self {
            issuer,
            state,
            server,
        }
    }

    /// The issuer, `http://127.0.0.1:<port>`
    pub fn issuer(&self) -> &str {
        &self.issuer
    }

    /// The client id the fake issued the service
    pub fn client_id(&self) -> &str {
        CLIENT_ID
    }

    /// The client secret the fake shares with the service
    pub fn client_secret(&self) -> &str {
        CLIENT_SECRET
    }

    /// The setup of a provider named `id` pointing at the fake
    pub fn provider_setup(&self, id: &str, admits_on_first_login: bool) -> OpenIdProviderSetup {
        OpenIdProviderSetup {
            id: id.to_string(),
            display_name: format!("Fake {id}"),
            issuer: self.issuer.clone(),
            client_id: CLIENT_ID.to_string(),
            client_secret: ClientSecret::Shared(CLIENT_SECRET.to_string()),
            admits_on_first_login,
        }
    }

    /// Play the browser's visit to the authorization endpoint, vouching for `person`
    ///
    /// `authorization_url` is what
    /// [`IdentityModule::begin_oidc_login`](crate::IdentityModule::begin_oidc_login)
    /// returned. Returns the callback url the fake sends the browser back to,
    /// carrying a fresh code and the request's `state`.
    ///
    /// Panics on an authorization request a real provider would refuse.
    pub fn authorize(&self, authorization_url: &Url, person: FakePerson) -> Url {
        let query: HashMap<String, String> = authorization_url.query_pairs().into_owned().collect();
        let param = |name: &str| {
            query
                .get(name)
                .cloned()
                .unwrap_or_else(|| panic!("the authorization request lacks {name}"))
        };
        assert_eq!(param("client_id"), CLIENT_ID, "unknown client");
        assert_eq!(param("response_type"), "code", "not the code flow");
        assert_eq!(param("code_challenge_method"), "S256", "no PKCE with S256");
        assert!(
            param("scope").split(' ').any(|scope| scope == "openid"),
            "the openid scope is missing"
        );

        let redirect_uri = param("redirect_uri");
        let code = uuid::Uuid::new_v4().to_string();
        self.lock().grants.insert(
            code.clone(),
            Grant {
                person,
                nonce: param("nonce"),
                code_challenge: param("code_challenge"),
                redirect_uri: redirect_uri.clone(),
            },
        );

        let mut callback = Url::parse(&redirect_uri)
            .unwrap_or_else(|error| panic!("the redirect_uri is no url: {error}"));
        callback
            .query_pairs_mut()
            .append_pair("code", &code)
            .append_pair("state", &param("state"));
        callback
    }

    /// Publish a new signing key in place of the old one and sign with it from now on
    pub fn rotate_keys(&self) {
        self.lock().rotated = true;
    }

    /// The fake's changing state
    fn lock(&self) -> MutexGuard<'_, Mutable> {
        self.state.lock()
    }
}

impl Drop for FakeOpenIdProvider {
    fn drop(&mut self) {
        self.server.abort();
    }
}

impl Fake {
    /// The changing state
    fn lock(&self) -> MutexGuard<'_, Mutable> {
        self.mutable
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// The url of the endpoint at `path`
    fn endpoint(&self, path: &str) -> String {
        format!("{}{path}", self.issuer)
    }

    /// Sign an ID token for `grant`
    fn id_token(&self, grant: &Grant) -> CoreIdToken {
        let person = &grant.person;
        let tamper = person.tamper;
        let now = OffsetDateTime::now_utc();
        let (issued, expires) = match tamper {
            Some(Tamper::Expired) => (now - Duration::minutes(70), now - Duration::minutes(10)),
            _ => (now, now + Duration::hours(1)),
        };
        let issuer = match tamper {
            Some(Tamper::WrongIssuer) => self.endpoint("/elsewhere"),
            _ => self.issuer.clone(),
        };
        let audience = match tamper {
            Some(Tamper::WrongAudience) => "another-client",
            _ => CLIENT_ID,
        };
        let nonce = match tamper {
            Some(Tamper::WrongNonce) => "another-nonce".to_string(),
            _ => grant.nonce.clone(),
        };

        let mut claims = serde_json::json!({
            "iss": issuer,
            "aud": [audience],
            "sub": person.subject,
            "iat": issued.unix_timestamp(),
            "exp": expires.unix_timestamp(),
            "nonce": nonce,
            "email_verified": person.email_verified,
        });
        if let Some(email) = &person.email {
            claims["email"] = serde_json::Value::String(email.clone());
        }
        let claims: CoreIdTokenClaims = serde_json::from_value(claims)
            .unwrap_or_else(|error| panic!("build the ID token's claims: {error}"));

        let key = match (tamper, self.lock().rotated) {
            (Some(Tamper::BadSignature), _) => &self.forged,
            (_, true) => &self.rotated,
            (_, false) => &self.signing,
        };
        CoreIdToken::new(
            claims,
            key,
            CoreJwsSigningAlgorithm::RsaSsaPkcs1V15Sha256,
            None,
            None,
        )
        .unwrap_or_else(|error| panic!("sign the ID token: {error}"))
    }
}

/// The discovery document
async fn discovery(State(fake): State<Arc<Fake>>) -> Json<CoreProviderMetadata> {
    let url = |path: &str| fake.endpoint(path);
    let metadata = CoreProviderMetadata::new(
        IssuerUrl::new(fake.issuer.clone()).unwrap_or_else(|_| unreachable!("a valid url")),
        AuthUrl::new(url("/authorize")).unwrap_or_else(|_| unreachable!("a valid url")),
        JsonWebKeySetUrl::new(url("/jwks")).unwrap_or_else(|_| unreachable!("a valid url")),
        vec![ResponseTypes::new(vec![CoreResponseType::Code])],
        vec![CoreSubjectIdentifierType::Public],
        vec![CoreJwsSigningAlgorithm::RsaSsaPkcs1V15Sha256],
        EmptyAdditionalProviderMetadata {},
    )
    .set_token_endpoint(Some(
        TokenUrl::new(url("/token")).unwrap_or_else(|_| unreachable!("a valid url")),
    ));
    Json(metadata)
}

/// The published keys
async fn jwks(State(fake): State<Arc<Fake>>) -> Json<CoreJsonWebKeySet> {
    let key = match fake.lock().rotated {
        true => &fake.rotated,
        false => &fake.signing,
    };
    Json(CoreJsonWebKeySet::new(vec![key.as_verification_key()]))
}

/// The form of a token request
#[derive(Deserialize)]
struct TokenRequest {
    /// Has to be `authorization_code`
    grant_type: String,
    /// The authorization code
    code: String,
    /// Has to match the authorization request's
    redirect_uri: String,
    /// The PKCE verifier of the authorization request's challenge
    code_verifier: String,
}

/// Exchange an authorization code for tokens
async fn token(
    State(fake): State<Arc<Fake>>,
    headers: HeaderMap,
    Form(request): Form<TokenRequest>,
) -> Response {
    let refuse = |error: &str| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": error })),
        )
            .into_response()
    };

    let authorization = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    if authorization != Some(&basic_auth()) {
        return refuse("invalid_client");
    }
    if request.grant_type != "authorization_code" {
        return refuse("unsupported_grant_type");
    }
    let Some(grant) = fake.lock().grants.remove(&request.code) else {
        return refuse("invalid_grant");
    };
    let challenge =
        PkceCodeChallenge::from_code_verifier_sha256(&PkceCodeVerifier::new(request.code_verifier));
    if grant.redirect_uri != request.redirect_uri || challenge.as_str() != grant.code_challenge {
        return refuse("invalid_grant");
    }

    let response = CoreTokenResponse::new(
        AccessToken::new(uuid::Uuid::new_v4().to_string()),
        CoreTokenType::Bearer,
        CoreIdTokenFields::new(Some(fake.id_token(&grant)), EmptyExtraTokenFields {}),
    );
    Json(response).into_response()
}

/// The `Authorization` header of the service's client authentication
fn basic_auth() -> String {
    format!(
        "Basic {}",
        STANDARD.encode(format!("{CLIENT_ID}:{CLIENT_SECRET}"))
    )
}
