use std::error::Error;
use std::fmt;
use std::io;
use std::net::Ipv4Addr;
use std::net::SocketAddr;
use std::num::NonZeroU64;
use std::time::Duration;

use clap::Parser;
use galvyn::ModuleBuilder;
use galvyn::RouterBuilder;
use galvyn::core::modules::database::DatabaseSetup;
use galvyn::core::re_exports::rorm;
use galvyn::error::GalvynError;
use galvyn::rorm::Database;
use galvyn::rorm::DatabaseConfiguration;
use galvyn::rorm::DatabaseDriver;
use galvyn::rorm::cli::migrate;
use galvyn::rorm::config::DatabaseConfig;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn_identity::IdentityModule;
use galvyn_identity::IdentitySetup;
use galvyn_identity::PasskeySetup;
use service_bootstrap::nats::publisher::Nats;
use service_bootstrap::nats::publisher::NatsSetup;
use tokio::net::TcpStream;
use tokio::time::sleep;
use tracing::error;
use tracing::info;
use tracing_subscriber::EnvFilter;

use crate::cli::Cli;
use crate::cli::Command;
use crate::config::Config;
use crate::http::FrontendApi;
use crate::models::account::Account;
use crate::models::account::Role;
use crate::models::account::Username;
use crate::models::admin_log::AdminActor;
use crate::models::collection::stock::StockDrift;
use crate::models::collection::stock::rebuild as rebuild_stock;
use crate::models::statistics::StatisticsSnapshot;
use crate::models::sync_run::SyncKind;
use crate::models::sync_run::SyncRun;
use crate::modules::config::Conf;
use crate::modules::graph::GraphClient;
use crate::modules::graph::GraphClientSetup;
use crate::modules::mpcfill::MpcFill;
use crate::modules::mpcfill::MpcFillSetup;
use crate::utils::catalog_sync::SyncOutcome;
use crate::utils::catalog_sync::sync_catalog;
use crate::utils::price_sync::PriceOutcome;
use crate::utils::price_sync::sync_price_guide;

mod cli;
pub mod config;
pub mod http;
pub mod models;
pub mod modules;
pub mod proto;
pub mod utils;

#[cfg(test)]
mod tests;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let cli = Cli::parse();

    match &cli.command {
        Command::Start => {
            service_bootstrap::run("mtg", config::load, run).await;
        }
        Command::MakeMigrations {
            migration_directory,
        } => {
            make_migrations(migration_directory)?;
        }
        Command::Migrate => {
            let conf = match config::load() {
                Ok(conf) => conf,
                Err(err) => return Err(Box::from(err)),
            };
            migrate(conf.database_driver).await?;
        }
        Command::SyncCatalog {
            force,
            every_minutes,
        } => {
            sync_catalog_command(*force, *every_minutes).await?;
        }
        Command::SyncPriceGuide {
            force,
            every_minutes,
        } => {
            sync_price_guide_command(*force, *every_minutes).await?;
        }
        Command::SnapshotStatistics { every_minutes } => {
            snapshot_statistics_command(*every_minutes).await?;
        }
        Command::Health => {
            health_command().await?;
        }
        Command::Openapi { output } => {
            service_bootstrap::openapi::write_openapi(http::routes(), FrontendApi, output).await?;
        }
        Command::CheckStock { repair } => {
            check_stock_command(*repair).await?;
        }
        Command::SetRole { username, role } => {
            set_role_command(username, Role::from(*role)).await?;
        }
    }

    Ok(())
}

/// Setups of the modules the service runs with
pub struct ModuleSetups {
    /// The loaded configuration
    pub config: Config,
    /// The NATS connection, `None` to run without one
    ///
    /// Only mail goes through NATS, so tests can leave it out.
    pub nats: Option<NatsSetup>,
}

/// Registers and initializes all modules of the service
pub async fn init_modules(
    builder: &mut ModuleBuilder,
    setups: ModuleSetups,
) -> Result<RouterBuilder, GalvynError> {
    let ModuleSetups { config, nats } = setups;
    builder
        .register_module::<Conf>(Some(config.clone()))
        .register_module::<Database>(DatabaseSetup::Custom(DatabaseConfiguration::new(
            config.database_driver.clone(),
        )))
        .register_module::<IdentityModule>(IdentitySetup {
            public_origin: Some(config.public_origin.clone()),
            registration_link_path: "/auth/register".to_string(),
            passkey: PasskeySetup {
                rp_name: "MTG".to_string(),
            },
            ..IdentitySetup::default()
        })
        .register_module::<GraphClient>(GraphClientSetup {
            base_url: Some(config.graph_url.clone()),
        })
        .register_module::<MpcFill>(MpcFillSetup {
            base_url: Some(config.mpcfill_url.clone()),
        });
    if let Some(nats) = nats {
        builder.register_module::<Nats>(nats);
    }
    builder.init_modules().await
}

