//! In-process HTTP test harness
//!
//! Initializes the service's modules and builds its router once per test binary, against
//! a fresh Postgres database with the migrations applied. [`TestClient`] then sends
//! requests into that router like a browser would, with a cookie jar.
//!
//! The Postgres server comes from `TEST_POSTGRES_HOST`, `TEST_POSTGRES_PORT`,
//! `TEST_POSTGRES_USER` and `TEST_POSTGRES_PASSWORD`, defaulting to `localhost:5432`
//! where the dev infra stack publishes `test-postgres` (`just dev infra up -d --wait test-postgres`).
//!
//! Ported from `services/bnv-manager-v2/src/tests/harness.rs`. Login runs no WebAuthn
//! ceremony: [`TestClient::log_in`] goes through a test-only route that marks the
//! session logged in (`galvyn-identity`'s `test-support` feature).
//!
//! OIDC login runs against a fake OpenID provider, configured as `google`:
//! [`App::fake`] plays the provider's authorization endpoint.

use std::collections::HashMap;
use std::future::Future;
use std::net::IpAddr;
use std::net::Ipv4Addr;
use std::num::NonZeroU16;
use std::sync::LazyLock;
use std::sync::atomic::AtomicU32;
use std::sync::atomic::Ordering;

use galvyn::Galvyn;
use galvyn::GalvynSetup;
use galvyn::core::Module;
use galvyn::core::re_exports::axum::Router;
use galvyn::core::re_exports::axum::body::Body;
use galvyn::core::re_exports::axum::body::Bytes;
use galvyn::core::re_exports::axum::body::to_bytes;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::http::HeaderMap;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::Request;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::http::header;
use galvyn::core::re_exports::axum::routing::post;
use galvyn::core::session;
use galvyn::core::session::Session;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::DatabaseConfiguration;
use galvyn::rorm::DatabaseDriver;
use galvyn::rorm::fields::types::MaxStr;
use galvyn_identity::FakeOpenIdProvider;
use galvyn_identity::IdentityModule;
use serde::Serialize;
use serde::de::DeserializeOwned;
use tokio::runtime::Runtime;
use tokio::sync::OnceCell;
use tower::ServiceExt;
use url::Url;
use uuid::Uuid;

use crate::ModuleSetups;
use crate::config::Config;
use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::account::Role;
use crate::models::account::Username;

/// Prefix of every database the harness creates
const DATABASE_PREFIX: &str = "mtg_test_";

/// The origin the service believes it is reachable under
pub fn origin() -> Url {
    Url::parse("http://mtg.test").expect("valid url")
}

/// The url of a frontend API route, `path` relative to `/api/frontend/v1/`
pub fn api(path: &str) -> Url {
    origin()
        .join("/api/frontend/v1/")
        .and_then(|base| base.join(path))
        .expect("valid path")
}

/// Runs a test on the runtime the modules live on
///
/// galvyn's modules are process-wide and their connection pools are bound to the runtime
/// that created them, so every test shares one runtime instead of using `#[tokio::test]`.
pub fn run<F: Future>(test: F) -> F::Output {
    static RUNTIME: LazyLock<Runtime> = LazyLock::new(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("build the test runtime")
    });
    RUNTIME.block_on(test)
}

/// The initialized service, shared by all tests of the binary
pub struct App {
    router: Router,
    fake: FakeOpenIdProvider,
}

impl App {
    /// The app, initialized on first use
    pub async fn get() -> &'static App {
        static APP: OnceCell<App> = OnceCell::const_new();
        APP.get_or_init(App::start).await
    }

    /// The fake OpenID provider the service knows as `google`
    pub async fn fake() -> &'static FakeOpenIdProvider {
        &App::get().await.fake
    }

    async fn start() -> App {
        let driver = create_database().await;
        let fake = FakeOpenIdProvider::start().await;

        crate::init_modules(
            &mut Galvyn::builder(GalvynSetup {
                disable_panic_hook: true,
                ..Default::default()
            }),
            ModuleSetups {
                config: Config {
                    public_origin: origin(),
                    graph_url: Url::parse("http://graph.invalid").expect("valid url"),
                    mpcfill_url: Url::parse("http://mpcfill.invalid/").expect("valid url"),
                    database_driver: driver,
                    listen_address: IpAddr::V4(Ipv4Addr::LOCALHOST),
                    listen_port: NonZeroU16::MIN,
                    openid_providers: vec![fake.provider_setup("google", true)],
                },
                nats: None,
            },
        )
        .await
        .expect("initialize the modules");

        let test_routes = Router::new()
            .route("/test/log-in/{username}", post(log_in))
            .layer(session::layer());

        App {
            router: crate::http::initialize_routes()
                .finish()
                .0
                .merge(test_routes),
            fake,
        }
    }
}

