use galvyn::core::InitError;
use galvyn::core::Module;
use galvyn::core::PreInitError;

use crate::config::Config;

pub struct Conf {
    pub config: Config,
}

impl Module for Conf {
    type Setup = Option<Config>;
    type PreInit = Config;

    async fn pre_init(setup: Self::Setup) -> Result<Self::PreInit, PreInitError> {
        Ok(setup.expect("Could not load config"))
    }

    type Dependencies = ();

    async fn init(
        pre_init: Self::PreInit,
        _dependencies: &mut Self::Dependencies,
    ) -> Result<Self, InitError> {
        Ok(Self { config: pre_init })
    }
}
