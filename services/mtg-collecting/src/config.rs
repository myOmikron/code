use service_bootstrap::config::ConfigError;

#[derive(Debug)]
pub struct Config {}

pub fn load() -> Result<Config, ConfigError> {
    Ok(Config {})
}
