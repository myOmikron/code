//! The OpenID providers in the module's tables and what their discovery yields

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use std::time::Instant;

use openidconnect::ClientId;
use openidconnect::EndpointMaybeSet;
use openidconnect::EndpointNotSet;
use openidconnect::EndpointSet;
use openidconnect::HttpRequest;
use openidconnect::HttpResponse;
use openidconnect::IssuerUrl;
use openidconnect::RedirectUrl;
use openidconnect::core::CoreClient;
use openidconnect::core::CoreProviderMetadata;
use openidconnect::http;
use tokio::sync::RwLock;
use url::Url;
use uuid::Uuid;

use super::OidcSetup;
use super::OpenAdmission;

/// How long a provider's discovery document and keys are trusted before they are fetched again
const DISCOVERY_MAX_AGE: Duration = Duration::from_secs(60 * 60);

/// How long a request to a provider may take
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

/// Where below its issuer a provider serves its discovery document
const WELL_KNOWN: &str = "/.well-known/openid-configuration";

/// The claim identifying a person unless a provider is configured otherwise
pub const DEFAULT_IDENTIFYING_CLAIM: &str = "sub";

/// A client for one provider, as discovery leaves it
pub(crate) type DiscoveredClient = CoreClient<
    EndpointSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointMaybeSet,
    EndpointMaybeSet,
>;

/// Who an OpenID provider admits on their first OIDC login
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Admission {
    /// Everyone it vouches for: the first OIDC login creates their Identity
    Open,
    /// Only those holding a Registration link
    InviteOnly,
}

impl Admission {
    /// How the provider table stores it
    pub(crate) fn encode(self) -> &'static str {
        match self {
            Admission::Open => "open",
            Admission::InviteOnly => "invite_only",
        }
    }

    /// The admission stored as `value`, if it is one
    pub(crate) fn decode(value: &str) -> Option<Self> {
        match value {
            "open" => Some(Admission::Open),
            "invite_only" => Some(Admission::InviteOnly),
            _ => None,
        }
    }
}

/// An OpenID provider to add to the module's tables
#[derive(Clone, PartialEq, Eq)]
pub struct NewOpenIdProvider {
    /// The service's own short name for the provider, e.g. `google`
    ///
    /// Lowercase letters, digits and `-`, as it ends the redirect uri.
    pub slug: String,
    /// What the frontend calls the provider, e.g. `Google`
    pub display_name: String,
    /// Where the provider's discovery document is, or its issuer below which it is
    pub discovery_url: String,
    /// The client id the provider issued the service
    pub client_id: String,
    /// The secret the service authenticates to the provider's token endpoint with
    ///
    /// Stored in plain text.
    pub client_secret: String,
    /// The ID token claim whose value identifies a person, usually
    /// [`DEFAULT_IDENTIFYING_CLAIM`]
    pub identifying_claim: String,
    /// Who the provider admits on their first OIDC login
    pub admission: Admission,
}

impl std::fmt::Debug for NewOpenIdProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NewOpenIdProvider")
            .field("slug", &self.slug)
            .field("display_name", &self.display_name)
            .field("discovery_url", &self.discovery_url)
            .field("client_id", &self.client_id)
            .field("identifying_claim", &self.identifying_claim)
            .field("admission", &self.admission)
            .finish_non_exhaustive()
    }
}

/// Which field of a [`NewOpenIdProvider`] is unusable
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InvalidOpenIdProvider {
    /// Empty, longer than 64 bytes, or not only lowercase letters, digits and `-`
    Slug,
    /// Empty or longer than 255 bytes
    DisplayName,
    /// No http(s) url, or longer than 255 bytes
    DiscoveryUrl,
    /// Empty or longer than 255 bytes
    ClientId,
    /// Empty or longer than 1024 bytes
    ClientSecret,
    /// Empty or longer than 64 bytes
    IdentifyingClaim,
}

