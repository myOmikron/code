//! OIDC login against the fake OpenID provider
//!
//! The providers live in the module's tables, so most tests need Postgres,
//! see [`crate::testing`]; only the setup checks here run without.

use std::sync::Arc;

use galvyn::core::Module;
use galvyn::core::session::Session;
use galvyn::rorm::Database;
use tower_sessions::MemoryStore;
use url::Url;

use super::Admission;
use super::FakeOpenIdProvider;
use super::FakePerson;
use super::OidcCallback;
use super::OidcLoginOutcome;
use super::OidcSetup;
use super::OpenAdmission;
use super::Tamper;
use super::error::BeginOidcLoginError;
use super::error::FinishOidcLoginError;
use crate::IdentityModule;
use crate::IdentitySetup;
use crate::testing::database;
use crate::testing::run;

mod admin;
mod admission;
mod bulk_delete;
mod db;
mod providers;

/// The callback path the tests set up
const CALLBACK_PATH: &str = "/auth/oidc/callback";

/// A module and the slug of the fake's provider in its tables
struct Fixture {
    /// The module
    module: IdentityModule,
    /// The slug of the provider pointing at the fake
    slug: String,
}

/// A slug no other test uses
fn fresh_slug() -> String {
    format!("fake-{}", &uuid::Uuid::new_v4().simple().to_string()[..12])
}

/// A module that holds pending External identities in the session
async fn prepared(open_admission: OpenAdmission) -> IdentityModule {
    let prepared = IdentityModule::pre_init(setup(OidcSetup {
        callback_path: CALLBACK_PATH.to_string(),
        open_admission,
        ..OidcSetup::default()
    }))
    .await
    .unwrap_or_else(|error| panic!("prepare the module: {error:?}"));
    IdentityModule::from_prepared(prepared)
}

/// A module logging in through `fake`, added to the tables with `admission`
async fn module(fake: &FakeOpenIdProvider, admission: Admission) -> Fixture {
    fixture(fake, admission, OpenAdmission::PendingInSession).await
}

/// [`module`] with `open_admission`
async fn fixture(
    fake: &FakeOpenIdProvider,
    admission: Admission,
    open_admission: OpenAdmission,
) -> Fixture {
    let slug = fresh_slug();
    IdentityModule::add_openid_provider(Database::global(), &fake.provider(&slug, admission))
        .await
        .unwrap_or_else(|error| panic!("add the provider: {error:?}"));
    Fixture {
        module: prepared(open_admission).await,
        slug,
    }
}

/// An Identity setup of `http://service.test` with `oidc`
fn setup(oidc: OidcSetup) -> IdentitySetup {
    IdentitySetup {
        public_origin: Some(Url::parse("http://service.test").expect("valid url")),
        registration_link_path: "/auth/register".to_string(),
        #[cfg(feature = "passkey")]
        passkey: crate::PasskeySetup {
            rp_name: "Service".to_string(),
        },
        oidc,
        ..IdentitySetup::default()
    }
}

/// A fresh browser session
fn session() -> Session {
    Session::new(None, Arc::new(MemoryStore::default()), None)
}

/// What the browser hands the callback route on its way back from the provider
fn callback(url: &Url) -> OidcCallback {
    let query: serde_json::Map<String, serde_json::Value> = url
        .query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned().into()))
        .collect();
    serde_json::from_value(query.into()).expect("a callback query")
}

/// The slug the callback url ends with
fn callback_slug(url: &Url) -> String {
    url.path_segments()
        .and_then(|mut segments| segments.next_back())
        .expect("a callback path")
        .to_string()
}

/// Run an OIDC login of `person` in `session` up to the callback
async fn log_in(
    fixture: &Fixture,
    fake: &FakeOpenIdProvider,
    session: &Session,
    person: FakePerson,
) -> Result<OidcLoginOutcome, FinishOidcLoginError> {
    let authorization = fixture
        .module
        .begin_oidc_login(session, &fixture.slug, false)
        .await
        .unwrap_or_else(|error| panic!("begin the login: {error:?}"));
    let back = fake.authorize(&authorization, person);
    fixture
        .module
        .finish_oidc_login(session, &callback_slug(&back), callback(&back))
        .await
}

/// A person the fake knows
fn alice() -> FakePerson {
    FakePerson::new(&uuid::Uuid::new_v4().to_string(), "alice@example.org")
}

