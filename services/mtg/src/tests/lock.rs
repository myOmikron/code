//! Locking and unlocking Accounts, and the Admin log it writes

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;

/// Locks `account` as the Admin behind `client`, returning the response body
async fn lock(client: &mut TestClient, account: &TestAccount, reason: &str) -> Value {
    client
        .json(
            Method::POST,
            &api(&format!(
                "admin/accounts/{}/lock",
                account.uuid.into_inner()
            )),
            &json!({ "reason": reason }),
        )
        .await
        .ok_json()
}

#[test]
fn a_locked_account_cannot_start_a_login() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let body = lock(&mut TestClient::logged_in(&admin).await, &member, "Spam").await;
        assert_eq!(body, Value::Null);

        let body = TestClient::new()
            .json(
                Method::POST,
                &api("auth/login/start"),
                &json!({ "username": member.username }),
            )
            .await
            .ok_json();
        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["locked"], true);
    });
}

#[test]
fn a_locked_accounts_session_stops_working() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut session = TestClient::logged_in(&member).await;
        assert_eq!(
            session.get(&api("accounts/me")).await.status,
            StatusCode::OK
        );

        lock(&mut TestClient::logged_in(&admin).await, &member, "Spam").await;

        assert_eq!(
            session.get(&api("accounts/me")).await.status,
            StatusCode::UNAUTHORIZED
        );
        let printing = Uuid::new_v4();
        assert_eq!(
            session
                .get(&api(&format!("printings/{printing}/languages")))
                .await
                .status,
            StatusCode::UNAUTHORIZED
        );
    });
}

#[test]
fn a_locked_accounts_profile_stays_public() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        lock(&mut TestClient::logged_in(&admin).await, &member, "Spam").await;

        let profile = TestClient::new()
            .get(&api(&format!("explore/profiles/{}", member.username)))
            .await
            .ok_json();
        assert_eq!(profile["username"], member.username.as_str());
    });
}

#[test]
fn an_unlocked_account_logs_in_again() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&admin).await;
        lock(&mut client, &member, "Spam").await;

        let body = client
            .json(
                Method::POST,
                &api(&format!(
                    "admin/accounts/{}/unlock",
                    member.uuid.into_inner()
                )),
                &json!({}),
            )
            .await
            .ok_json();
        assert_eq!(body, Value::Null);

        let mut session = TestClient::logged_in(&member).await;
        assert_eq!(
            session.get(&api("accounts/me")).await.status,
            StatusCode::OK
        );
    });
}

#[test]
fn an_admin_cannot_lock_itself() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;

        let body = lock(&mut client, &admin, "Oops").await;
        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["own_account"], true);

        assert_eq!(
            client.get(&api("admin/accounts")).await.status,
            StatusCode::OK
        );
    });
}

#[test]
fn an_admin_locks_another_admin() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let other = create_account(Role::Admin).await;
        let body = lock(&mut TestClient::logged_in(&admin).await, &other, "Left").await;
        assert_eq!(body, Value::Null);

        let response = TestClient::logged_in(&other)
            .await
            .get(&api("admin/accounts"))
            .await;
        assert_eq!(response.status, StatusCode::UNAUTHORIZED);
    });
}

#[test]
fn a_lock_needs_a_reason() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;

        let body = lock(&mut TestClient::logged_in(&admin).await, &member, "  ").await;
        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["reason_missing"], true);
    });
}

#[test]
fn the_locked_filter_lists_locked_accounts_with_their_reason() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&admin).await;
        lock(&mut client, &member, "Spam").await;

        let body = client
            .get(&api(&format!(
                "admin/accounts?locked=true&search={}",
                member.username
            )))
            .await
            .ok_json();
        assert_eq!(body["accounts"][0]["username"], member.username.as_str());
        assert_eq!(body["accounts"][0]["lock"]["reason"], "Spam");

        let body = client
            .get(&api(&format!(
                "admin/accounts?locked=false&search={}",
                member.username
            )))
            .await
            .ok_json();
        assert_eq!(body["accounts"], json!([]));
    });
}

#[test]
fn lock_unlock_and_role_change_land_in_the_admin_log() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&admin).await;
        let account = member.uuid.into_inner();

        lock(&mut client, &member, "Spam").await;
        client
            .json(
                Method::POST,
                &api(&format!("admin/accounts/{account}/unlock")),
                &json!({ "reason": "Appeal" }),
            )
            .await
            .ok_json();
        client
            .json(
                Method::PUT,
                &api(&format!("admin/accounts/{account}/role")),
                &json!({ "role": "Admin" }),
            )
            .await
            .ok_json();

        let body = client
            .get(&api(&format!("admin/log?account={account}")))
            .await
            .ok_json();
        let entries = body["entries"].as_array().expect("entries");
        let actions: Vec<_> = entries.iter().map(|entry| &entry["action"]).collect();
        assert_eq!(actions, ["RoleChange", "Unlock", "Lock"]);
        assert_eq!(entries[0]["role"], "Admin");
        assert_eq!(entries[1]["reason"], "Appeal");
        assert_eq!(entries[2]["reason"], "Spam");
        for entry in entries {
            assert_eq!(entry["admin_username"], admin.username.as_str());
            assert_eq!(entry["account_username"], member.username.as_str());
        }
    });
}
