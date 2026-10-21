//! OIDC login through the fake OpenID provider: the username step and returning logins

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;
use galvyn_identity::FakePerson;
use galvyn_identity::IdentityModule;
use galvyn_identity::LoginMethod;
use serde_json::json;
use url::Url;
use uuid::Uuid;

use crate::models::account::Account;
use crate::models::account::Role;
use crate::models::account::Username;
use crate::tests::harness::App;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;

/// A person unknown to the service, with a verified email
fn stranger() -> FakePerson {
    let id = Uuid::new_v4().simple();
    FakePerson::new(&format!("subject-{id}"), &format!("{id}@gmail.test"))
}

/// A free, valid username
fn free_username() -> String {
    format!("g{}", &Uuid::new_v4().simple().to_string()[..12])
}

/// Logs in with Google as `person` and returns where the callback sends the browser
async fn continue_with_google(client: &mut TestClient, person: FakePerson) -> Url {
    let started = client
        .json(
            Method::POST,
            &api("auth/oidc/start"),
            &json!({ "provider": "google", "remember_me": false }),
        )
        .await
        .ok_json();
    let authorization_url = Url::parse(started["url"].as_str().expect("an authorization url"))
        .expect("a valid authorization url");

    let callback = App::fake().await.authorize(&authorization_url, person);
    client.get(&callback).await.location()
}

/// Submits `username` for the session's pending OIDC login
async fn choose_username(client: &mut TestClient, username: &str) -> TestResponse {
    client
        .json(
            Method::POST,
            &api("auth/oidc/username"),
            &json!({ "username": username }),
        )
        .await
}

/// The Account named `username`, if there is one
async fn account_named(username: &str) -> Option<Account> {
    let mut tx = Database::global()
        .start_transaction()
        .await
        .expect("start a transaction");
    let account = Account::get_by_username(
        &mut tx,
        &Username::new(username.to_string()).expect("valid username"),
    )
    .await
    .expect("look the account up");
    tx.commit().await.expect("commit");
    account
}

/// The Account whose email is `email`, if there is one
async fn account_with_email(email: &str) -> Option<Account> {
    let mut tx = Database::global()
        .start_transaction()
        .await
        .expect("start a transaction");
    let account = Account::get_by_email(
        &mut tx,
        &MaxStr::new(email.to_string()).expect("short email"),
    )
    .await
    .expect("look the account up");
    tx.commit().await.expect("commit");
    account
}

/// How many Identities and External identities no Account signs in as
async fn orphans() -> (i64, i64) {
    let pool = Database::global().as_pool();
    let identities = sqlx::query_scalar(
        "SELECT count(*) FROM identity i \
         WHERE NOT EXISTS (SELECT 1 FROM account a WHERE a.identity = i.uuid)",
    )
    .fetch_one(pool)
    .await
    .expect("count orphaned identities");
    let external = sqlx::query_scalar(
        "SELECT count(*) FROM external_identity e \
         WHERE NOT EXISTS (SELECT 1 FROM account a WHERE a.identity = e.identity)",
    )
    .fetch_one(pool)
    .await
    .expect("count orphaned external identities");
    (identities, external)
}

#[test]
fn the_active_providers_are_listed() {
    run(async {
        let body = TestClient::new()
            .get(&api("auth/oidc/providers"))
            .await
            .ok_json();

        assert_eq!(
            body,
            json!({ "providers": [{ "id": "google", "display_name": "Fake google" }] })
        );
    });
}

#[test]
fn a_first_oidc_login_goes_to_the_username_step() {
    run(async {
        let mut client = TestClient::new();
        let person = stranger();
        let email = person.email.clone();

        let location = continue_with_google(&mut client, person).await;

        assert_eq!(location.path(), "/auth/username");
        assert_eq!(
            client.get(&api("accounts/me")).await.status,
            StatusCode::UNAUTHORIZED
        );
        let pending = client.get(&api("auth/oidc/pending")).await.ok_json();
        assert_eq!(pending["pending"]["provider"], "Fake google", "{pending}");
        assert_eq!(pending["pending"]["email"], json!(email), "{pending}");
    });
}