impl std::fmt::Display for InvalidOpenIdProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            InvalidOpenIdProvider::Slug => {
                "the slug needs 1 to 64 lowercase letters, digits or dashes"
            }
            InvalidOpenIdProvider::DisplayName => "the display name needs 1 to 255 bytes",
            InvalidOpenIdProvider::DiscoveryUrl => {
                "the discovery url needs to be an http(s) url of at most 255 bytes"
            }
            InvalidOpenIdProvider::ClientId => "the client id needs 1 to 255 bytes",
            InvalidOpenIdProvider::ClientSecret => "the client secret needs 1 to 1024 bytes",
            InvalidOpenIdProvider::IdentifyingClaim => "the identifying claim needs 1 to 64 bytes",
        })
    }
}

impl NewOpenIdProvider {
    /// The first field that cannot be stored or used, if any
    pub fn validate(&self) -> Result<(), InvalidOpenIdProvider> {
        let fits = |value: &str, max: usize| !value.is_empty() && value.len() <= max;
        let slug = fits(&self.slug, 64)
            && self
                .slug
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-');
        if !slug {
            return Err(InvalidOpenIdProvider::Slug);
        }
        if !fits(&self.display_name, 255) {
            return Err(InvalidOpenIdProvider::DisplayName);
        }
        let url = Url::parse(&self.discovery_url)
            .is_ok_and(|url| matches!(url.scheme(), "http" | "https"));
        if !fits(&self.discovery_url, 255) || !url {
            return Err(InvalidOpenIdProvider::DiscoveryUrl);
        }
        if !fits(&self.client_id, 255) {
            return Err(InvalidOpenIdProvider::ClientId);
        }
        if !fits(&self.client_secret, 1024) {
            return Err(InvalidOpenIdProvider::ClientSecret);
        }
        if !fits(&self.identifying_claim, 64) {
            return Err(InvalidOpenIdProvider::IdentifyingClaim);
        }
        Ok(())
    }
}

/// An OpenID provider as the module's tables hold it
///
/// Its client secret stays inside the module.
#[derive(Clone)]
pub struct OpenIdProvider {
    /// Primary key
    pub(crate) uuid: Uuid,
    /// See [`NewOpenIdProvider::slug`]
    pub(crate) slug: String,
    /// See [`NewOpenIdProvider::display_name`]
    pub(crate) display_name: String,
    /// See [`NewOpenIdProvider::discovery_url`]
    pub(crate) discovery_url: String,
    /// The issuer its discovery stated, `None` before the first discovery
    pub(crate) issuer: Option<String>,
    /// See [`NewOpenIdProvider::client_id`]
    pub(crate) client_id: String,
    /// See [`NewOpenIdProvider::client_secret`]
    pub(crate) client_secret: String,
    /// See [`NewOpenIdProvider::identifying_claim`]
    pub(crate) identifying_claim: String,
    /// See [`NewOpenIdProvider::admission`]
    pub(crate) admission: Admission,
}

impl std::fmt::Debug for OpenIdProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OpenIdProvider")
            .field("slug", &self.slug)
            .field("display_name", &self.display_name)
            .field("discovery_url", &self.discovery_url)
            .field("issuer", &self.issuer)
            .field("client_id", &self.client_id)
            .field("identifying_claim", &self.identifying_claim)
            .field("admission", &self.admission)
            .finish_non_exhaustive()
    }
}

impl OpenIdProvider {
    /// The service's own short name for the provider
    pub fn slug(&self) -> &str {
        &self.slug
    }

    /// What the frontend calls the provider
    pub fn display_name(&self) -> &str {
        &self.display_name
    }

    /// Where the provider's discovery document is, or its issuer below which it is
    pub fn discovery_url(&self) -> &str {
        &self.discovery_url
    }

    /// The issuer the provider's discovery stated, `None` before its first discovery
    pub fn issuer(&self) -> Option<&str> {
        self.issuer.as_deref()
    }

