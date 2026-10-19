//! CLI for semmelei

use std::path::PathBuf;

use clap::Parser;
use clap::Subcommand;
use clap::ValueEnum;

/// Role assignable via the cli
#[derive(Copy, Clone, Debug, ValueEnum)]
pub enum CliRole {
    /// Manages items, prices, categories and staff accounts
    Admin,
    /// Processes incoming pre-orders in the shop
    Verkauf,
}

/// The subcommands of semmelei
#[derive(Subcommand)]
pub enum Command {
    /// Start the service
    Start,
    /// Create an account and print a one-time passkey registration link
    CreateAccount {
        /// Username of the new account
        username: String,
        /// Role of the new account
        #[clap(long, value_enum, default_value_t = CliRole::Verkauf)]
        role: CliRole,
    },
    /// Create migration files
    MakeMigrations {
        /// Directory to write the migrations to
        migration_directory: String,
    },
    /// Write the frontend's openapi document to a file and exit
    ///
    /// Needs no database, no NATS and no config, see
    /// `service_bootstrap::openapi::write_openapi`. `just gen-api` builds the
    /// frontend's api client from it.
    Openapi {
        /// Where to write the document
        output: PathBuf,
    },
}

/// Pre-order service for a small village shop
#[derive(Parser)]
pub struct Cli {
    /// The command to execute
    #[clap(subcommand)]
    pub command: Command,
}
