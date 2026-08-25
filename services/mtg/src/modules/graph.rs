//! Global module holding the http client for the graph advisor

use std::time::Duration;

use galvyn::core::InitError;
use galvyn::core::Module;
use galvyn::core::PreInitError;
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