#[test]
fn the_username_step_creates_an_external_account_with_the_providers_email() {
    run(async {
        let mut client = TestClient::new();
        let person = stranger();
        let email = person.email.clone().expect("an email");
        let username = free_username();
        continue_with_google(&mut client, person).await;

        let body = choose_username(&mut client, &username).await.ok_json();

        assert_eq!(body, json!(null));
        let me = client.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], username.as_str());
        let account = account_named(&username).await.expect("the account exists");
        assert_eq!(&*account.email, email);
        assert_eq!(
            IdentityModule::global()
                .login_method(Database::global(), account.identity)
                .await
                .expect("read the login method"),
            Some(LoginMethod::External {
                issuer: App::fake().await.issuer().to_string()
            })
        );
        let pending = client.get(&api("auth/oidc/pending")).await.ok_json();
        assert_eq!(pending["pending"], json!(null));
    });
}

#[test]
fn the_same_person_logs_in_again_without_a_username_step() {
    run(async {
        let person = stranger();
        let username = free_username();
        let mut first = TestClient::new();
        continue_with_google(&mut first, person.clone()).await;
        choose_username(&mut first, &username).await.ok_json();

        let mut again = TestClient::new();
        let location = continue_with_google(&mut again, person).await;

        assert_eq!(location.path(), "/home");
        let me = again.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], username.as_str());
    });
}

#[test]
fn a_taken_username_is_refused_in_the_username_step() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut client = TestClient::new();
        continue_with_google(&mut client, stranger()).await;

        let body = choose_username(&mut client, &member.username)
            .await
            .ok_json();

        assert_eq!(body["result"], "Err", "{body}");
        assert_eq!(body["error"]["username_taken"], true, "{body}");
        let username = free_username();
        assert_eq!(
            choose_username(&mut client, &username).await.ok_json(),
            json!(null)
        );
    });
}

#[test]
fn an_invalid_username_is_refused_in_the_username_step() {
    run(async {
        let mut client = TestClient::new();
        let person = stranger();
        let email = person.email.clone().expect("an email");
        continue_with_google(&mut client, person).await;

        let response = choose_username(&mut client, "-not valid").await;

        assert!(response.status.is_client_error(), "{response:?}");
        assert!(account_with_email(&email).await.is_none());
        let pending = client.get(&api("auth/oidc/pending")).await.ok_json();
        assert_eq!(pending["pending"]["email"], json!(email), "{pending}");
    });
}

#[test]
fn the_username_step_needs_a_pending_oidc_login() {
    run(async {
        let body = choose_username(&mut TestClient::new(), &free_username())
            .await
            .ok_json();

        assert_eq!(body["result"], "Err", "{body}");
        assert_eq!(body["error"]["nothing_pending"], true, "{body}");
    });
}

#[test]
fn abandoning_the_username_step_leaves_nothing_behind() {
    run(async {
        let person = stranger();
        let email = person.email.clone().expect("an email");
        continue_with_google(&mut TestClient::new(), person.clone()).await;

        assert!(account_with_email(&email).await.is_none());
        assert_eq!(orphans().await, (0, 0));
        let location = continue_with_google(&mut TestClient::new(), person).await;
        assert_eq!(location.path(), "/auth/username");
    });
}

#[test]
fn an_unverified_email_is_refused_before_the_username_step() {
    run(async {
        let mut client = TestClient::new();

        let location = continue_with_google(&mut client, stranger().unverified()).await;

        assert_eq!(location.path(), "/auth/login");
        assert_eq!(
            location.query(),
            Some("oidc_error=email_unverified"),
            "{location}"
        );
        let pending = client.get(&api("auth/oidc/pending")).await.ok_json();
        assert_eq!(pending["pending"], json!(null));
    });
}

#[test]
fn a_cancelled_oidc_login_goes_back_to_the_login_page() {
    run(async {
        let mut client = TestClient::new();
        let started = client
            .json(
                Method::POST,
                &api("auth/oidc/start"),
                &json!({ "provider": "google", "remember_me": true }),
            )
            .await
            .ok_json();
        let authorization_url =
            Url::parse(started["url"].as_str().expect("an authorization url")).expect("valid url");
        let state = authorization_url
            .query_pairs()
            .find(|(name, _)| name == "state")
            .map(|(_, value)| value.into_owned())
            .expect("a state");
        let mut callback = api("auth/oidc/callback");
        callback
            .query_pairs_mut()
            .append_pair("error", "access_denied")
            .append_pair("state", &state);

        let location = client.get(&callback).await.location();

        assert_eq!(location.path(), "/auth/login");
        assert_eq!(location.query(), Some("oidc_error=cancelled"));
    });
}
