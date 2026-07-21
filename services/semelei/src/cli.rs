//! CLI for semelei

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

/// The subcommands of semelei
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
}

/// Pre-order service for a small village shop
#[derive(Parser)]
pub struct Cli {
    /// The command to execute
    #[clap(subcommand)]
    pub command: Command,
}