    /// The client id the provider issued the service
    pub fn client_id(&self) -> &str {
        &self.client_id
    }

    /// The ID token claim whose value identifies a person
    pub fn identifying_claim(&self) -> &str {
        &self.identifying_claim
    }

    /// Who the provider admits on their first OIDC login
    pub fn admission(&self) -> Admission {
        self.admission
    }

    /// The issuer to discover below, from the configured discovery url
    fn issuer_url(&self) -> Result<IssuerUrl, DiscoveryFailed> {
        IssuerUrl::new(issuer_of(&self.discovery_url).to_string()).map_err(|error| {
            DiscoveryFailed(format!(
                "the discovery url of {} is no url: {error}",
                self.slug
            ))
        })
    }
}

/// The issuer whose discovery document `discovery_url` names
///
/// A url ending in the well-known path names the issuer before it; any
/// other url is taken as the issuer itself.
fn issuer_of(discovery_url: &str) -> &str {
    discovery_url
        .strip_suffix(WELL_KNOWN)
        .unwrap_or(discovery_url)
}

/// The redirect uri of the provider `slug`: `callback_path` below `origin`, then the slug
fn redirect_uri(origin: &Url, callback_path: &str, slug: &str) -> Url {
    let mut uri = origin.clone();
    uri.set_path(&format!("{}/{slug}", callback_path.trim_end_matches('/')));
    uri.set_query(None);
    uri
}

/// Every OpenID provider's discovery, and how the module reaches them
pub(crate) struct OpenIdProviders {
    /// The public origin the redirect uris are below
    origin: Url,
    /// The path the redirect uris start with, followed by the provider's slug
    callback_path: String,
    /// How a first OIDC login through an open provider is admitted
    pub(crate) open_admission: OpenAdmission,
    /// The client every request to a provider goes through
    http: reqwest::Client,
    /// The most recent discovery of each provider, by its primary key
    discoveries: RwLock<HashMap<Uuid, Arc<Discovery>>>,
}

/// The discovery of one provider
struct Discovery {
    /// The discovery url it was fetched from
    discovery_url: String,
    /// The most recent successful fetch
    discovered: RwLock<Option<Discovered>>,
}

/// A provider's discovery document with its keys
struct Discovered {
    /// The document, including the keys behind its `jwks_uri`
    metadata: CoreProviderMetadata,
    /// When it was fetched
    fetched_at: Instant,
}

/// Fetching a provider's discovery document or keys failed
#[derive(Debug)]
pub(crate) struct DiscoveryFailed(pub(crate) String);

impl OpenIdProviders {
    /// Validate `setup` for a service served from `origin`
    pub(crate) fn new(origin: &Url, setup: OidcSetup) -> Result<Self, String> {
        let OidcSetup {
            callback_path,
            root_certificates,
            open_admission,
        } = setup;
        let mut certificates = Vec::new();
        for bundle in root_certificates {
            certificates.extend(
                reqwest::Certificate::from_pem_bundle(bundle.as_bytes())
                    .map_err(|e| format!("Failed to read a root certificate for OIDC: {e}"))?,
            );
        }
        let http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(REQUEST_TIMEOUT)
            .tls_certs_merge(certificates)
            .build()
            .map_err(|e| format!("Failed to build the client for OpenID providers: {e}"))?;

        Ok(Self {
            origin: origin.clone(),
            callback_path,
            open_admission,
            http,
            discoveries: RwLock::new(HashMap::new()),
        })
    }

    /// Whether the service set OIDC login up, by naming its callback path
    pub(crate) fn enabled(&self) -> bool {
        !self.callback_path.is_empty()
    }

    /// The redirect uri registered with `provider`
    pub(crate) fn redirect_uri(&self, provider: &OpenIdProvider) -> RedirectUrl {
        RedirectUrl::from_url(redirect_uri(
            &self.origin,
            &self.callback_path,
            &provider.slug,
        ))
    }

