//! An Admin renaming another Account, the Admin log entry and the mail it writes

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::passkeys::enroll;
use crate::utils::mail::outbox;

/// Renames `account` to `username` as the Admin behind `client`
async fn rename(
    client: &mut TestClient,
    account: &TestAccount,
    username: &str,
    reason: &str,
) -> TestResponse {
    client
        .json(
            Method::PUT,
            &api(&format!(
                "admin/accounts/{}/username",
                account.uuid.into_inner()
            )),
            &json!({ "username": username, "reason": reason, "language": "En" }),
        )
        .await
}

/// A username nobody has, unique per test run
fn fresh_username() -> String {
    format!("a{}", &Uuid::new_v4().simple().to_string()[..12])
}

/// The address [`create_account`] gives `account`
fn email(account: &TestAccount) -> String {
    format!("{}@mtg.test", account.username)
}

/// Starts a login as `username`, returning the response body
async fn start_login(username: &str) -> Value {
    TestClient::new()
        .json(
            Method::POST,
            &api("auth/login/start"),
            &json!({ "username": username }),
        )
        .await
        .ok_json()
}

/// The username the admin detail page shows for `account`
async fn username_of(admin: &mut TestClient, account: &TestAccount) -> Value {
    admin
        .get(&api(&format!(
            "admin/accounts/{}",
            account.uuid.into_inner()
        )))
        .await
        .ok_json()["account"]["username"]
        .clone()
}

#[test]
fn an_admin_renames_another_account() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        enroll(&member, "Laptop").await;
        let mut client = TestClient::logged_in(&admin).await;
        let new = fresh_username();

        let body = rename(&mut client, &member, &new, "Offensive name")
            .await
            .ok_json();
        assert_eq!(body, Value::Null);

        assert_eq!(username_of(&mut client, &member).await, new.as_str());
        assert!(start_login(&new).await["options"].is_object());
        let old_login = start_login(&member.username).await;
        assert_eq!(old_login["error"]["unknown_username"], true);
    });
}

#[test]
fn an_admin_renames_a_locked_account() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&admin).await;
        client
            .json(
                Method::POST,
                &api(&format!("admin/accounts/{}/lock", member.uuid.into_inner())),
                &json!({ "reason": "Spam" }),
            )
            .await
            .ok_json();
        let new = fresh_username();

        rename(&mut client, &member, &new, "Offensive name")
            .await
            .ok_json();

        assert_eq!(username_of(&mut client, &member).await, new.as_str());
        assert_eq!(start_login(&new).await["error"]["locked"], true);
    });
}

#[test]
fn the_account_is_mailed_its_new_username_without_the_reason() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let new = fresh_username();

        rename(
            &mut TestClient::logged_in(&admin).await,
            &member,
            &new,
            "Impersonates a judge",
        )
        .await
        .ok_json();

        let mails = outbox::sent_to(&email(&member));
        assert_eq!(mails.len(), 1, "{mails:?}");
        assert!(mails[0].text_body.contains(&new), "{}", mails[0].text_body);
        assert!(!mails[0].text_body.contains("Impersonates"));
        assert!(!mails[0].subject.contains("Impersonates"));
    });
}

#[test]
fn a_rename_is_in_the_admin_log() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&admin).await;
        let new = fresh_username();

        rename(&mut client, &member, &new, "  Offensive name ")
            .await
            .ok_json();

        let body = client
            .get(&api(&format!(
                "admin/log?account={}",
                member.uuid.into_inner()
            )))
            .await
            .ok_json();
        let entries = body["entries"].as_array().expect("entries");
        assert_eq!(entries.len(), 1, "{entries:?}");
        let entry = &entries[0];
        assert_eq!(entry["admin_username"], admin.username.as_str());
        assert_eq!(entry["account_username"], member.username.as_str());
        assert_eq!(
            entry["action"],
            json!({ "kind": "Rename", "new_username": new, "reason": "Offensive name" })
        );
    });
}

#[test]
fn a_rename_without_a_reason_is_refused() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&admin).await;

        let body = rename(&mut client, &member, &fresh_username(), "  ")
            .await
            .ok_json();

        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["reason_missing"], true);
        assert_eq!(
            username_of(&mut client, &member).await,
            member.username.as_str()
        );
        assert!(outbox::sent_to(&email(&member)).is_empty());
    });
}

#[test]
fn a_taken_username_is_refused_whatever_its_case() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let other = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&admin).await;

        let body = rename(
            &mut client,
            &member,
            &other.username.to_uppercase(),
            "Offensive name",
        )
        .await
        .ok_json();

        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["username_taken"], true);
        assert_eq!(
            username_of(&mut client, &member).await,
            member.username.as_str()
        );
        assert!(outbox::sent_to(&email(&member)).is_empty());
    });
}

#[test]
fn an_invalid_username_is_refused() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&admin).await;

        for invalid in ["ab", "-leading", "with space", "#deleted"] {
            let response = rename(&mut client, &member, invalid, "Offensive name").await;
            assert_ne!(response.status, StatusCode::OK, "{invalid}");
        }
        assert_eq!(
            username_of(&mut client, &member).await,
            member.username.as_str()
        );
    });
}

#[test]
fn an_admin_cannot_rename_itself_through_the_admin_dashboard() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;

        let body = rename(&mut client, &admin, &fresh_username(), "Typo")
            .await
            .ok_json();

        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["own_account"], true);
        assert_eq!(
            username_of(&mut client, &admin).await,
            admin.username.as_str()
        );
    });
}

#[test]
fn a_member_cannot_rename_another_account() {
    run(async {
        let member = create_account(Role::Member).await;
        let other = create_account(Role::Member).await;

        let response = rename(
            &mut TestClient::logged_in(&member).await,
            &other,
            &fresh_username(),
            "Offensive name",
        )
        .await;

        assert_eq!(response.status, StatusCode::FORBIDDEN);
    });
}
