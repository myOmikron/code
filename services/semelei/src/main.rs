//! # semelei
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
use service_bootstrap::PUBLIC_HTTP;

use crate::cli::Cli;
use crate::cli::CliRole;
use crate::cli::Command;
use crate::config::Config;
use crate::models::Account;
use crate::models::RegistrationToken;
use crate::models::Role;
use crate::modules::webauthn::WebauthnModule;
use crate::modules::webauthn::WebauthnSetup;

pub mod cli;
pub mod config;
pub mod http;
pub mod models;
pub mod modules;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let cli = Cli::parse();

    match &cli.command {
        Command::Start => {
            service_bootstrap::run("semelei", config::load, run).await;
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
    }

    Ok(())
}

async fn run(
    mut builder: galvyn::ModuleBuilder,
    config: Config,
) -> Result<RouterBuilder, GalvynError> {
    migrate(config.database_driver.clone()).await?;

    let mut builder = builder
        .register_module::<Database>(DatabaseSetup::Custom(DatabaseConfiguration::new(
            config.database_driver.clone(),
        )))
        .register_module::<WebauthnModule>(WebauthnSetup {
            public_origin: Some(config.public_origin.clone()),
        })
        .init_modules()
        .await?;

    builder.add_listener(PUBLIC_HTTP, http::initialize_routes());
    Ok(builder)
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
            config.database_driver,
        )))
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

    let account_uuid = Account::insert(
        &mut tx,
        username,
        match role {
            CliRole::Admin => Role::Admin,
            CliRole::Verkauf => Role::Verkauf,
        },
    )
    .await?;

    let token = RegistrationToken::create(&mut tx, account_uuid).await?;

    tx.commit().await?;

    let mut link = config.public_origin;
    link.set_path("/register");
    link.set_query(Some(&format!("token={token}")));
    println!("Created account.");
    println!("One-time passkey registration link (valid for 7 days):");
    println!("  {link}");

    Ok(())
}