/// Marks the session logged in as the Account named `username`
async fn log_in(session: Session, Path(username): Path<String>) -> StatusCode {
    let username = Username::new(username).expect("valid username");
    let mut tx = Database::global()
        .start_transaction()
        .await
        .expect("start a transaction");
    let account = Account::get_by_username(&mut tx, &username)
        .await
        .expect("look the account up")
        .expect("the account exists");
    tx.commit().await.expect("commit");

    IdentityModule::global()
        .log_in_without_ceremony(&session, account.identity)
        .await
        .expect("write the session");
    StatusCode::OK
}

/// Creates a fresh database with the migrations applied
///
/// Databases left over from earlier runs are dropped first, unless a run still uses them.
async fn create_database() -> DatabaseDriver {
    let server = connect_server().await;
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
    server.close().await;

    migrated_database(None).await
}

/// The driver for the database `name` on the test Postgres server
fn test_driver(name: String) -> DatabaseDriver {
    let var = |name: &str, default: &str| std::env::var(name).unwrap_or_else(|_| default.into());
    DatabaseDriver::Postgres {
        name,
        host: var("TEST_POSTGRES_HOST", "localhost"),
        port: var("TEST_POSTGRES_PORT", "5432")
            .parse()
            .expect("TEST_POSTGRES_PORT is a port"),
        user: var("TEST_POSTGRES_USER", "postgres"),
        password: var("TEST_POSTGRES_PASSWORD", ""),
    }
}

/// Connects to the test Postgres server's maintenance database
async fn connect_server() -> Database {
    Database::connect(DatabaseConfiguration::new(test_driver(
        "postgres".to_string(),
    )))
    .await
    .unwrap_or_else(|error| {
        panic!(
            "No Postgres for the tests ({error}). \
             Start one with `just dev infra up -d --wait test-postgres` \
             or point TEST_POSTGRES_HOST and TEST_POSTGRES_PORT at one."
        )
    })
}

