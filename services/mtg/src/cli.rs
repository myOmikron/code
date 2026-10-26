use std::num::NonZeroU64;
use std::path::PathBuf;

use clap::Parser;
use clap::Subcommand;
use clap::ValueEnum;

use crate::models::account::Role;

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
    ///
    /// Always takes every printing in every language — a collection holding a
    /// single German card would otherwise not resolve it.
    ///
    /// One shot: it reads the catalog and exits, so a scheduler outside it
    /// decides how often that happens. A run whose file Scryfall has not
    /// regenerated since the last one downloads nothing and exits successfully,
    /// which is what makes it cheap to run on a timer.
    SyncCatalog {
        /// Read the file even when it is the one already read
        ///
        /// Refused together with `--every-minutes`: a service that forced every
        /// tick would download the whole catalog around the clock, which is the
        /// one thing the stamp check exists to prevent.
        #[clap(long, conflicts_with = "every_minutes")]
        force: bool,

        /// Keep running and sync this often, in minutes, instead of exiting
        ///
        /// What turns the one shot into a service for a compose stack, which
        /// has no scheduler of its own. Left out, the command runs once and
        /// exits — which is the shape a Kubernetes CronJob wants.
        #[clap(long, value_name = "MINUTES")]
        every_minutes: Option<NonZeroU64>,
    },
    /// Pull Cardmarket's price guide into the price history
    ///
    /// Cardmarket publishes the guide as a public file, regenerated once a
    /// night. One row per product per day, thinned to one a week beyond the
    /// daily window — see `models::price`.
    ///
    /// Re-runnable: a day already read is overwritten with what the file says.
    ///
    /// One shot, like `sync-catalog`: it applies the file and exits, and a run
    /// whose file the CDN has not replaced downloads nothing.
    SyncPriceGuide {
        /// Read the file even when it is the one already read
        ///
        /// Refused together with `--every-minutes` for the same reason as on
        /// `sync-catalog`: a service that forced every tick would pull
        /// twenty-five megabytes around the clock.
        #[clap(long, conflicts_with = "every_minutes")]
        force: bool,

        /// Keep running and sync this often, in minutes, instead of exiting
        ///
        /// What turns the one shot into a service for a compose stack.
        #[clap(long, value_name = "MINUTES")]
        every_minutes: Option<NonZeroU64>,
    },
    /// Take a Statistics snapshot for the admin dashboard
    ///
    /// One shot like the syncs: it counts, stores the snapshot and exits.
    SnapshotStatistics {
        /// Keep running and take a snapshot this often, in minutes, instead of exiting
        #[clap(long, value_name = "MINUTES")]
        every_minutes: Option<NonZeroU64>,
    },
    /// Purge images and diagnostics of Bug reports done for more than 90 days
    ///
    /// Keeps their text, note and metadata. One shot like the syncs unless
    /// `--every-minutes` keeps it running as its own service.
    PurgeBugReports {
        /// Keep running and purge this often, in minutes, instead of exiting
        #[clap(long, value_name = "MINUTES")]
        every_minutes: Option<NonZeroU64>,
    },
    /// Report whether the server is up, for the container's healthcheck
    ///
    /// Connects to the listener on loopback and exits non-zero if nothing
    /// answers. That is the check the sync containers wait on: `start` opens
    /// the listener only after the migrations have been applied, so a webserver
    /// that answers is a database that is migrated.
    Health,
    /// Write the frontend's openapi document to a file and exit
    ///
    /// Needs no database, no NATS and no config, see
    /// `service_bootstrap::openapi::write_openapi`. `just gen-api` builds the
    /// frontend's api client from it.
    Openapi {
        /// Where to write the document
        output: PathBuf,
    },
    /// Check that the stock rollup still matches the collections
    ///
    /// `collection_stock` is kept by triggers, so it can only fall out of step
    /// through a bug or a hand-written write. This counts the entries the long
    /// way round and reports every key the two disagree about; it changes
    /// nothing unless `--repair` says so.
    CheckStock {
        /// Count the rollup again from the entries instead of only reporting
        #[clap(long)]
        repair: bool,
    },
    /// Set an Account's Role
    ///
    /// How the first Admin is made; afterwards Admins change Roles in the
    /// admin dashboard.
    SetRole {
        /// Username of the Account, case ignored
        username: String,
        /// The new Role
        #[clap(value_enum)]
        role: CliRole,
    },
    /// Print a fresh VAPID key pair for Web Push and exit
    ///
    /// The private key goes into `VAPID_PRIVATE_KEY`. Needs no config. Keep
    /// it for the life of the origin: replacing it orphans every subscribed
    /// device.
    GenerateVapidKey,
}

/// Role assignable via the cli
#[derive(Copy, Clone, Debug, ValueEnum)]
pub enum CliRole {
    /// Manages its own collections and decks
    Member,
    /// Also manages other Accounts in the admin dashboard
    Admin,
}

impl From<CliRole> for Role {
    fn from(value: CliRole) -> Self {
        match value {
            CliRole::Member => Role::Member,
            CliRole::Admin => Role::Admin,
        }
    }
}

#[cfg(test)]
mod tests {
    use clap::Parser;

    use super::Cli;
    use super::Command;

    #[test]
    fn snapshot_statistics_runs_once_without_an_interval() {
        let cli = Cli::try_parse_from(["mtg", "snapshot-statistics"]).expect("valid arguments");
        assert!(matches!(
            cli.command,
            Command::SnapshotStatistics {
                every_minutes: None
            }
        ));
    }

    #[test]
    fn snapshot_statistics_takes_an_interval_in_minutes() {
        let cli = Cli::try_parse_from(["mtg", "snapshot-statistics", "--every-minutes", "60"])
            .expect("valid arguments");
        let Command::SnapshotStatistics { every_minutes } = cli.command else {
            panic!("parsed another subcommand");
        };
        assert_eq!(every_minutes.map(|minutes| minutes.get()), Some(60));
    }

    #[test]
    fn snapshot_statistics_refuses_a_zero_interval() {
        assert!(
            Cli::try_parse_from(["mtg", "snapshot-statistics", "--every-minutes", "0"]).is_err()
        );
    }

    #[test]
    fn purge_bug_reports_runs_once_without_an_interval() {
        let cli = Cli::try_parse_from(["mtg", "purge-bug-reports"]).expect("valid arguments");
        assert!(matches!(
            cli.command,
            Command::PurgeBugReports {
                every_minutes: None
            }
        ));
    }

    #[test]
    fn purge_bug_reports_takes_an_interval_in_minutes() {
        let cli = Cli::try_parse_from(["mtg", "purge-bug-reports", "--every-minutes", "720"])
            .expect("valid arguments");
        let Command::PurgeBugReports { every_minutes } = cli.command else {
            panic!("parsed another subcommand");
        };
        assert_eq!(every_minutes.map(|minutes| minutes.get()), Some(720));
    }

    #[test]
    fn purge_bug_reports_refuses_a_zero_interval() {
        assert!(Cli::try_parse_from(["mtg", "purge-bug-reports", "--every-minutes", "0"]).is_err());
    }
}
