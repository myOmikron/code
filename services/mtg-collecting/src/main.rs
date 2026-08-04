use std::error::Error;

use clap::Parser;
use galvyn::ModuleBuilder;
use galvyn::RouterBuilder;
use galvyn::error::GalvynError;

use crate::cli::Cli;
use crate::cli::Command;
use crate::config::Config;

mod cli;
pub mod config;

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
    let builder = builder.init_modules().await?;

    Ok(builder)
}
