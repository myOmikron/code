//! A throwaway Postgres database for the module's own tests
//!
//! The migrations are generated from the models linked into the test binary
//! and applied to a fresh database, created once per test binary. The
//! Postgres server comes from `TEST_POSTGRES_HOST`, `TEST_POSTGRES_PORT`,
//! `TEST_POSTGRES_USER` and `TEST_POSTGRES_PASSWORD`, defaulting to
//! `localhost:5432` where the dev infra stack publishes `test-postgres`
//! (`just dev infra up -d --wait test-postgres`).
//!
//! Ported from `services/mtg/src/tests/harness.rs`.

use std::future::Future;
use std::io::Write;
use std::path::PathBuf;
use std::sync::LazyLock;

use galvyn::Galvyn;
use galvyn::GalvynSetup;
use galvyn::core::modules::database::DatabaseSetup;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::DatabaseConfiguration;
use galvyn::rorm::DatabaseDriver;
use tokio::runtime::Runtime;
use tokio::sync::OnceCell;
use uuid::Uuid;

/// Prefix of every database the harness creates
const DATABASE_PREFIX: &str = "galvyn_identity_test_";

/// Runs a test on the runtime the database pool lives on
///
/// galvyn's modules are process-wide and their connection pools are bound to
/// the runtime that created them, so every database test shares one runtime
/// instead of using `#[tokio::test]`.
pub(crate) fn run<F: Future>(test: F) -> F::Output {
    static RUNTIME: LazyLock<Runtime> = LazyLock::new(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("build the test runtime")
    });
    RUNTIME.block_on(test)
}

/// Make sure [`Database::global`] is a migrated, fresh database
pub(crate) async fn database() {
    static DATABASE: OnceCell<()> = OnceCell::const_new();
    DATABASE
        .get_or_init(|| async {
            let driver = create_database().await;
            Galvyn::builder(GalvynSetup {
                disable_panic_hook: true,
                ..Default::default()
            })
            .register_module::<Database>(DatabaseSetup::Custom(DatabaseConfiguration::new(driver)))
            .init_modules()
            .await
            .expect("initialize the database module");
        })
        .await;
}

/// Creates a fresh database with migrations of the linked models applied
///
/// Databases left over from earlier runs are dropped first, unless a run still uses them.
async fn create_database() -> DatabaseDriver {
    let var = |name: &str, default: &str| std::env::var(name).unwrap_or_else(|_| default.into());
    let host = var("TEST_POSTGRES_HOST", "localhost");
    let port = var("TEST_POSTGRES_PORT", "5432")
        .parse()
        .expect("TEST_POSTGRES_PORT is a port");
    let user = var("TEST_POSTGRES_USER", "postgres");
    let password = var("TEST_POSTGRES_PASSWORD", "");
    let driver = |name: String| DatabaseDriver::Postgres {
        name,
        host: host.clone(),
        port,
        user: user.clone(),
        password: password.clone(),
    };

    let server = Database::connect(DatabaseConfiguration::new(driver("postgres".to_string())))
        .await
        .unwrap_or_else(|error| {
            panic!(
                "No Postgres for the tests at {host}:{port} ({error}). \
                 Start one with `just dev infra up -d --wait test-postgres` \
                 or point TEST_POSTGRES_HOST and TEST_POSTGRES_PORT at one."
            )
        });

    let leftovers: Vec<String> =
        sqlx::query_scalar("SELECT datname FROM pg_database WHERE datname LIKE $1")
            .bind(format!("{DATABASE_PREFIX}%"))
            .fetch_all(server.as_pool())
            .await
            .expect("list databases");
    for name in leftovers {
        let _ = sqlx::query(sqlx::AssertSqlSafe(format!(r#"DROP DATABASE "{name}""#)))
            .execute(server.as_pool())
            .await;
    }

    let name = format!("{DATABASE_PREFIX}{}", Uuid::new_v4().simple());
    sqlx::query(sqlx::AssertSqlSafe(format!(r#"CREATE DATABASE "{name}""#)))
        .execute(server.as_pool())
        .await
        .expect("create the test database");
    server.close().await;

    let directory = make_migrations();
    rorm::cli::migrate::run_migrate_custom(
        rorm::config::DatabaseConfig {
            driver: driver(name.clone()),
            last_migration_table_name: None,
        },
        directory.join("migrations").to_string_lossy().into_owned(),
        None,
    )
    .await
    .expect("apply the migrations");
    let _ = std::fs::remove_dir_all(&directory);

    driver(name)
}

/// Generate migrations of the linked models below a fresh directory and return it
///
/// They land in its `migrations` subdirectory.
fn make_migrations() -> PathBuf {
    let directory = std::env::temp_dir().join(format!("{DATABASE_PREFIX}{}", Uuid::new_v4()));
    std::fs::create_dir_all(&directory).expect("create the migrations directory");
    let models = directory.join(".models.json");

    let mut file = std::fs::File::create(&models).expect("create the models file");
    rorm::write_models(&mut file).expect("write the models");
    file.flush().expect("write the models");

    let migrations = directory.join("migrations");
    std::fs::create_dir_all(&migrations).expect("create the migrations directory");
    rorm::cli::make_migrations::run_make_migrations(
        rorm::cli::make_migrations::MakeMigrationsOptions {
            models_file: models.to_string_lossy().into_owned(),
            migration_dir: migrations.to_string_lossy().into_owned(),
            name: None,
            non_interactive: true,
            warnings_disabled: true,
        },
    )
    .expect("generate the migrations");
    directory
}
