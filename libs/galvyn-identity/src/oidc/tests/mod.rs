//! OIDC login against the fake OpenID provider
//!
//! The refusals here happen before the module touches the database, so they
//! run without Postgres; [`db`] holds the rest.

use std::sync::Arc;

use galvyn::core::Module;
use galvyn::core::session::Session;
use tower_sessions::MemoryStore;
use url::Url;

use super::FakeOpenIdProvider;
use super::FakePerson;
use super::OidcCallback;
use super::OidcSetup;
use super::Tamper;
use super::error::BeginOidcLoginError;
use super::error::FinishOidcLoginError;
use crate::IdentityModule;
use crate::IdentitySetup;

mod db;

/// The id the tests configure the fake under
const PROVIDER: &str = "fake";

/// A module logging in through `fake`, which admits people on their first login if `admits`
async fn module(fake: &FakeOpenIdProvider, admits: bool) -> IdentityModule {
    let prepared = IdentityModule::pre_init(setup(OidcSetup {
        callback_path: "/auth/oidc/callback".to_string(),
        providers: vec![fake.provider_setup(PROVIDER, admits)],
    }))
    .await
    .unwrap_or_else(|error| panic!("prepare the module: {error:?}"));
    IdentityModule::from_prepared(prepared)
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

/// Run an OIDC login of `person` in `session` up to the callback
async fn log_in(
    module: &IdentityModule,
    fake: &FakeOpenIdProvider,
    session: &Session,
    person: FakePerson,
) -> Result<super::OidcLoginOutcome, FinishOidcLoginError> {
    let authorization = module
        .begin_oidc_login(session, PROVIDER, false)
        .await
        .unwrap_or_else(|error| panic!("begin the login: {error:?}"));
    let back = fake.authorize(&authorization, person);
    module.finish_oidc_login(session, callback(&back)).await
}

/// A person the fake knows
fn alice() -> FakePerson {
    FakePerson::new(&uuid::Uuid::new_v4().to_string(), "alice@example.org")
}

#[tokio::test]
async fn the_provider_sends_the_browser_back_to_the_callback_path() {
    let fake = FakeOpenIdProvider::start().await;
    let module = module(&fake, true).await;
    let authorization = module
        .begin_oidc_login(&session(), PROVIDER, false)
        .await
        .unwrap();

    let back = fake.authorize(&authorization, alice());
    assert_eq!(
        back.as_str().split('?').next(),
        Some("http://service.test/auth/oidc/callback")
    );
}

#[tokio::test]
async fn an_unknown_provider_cannot_begin_a_login() {
    let fake = FakeOpenIdProvider::start().await;
    let module = module(&fake, true).await;
    let begun = module.begin_oidc_login(&session(), "nobody", false).await;
    assert!(matches!(begun, Err(BeginOidcLoginError::UnknownProvider)));
}

#[tokio::test]
async fn an_unreachable_provider_cannot_begin_a_login() {
    let fake = FakeOpenIdProvider::start().await;
    let module = module(&fake, true).await;
    drop(fake);

    let begun = module.begin_oidc_login(&session(), PROVIDER, false).await;
    assert!(matches!(
        begun,
        Err(BeginOidcLoginError::ProviderUnavailable)
    ));
}

#[tokio::test]
async fn a_callback_without_a_running_login_is_refused() {
    let fake = FakeOpenIdProvider::start().await;
    let module = module(&fake, true).await;
    let finished = module
        .finish_oidc_login(
            &session(),
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
}

#[tokio::test]
async fn a_tampered_state_is_refused() {
    let fake = FakeOpenIdProvider::start().await;
    let module = module(&fake, true).await;
    let session = session();
    let authorization = module
        .begin_oidc_login(&session, PROVIDER, false)
        .await
        .unwrap();
    let mut back = callback(&fake.authorize(&authorization, alice()));
    back.state.push('x');

    let finished = module.finish_oidc_login(&session, back).await;
    assert!(matches!(finished, Err(FinishOidcLoginError::StateMismatch)));
}

#[tokio::test]
async fn the_state_of_another_login_is_refused() {
    let fake = FakeOpenIdProvider::start().await;
    let module = module(&fake, true).await;
    let (session, other) = (session(), session());
    let authorization = module
        .begin_oidc_login(&session, PROVIDER, false)
        .await
        .unwrap();
    module
        .begin_oidc_login(&other, PROVIDER, false)
        .await
        .unwrap();
    let back = callback(&fake.authorize(&authorization, alice()));

    let finished = module.finish_oidc_login(&other, back).await;
    assert!(matches!(finished, Err(FinishOidcLoginError::StateMismatch)));
}

#[tokio::test]
async fn a_login_is_used_up_by_its_first_callback() {
    let fake = FakeOpenIdProvider::start().await;
    let module = module(&fake, true).await;
    let session = session();
    let authorization = module
        .begin_oidc_login(&session, PROVIDER, false)
        .await
        .unwrap();
    let back = callback(&fake.authorize(&authorization, alice().tampered(Tamper::WrongNonce)));

    let first = module.finish_oidc_login(&session, back.clone()).await;
    let second = module.finish_oidc_login(&session, back).await;
    assert!(matches!(first, Err(FinishOidcLoginError::InvalidIdToken)));
    assert!(matches!(
        second,
        Err(FinishOidcLoginError::NoLoginInProgress)
    ));
}

#[tokio::test]
async fn a_provider_error_is_reported_as_denied() {
    let fake = FakeOpenIdProvider::start().await;
    let module = module(&fake, true).await;
    let session = session();
    let authorization = module
        .begin_oidc_login(&session, PROVIDER, false)
        .await
        .unwrap();
    let back = callback(&fake.authorize(&authorization, alice()));

    let finished = module
        .finish_oidc_login(
            &session,
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
}

/// Finish a login of a person whose ID token `tamper` spoils
async fn tampered_login(tamper: Tamper) -> Result<super::OidcLoginOutcome, FinishOidcLoginError> {
    let fake = FakeOpenIdProvider::start().await;
    let module = module(&fake, true).await;
    log_in(&module, &fake, &session(), alice().tampered(tamper)).await
}

#[tokio::test]
async fn an_id_token_with_a_wrong_nonce_is_refused() {
    let finished = tampered_login(Tamper::WrongNonce).await;
    assert!(matches!(
        finished,
        Err(FinishOidcLoginError::InvalidIdToken)
    ));
}

#[tokio::test]
async fn an_id_token_for_another_client_is_refused() {
    let finished = tampered_login(Tamper::WrongAudience).await;
    assert!(matches!(
        finished,
        Err(FinishOidcLoginError::InvalidIdToken)
    ));
}

#[tokio::test]
async fn an_id_token_of_another_issuer_is_refused() {
    let finished = tampered_login(Tamper::WrongIssuer).await;
    assert!(matches!(
        finished,
        Err(FinishOidcLoginError::InvalidIdToken)
    ));
}

#[tokio::test]
async fn an_expired_id_token_is_refused() {
    let finished = tampered_login(Tamper::Expired).await;
    assert!(matches!(
        finished,
        Err(FinishOidcLoginError::InvalidIdToken)
    ));
}

#[tokio::test]
async fn an_id_token_with_a_bad_signature_is_refused() {
    let finished = tampered_login(Tamper::BadSignature).await;
    assert!(matches!(
        finished,
        Err(FinishOidcLoginError::InvalidIdToken)
    ));
}

#[tokio::test]
async fn a_service_without_providers_needs_no_callback_path() {
    let prepared = IdentityModule::pre_init(setup(OidcSetup::default())).await;
    assert!(prepared.is_ok());
}

#[tokio::test]
async fn providers_without_a_callback_path_are_refused() {
    let fake = FakeOpenIdProvider::start().await;
    let prepared = IdentityModule::pre_init(setup(OidcSetup {
        callback_path: String::new(),
        providers: vec![fake.provider_setup(PROVIDER, true)],
    }))
    .await;
    assert!(prepared.is_err());
}

#[tokio::test]
async fn two_providers_with_the_same_id_are_refused() {
    let fake = FakeOpenIdProvider::start().await;
    let prepared = IdentityModule::pre_init(setup(OidcSetup {
        callback_path: "/auth/oidc/callback".to_string(),
        providers: vec![
            fake.provider_setup(PROVIDER, true),
            fake.provider_setup(PROVIDER, false),
        ],
    }))
    .await;
    assert!(prepared.is_err());
}

#[tokio::test]
async fn a_provider_without_client_secret_is_refused() {
    let fake = FakeOpenIdProvider::start().await;
    let prepared = IdentityModule::pre_init(setup(OidcSetup {
        callback_path: "/auth/oidc/callback".to_string(),
        providers: vec![super::OpenIdProviderSetup {
            client_secret: super::ClientSecret::Shared(String::new()),
            ..fake.provider_setup(PROVIDER, true)
        }],
    }))
    .await;
    assert!(prepared.is_err());
}

#[tokio::test]
async fn the_active_providers_are_listed_with_their_display_name() {
    let fake = FakeOpenIdProvider::start().await;
    let module = module(&fake, true).await;
    let listed: Vec<(&str, &str)> = module
        .openid_providers()
        .iter()
        .map(|provider| (provider.id(), provider.display_name()))
        .collect();
    assert_eq!(listed, [(PROVIDER, "Fake fake")]);
}
