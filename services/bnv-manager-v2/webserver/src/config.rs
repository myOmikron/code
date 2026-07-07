//! Definitions of the configuration file

use std::net::IpAddr;
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::LazyLock;

use galvyn::core::stuff::env::EnvError;
use galvyn::core::stuff::env::EnvVar;
use galvyn::rorm::DatabaseDriver;
use url::Url;

/// Load all environment variables declared in this module
///
/// Called at the beginning of `main` to gather and report all env errors at once.
pub fn load_env() -> Result<(), Vec<&'static EnvError>> {
    let mut errors = Vec::new();

    for result in [
        LISTEN_ADDRESS.load(),
        LISTEN_PORT.load(),
        ORIGIN.load(),
        STATE_DIR.load(),
        POSTGRES_HOST.load(),
        POSTGRES_DB.load(),
        POSTGRES_PORT.load(),
        POSTGRES_USER.load(),
        POSTGRES_PASSWORD.load(),
        MAILCOW_BASE_URL.load(),
        MAILCOW_API_KEY.load(),
        OTEL_EXPORTER_OTLP_ENDPOINT.load(),
    ] {
        errors.extend(result.err());
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

/// Address the API server should bind to
pub static LISTEN_ADDRESS: EnvVar<IpAddr> =
    EnvVar::optional("LISTEN_ADDRESS", || IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0)));

/// Port the API server should bind to
pub static LISTEN_PORT: EnvVar<u16> = EnvVar::optional("LISTEN_PORT", || 8080);

/// The url this server is reachable under
///
/// # Used for
/// - generating links which should point back to bnv-manager
/// - defaulting [`WEBAUTHN_ID`] and [`WEBAUTHN_ORIGIN`]
pub static ORIGIN: EnvVar<Url> = EnvVar::required("ORIGIN");

/// A directory bnv-manager puts files it creates.
///
/// Most noteworthy, this will contain a `/media` where file uploaded by users will be stored.
pub static STATE_DIR: EnvVar<PathBuf> = EnvVar::optional("BNV_MANAGER_STATE_DIR", || {
    PathBuf::from("/var/lib/bnv-manager")
});

/// Disable mailcow integration
pub static DISABLE_MAILCOW: EnvVar<bool> = EnvVar::optional("DISABLE_MAILCOW", || false);

/// Mailcow base url
pub static MAILCOW_BASE_URL: EnvVar<Url> = EnvVar::required("MAILCOW_BASE_URL");

/// API key of the mailcow user
pub static MAILCOW_API_KEY: EnvVar = EnvVar::required("MAILCOW_API_KEY");

/// The address of the database server
pub static POSTGRES_HOST: EnvVar = EnvVar::optional("POSTGRES_HOST", || "postgres".to_string());

/// The database name
pub static POSTGRES_DB: EnvVar = EnvVar::required("POSTGRES_DB");

/// The port of the database server
pub static POSTGRES_PORT: EnvVar<u16> = EnvVar::optional("POSTGRES_PORT", || 5432);

/// The user to use for the database connection
pub static POSTGRES_USER: EnvVar = EnvVar::optional("POSTGRES_USER", || "postgres".to_string());

/// Password for the user
pub static POSTGRES_PASSWORD: EnvVar = EnvVar::optional("POSTGRES_PASSWORD", || "".to_string());

/// Bundle of all database variables combined in `rorm`'s format
pub static DB: LazyLock<DatabaseDriver> = LazyLock::new(|| DatabaseDriver::Postgres {
    name: POSTGRES_DB.clone(),
    host: POSTGRES_HOST.clone(),
    port: *POSTGRES_PORT,
    user: POSTGRES_USER.clone(),
    password: POSTGRES_PASSWORD.clone(),
});

/// The endpoint to export opentelemetry traces to
///
/// This variable is defined in the opentelemetry specifications and used implicitly by our dependencies.
/// It is declared explicitly here to be easier to discover and change its default.
pub static OTEL_EXPORTER_OTLP_ENDPOINT: EnvVar =
    EnvVar::optional("OTEL_EXPORTER_OTLP_ENDPOINT", || {
        "http://jaeger-dev:4317".to_string()
    });
