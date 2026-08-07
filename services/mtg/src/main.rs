use std::error::Error;
use std::io;
use std::net::SocketAddr;

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

use crate::cli::Cli;
use crate::cli::Command;
use crate::config::Config;
use crate::modules::config::Conf;
use crate::modules::webauthn::WebauthnModule;
use crate::modules::webauthn::WebauthnSetup;

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
        .register_module::<Nats>(NatsSetup::FromEnv)
        .init_modules()
        .await?;

    builder.add_listener(
        SocketAddr::new(config.listen_address, config.listen_port.get()),
        http::get_routes(),
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

    /// Temporary file to store models in
    const MODELS: &str = "/tmp/.models.json";

    let mut file = std::fs::File::create(MODELS)?;
    rorm::write_models(&mut file)?;
    file.flush()?;

    rorm::cli::make_migrations::run_make_migrations(
        rorm::cli::make_migrations::MakeMigrationsOptions {
            models_file: MODELS.to_string(),
            migration_dir: migrations_dir.to_string(),
            name: None,
            non_interactive: false,
            warnings_disabled: false,
        },
    )?;

    std::fs::remove_file(MODELS)?;
    Ok(())
}