/// Creates a fresh database with the migrations up to `until` applied, all of them for `None`
///
/// For tests of a migration itself: they write the rows it finds into a database
/// stopped just before it, then [`migrate`] the rest.
pub async fn migrated_database(until: Option<u16>) -> DatabaseDriver {
    let name = format!("{DATABASE_PREFIX}{}", Uuid::new_v4().simple());
    let server = connect_server().await;
    sqlx::query(sqlx::AssertSqlSafe(format!(r#"CREATE DATABASE "{name}""#)))
        .execute(server.as_pool())
        .await
        .expect("create the test database");
    server.close().await;

    let driver = test_driver(name);
    migrate(&driver, until).await;
    driver
}

/// Applies the migrations up to `until` that the database is missing, all of them for `None`
pub async fn migrate(driver: &DatabaseDriver, until: Option<u16>) {
    rorm::cli::migrate::run_migrate_custom(
        rorm::config::DatabaseConfig {
            driver: driver.clone(),
            last_migration_table_name: None,
        },
        concat!(env!("CARGO_MANIFEST_DIR"), "/migrations").to_string(),
        until,
    )
    .await
    .expect("apply the migrations");
}

/// A request to the service, addressed by its absolute url
pub fn request(
    method: Method,
    url: &Url,
) -> galvyn::core::re_exports::axum::http::request::Builder {
    let origin = origin();
    assert_eq!(
        url.origin(),
        origin.origin(),
        "{url} is not served by this service"
    );
    let path_and_query = match url.query() {
        Some(query) => format!("{}?{query}", url.path()),
        None => url.path().to_string(),
    };
    Request::builder()
        .method(method)
        .uri(path_and_query)
        .header(header::HOST, origin.authority())
}

/// Sends requests into the router, keeping cookies like a browser
///
/// Each client comes from its own IP (`X-Real-IP`, as the reverse proxy sets it),
/// so rate limits of one test do not leak into another.
pub struct TestClient {
    cookies: HashMap<String, String>,
    real_ip: IpAddr,
}

impl TestClient {
    /// A client with an empty cookie jar
    pub fn new() -> Self {
        static NEXT_IP: AtomicU32 = AtomicU32::new(1);
        let offset = NEXT_IP.fetch_add(1, Ordering::Relaxed);
        Self {
            cookies: HashMap::new(),
            real_ip: IpAddr::V4(Ipv4Addr::from(
                u32::from(Ipv4Addr::new(10, 0, 0, 0)) + offset,
            )),
        }
    }

    /// A client whose session is logged in as `account`
    pub async fn logged_in(account: &TestAccount) -> Self {
        let mut client = Self::new();
        let response = client
            .send(
                request(
                    Method::POST,
                    &origin()
                        .join(&format!("/test/log-in/{}", account.username))
                        .expect("valid path"),
                )
                .body(Body::empty())
                .expect("valid request"),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK, "log in: {response:?}");
        client
    }

    /// `GET`s the url
    pub async fn get(&mut self, url: &Url) -> TestResponse {
        self.send(
            request(Method::GET, url)
                .body(Body::empty())
                .expect("valid request"),
        )
        .await
    }

    /// Sends a json body to the url
    pub async fn json(&mut self, method: Method, url: &Url, body: &impl Serialize) -> TestResponse {
        self.send(
            request(method, url)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(body).expect("serializable body"),
                ))
                .expect("valid request"),
        )
        .await
    }

    /// Sends a request, attaching and then updating the cookies
    pub async fn send(&mut self, mut request: Request<Body>) -> TestResponse {
        let headers = request.headers_mut();
        headers.insert(
            "x-real-ip",
            self.real_ip.to_string().parse().expect("valid header"),
        );
        if !self.cookies.is_empty() {
            let cookies = self
                .cookies
                .iter()
                .map(|(name, value)| format!("{name}={value}"))
                .collect::<Vec<_>>()
                .join("; ");
            headers.insert(header::COOKIE, cookies.parse().expect("valid header"));
        }

        let response = App::get()
            .await
            .router
            .clone()
            .oneshot(request)
            .await
            .expect("infallible");
        let (parts, body) = response.into_parts();

        for set_cookie in parts.headers.get_all(header::SET_COOKIE) {
            let set_cookie = set_cookie.to_str().expect("ascii cookie");
            let mut attributes = set_cookie.split(';').map(str::trim);
            let (name, value) = attributes
                .next()
                .and_then(|pair| pair.split_once('='))
                .expect("cookie has a name and a value");
            let removed = attributes.any(|attribute| attribute.eq_ignore_ascii_case("max-age=0"));
            if removed {
                self.cookies.remove(name);
            } else {
                self.cookies.insert(name.to_string(), value.to_string());
            }
        }

        TestResponse {
            status: parts.status,
            headers: parts.headers,
            body: to_bytes(body, usize::MAX).await.expect("read the body"),
        }
    }
}

/// A response with its body read
#[derive(Debug)]
pub struct TestResponse {
    /// Status code
    pub status: StatusCode,
    /// Headers
    pub headers: HeaderMap,
    /// Body
    pub body: Bytes,
}

impl TestResponse {
    /// The body, parsed as json
    pub fn json<T: DeserializeOwned>(&self) -> T {
        serde_json::from_slice(&self.body).unwrap_or_else(|error| {
            panic!(
                "body is not the expected json ({error}): {}",
                String::from_utf8_lossy(&self.body)
            )
        })
    }

    /// Where the response redirects to, resolved against the service's origin
    pub fn location(&self) -> Url {
        assert!(self.status.is_redirection(), "not a redirect: {self:?}");
        let location = self
            .headers
            .get(header::LOCATION)
            .expect("a redirect has a location")
            .to_str()
            .expect("ascii location");
        origin().join(location).expect("valid location")
    }

    /// The body as untyped json, after checking the status is `200 OK`
    pub fn ok_json(&self) -> serde_json::Value {
        assert_eq!(self.status, StatusCode::OK, "{self:?}");
        self.json()
    }
}

/// An Account created for a test
pub struct TestAccount {
    /// Primary key
    pub uuid: AccountUuid,
    /// Username, unique per test run
    pub username: String,
}

/// Creates an Account with `role` and a unique username
pub async fn create_account(role: Role) -> TestAccount {
    App::get().await;
    let username = format!("u{}", &Uuid::new_v4().simple().to_string()[..12]);

    let mut tx = Database::global()
        .start_transaction()
        .await
        .expect("start a transaction");
    Account::insert(
        &mut tx,
        Username::new(username.clone()).expect("valid username"),
        MaxStr::new(format!("{username}@mtg.test")).expect("short email"),
    )
    .await
    .expect("create the account");
    let account = Account::get_by_username(
        &mut tx,
        &Username::new(username.clone()).expect("valid username"),
    )
    .await
    .expect("look the account up")
    .expect("the account exists");
    Account::set_role(&mut tx, account.uuid, role)
        .await
        .expect("set the role");
    tx.commit().await.expect("commit");

    TestAccount {
        uuid: account.uuid,
        username,
    }
}
