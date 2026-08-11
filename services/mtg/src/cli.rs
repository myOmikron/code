use clap::Parser;
use clap::Subcommand;

#[derive(Parser)]
pub struct Cli {
    #[clap(subcommand)]
    pub command: Command,
}

#[derive(Subcommand)]
pub enum Command {
    Start,
    MakeMigrations {
        #[clap(default_value_t = String::from("/migrations"))]
        migration_directory: String,
    },
    Migrate,
    /// Pull Scryfall's card catalog into the database
    ///
    /// Re-runnable: every printing is overwritten with what the file says, so
    /// running it again is how prices are refreshed.
    SyncCatalog {
        /// Take every language rather than one printing per card
        ///
        /// Needed as soon as a collection holds cards in another language, and
        /// several times the download.
        #[clap(long)]
        all_languages: bool,
    },
}