#[test]
fn the_provider_sends_the_browser_back_to_the_callback_path_and_slug() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let authorization = fixture
            .module
            .begin_oidc_login(&session(), &fixture.slug, false)
            .await
            .unwrap();

        let back = fake.authorize(&authorization, alice());
        assert_eq!(
            back.as_str().split('?').next(),
            Some(format!("http://service.test/auth/oidc/callback/{}", fixture.slug).as_str())
        );
    });
}

#[test]
fn a_login_asks_for_the_openid_profile_and_email_scopes() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let authorization = fixture
            .module
            .begin_oidc_login(&session(), &fixture.slug, false)
            .await
            .unwrap();

        let scope = authorization
            .query_pairs()
            .find(|(key, _)| key == "scope")
            .map(|(_, scope)| scope.into_owned());
        let mut scopes: Vec<_> = scope.as_deref().unwrap_or("").split(' ').collect();
        scopes.sort_unstable();
        assert_eq!(scopes, ["email", "openid", "profile"]);
    });
}

#[test]
fn an_unknown_provider_cannot_begin_a_login() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let begun = fixture
            .module
            .begin_oidc_login(&session(), "nobody", false)
            .await;
        assert!(matches!(begun, Err(BeginOidcLoginError::UnknownProvider)));
    });
}

#[test]
fn an_unreachable_provider_cannot_begin_a_login() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        drop(fake);

        let begun = fixture
            .module
            .begin_oidc_login(&session(), &fixture.slug, false)
            .await;
        assert!(matches!(
            begun,
            Err(BeginOidcLoginError::ProviderUnavailable)
        ));
    });
}

#[test]
fn a_broken_provider_leaves_the_others_working() {
    run(async {
        database().await;
        let (fake, broken) = (
            FakeOpenIdProvider::start().await,
            FakeOpenIdProvider::start().await,
        );
        let working = module(&fake, Admission::Open).await;
        let broken_slug = module(&broken, Admission::Open).await.slug;
        drop(broken);

        let begun = working
            .module
            .begin_oidc_login(&session(), &broken_slug, false)
            .await;
        assert!(matches!(
            begun,
            Err(BeginOidcLoginError::ProviderUnavailable)
        ));
        let outcome = log_in(&working, &fake, &session(), alice()).await;
        assert!(matches!(outcome, Ok(OidcLoginOutcome::Pending(_))));
    });
}

#[test]
fn a_callback_without_a_running_login_is_refused() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let finished = fixture
            .module
            .finish_oidc_login(
                &session(),
                &fixture.slug,
                OidcCallback {
                    state: "state".to_string(),
                    code: Some("code".to_string()),
                    error: None,
                },
            )
            .await;
        assert!(matches!(
            finished,
            Err(FinishOidcLoginError::NoLoginInProgress)
        ));
    });
}

#[test]
fn a_tampered_state_is_refused() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let session = session();
        let authorization = fixture
            .module
            .begin_oidc_login(&session, &fixture.slug, false)
            .await
            .unwrap();
        let mut back = callback(&fake.authorize(&authorization, alice()));
        back.state.push('x');

        let finished = fixture
            .module
            .finish_oidc_login(&session, &fixture.slug, back)
            .await;
        assert!(matches!(finished, Err(FinishOidcLoginError::StateMismatch)));
    });
}

#[test]
fn a_callback_for_another_provider_is_refused() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let other = module(&fake, Admission::Open).await;
        let session = session();
        let authorization = fixture
            .module
            .begin_oidc_login(&session, &fixture.slug, false)
            .await
            .unwrap();
        let back = callback(&fake.authorize(&authorization, alice()));

        let finished = fixture
            .module
            .finish_oidc_login(&session, &other.slug, back)
            .await;
        assert!(matches!(finished, Err(FinishOidcLoginError::StateMismatch)));
    });
}

#[test]
fn the_state_of_another_login_is_refused() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let (session, other) = (session(), session());
        let authorization = fixture
            .module
            .begin_oidc_login(&session, &fixture.slug, false)
            .await
            .unwrap();
        fixture
            .module
            .begin_oidc_login(&other, &fixture.slug, false)
            .await
            .unwrap();
        let back = callback(&fake.authorize(&authorization, alice()));

        let finished = fixture
            .module
            .finish_oidc_login(&other, &fixture.slug, back)
            .await;
        assert!(matches!(finished, Err(FinishOidcLoginError::StateMismatch)));
    });
}