async fn run(mut builder: ModuleBuilder, config: Config) -> Result<RouterBuilder, GalvynError> {
    migrate(config.database_driver.clone()).await?;

    let listen = SocketAddr::new(config.listen_address, config.listen_port.get());
    let mut builder = init_modules(
        &mut builder,
        ModuleSetups {
            config,
            nats: Some(NatsSetup::FromEnv),
        },
    )
    .await?;

    builder.add_listener(listen, http::initialize_routes());

    Ok(builder)
}

/// Key for the advisory lock the migration runs under
///
/// Any constant does, as long as every process that migrates this database
/// picks the same one.
const MIGRATION_LOCK: i64 = 6_275_193_762_129_040_001;

/// Applies the migrations, one process at a time
///
/// Only `start` and the `migrate` subcommand migrate; the sync containers wait
/// for the webserver's healthcheck instead. Two migrations at once are still
/// possible, through a rolling restart or a hand-run `migrate`, and Postgres
/// answers a concurrent `CREATE OR REPLACE` of the same trigger function with
/// `tuple concurrently updated`, which is fatal. So the migration is taken
/// under a transaction-scoped advisory lock and the second one waits. The lock
/// lives on the transaction's own connection and is released by the commit;
/// `run_migrate_custom` connects separately and is unaffected by it beyond
/// having to wait its turn.
async fn migrate(driver: DatabaseDriver) -> Result<(), GalvynError> {
    fn io_error(error: impl fmt::Debug) -> GalvynError {
        GalvynError::Io(io::Error::other(format!("{error:?}")))
    }

    let database = Database::connect(DatabaseConfiguration::new(driver.clone()))
        .await
        .map_err(io_error)?;
    let mut guard = database.start_transaction().await.map_err(io_error)?;
    (&mut guard)
        .execute::<All>(
            format!("SELECT pg_advisory_xact_lock({MIGRATION_LOCK})"),
            Vec::new(),
        )
        .await
        .map_err(io_error)?;

    let migrated = migrate::run_migrate_custom(
        DatabaseConfig {
            driver,
            last_migration_table_name: None,
        },
        "/migrations".to_string(),
        None,
    )
    .await
    .map_err(|e| GalvynError::Io(io::Error::other(format!("{e:?}"))));

    guard.commit().await.map_err(io_error)?;
    database.close().await;

    migrated
}

fn make_migrations(migrations_dir: &str) -> Result<(), Box<dyn Error>> {
    use std::io::Write;

    // Temporary file to store models in — `temp_dir` honours `TMPDIR`, which
    // sandboxed environments point away from `/tmp`.
    let models = std::env::temp_dir().join(".models.json");
    let models = models.to_string_lossy().into_owned();

    let mut file = std::fs::File::create(&models)?;
    rorm::write_models(&mut file)?;
    file.flush()?;

    rorm::cli::make_migrations::run_make_migrations(
        rorm::cli::make_migrations::MakeMigrationsOptions {
            models_file: models.clone(),
            migration_dir: migrations_dir.to_string(),
            name: None,
            non_interactive: false,
            warnings_disabled: false,
        },
    )?;

    std::fs::remove_file(&models)?;
    Ok(())
}

/// Applies Scryfall's catalog outside a running server
///
/// Connects on its own rather than going through `service_bootstrap::run`: it
/// has no listener, no session store and no reason to bring up the rest of the
/// service.
///
/// Runs once and exits unless `every_minutes` is given, which is what lets one
/// image be both a Kubernetes CronJob and a compose service — a compose stack
/// has no scheduler, so for it the loop has to live in here.
/// Answers the container's healthcheck
///
/// A connect against the listener, nothing more: it says the process is up and
/// past its migrations, which is all the sync containers wait for. Deliberately
/// not an http request to a route, so it stays true no matter which routes the
/// service grows.
async fn health_command() -> Result<(), Box<dyn Error>> {
    let config = match config::load() {
        Ok(config) => config,
        Err(err) => return Err(Box::from(err)),
    };

    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, config.listen_port.get()));
    TcpStream::connect(address).await?;
    Ok(())
}

