//! OIDC login through the fake OpenID provider: the username step, returning
//! logins and refused logins

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;
use galvyn_identity::FakePerson;
use galvyn_identity::IdentityModel;
use galvyn_identity::IdentityModule;
use galvyn_identity::IdentityUuid;
use galvyn_identity::LoginMethod;
use serde_json::json;
use url::Url;
use uuid::Uuid;

use crate::models::account::Account;
use crate::models::account::Role;
use crate::models::account::Username;
use crate::tests::harness::App;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;

/// A person unknown to the service, with a verified email
pub(super) fn stranger() -> FakePerson {
    let id = Uuid::new_v4().simple();
    FakePerson::new(&format!("subject-{id}"), &format!("{id}@gmail.test"))
}

/// A person unknown to the service, whose verified email is `email`
fn stranger_with_email(email: &str) -> FakePerson {
    FakePerson::new(&format!("subject-{}", Uuid::new_v4().simple()), email)
}

/// Signs `person` up with Google and returns the External Account
async fn external_account(person: FakePerson) -> TestAccount {
    let username = free_username();
    let mut client = TestClient::new();
    continue_with_google(&mut client, person).await;
    choose_username(&mut client, &username).await.ok_json();
    let account = account_named(&username).await.expect("the account exists");
    TestAccount {
        uuid: account.uuid,
        username,
    }
}

/// Inserts a Local Account named `username` with `email`
async fn insert_local_account(username: &str, email: &str) {
    let mut tx = Database::global()
        .start_transaction()
        .await
        .expect("start a transaction");
    Account::insert(
        &mut tx,
        Username::new(username.to_string()).expect("valid username"),
        MaxStr::new(email.to_string()).expect("short email"),
    )
    .await
    .expect("create the account");
    tx.commit().await.expect("commit");
}

/// Locks `account` as a fresh Admin
async fn lock(account: &TestAccount) {
    let admin = create_account(Role::Admin).await;
    let body = TestClient::logged_in(&admin)
        .await
        .json(
            Method::POST,
            &api(&format!(
                "admin/accounts/{}/lock",
                account.uuid.into_inner()
            )),
            &json!({ "reason": "Spam" }),
        )
        .await
        .ok_json();
    assert_eq!(body, json!(null));
}

/// A free, valid username
pub(super) fn free_username() -> String {
    format!("g{}", &Uuid::new_v4().simple().to_string()[..12])
}

