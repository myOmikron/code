use galvyn::rorm::DatabaseDriver;
use service_bootstrap::config::ConfigError;
use service_bootstrap::config::EnvLoader;

#[derive(Debug)]
pub struct Config {
    /// Database connection parameters
    pub database_driver: DatabaseDriver,
}

pub fn load() -> Result<Config, ConfigError> {
    let mut env = EnvLoader::new();

    let postgres_host = env.require("POSTGRES_HOST");
    let postgres_db = env.require("POSTGRES_DB");
    let postgres_port = env.require_parse("POSTGRES_PORT");
    let postgres_user = env.require("POSTGRES_USER");
    let postgres_password = env.require("POSTGRES_PASSWORD");

    env.finish()?;

    Ok(Config {
        database_driver: DatabaseDriver::Postgres {
            name: postgres_db.unwrap(),
            host: postgres_host.unwrap(),
            port: postgres_port.unwrap(),
            user: postgres_user.unwrap(),
            password: postgres_password.unwrap(),
        },
    })
}