    /// A client for `provider` with the issuer its discovery states
    ///
    /// Discovers on first use, once the last discovery is
    /// [`DISCOVERY_MAX_AGE`] old or the discovery url changed, and right away
    /// with `refresh`, e.g. because an ID token is signed by a key the last
    /// discovery did not list. Fails if the discovery states another issuer
    /// than the one stored for the provider.
    pub(crate) async fn client(
        &self,
        provider: &OpenIdProvider,
        refresh: bool,
    ) -> Result<(DiscoveredClient, String), DiscoveryFailed> {
        let metadata = self.metadata(provider, refresh).await?;
        let issuer = metadata.issuer().as_str().to_string();
        if provider
            .issuer
            .as_ref()
            .is_some_and(|stored| *stored != issuer)
        {
            return Err(DiscoveryFailed(format!(
                "discovery of {} states the issuer {issuer}, not the stored one",
                provider.slug
            )));
        }
        let client = CoreClient::from_provider_metadata(
            metadata,
            ClientId::new(provider.client_id.clone()),
            Some(openidconnect::ClientSecret::new(
                provider.client_secret.clone(),
            )),
        )
        .set_redirect_uri(self.redirect_uri(provider));
        Ok((client, issuer))
    }

    /// The discovery of `provider`, replaced if its discovery url changed
    async fn discovery(&self, provider: &OpenIdProvider) -> Arc<Discovery> {
        let current = |discoveries: &HashMap<Uuid, Arc<Discovery>>| {
            discoveries
                .get(&provider.uuid)
                .filter(|discovery| discovery.discovery_url == provider.discovery_url)
                .cloned()
        };
        if let Some(discovery) = current(&*self.discoveries.read().await) {
            return discovery;
        }
        let mut discoveries = self.discoveries.write().await;
        if let Some(discovery) = current(&discoveries) {
            return discovery;
        }
        let discovery = Arc::new(Discovery {
            discovery_url: provider.discovery_url.clone(),
            discovered: RwLock::new(None),
        });
        discoveries.insert(provider.uuid, discovery.clone());
        discovery
    }

    /// `provider`'s discovery document, fetched again if it is stale or `refresh` is set
    async fn metadata(
        &self,
        provider: &OpenIdProvider,
        refresh: bool,
    ) -> Result<CoreProviderMetadata, DiscoveryFailed> {
        let discovery = self.discovery(provider).await;
        let fresh = |discovered: &Option<Discovered>| {
            discovered
                .as_ref()
                .filter(|discovered| discovered.fetched_at.elapsed() < DISCOVERY_MAX_AGE)
                .map(|discovered| discovered.metadata.clone())
        };
        if !refresh && let Some(metadata) = fresh(&*discovery.discovered.read().await) {
            return Ok(metadata);
        }

        let mut discovered = discovery.discovered.write().await;
        if !refresh && let Some(metadata) = fresh(&discovered) {
            return Ok(metadata);
        }
        let http = self.http.clone();
        let metadata =
            CoreProviderMetadata::discover_async(provider.issuer_url()?, &move |request| {
                send(http.clone(), request)
            })
            .await
            .map_err(|e| DiscoveryFailed(format!("discovery of {} failed: {e}", provider.slug)))?;
        *discovered = Some(Discovered {
            metadata: metadata.clone(),
            fetched_at: Instant::now(),
        });
        Ok(metadata)
    }

    /// The client for requests to the providers
    pub(crate) fn http(&self) -> reqwest::Client {
        self.http.clone()
    }
}

