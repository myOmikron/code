use std::error::Error;
use std::io;
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
use service_bootstrap::nats::publisher::Nats;
use service_bootstrap::nats::publisher::NatsSetup;
use tokio::time::sleep;
use tracing::error;
use tracing::info;
use tracing_subscriber::EnvFilter;

use crate::cli::Cli;
use crate::cli::Command;
use crate::config::Config;
use crate::models::collection::stock::StockDrift;
use crate::models::collection::stock::rebuild as rebuild_stock;
use crate::modules::config::Conf;
use crate::modules::graph::GraphClient;
use crate::modules::graph::GraphClientSetup;
use crate::modules::webauthn::WebauthnModule;
use crate::modules::webauthn::WebauthnSetup;
use crate::utils::catalog_sync::SyncOutcome;
use crate::utils::catalog_sync::sync_catalog;

mod cli;
pub mod config;
pub mod http;
pub mod models;
pub mod modules;
pub mod proto;
pub mod utils;

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
        Command::CheckStock { repair } => {
            check_stock_command(*repair).await?;
        }
    }

    Ok(())
}

async fn run(mut builder: ModuleBuilder, config: Config) -> Result<RouterBuilder, GalvynError> {
    migrate(config.database_driver.clone()).await?;

    let mut builder = builder
        .register_module::<Conf>(Some(config.clone()))
        .register_module::<Database>(DatabaseSetup::Custom(DatabaseConfiguration::new(
            config.database_driver.clone(),
        )))
        .register_module::<WebauthnModule>(WebauthnSetup {
            public_origin: Some(config.public_origin.clone()),
        })
        .register_module::<GraphClient>(GraphClientSetup {
            base_url: Some(config.graph_url.clone()),
        })
        .register_module::<Nats>(NatsSetup::FromEnv)
        .init_modules()
        .await?;

    builder.add_listener(
        SocketAddr::new(config.listen_address, config.listen_port.get()),
        http::initialize_routes(),
    );

    Ok(builder)
}

async fn migrate(driver: DatabaseDriver) -> Result<(), GalvynError> {
    migrate::run_migrate_custom(
        DatabaseConfig {
            driver,
            last_migration_table_name: None,
        },
        "/migrations".to_string(),
        None,
    )
    .await
    .map_err(|e| GalvynError::Io(io::Error::other(format!("{e:?}"))))
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

    migrate(config.database_driver.clone()).await?;
    let database = Database::connect(DatabaseConfiguration::new(config.database_driver)).await?;

    let Some(minutes) = every_minutes else {
        report_sync(sync_catalog(&database, force).await?);
        return Ok(());
    };

    let interval = Duration::from_secs(minutes.get().saturating_mul(60));
    info!(minutes = minutes.get(), "Syncing the catalog on a loop");
    loop {
        // A failed run must not end the container. Exiting would hand the retry
        // to docker's restart policy, which has no interval and would turn a
        // Scryfall outage into a hot loop against it.
        match sync_catalog(&database, false).await {
            Ok(outcome) => report_sync(outcome),
            Err(error) => error!(error.display = %error, "Catalog sync failed, trying again later"),
        }
        sleep(interval).await;
    }
}

/// Says what a run came to, on stdout where `docker logs` picks it up
fn report_sync(outcome: SyncOutcome) {
    match outcome {
        SyncOutcome::Unchanged { stamp } => {
            println!("catalog already up to date ({stamp})");
        }
        SyncOutcome::Synced(report) => {
            println!(
                "read {} printings, wrote {}, skipped {}; armed {} alarms, disarmed {}",
                report.read, report.written, report.skipped, report.armed, report.disarmed
            );
        }
    }
}