/// Report where the stock rollup and the collections disagree, and put it right
///
/// Reads before it writes even with `--repair`, so the log says what was wrong
/// rather than only that something was. An account whose numbers were off is
/// worth knowing about: the rollup is kept by triggers, and a drift means one
/// of them missed a write, which repairing the numbers does not fix.
async fn check_stock_command(repair: bool) -> Result<(), Box<dyn Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("mtg=info,warn")),
        )
        .init();

    let config = match config::load() {
        Ok(config) => config,
        Err(err) => return Err(Box::from(err)),
    };

    let database = Database::connect(DatabaseConfiguration::new(config.database_driver)).await?;
    let mut tx = database.start_transaction().await?;

    let drift = StockDrift::read(&mut tx).await?;
    for row in &drift {
        error!(
            owner = %row.owner,
            printing = %row.printing,
            finish = %row.finish,
            rolled_free = row.rolled_free,
            actual_free = row.actual_free,
            rolled_sleeved = row.rolled_sleeved,
            actual_sleeved = row.actual_sleeved,
            stale_card = row.stale_card,
            "The rollup and the collections disagree"
        );
    }

    if drift.is_empty() {
        info!("The stock rollup matches every collection");
    } else if repair {
        let rows = rebuild_stock(&mut tx).await?;
        info!(rows, keys = drift.len(), "Counted the rollup again");
    } else {
        info!(
            keys = drift.len(),
            "Run again with --repair to put it right"
        );
    }

    tx.commit().await?;
    // Dropping the pool instead leaves the last statements unflushed, and says
    // so in a warning on the way out.
    database.close().await;
    Ok(())
}

/// Set the Role of the Account named `username`
///
/// Fails on an unknown username, so a typo exits non-zero instead of
/// reporting success. A change lands in the Admin log with no acting Admin.
async fn set_role_command(username: &str, role: Role) -> Result<(), Box<dyn Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("mtg=info,warn")),
        )
        .init();

    let config = match config::load() {
        Ok(config) => config,
        Err(err) => return Err(Box::from(err)),
    };
    let username = Username::new(username)?;

    let database = Database::connect(DatabaseConfiguration::new(config.database_driver)).await?;
    let mut tx = database.start_transaction().await?;
    let Some(account) = Account::get_by_username(&mut tx, &username).await? else {
        tx.rollback().await?;
        database.close().await;
        return Err(format!("No account is named {}", username.as_str()).into());
    };
    let changed = Account::change_role(&mut tx, AdminActor::Cli, &account, role).await?;
    tx.commit().await?;
    database.close().await;

    if changed {
        info!(
            username = account.username.as_str(),
            ?role,
            "Changed the Role"
        );
    } else {
        info!(
            username = account.username.as_str(),
            ?role,
            "The Account has the Role already"
        );
    }
    Ok(())
}

async fn sync_catalog_command(
    force: bool,
    every_minutes: Option<NonZeroU64>,
) -> Result<(), Box<dyn Error>> {
    // `service_bootstrap::run` is what normally sets tracing up, and this path
    // never calls it. Without this the sync's own progress goes nowhere, which
    // is survivable for a command somebody is watching and not for a container
    // that is supposed to run unattended for months.
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("mtg=info,warn")),
        )
        .init();

    let config = match config::load() {
        Ok(config) => config,
        Err(err) => return Err(Box::from(err)),
    };

    let database = Database::connect(DatabaseConfiguration::new(config.database_driver)).await?;

    let Some(minutes) = every_minutes else {
        report_sync(
            SyncRun::track(&database, SyncKind::Catalog, sync_catalog(&database, force)).await?,
        );
        return Ok(());
    };

    let interval = Duration::from_secs(minutes.get().saturating_mul(60));
    info!(minutes = minutes.get(), "Syncing the catalog on a loop");
    loop {
        // A failed run must not end the container. Exiting would hand the retry
        // to docker's restart policy, which has no interval and would turn a
        // Scryfall outage into a hot loop against it.
        match SyncRun::track(&database, SyncKind::Catalog, sync_catalog(&database, false)).await {
            Ok(outcome) => report_sync(outcome),
            Err(error) => error!(error.display = %error, "Catalog sync failed, trying again later"),
        }
        sleep(interval).await;
    }
}

