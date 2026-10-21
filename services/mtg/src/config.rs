use std::net::IpAddr;
use std::num::NonZeroU16;

use galvyn::rorm::DatabaseDriver;
use galvyn_identity::ClientSecret;
use galvyn_identity::OpenIdProviderSetup;
use service_bootstrap::config::ConfigError;
use service_bootstrap::config::EnvLoader;
use url::Url;

#[derive(Debug, Clone)]
pub struct Config {
    /// Public origin the app is served from.
    ///
    /// Used as WebAuthn `rp_origin`; its host becomes the `rp_id`.
    /// Changing the host invalidates all registered passkeys!
    pub public_origin: Url,
    /// Internal base url of the graph advisor (services/mtg-graph).
    ///
    /// The webserver proxies `/api/graph/*` to it. Origin only — no path.
    pub graph_url: Url,
    /// Base url of the MPCFill server whose art index is searched.
    ///
    /// Their api allows cors for their own origins only, so the proxy-art
    /// picker asks it through this service. Must end in a slash.
    pub mpcfill_url: Url,
    /// Database connection parameters
    pub database_driver: DatabaseDriver,
    pub listen_address: IpAddr,
    pub listen_port: NonZeroU16,
    /// The OpenID providers people may log in through, none to turn OIDC login off
    pub openid_providers: Vec<OpenIdProviderSetup>,
}

/// The MPCFill server used when none is configured
///
/// The community's own, which is the one every reader of the site searches.
const DEFAULT_MPCFILL_URL: &str = "https://mpcfill.com/";

/// Google's issuer, exactly as its ID tokens state it
const GOOGLE_ISSUER: &str = "https://accounts.google.com";

pub fn load() -> Result<Config, ConfigError> {
    let mut env = EnvLoader::new();

    let public_origin = env.require_parse::<Url>("PUBLIC_ORIGIN");
    let graph_url = env.require_parse::<Url>("GRAPH_URL");
    let mpcfill_url = env.optional_parse::<Url>("MPCFILL_URL", DEFAULT_MPCFILL_URL);

    let postgres_host = env.require("POSTGRES_HOST");
    let postgres_db = env.require("POSTGRES_DB");
    let postgres_port = env.require_parse("POSTGRES_PORT");
    let postgres_user = env.require("POSTGRES_USER");
    let postgres_password = env.require("POSTGRES_PASSWORD");

    let listen_address = env.require_parse::<IpAddr>("LISTEN_ADDRESS");
    let listen_port = env.require_parse::<NonZeroU16>("LISTEN_PORT");

    let google = load_google(&mut env);

    env.finish()?;

    Ok(Config {
        public_origin: public_origin.unwrap(),
        graph_url: graph_url.unwrap(),
        mpcfill_url: mpcfill_url.unwrap(),
        database_driver: DatabaseDriver::Postgres {
            name: postgres_db.unwrap(),
            host: postgres_host.unwrap(),
            port: postgres_port.unwrap(),
            user: postgres_user.unwrap(),
            password: postgres_password.unwrap(),
        },
        listen_address: listen_address.unwrap(),
        listen_port: listen_port.unwrap(),
        openid_providers: google.into_iter().collect(),
    })
}

/// Google as an OpenID provider, `None` while neither of its env vars is set
///
/// Setting only one of `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` is an
/// error for the other. Google admits people on their first OIDC login.
fn load_google(env: &mut EnvLoader) -> Option<OpenIdProviderSetup> {
    const CLIENT_ID: &str = "GOOGLE_CLIENT_ID";
    const CLIENT_SECRET: &str = "GOOGLE_CLIENT_SECRET";

    if env.optional(CLIENT_ID, "").is_empty() && env.optional(CLIENT_SECRET, "").is_empty() {
        return None;
    }
    let client_id = env.require(CLIENT_ID);
    let client_secret = env.require(CLIENT_SECRET);
    Some(OpenIdProviderSetup {
        id: "google".to_string(),
        display_name: "Google".to_string(),
        issuer: GOOGLE_ISSUER.to_string(),
        client_id: client_id?,
        client_secret: ClientSecret::Shared(client_secret?),
        admits_on_first_login: true,
    })
}
