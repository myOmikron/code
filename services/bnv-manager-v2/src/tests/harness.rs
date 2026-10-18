//! In-process HTTP test harness
//!
//! Initializes the service's modules and builds its router once per test binary, against
//! a fresh Postgres database with the migrations applied and a [fake Mailcow](super::fake_mailcow).
//! [`TestClient`] then sends requests into that router like a browser (with a cookie jar)
//! or a relying party would.
//!
//! The Postgres server comes from `TEST_POSTGRES_HOST`, `TEST_POSTGRES_PORT`,
//! `TEST_POSTGRES_USER` and `TEST_POSTGRES_PASSWORD`, defaulting to `localhost:5432`
//! where the dev infra stack publishes `test-postgres` (`just dev infra up -d --wait test-postgres`).
//!
//! To reuse it in another galvyn service: copy this file, swap [`App::start`]'s module setups
//! and seed data, and the helpers at the bottom.

use std::collections::HashMap;
use std::future::Future;
use std::net::IpAddr;
use std::net::Ipv4Addr;
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
use galvyn::core::re_exports::axum::http::HeaderMap;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::Request;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::http::header;
use galvyn::core::re_exports::axum::http::request;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::DatabaseConfiguration;
use galvyn::rorm::DatabaseDriver;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use rand::distr::Alphanumeric;
use rand::distr::SampleString;
use serde::Serialize;
use serde::de::DeserializeOwned;
use tokio::runtime::Runtime;
use tokio::sync::OnceCell;
use tower::ServiceExt;
use url::Url;
use uuid::Uuid;

use crate::ModuleSetups;
use crate::models::account::Account;
use crate::models::account::ClubAccount;
use crate::models::account::CreateManualClubMember;
use crate::models::club::Club;
use crate::models::club::ClubUuid;
use crate::models::club::CreateClub;
use crate::models::domain::Domain;
use crate::models::oidc_provider::OidcClient;
use crate::modules::mailcow::MailcowSetup;
use crate::modules::oidc::OidcSetup;
use crate::tests::fake_mailcow;

/// Prefix of every database the harness creates
const DATABASE_PREFIX: &str = "bnv_manager_v2_test_";

/// The origin the service believes it is reachable under, see [`ORIGIN`](crate::config::ORIGIN)
pub fn origin() -> Url {
    Url::parse("http://bnv.test").expect("valid url")
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
    club: ClubUuid,
}

impl App {
    /// The app, initialized on first use
    pub async fn get() -> &'static App {
        static APP: OnceCell<App> = OnceCell::const_new();
        APP.get_or_init(App::start).await
    }

    async fn start() -> App {
        let driver = create_database().await;
        let mailcow = fake_mailcow::start().await;
        let key_path =
            std::env::temp_dir().join(format!("{DATABASE_PREFIX}{}.key", Uuid::new_v4().simple()));

        crate::init_modules(
            &mut Galvyn::builder(GalvynSetup {
                disable_panic_hook: true,
                ..Default::default()
            }),
            ModuleSetups {
                database: DatabaseConfiguration::new(driver),
                mailcow: MailcowSetup {
                    base_url: mailcow,
                    api_key: "fake".to_string(),
                    skip_version_check: false,
                },
                oidc: OidcSetup { key_path },
            },
        )
        .await
        .expect("initialize the modules");

        let domain = Domain::find_by_domain(
            Database::global(),
            &MaxStr::new(fake_mailcow::DOMAIN.to_string()).expect("short domain"),
        )
        .await
        .expect("query the domain")
        .expect("the initial mailcow sync creates the domain");
        let club = Club::create(
            Database::global(),
            CreateClub {
                name: MaxStr::new("Test club".to_string()).expect("short name"),
                primary_domain: &domain,
                use_xauth: true,
            },
        )
        .await
        .expect("create the club");

        App {
            router: crate::http::get_router().finish().0,
            club: club.uuid,
        }
    }
}

/// Creates a fresh database with the migrations applied
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

    rorm::cli::migrate::run_migrate_custom(
        rorm::config::DatabaseConfig {
            driver: driver(name.clone()),
            last_migration_table_name: None,
        },
        concat!(env!("CARGO_MANIFEST_DIR"), "/migrations").to_string(),
        None,
    )
    .await
    .expect("apply the migrations");

    driver(name)
}

/// A request to the service, addressed by its absolute url
pub fn request(method: Method, url: &Url) -> request::Builder {
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

    /// `GET`s the url
    pub async fn get(&mut self, url: &Url) -> TestResponse {
        self.send(
            request(Method::GET, url)
                .body(Body::empty())
                .expect("valid request"),
        )
        .await
    }

    /// `POST`s a json body to the url
    pub async fn post_json(&mut self, url: &Url, body: &impl Serialize) -> TestResponse {
        self.send(
            request(Method::POST, url)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(body).expect("serializable body"),
                ))
                .expect("valid request"),
        )
        .await
    }

    /// `POST`s a form to the url
    pub async fn post_form(&mut self, url: &Url, form: &[(&str, &str)]) -> TestResponse {
        let body = url::form_urlencoded::Serializer::new(String::new())
            .extend_pairs(form)
            .finish();
        self.send(
            request(Method::POST, url)
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(body))
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

    /// The `Location` header, resolved against the origin
    pub fn location(&self) -> Url {
        let location = self
            .headers
            .get(header::LOCATION)
            .unwrap_or_else(|| panic!("no Location header in {self:?}"))
            .to_str()
            .expect("ascii location");
        origin().join(location).expect("valid location")
    }
}

/// An OIDC client, registered like an admin would
pub struct RegisteredClient {
    /// `client_id`
    pub client_id: Uuid,
    /// `client_secret`
    pub client_secret: String,
    /// The one registered `redirect_uri`
    pub redirect_uri: Url,
}

/// Registers an OIDC client
pub async fn register_client(redirect_uri: &str) -> RegisteredClient {
    App::get().await;
    let client = OidcClient::create(
        Database::global(),
        MaxStr::new(format!("client-{}", Uuid::new_v4().simple())).expect("short name"),
        Url::parse(redirect_uri).expect("valid redirect_uri"),
    )
    .await
    .expect("create the client");
    RegisteredClient {
        client_id: client.client_id.0,
        client_secret: client.client_secret.to_string(),
        redirect_uri: client.redirect_uri,
    }
}

/// A club member and their credentials
pub struct Member {
    /// Username to sign in with
    pub username: String,
    /// Password to sign in with
    pub password: String,
    /// Display name
    pub display_name: String,
    /// Mailbox
    pub email: String,
}

/// Registers a member of the test club
pub async fn register_member() -> Member {
    let app = App::get().await;
    let username = format!("member-{}", &Uuid::new_v4().simple().to_string()[..12]);
    let member = Member {
        email: format!("{username}@{}", fake_mailcow::DOMAIN),
        display_name: format!("Member {username}"),
        password: Alphanumeric.sample_string(&mut rand::rng(), 32),
        username,
    };

    let hashed_password =
        Account::hash_password(&MaxStr::new(member.password.clone()).expect("short password"))
            .expect("hash the password");
    ClubAccount::create_raw(
        Database::global(),
        CreateManualClubMember {
            username: MaxStr::new(member.username.clone()).expect("short username"),
            display_name: MaxStr::new(member.display_name.clone()).expect("short name"),
            hashed_password: MaxStr::new(hashed_password).expect("short hash"),
            email: MaxStr::new(member.email.clone()).expect("short email"),
            club: ForeignModelByField(app.club.0),
        },
    )
    .await
    .expect("create the member");

    member
}
