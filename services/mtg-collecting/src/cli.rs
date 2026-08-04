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
}
