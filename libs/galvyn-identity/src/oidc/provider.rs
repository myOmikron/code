//! The configured OpenID providers and what their discovery yields

use std::collections::HashSet;
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

use super::ClientSecret;
use super::OidcSetup;
use super::OpenIdProviderSetup;

/// How long a provider's discovery document and keys are trusted before they are fetched again
const DISCOVERY_MAX_AGE: Duration = Duration::from_secs(60 * 60);

/// How long a request to a provider may take
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

/// Longest issuer an External identity can store
const MAX_ISSUER_LEN: usize = 255;

/// A client for one provider, as discovery leaves it
pub(crate) type DiscoveredClient = CoreClient<
    EndpointSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointMaybeSet,
    EndpointMaybeSet,
>;

/// Every configured OpenID provider
pub(crate) struct OpenIdProviders {
    /// The redirect uri registered with every provider
    pub(crate) redirect_uri: RedirectUrl,
    /// The providers, in configuration order
    pub(crate) providers: Vec<OpenIdProvider>,
    /// The client every request to a provider goes through
    http: reqwest::Client,
}

/// An OpenID provider people may log in through
pub struct OpenIdProvider {
    /// See [`OpenIdProviderSetup::id`]
    id: String,
    /// See [`OpenIdProviderSetup::display_name`]
    display_name: String,
    /// See [`OpenIdProviderSetup::issuer`]
    issuer: IssuerUrl,
    /// See [`OpenIdProviderSetup::client_id`]
    client_id: ClientId,
    /// See [`OpenIdProviderSetup::client_secret`]
    client_secret: ClientSecret,
    /// See [`OpenIdProviderSetup::admits_on_first_login`]
    admits_on_first_login: bool,
    /// The most recent discovery, fetched on first use
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

impl OpenIdProvider {
    /// The service's own short name for the provider
    pub fn id(&self) -> &str {
        &self.id
    }

    /// What the frontend calls the provider
    pub fn display_name(&self) -> &str {
        &self.display_name
    }

    /// The provider's issuer
    pub fn issuer(&self) -> &str {
        self.issuer.as_str()
    }

    /// Whether the provider admits people on their first OIDC login
    pub fn admits_on_first_login(&self) -> bool {
        self.admits_on_first_login
    }

    /// Validate one provider's setup
    fn new(setup: OpenIdProviderSetup) -> Result<Self, String> {
        let OpenIdProviderSetup {
            id,
            display_name,
            issuer,
            client_id,
            client_secret,
            admits_on_first_login,
        } = setup;
        if id.is_empty() {
            return Err("every OpenID provider needs an id".to_string());
        }
        if display_name.is_empty() {
            return Err(format!("OpenID provider {id} needs a display_name"));
        }
        if client_id.is_empty() {
            return Err(format!("OpenID provider {id} needs a client_id"));
        }
        match &client_secret {
            ClientSecret::Shared(secret) if secret.is_empty() => {
                return Err(format!("OpenID provider {id} needs a client_secret"));
            }
            ClientSecret::Shared(_) => {}
        }
        if issuer.len() > MAX_ISSUER_LEN {
            return Err(format!(
                "the issuer of OpenID provider {id} is longer than {MAX_ISSUER_LEN} bytes"
            ));
        }
        let issuer = IssuerUrl::new(issuer)
            .map_err(|e| format!("the issuer of OpenID provider {id} is no url: {e}"))?;
        Ok(Self {
            id,
            display_name,
            issuer,
            client_id: ClientId::new(client_id),
            client_secret,
            admits_on_first_login,
            discovered: RwLock::new(None),
        })
    }

    /// The client secret to authenticate with
    fn client_secret(&self) -> openidconnect::ClientSecret {
        match &self.client_secret {
            ClientSecret::Shared(secret) => openidconnect::ClientSecret::new(secret.clone()),
        }
    }
}

impl OpenIdProviders {
    /// Validate `setup` for a service served from `origin`
    pub(crate) fn new(origin: &Url, setup: OidcSetup) -> Result<Self, String> {
        let OidcSetup {
            callback_path,
            providers,
        } = setup;

        let mut ids = HashSet::new();
        let providers = providers
            .into_iter()
            .map(OpenIdProvider::new)
            .collect::<Result<Vec<_>, _>>()?;
        for provider in &providers {
            if !ids.insert(provider.id.as_str()) {
                return Err(format!("OpenID provider id {} is used twice", provider.id));
            }
        }

        if !providers.is_empty() && callback_path.is_empty() {
            return Err("oidc.callback_path must be set in IdentitySetup".to_string());
        }
        let mut redirect_uri = origin.clone();
        redirect_uri.set_path(&callback_path);
        redirect_uri.set_query(None);

        let http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|e| format!("Failed to build the client for OpenID providers: {e}"))?;

        Ok(Self {
            redirect_uri: RedirectUrl::from_url(redirect_uri),
            providers,
            http,
        })
    }

    /// The provider named `id`
    pub(crate) fn get(&self, id: &str) -> Option<&OpenIdProvider> {
        self.providers.iter().find(|provider| provider.id == id)
    }

    /// A client for `provider`, from its discovery
    ///
    /// Discovers on first use and once the last discovery is
    /// [`DISCOVERY_MAX_AGE`] old, or right away with `refresh`, e.g. because
    /// an ID token is signed by a key the last discovery did not list.
    pub(crate) async fn client(
        &self,
        provider: &OpenIdProvider,
        refresh: bool,
    ) -> Result<DiscoveredClient, DiscoveryFailed> {
        let metadata = self.metadata(provider, refresh).await?;
        Ok(CoreClient::from_provider_metadata(
            metadata,
            provider.client_id.clone(),
            Some(provider.client_secret()),
        )
        .set_redirect_uri(self.redirect_uri.clone()))
    }

    /// `provider`'s discovery document, fetched again if it is stale or `refresh` is set
    async fn metadata(
        &self,
        provider: &OpenIdProvider,
        refresh: bool,
    ) -> Result<CoreProviderMetadata, DiscoveryFailed> {
        let fresh = |discovered: &Option<Discovered>| {
            discovered
                .as_ref()
                .filter(|discovered| discovered.fetched_at.elapsed() < DISCOVERY_MAX_AGE)
                .map(|discovered| discovered.metadata.clone())
        };
        if !refresh && let Some(metadata) = fresh(&*provider.discovered.read().await) {
            return Ok(metadata);
        }

        let mut discovered = provider.discovered.write().await;
        if !refresh && let Some(metadata) = fresh(&discovered) {
            return Ok(metadata);
        }
        let metadata = CoreProviderMetadata::discover_async(provider.issuer.clone(), &|request| {
            self.send(request)
        })
        .await
        .map_err(|e| DiscoveryFailed(format!("discovery of {} failed: {e}", provider.id)))?;
        *discovered = Some(Discovered {
            metadata: metadata.clone(),
            fetched_at: Instant::now(),
        });
        Ok(metadata)
    }

    /// Send a request a provider is the target of
    pub(crate) async fn send(&self, request: HttpRequest) -> Result<HttpResponse, reqwest::Error> {
        let (parts, body) = request.into_parts();
        let response = self
            .http
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
}
