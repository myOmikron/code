use std::net::IpAddr;
use std::num::NonZeroU16;

use galvyn::rorm::DatabaseDriver;
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
}

/// The MPCFill server used when none is configured
///
/// The community's own, which is the one every reader of the site searches.
const DEFAULT_MPCFILL_URL: &str = "https://mpcfill.com/";

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
    })
}
