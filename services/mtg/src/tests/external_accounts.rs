//! External Accounts in recovery, signup and Deletion

use galvyn::core::re_exports::axum::http::Method;
use serde_json::Value;
use serde_json::json;

use crate::models::account::Account;
use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::oidc::account_named;
use crate::tests::oidc::choose_username;
use crate::tests::oidc::continue_with_google;
use crate::tests::oidc::free_username;
use crate::tests::oidc::stranger;
use crate::utils::mail::outbox;

/// Signs a stranger up with Google, returning the new External Account
async fn external_account() -> Account {
    let username = free_username();
    let mut client = TestClient::new();
    continue_with_google(&mut client, stranger()).await;
    choose_username(&mut client, &username).await.ok_json();
    account_named(&username).await.expect("the account exists")
}

/// Asks for a recovery link for `username`, returning the response body
async fn recover(username: &str) -> Value {
    TestClient::new()
        .json(
            Method::POST,
            &api("auth/recover"),
            &json!({ "username": username }),
        )
        .await
        .ok_json()
}

/// Signs up as `username` with `email`, returning the response body
async fn sign_up(username: &str, email: &str) -> Value {
    TestClient::new()
        .json(
            Method::POST,
            &api("auth/signup"),
            &json!({ "username": username, "email": email }),
        )
        .await
        .ok_json()
}

#[test]
fn recovery_mails_a_link_to_a_local_account() {
    run(async {
        let member = create_account(Role::Member).await;
        let email = format!("{}@mtg.test", member.username);

        let body = recover(&member.username).await;

        assert_eq!(body, Value::Null);
        assert_eq!(outbox::sent_to(&email).len(), 1);
    });
}

#[test]
fn recovery_for_an_external_account_answers_200_and_mails_nothing() {
    run(async {
        let account = external_account().await;

        let body = recover(account.username.as_str()).await;

        assert_eq!(body, Value::Null);
        assert!(outbox::sent_to(&account.email).is_empty());
    });
}

#[test]
fn signup_with_an_unregistered_accounts_username_mails_the_invite_again() {
    run(async {
        let member = create_account(Role::Member).await;
        let email = format!("{}@mtg.test", member.username);

        sign_up(&member.username, "stranger@mtg.test").await;

        assert_eq!(outbox::sent_to(&email).len(), 1);
    });
}

#[test]
fn signup_with_an_external_accounts_username_mails_nothing() {
    run(async {
        let account = external_account().await;

        let body = sign_up(account.username.as_str(), "stranger@mtg.test").await;

        assert_eq!(body["error"]["username_taken"], true, "{body}");
        assert!(outbox::sent_to(&account.email).is_empty());
    });
}

#[test]
fn after_deletion_the_same_external_identity_gets_a_new_account() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let person = stranger();
        let old_username = free_username();
        let mut first = TestClient::new();
        continue_with_google(&mut first, person.clone()).await;
        choose_username(&mut first, &old_username).await.ok_json();
        let old = account_named(&old_username)
            .await
            .expect("the account exists");
        let deleted = TestClient::logged_in(&admin)
            .await
            .json(
                Method::DELETE,
                &api(&format!("admin/accounts/{}", old.uuid.into_inner())),
                &json!({ "username": old_username, "mode": "Tombstone" }),
            )
            .await
            .ok_json();
        assert_eq!(deleted, Value::Null);

        let mut again = TestClient::new();
        let location = continue_with_google(&mut again, person).await;
        assert_eq!(location.path(), "/auth/username");
        let new_username = free_username();
        choose_username(&mut again, &new_username).await.ok_json();

        let new = account_named(&new_username).await.expect("a new account");
        assert_ne!(new.uuid, old.uuid);
        assert_eq!(new.email, old.email);
        assert!(account_named(&old_username).await.is_none());
    });
}

#[test]
fn me_tells_an_external_account_from_a_local_one() {
    run(async {
        let member = create_account(Role::Member).await;
        let username = free_username();
        let mut external = TestClient::new();
        continue_with_google(&mut external, stranger()).await;
        choose_username(&mut external, &username).await.ok_json();

        let local = TestClient::logged_in(&member)
            .await
            .get(&api("accounts/me"))
            .await
            .ok_json();
        let external = external.get(&api("accounts/me")).await.ok_json();

        assert_eq!(local["external"], false, "{local}");
        assert_eq!(external["external"], true, "{external}");
    });
}
