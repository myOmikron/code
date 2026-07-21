//! The configuration of `semelei`

use galvyn::rorm::DatabaseDriver;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::config::ConfigError;
use service_bootstrap::config::EnvLoader;
use url::Url;

/// The configuration of semelei
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Config {
    /// Public origin the app is served from.
    ///
    /// Used as WebAuthn `rp_origin`; its host becomes the `rp_id`.
    /// Changing the host invalidates all registered passkeys!
    pub public_origin: Url,

    /// Database connection parameters
    pub database_driver: DatabaseDriver,
}

/// Load and validate all env vars. Reports all errors at once.
pub fn load() -> Result<Config, ConfigError> {
    let mut env = EnvLoader::new();

    let public_origin = env.require_parse::<Url>("PUBLIC_ORIGIN");

    let postgres_host = env.require("POSTGRES_HOST");
    let postgres_db = env.require("POSTGRES_DB");
    let postgres_port = env.optional_parse::<u16>("POSTGRES_PORT", "5432");
    let postgres_user = env.optional("POSTGRES_USER", "postgres");
    let postgres_password = env.require("POSTGRES_PASSWORD");

    env.finish()?;

    Ok(Config {
        public_origin: public_origin.unwrap(),
        database_driver: DatabaseDriver::Postgres {
            name: postgres_db.unwrap(),
            host: postgres_host.unwrap(),
            port: postgres_port.unwrap(),
            user: postgres_user,
            password: postgres_password.unwrap(),
        },
    })
}
