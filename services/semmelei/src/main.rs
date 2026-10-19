//! # semmelei
//!
//! Pre-order service for a small village shop.
#![warn(missing_docs)]

use std::error::Error;
use std::io;
use std::process::exit;

use clap::Parser;
use galvyn::Galvyn;
use galvyn::GalvynSetup;
use galvyn::RouterBuilder;
use galvyn::core::Module;
use galvyn::core::modules::database::DatabaseSetup;
use galvyn::core::re_exports::rorm;
use galvyn::error::GalvynError;
use galvyn::rorm::Database;
use galvyn::rorm::DatabaseConfiguration;
use galvyn::rorm::DatabaseDriver;
use galvyn::rorm::config::DatabaseConfig;
use galvyn::rorm::fields::types::MaxStr;
use galvyn_identity::IdentityModule;
use galvyn_identity::IdentitySetup;
use galvyn_identity::PasskeySetup;
use service_bootstrap::PUBLIC_HTTP;
use service_bootstrap::nats::publisher::Nats;
use service_bootstrap::nats::publisher::NatsSetup;

use crate::cli::Cli;
use crate::cli::CliRole;
use crate::cli::Command;
use crate::config::Config;
use crate::models::Account;
use crate::models::Role;

pub mod cli;
pub mod config;
pub mod http;
pub mod models;
pub mod proto;
pub mod utils;

#[cfg(test)]
mod tests;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let cli = Cli::parse();

    match &cli.command {
        Command::Start => {
            service_bootstrap::run("semmelei", config::load, run).await;
        }
        Command::MakeMigrations {
            migration_directory,
        } => {
            make_migrations(migration_directory)?;
        }
        Command::CreateAccount { username, role } => {
            let config = config::load()?;
            create_account(config, username, *role).await?;
        }
        Command::Openapi { output } => {
            service_bootstrap::openapi::write_openapi(http::routes(), http::FrontendApi, output)
                .await?;
        }
    }

    Ok(())
}

async fn run(
    mut builder: galvyn::ModuleBuilder,
    config: Config,
) -> Result<RouterBuilder, GalvynError> {
    migrate(config.database_driver.clone()).await?;

    utils::mail::init(config.public_origin.clone());

    let mut builder = init_modules(
        &mut builder,
        ModuleSetups {
            config: config.clone(),
            nats: Some(NatsSetup::FromEnv),
        },
    )
    .await?;

    // Freezes pickup days once their deadline passes, and sends the binding
    // confirmations. Runs in-process: it needs nothing but the database and
    // the clock, and a second deployment unit for one timer is not worth it.
    tokio::spawn(utils::lock::run_deadline_job());

    builder.add_listener(PUBLIC_HTTP, http::initialize_routes());
    Ok(builder)
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
    builder: &mut galvyn::ModuleBuilder,
    setups: ModuleSetups,
) -> Result<RouterBuilder, GalvynError> {
    let ModuleSetups { config, nats } = setups;
    builder
        .register_module::<Database>(DatabaseSetup::Custom(DatabaseConfiguration::new(
            config.database_driver.clone(),
        )))
        .register_module::<IdentityModule>(identity_setup(&config));
    if let Some(nats) = nats {
        builder.register_module::<Nats>(nats);
    }
    builder.init_modules().await
}

/// Setup of the [`IdentityModule`], shared by the service and the cli
fn identity_setup(config: &Config) -> IdentitySetup {
    IdentitySetup {
        public_origin: Some(config.public_origin.clone()),
        registration_link_path: "/register".to_string(),
        passkey: PasskeySetup {
            rp_name: "Semmelei".to_string(),
        },
        ..IdentitySetup::default()
    }
}

async fn migrate(driver: DatabaseDriver) -> Result<(), GalvynError> {
    rorm::cli::migrate::run_migrate_custom(
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

/// Create an account and print a one-time passkey registration link.
///
/// Passkey registration needs a browser, so unlike password-based services
/// the cli only prepares the account and hands out an invite link.
async fn create_account(
    config: Config,
    username: &str,
    role: CliRole,
) -> Result<(), Box<dyn Error>> {
    let username = username.trim().to_string();
    if username.is_empty() {
        eprintln!("Empty username is not allowed");
        exit(1);
    }
    let username = MaxStr::new(username)?;

    Galvyn::builder(GalvynSetup::default())
        .register_module::<Database>(DatabaseSetup::Custom(DatabaseConfiguration::new(
            config.database_driver.clone(),
        )))
        .register_module::<IdentityModule>(identity_setup(&config))
        .init_modules()
        .await?;

    let mut tx = Database::global().start_transaction().await?;

    if Account::get_by_username(&mut tx, &username)
        .await?
        .is_some()
    {
        eprintln!("There is already an account with that name");
        exit(1);
    }

    let (_account, identity) = Account::insert(
        &mut tx,
        username,
        match role {
            CliRole::Admin => Role::Admin,
            CliRole::Verkauf => Role::Verkauf,
        },
    )
    .await?;

    let identity_module = IdentityModule::global();
    let link = identity_module
        .issue_registration_link(&mut tx, identity)
        .await?;

    tx.commit().await?;

    println!("Created account.");
    println!(
        "One-time passkey registration link (valid for {} days):",
        identity_module.registration_link_validity().whole_days()
    );
    println!("  {link}");

    Ok(())
}