/// Send a request a provider is the target of
///
/// Owns its client, so the future borrows nothing and stays `Send` for any caller.
pub(crate) async fn send(
    http: reqwest::Client,
    request: HttpRequest,
) -> Result<HttpResponse, reqwest::Error> {
    let (parts, body) = request.into_parts();
    let response = http
        .request(parts.method, parts.uri.to_string())
        .headers(parts.headers)
        .body(body)
        .send()
        .await?;

    let mut converted = http::Response::builder().status(response.status());
    if let Some(headers) = converted.headers_mut() {
        *headers = response.headers().clone();
    }
    let body = response.bytes().await?.to_vec();
    Ok(converted
        .body(body)
        .unwrap_or_else(|_| unreachable!("status and headers come from a valid response")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn google() -> NewOpenIdProvider {
        NewOpenIdProvider {
            slug: "google".to_string(),
            display_name: "Google".to_string(),
            discovery_url: "https://accounts.google.com/.well-known/openid-configuration"
                .to_string(),
            client_id: "client".to_string(),
            client_secret: "secret".to_string(),
            identifying_claim: DEFAULT_IDENTIFYING_CLAIM.to_string(),
            admission: Admission::Open,
        }
    }

    #[test]
    fn a_complete_provider_is_valid() {
        assert_eq!(google().validate(), Ok(()));
    }

    #[test]
    fn a_slug_has_to_fit_into_a_url_path() {
        for slug in ["", "Google", "my provider", "a/b", &"a".repeat(65)] {
            let provider = NewOpenIdProvider {
                slug: slug.to_string(),
                ..google()
            };
            assert_eq!(
                provider.validate(),
                Err(InvalidOpenIdProvider::Slug),
                "{slug}"
            );
        }
    }

    #[test]
    fn a_discovery_url_has_to_be_an_http_url() {
        for url in ["", "accounts.google.com", "ftp://accounts.google.com"] {
            let provider = NewOpenIdProvider {
                discovery_url: url.to_string(),
                ..google()
            };
            assert_eq!(
                provider.validate(),
                Err(InvalidOpenIdProvider::DiscoveryUrl),
                "{url}"
            );
        }
    }

    #[test]
    fn client_id_secret_and_claim_cannot_be_empty() {
        let refused = |provider: NewOpenIdProvider| provider.validate().unwrap_err();
        assert_eq!(
            refused(NewOpenIdProvider {
                client_id: String::new(),
                ..google()
            }),
            InvalidOpenIdProvider::ClientId
        );
        assert_eq!(
            refused(NewOpenIdProvider {
                client_secret: String::new(),
                ..google()
            }),
            InvalidOpenIdProvider::ClientSecret
        );
        assert_eq!(
            refused(NewOpenIdProvider {
                identifying_claim: String::new(),
                ..google()
            }),
            InvalidOpenIdProvider::IdentifyingClaim
        );
    }

    #[test]
    fn the_debug_output_leaves_the_client_secret_out() {
        assert!(!format!("{:?}", google()).contains("secret\""));
    }

    #[test]
    fn a_well_known_discovery_url_names_the_issuer_before_it() {
        assert_eq!(
            issuer_of("https://accounts.google.com/.well-known/openid-configuration"),
            "https://accounts.google.com"
        );
        assert_eq!(
            issuer_of("https://auth.example.org/application/o/mtg/"),
            "https://auth.example.org/application/o/mtg/"
        );
    }

    #[test]
    fn the_redirect_uri_ends_with_the_providers_slug() {
        let origin = Url::parse("https://mtg.example.org").unwrap();
        assert_eq!(
            redirect_uri(&origin, "/api/auth/oidc/callback", "google").as_str(),
            "https://mtg.example.org/api/auth/oidc/callback/google"
        );
        assert_eq!(
            redirect_uri(&origin, "/api/auth/oidc/callback/", "authentik").as_str(),
            "https://mtg.example.org/api/auth/oidc/callback/authentik"
        );
    }

    #[test]
    fn an_admission_survives_the_provider_table() {
        for admission in [Admission::Open, Admission::InviteOnly] {
            assert_eq!(Admission::decode(admission.encode()), Some(admission));
        }
        assert_eq!(Admission::decode("closed"), None);
    }
}
