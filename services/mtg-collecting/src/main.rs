use std::error::Error;

use clap::Parser;
use galvyn::ModuleBuilder;
use galvyn::RouterBuilder;
use galvyn::error::GalvynError;

use crate::cli::Cli;
use crate::cli::Command;
use crate::config::Config;
use crate::modules::config::Conf;

mod cli;
pub mod config;
pub mod modules;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let cli = Cli::parse();

    match &cli.command {
        Command::Start => {
            service_bootstrap::run("mtg-collecting", config::load, run).await;
        }
    }
}

async fn run(mut builder: ModuleBuilder, config: Config) -> Result<RouterBuilder, GalvynError> {
    let builder = builder
        .register_module::<Conf>(Some(config))
        .init_modules()
        .await?;

    Ok(builder)
}