async fn sync_price_guide_command(
    force: bool,
    every_minutes: Option<NonZeroU64>,
) -> Result<(), Box<dyn Error>> {
    // Same reason as in `sync_catalog_command`: nothing else sets tracing up on
    // this path.
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("mtg=info,warn")),
        )
        .init();

    let config = match config::load() {
        Ok(config) => config,
        Err(err) => return Err(Box::from(err)),
    };

    let database = Database::connect(DatabaseConfiguration::new(config.database_driver)).await?;

    let Some(minutes) = every_minutes else {
        report_prices(
            SyncRun::track(
                &database,
                SyncKind::PriceGuide,
                sync_price_guide(&database, force),
            )
            .await?,
        );
        return Ok(());
    };

    let interval = Duration::from_secs(minutes.get().saturating_mul(60));
    info!(minutes = minutes.get(), "Syncing prices on a loop");
    loop {
        // A failed run must not end the container, see `sync_catalog_command`.
        match SyncRun::track(
            &database,
            SyncKind::PriceGuide,
            sync_price_guide(&database, false),
        )
        .await
        {
            Ok(outcome) => report_prices(outcome),
            Err(error) => error!(error.display = %error, "Price sync failed, trying again later"),
        }
        sleep(interval).await;
    }
}

/// Take Statistics snapshots, once or every `every_minutes`
///
/// Shaped like `sync_catalog_command`: a failed snapshot in the loop is logged
/// and tried again on the next tick instead of ending the container.
async fn snapshot_statistics_command(
    every_minutes: Option<NonZeroU64>,
) -> Result<(), Box<dyn Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("mtg=info,warn")),
        )
        .init();

    let config = match config::load() {
        Ok(config) => config,
        Err(err) => return Err(Box::from(err)),
    };

    let database = Database::connect(DatabaseConfiguration::new(config.database_driver)).await?;

    let Some(minutes) = every_minutes else {
        report_snapshot(take_snapshot(&database).await?);
        database.close().await;
        return Ok(());
    };

    let interval = Duration::from_secs(minutes.get().saturating_mul(60));
    info!(
        minutes = minutes.get(),
        "Taking statistics snapshots on a loop"
    );
    loop {
        match take_snapshot(&database).await {
            Ok(snapshot) => report_snapshot(snapshot),
            Err(error) => {
                error!(error.display = %error, "Statistics snapshot failed, trying again later")
            }
        }
        sleep(interval).await;
    }
}

/// Take and store one Statistics snapshot
async fn take_snapshot(database: &Database) -> Result<StatisticsSnapshot, Box<dyn Error>> {
    let mut tx = database.start_transaction().await?;
    let snapshot = StatisticsSnapshot::take(&mut tx).await?;
    tx.commit().await?;
    Ok(snapshot)
}

/// Logs what a snapshot counted
fn report_snapshot(snapshot: StatisticsSnapshot) {
    info!(
        accounts = snapshot.accounts,
        new_accounts = snapshot.new_accounts,
        collections = snapshot.collections,
        decks = snapshot.decks,
        public_decks = snapshot.public_decks,
        cards = snapshot.cards,
        open_scanner_sessions = snapshot.open_scanner_sessions,
        "Took a statistics snapshot"
    );
}

/// Says what a price run came to, next to `report_sync`
fn report_prices(outcome: PriceOutcome) {
    match outcome {
        PriceOutcome::Unchanged { etag } => {
            info!(%etag, "Price guide already up to date");
        }
        PriceOutcome::Synced(report) => {
            info!(
                day = report.day.map(tracing::field::display),
                read = report.read,
                written = report.written,
                skipped = report.skipped,
                compacted = report.compacted,
                "Synced the price guide"
            );
        }
    }
}

/// Says what a run came to, in the log where `docker logs` picks it up
fn report_sync(outcome: SyncOutcome) {
    match outcome {
        SyncOutcome::Unchanged { stamp } => {
            info!(%stamp, "Catalog already up to date");
        }
        SyncOutcome::Synced(report) => {
            info!(
                read = report.read,
                written = report.written,
                skipped = report.skipped,
                inherited = report.inherited,
                armed = report.armed,
                disarmed = report.disarmed,
                "Synced the catalog"
            );
        }
    }
}
