//! Definitions of the CLI arguments

use std::path::PathBuf;

use clap::Parser;
use clap::Subcommand;

/// The cli
#[derive(Parser)]
pub struct Cli {
    /// The available subcommands
    #[clap(subcommand)]
    pub command: Command,
}

/// All available commands
#[derive(Subcommand)]
pub enum Command {
    /// Start the server
    Start {
        /// Do not try to migrate
        #[clap(short, long)]
        without_migrations: bool,
    },
    /// Run the migrations on the database
    Migrate {
        /// The directory where the migration files are located in
        #[clap(default_value_t = String::from("/migrations"))]
        migrations_dir: String,
    },
    /// Create new migrations
    #[cfg(debug_assertions)]
    MakeMigrations {
        /// The directory where the migration files are located in
        #[clap(default_value_t = String::from("/migrations"))]
        migrations_dir: String,
    },
    /// Create a superadmin account
    CreateAdmin {
        /// The username that should be set for the new account
        username: String,
        /// The display name for the user
        display_name: String,
    },
    /// Import a list of users and clubs from a JSON file
    ImportData {
        /// Path to the file where to read the data from
        filename: String,
    },
    /// Write the frontend's openapi document to a file and exit
    ///
    /// Needs no database, no mailcow and no config, see
    /// `service_bootstrap::openapi::write_openapi`. `just gen-api` builds the
    /// frontend's api client from it.
    Openapi {
        /// Where to write the document
        output: PathBuf,
    },
}
