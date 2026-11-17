//! Global module holding the http client for the graph advisor

use std::time::Duration;

use galvyn::core::InitError;
use galvyn::core::Module;
use galvyn::core::PreInitError;
use serde::Serialize;
use serde::de::DeserializeOwned;
use service_bootstrap::http::client::PropagateTrace;
use url::Url;

/// How long a connection attempt to the advisor may take
///
/// The advisor is one compose network away; if it does not accept within this,
/// it is down and the request should fail as such.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

/// Upper bound on a whole proxied request
///
/// A wedge guard, not a budget: legitimate solver and EDHREC-cold runs take up
/// to ~30s, so this only fires when the advisor has stopped answering at all.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

/// Global module wrapping the pooled http client for the graph advisor
///
/// The advisor (services/mtg-graph) is not publicly routable; the handlers in
/// [`crate::http::handler_graph`] proxy the frontend's requests through it.
pub struct GraphClient {
    /// Internal base url of the advisor (origin only, no path)
    pub base_url: Url,
    /// The pooled client all proxied requests share
    pub client: reqwest::Client,
}

/// Setup for [`GraphClient`], the option must be filled
#[derive(Debug, Default)]
pub struct GraphClientSetup {
    /// Internal base url of the advisor
    pub base_url: Option<Url>,
}

impl Module for GraphClient {
    type Setup = GraphClientSetup;
    type PreInit = (reqwest::Client, Url);

    async fn pre_init(setup: Self::Setup) -> Result<Self::PreInit, PreInitError> {
        let base_url = setup
            .base_url
            .ok_or("base_url must be set in GraphClientSetup")?;

        let client = reqwest::Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|e| format!("Failed to build the graph http client: {e}"))?;

        Ok((client, base_url))
    }

    type Dependencies = ();

    async fn init(
        pre_init: Self::PreInit,
        _dependencies: &mut Self::Dependencies,
    ) -> Result<Self, InitError> {
        let (client, base_url) = pre_init;
        Ok(Self { base_url, client })
    }
}

impl GraphClient {
    /// Posts json to one of the advisor's endpoints, `None` on a 404
    pub async fn post<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> anyhow::Result<Option<T>> {
        let url = self.base_url.join(path)?;
        let response = self
            .client
            .post(url)
            .json(body)
            .propagate_trace()
            .send()
            .await?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        Ok(Some(response.error_for_status()?.json().await?))
    }
}
