use service_bootstrap::config::ConfigError;

pub struct Config {}

pub fn load() -> Result<Config, ConfigError> {
    Ok(Config {})
}