/// Logs in with Google as `person` and returns where the callback sends the browser
pub(super) async fn continue_with_google(client: &mut TestClient, person: FakePerson) -> Url {
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
pub(super) async fn choose_username(client: &mut TestClient, username: &str) -> TestResponse {
    client
        .json(
            Method::POST,
            &api("auth/oidc/username"),
            &json!({ "username": username }),
        )
        .await
}

/// The Account named `username`, if there is one
pub(super) async fn account_named(username: &str) -> Option<Account> {
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
fn an_unverified_email_is_refused_and_creates_nothing() {
    run(async {
        let mut client = TestClient::new();
        let person = stranger().unverified();
        let email = person.email.clone().expect("an email");

        let location = continue_with_google(&mut client, person).await;

        assert_eq!(location.path(), "/auth/login");
        assert_eq!(
            location.query(),
            Some("oidc_error=email_unverified"),
            "{location}"
        );
        let pending = client.get(&api("auth/oidc/pending")).await.ok_json();
        assert_eq!(pending["pending"], json!(null));
        assert_eq!(
            choose_username(&mut client, &free_username())
                .await
                .ok_json()["error"]["nothing_pending"],
            true
        );
        assert!(account_with_email(&email).await.is_none());
        assert_eq!(orphans().await, (0, 0));
    });
}

#[test]
fn an_email_in_use_is_refused_before_the_username_step_and_creates_nothing() {
    run(async {
        let member = create_account(Role::Member).await;
        let email = format!("{}@mtg.test", member.username);
        let mut client = TestClient::new();

        let location = continue_with_google(&mut client, stranger_with_email(&email)).await;

        assert_eq!(location.path(), "/auth/login");
        assert_eq!(
            location.query(),
            Some("oidc_error=email_in_use"),
            "{location}"
        );
        let pending = client.get(&api("auth/oidc/pending")).await.ok_json();
        assert_eq!(pending["pending"], json!(null));
        let account = account_with_email(&email)
            .await
            .expect("the account exists");
        assert_eq!(account.uuid, member.uuid);
        assert_eq!(orphans().await, (0, 0));
    });
}

#[test]
fn an_email_in_use_is_refused_in_any_case() {
    run(async {
        let member = create_account(Role::Member).await;
        let email = format!("{}@MTG.test", member.username.to_uppercase());
        let mut client = TestClient::new();

        let location = continue_with_google(&mut client, stranger_with_email(&email)).await;

        assert_eq!(
            location.query(),
            Some("oidc_error=email_in_use"),
            "{location}"
        );
        assert_eq!(orphans().await, (0, 0));
    });
}

#[test]
fn an_email_taken_during_the_username_step_is_refused() {
    run(async {
        let person = stranger();
        let email = person.email.clone().expect("an email");
        let mut client = TestClient::new();
        continue_with_google(&mut client, person).await;
        let local_username = free_username();
        insert_local_account(&local_username, &email).await;

        let body = choose_username(&mut client, &free_username())
            .await
            .ok_json();

        assert_eq!(body["result"], "Err", "{body}");
        assert_eq!(body["error"]["email_in_use"], true, "{body}");
        let account = account_with_email(&email)
            .await
            .expect("the account exists");
        assert_eq!(account.username.as_str(), local_username);
        let pending = client.get(&api("auth/oidc/pending")).await.ok_json();
        assert_eq!(pending["pending"], json!(null));
        assert_eq!(orphans().await, (0, 0));
    });
}

#[test]
fn a_locked_external_account_cannot_log_in() {
    run(async {
        let person = stranger();
        let external = external_account(person.clone()).await;
        lock(&external).await;

        let identity = account_named(&external.username)
            .await
            .expect("the account exists")
            .identity;
        let before = last_login_at(identity).await;

        let mut client = TestClient::new();
        let location = continue_with_google(&mut client, person).await;

        assert_eq!(location.path(), "/auth/login");
        assert_eq!(location.query(), Some("oidc_error=locked"), "{location}");
        assert_eq!(
            client.get(&api("accounts/me")).await.status,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(last_login_at(identity).await, before);
    });
}

#[test]
fn an_oidc_login_gets_a_fresh_session_id() {
    run(async {
        let person = stranger();
        external_account(person.clone()).await;
        let mut client = TestClient::new();
        client
            .json(
                Method::POST,
                &api("auth/oidc/start"),
                &json!({ "provider": "google", "remember_me": false }),
            )
            .await
            .ok_json();
        let planted = client
            .cookie(SESSION_COOKIE)
            .expect("starting a login sets the session cookie")
            .to_string();

        continue_with_google(&mut client, person).await;

        let logged_in = client.cookie(SESSION_COOKIE).expect("a session cookie");
        assert_ne!(logged_in, planted);
        client.get(&api("accounts/me")).await.ok_json();
    });
}

#[test]
fn the_username_step_gets_a_fresh_session_id() {
    run(async {
        let mut client = TestClient::new();
        continue_with_google(&mut client, stranger()).await;
        let pending = client
            .cookie(SESSION_COOKIE)
            .expect("a pending login has a session cookie")
            .to_string();

        choose_username(&mut client, &free_username())
            .await
            .ok_json();

        let logged_in = client.cookie(SESSION_COOKIE).expect("a session cookie");
        assert_ne!(logged_in, pending);
    });
}

/// The name of the session cookie
const SESSION_COOKIE: &str = "id";

/// When the Identity last logged in
async fn last_login_at(identity: IdentityUuid) -> Option<OffsetDateTime> {
    rorm::query(Database::global(), IdentityModel.last_login_at)
        .condition(IdentityModel.uuid.equals(identity.into_inner()))
        .one()
        .await
        .expect("read the identity")
}

#[test]
fn a_locked_external_accounts_session_fails_on_its_next_request() {
    run(async {
        let person = stranger();
        let username = free_username();
        let mut session = TestClient::new();
        continue_with_google(&mut session, person).await;
        choose_username(&mut session, &username).await.ok_json();
        let account = account_named(&username).await.expect("the account exists");

        lock(&TestAccount {
            uuid: account.uuid,
            username,
        })
        .await;

        assert_eq!(
            session.get(&api("accounts/passkeys")).await.status,
            StatusCode::UNAUTHORIZED
        );
        let me = session.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["error"]["locked"], true, "{me}");
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
