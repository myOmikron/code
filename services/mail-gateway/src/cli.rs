//! CLI for mail-gateway

use clap::Parser;
use clap::Subcommand;

/// The subcommands of mail-gateway
#[derive(Subcommand)]
pub enum Command {
    /// Start the service
    Start,
}

/// Gateway consuming `mail.>` NATS messages and delivering them via SMTP
#[derive(Parser)]
pub struct Cli {
    /// The command to execute
    #[clap(subcommand)]
    pub command: Command,
}