#[test]
fn a_login_is_used_up_by_its_first_callback() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let session = session();
        let authorization = fixture
            .module
            .begin_oidc_login(&session, &fixture.slug, false)
            .await
            .unwrap();
        let back = callback(&fake.authorize(&authorization, alice().tampered(Tamper::WrongNonce)));

        let first = fixture
            .module
            .finish_oidc_login(&session, &fixture.slug, back.clone())
            .await;
        let second = fixture
            .module
            .finish_oidc_login(&session, &fixture.slug, back)
            .await;
        assert!(matches!(first, Err(FinishOidcLoginError::InvalidIdToken)));
        assert!(matches!(
            second,
            Err(FinishOidcLoginError::NoLoginInProgress)
        ));
    });
}

#[test]
fn a_provider_error_is_reported_as_denied() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let session = session();
        let authorization = fixture
            .module
            .begin_oidc_login(&session, &fixture.slug, false)
            .await
            .unwrap();
        let back = callback(&fake.authorize(&authorization, alice()));

        let finished = fixture
            .module
            .finish_oidc_login(
                &session,
                &fixture.slug,
                OidcCallback {
                    code: None,
                    error: Some("access_denied".to_string()),
                    ..back
                },
            )
            .await;
        assert!(
            matches!(finished, Err(FinishOidcLoginError::Denied { error }) if error == "access_denied")
        );
    });
}

/// Finish a login of a person whose ID token `tamper` spoils
fn tampered_login(tamper: Tamper) -> Result<OidcLoginOutcome, FinishOidcLoginError> {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        log_in(&fixture, &fake, &session(), alice().tampered(tamper)).await
    })
}

#[test]
fn an_id_token_with_a_wrong_nonce_is_refused() {
    let finished = tampered_login(Tamper::WrongNonce);
    assert!(matches!(
        finished,
        Err(FinishOidcLoginError::InvalidIdToken)
    ));
}

#[test]
fn an_id_token_for_another_client_is_refused() {
    let finished = tampered_login(Tamper::WrongAudience);
    assert!(matches!(
        finished,
        Err(FinishOidcLoginError::InvalidIdToken)
    ));
}

#[test]
fn an_id_token_of_another_issuer_is_refused() {
    let finished = tampered_login(Tamper::WrongIssuer);
    assert!(matches!(
        finished,
        Err(FinishOidcLoginError::InvalidIdToken)
    ));
}

#[test]
fn an_expired_id_token_is_refused() {
    let finished = tampered_login(Tamper::Expired);
    assert!(matches!(
        finished,
        Err(FinishOidcLoginError::InvalidIdToken)
    ));
}

#[test]
fn an_id_token_with_a_bad_signature_is_refused() {
    let finished = tampered_login(Tamper::BadSignature);
    assert!(matches!(
        finished,
        Err(FinishOidcLoginError::InvalidIdToken)
    ));
}

#[test]
fn an_id_token_hashing_another_access_token_is_refused() {
    let finished = tampered_login(Tamper::WrongAccessTokenHash);
    assert!(matches!(
        finished,
        Err(FinishOidcLoginError::InvalidIdToken)
    ));
}

#[tokio::test]
async fn a_service_without_callback_path_has_oidc_login_off() {
    let prepared = IdentityModule::pre_init(setup(OidcSetup::default()))
        .await
        .unwrap_or_else(|error| panic!("prepare the module: {error:?}"));
    let module = IdentityModule::from_prepared(prepared);

    let begun = module.begin_oidc_login(&session(), "google", false).await;
    assert!(matches!(begun, Err(BeginOidcLoginError::UnknownProvider)));
}

#[tokio::test]
async fn an_unreadable_root_certificate_is_refused() {
    let prepared = IdentityModule::pre_init(setup(OidcSetup {
        callback_path: CALLBACK_PATH.to_string(),
        root_certificates: vec![
            "-----BEGIN CERTIFICATE-----\nnot base64\n-----END CERTIFICATE-----\n".to_string(),
        ],
        ..OidcSetup::default()
    }))
    .await;
    assert!(prepared.is_err());
}
