//! An Admin's Impersonation of a Member Account: start, acting as the Account, end, Admin log

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::tests::deletion::delete;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::lock::lock;

/// Starts an Impersonation of `account` as the Admin behind `client`
async fn impersonate(client: &mut TestClient, account: &TestAccount, reason: &str) -> TestResponse {
    client
        .json(
            Method::POST,
            &api(&format!(
                "admin/accounts/{}/impersonation",
                account.uuid.into_inner()
            )),
            &json!({ "reason": reason }),
        )
        .await
}

/// A client logged in as a fresh Admin, impersonating `account`
pub(super) async fn impersonating(account: &TestAccount) -> (TestAccount, TestClient) {
    let admin = create_account(Role::Admin).await;
    let mut client = TestClient::logged_in(&admin).await;
    let body = impersonate(&mut client, account, "Debugging")
        .await
        .ok_json();
    assert_eq!(body, Value::Null);
    (admin, client)
}

/// Creates a private deck as the Account behind `client`, returning its uuid
async fn private_deck(client: &mut TestClient, name: &str) -> String {
    let body = client
        .json(
            Method::POST,
            &api("decks"),
            &json!({
                "name": name,
                "description": null,
                "format": "commander",
                "visibility": "Private",
            }),
        )
        .await
        .ok_json();
    body["uuid"].as_str().expect("deck uuid").to_string()
}

/// Ends the Impersonation of the session behind `client`
async fn end(client: &mut TestClient) -> TestResponse {
    client
        .json(
            Method::DELETE,
            &api("accounts/me/impersonation"),
            &json!({}),
        )
        .await
}

/// The Admin log entries about `account`, newest first, as a fresh Admin reads them
async fn log_of(account: &TestAccount) -> Vec<Value> {
    let reader = create_account(Role::Admin).await;
    let body = TestClient::logged_in(&reader)
        .await
        .get(&api(&format!(
            "admin/log?account={}",
            account.uuid.into_inner()
        )))
        .await
        .ok_json();
    body["entries"].as_array().expect("entries").clone()
}

/// The `kind` of each entry's action
fn kinds(entries: &[Value]) -> Vec<&str> {
    entries
        .iter()
        .map(|entry| entry["action"]["kind"].as_str().expect("a kind"))
        .collect()
}

#[test]
fn me_reports_the_impersonated_account_and_who_impersonates_it() {
    run(async {
        let member = create_account(Role::Member).await;
        let (admin, mut client) = impersonating(&member).await;

        let me = client.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["uuid"], member.uuid.into_inner().to_string());
        assert_eq!(me["username"], member.username.as_str());
        assert_eq!(me["role"], "Member");
        assert_eq!(
            me["impersonation"]["username"],
            member.username.as_str(),
            "{me}"
        );
        assert_eq!(
            me["impersonation"]["admin_username"],
            admin.username.as_str()
        );
        assert!(me["impersonation"]["expires_at"].is_string(), "{me}");
    });
}

#[test]
fn outside_an_impersonation_me_has_no_impersonation() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let me = TestClient::logged_in(&admin)
            .await
            .get(&api("accounts/me"))
            .await
            .ok_json();
        assert_eq!(me["username"], admin.username.as_str());
        assert!(me.get("impersonation").is_none(), "{me}");
    });
}

#[test]
fn an_admin_cannot_impersonate_another_admin() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let other = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;

        let body = impersonate(&mut client, &other, "Debugging")
            .await
            .ok_json();
        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["admin_account"], true);

        let me = client.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], admin.username.as_str());
        assert!(me.get("impersonation").is_none(), "{me}");
    });
}

#[test]
fn an_admin_cannot_impersonate_itself() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;

        let body = impersonate(&mut client, &admin, "Debugging")
            .await
            .ok_json();
        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["own_account"], true);
    });
}

#[test]
fn an_impersonation_needs_a_reason() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&admin).await;

        let body = impersonate(&mut client, &member, "  ").await.ok_json();
        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["reason_missing"], true);

        let me = client.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], admin.username.as_str());
    });
}

#[test]
fn an_unknown_account_cannot_be_impersonated() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;

        let response = client
            .json(
                Method::POST,
                &api(&format!("admin/accounts/{}/impersonation", Uuid::new_v4())),
                &json!({ "reason": "Debugging" }),
            )
            .await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST, "{response:?}");
    });
}

#[test]
fn a_member_cannot_impersonate() {
    run(async {
        let member = create_account(Role::Member).await;
        let other = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&member).await;

        let response = impersonate(&mut client, &other, "Debugging").await;
        assert_eq!(response.status, StatusCode::FORBIDDEN);

        let me = client.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], member.username.as_str());
    });
}

#[test]
fn an_admin_impersonates_a_locked_member() {
    run(async {
        let member = create_account(Role::Member).await;
        let other_admin = create_account(Role::Admin).await;
        lock(
            &mut TestClient::logged_in(&other_admin).await,
            &member,
            "Spam",
        )
        .await;

        let (_, mut client) = impersonating(&member).await;

        let me = client.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], member.username.as_str());
        assert_eq!(client.get(&api("decks")).await.status, StatusCode::OK);
    });
}

#[test]
fn an_impersonating_admin_reads_and_edits_the_members_private_deck() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut own = TestClient::logged_in(&member).await;
        let deck = private_deck(&mut own, "Secret").await;

        let (_, mut client) = impersonating(&member).await;

        let body = client.get(&api(&format!("decks/{deck}"))).await.ok_json();
        assert_eq!(body["name"], "Secret");
        client
            .json(
                Method::PUT,
                &api(&format!("decks/{deck}")),
                &json!({ "name": "Fixed", "description": null, "format": "commander" }),
            )
            .await
            .ok_json();

        let body = own.get(&api(&format!("decks/{deck}"))).await.ok_json();
        assert_eq!(body["name"], "Fixed");
        let me = own.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], member.username.as_str());
        assert!(me.get("impersonation").is_none(), "{me}");
    });
}

#[test]
fn an_impersonating_admin_cannot_reach_the_admin_routes() {
    run(async {
        let member = create_account(Role::Member).await;
        let (_, mut client) = impersonating(&member).await;

        assert_eq!(
            client.get(&api("admin/accounts")).await.status,
            StatusCode::FORBIDDEN
        );
        let other = create_account(Role::Member).await;
        assert_eq!(
            impersonate(&mut client, &other, "Nested").await.status,
            StatusCode::FORBIDDEN
        );
    });
}

#[test]
fn ending_returns_the_session_to_the_admin() {
    run(async {
        let member = create_account(Role::Member).await;
        let (admin, mut client) = impersonating(&member).await;

        assert_eq!(end(&mut client).await.ok_json(), Value::Null);

        let me = client.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], admin.username.as_str());
        assert_eq!(me["role"], "Admin");
        assert!(me.get("impersonation").is_none(), "{me}");
        assert_eq!(
            client.get(&api("admin/accounts")).await.status,
            StatusCode::OK
        );
    });
}

#[test]
fn ending_without_an_impersonation_is_an_error() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;

        let body = end(&mut client).await.ok_json();
        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["not_impersonating"], true);
    });
}

#[test]
fn start_and_end_land_in_the_admin_log() {
    run(async {
        let member = create_account(Role::Member).await;
        let (admin, mut client) = impersonating(&member).await;
        end(&mut client).await.ok_json();

        let entries = log_of(&member).await;
        assert_eq!(kinds(&entries), ["ImpersonationEnd", "ImpersonationStart"]);
        assert_eq!(entries[1]["action"]["reason"], "Debugging");
        assert!(
            entries[1]["action"]["expires_at"].is_string(),
            "{entries:?}"
        );
        for entry in &entries {
            assert_eq!(entry["admin_username"], admin.username.as_str());
            assert_eq!(entry["account_username"], member.username.as_str());
        }
    });
}

#[test]
fn logging_out_ends_the_impersonation_and_logs_out() {
    run(async {
        let member = create_account(Role::Member).await;
        let (_, mut client) = impersonating(&member).await;

        assert_eq!(client.get(&api("auth/logout")).await.status, StatusCode::OK);

        assert_eq!(
            client.get(&api("accounts/me")).await.status,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            kinds(&log_of(&member).await),
            ["ImpersonationEnd", "ImpersonationStart"]
        );
    });
}

#[test]
fn logging_out_without_an_impersonation_writes_no_entry() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&member).await;

        assert_eq!(client.get(&api("auth/logout")).await.status, StatusCode::OK);

        assert_eq!(log_of(&member).await, Vec::<Value>::new());
    });
}

#[test]
fn the_members_own_session_is_unaffected_throughout() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut own = TestClient::logged_in(&member).await;
        let deck = private_deck(&mut own, "Mine").await;

        let (_, mut client) = impersonating(&member).await;
        let me = own.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], member.username.as_str());
        assert!(me.get("impersonation").is_none(), "{me}");

        end(&mut client).await.ok_json();
        let body = own.get(&api(&format!("decks/{deck}"))).await.ok_json();
        assert_eq!(body["name"], "Mine");

        impersonate(&mut client, &member, "Again").await.ok_json();
        client.get(&api("auth/logout")).await;
        let me = own.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], member.username.as_str());
    });
}

#[test]
fn after_the_expiry_the_session_acts_as_the_admin_again_without_an_end_entry() {
    run(async {
        let member = create_account(Role::Member).await;
        let (admin, mut client) = impersonating(&member).await;

        client.expire_impersonation().await;

        let me = client.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], admin.username.as_str());
        assert!(me.get("impersonation").is_none(), "{me}");
        assert_eq!(
            client.get(&api("admin/accounts")).await.status,
            StatusCode::OK
        );
        assert_eq!(kinds(&log_of(&member).await), ["ImpersonationStart"]);
    });
}

/// Gives `account` the Role `role` as a fresh Admin
async fn set_role(account: &TestAccount, role: &str) {
    let other_admin = create_account(Role::Admin).await;
    let body = TestClient::logged_in(&other_admin)
        .await
        .json(
            Method::PUT,
            &api(&format!(
                "admin/accounts/{}/role",
                account.uuid.into_inner()
            )),
            &json!({ "role": role }),
        )
        .await
        .ok_json();
    assert_eq!(body, Value::Null);
}

#[test]
fn promoting_the_impersonated_account_ends_the_impersonation() {
    run(async {
        let member = create_account(Role::Member).await;
        let (admin, mut client) = impersonating(&member).await;

        set_role(&member, "Admin").await;

        let me = client.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], admin.username.as_str());
        assert!(me.get("impersonation").is_none(), "{me}");
        assert_eq!(
            kinds(&log_of(&member).await),
            ["RoleChange", "ImpersonationStart"]
        );
    });
}

#[test]
fn deleting_the_impersonated_account_ends_the_impersonation() {
    run(async {
        let member = create_account(Role::Member).await;
        let (admin, mut client) = impersonating(&member).await;

        let other_admin = create_account(Role::Admin).await;
        let body = delete(
            &mut TestClient::logged_in(&other_admin).await,
            &member,
            &member.username,
            "Tombstone",
        )
        .await;
        assert_eq!(body, Value::Null);

        let me = client.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], admin.username.as_str());
        assert!(me.get("impersonation").is_none(), "{me}");
        assert_eq!(
            client.get(&api("admin/accounts")).await.status,
            StatusCode::OK
        );
    });
}

#[test]
fn locking_the_impersonating_admin_fails_its_next_request_as_locked() {
    run(async {
        let member = create_account(Role::Member).await;
        let (admin, mut client) = impersonating(&member).await;

        let other_admin = create_account(Role::Admin).await;
        lock(
            &mut TestClient::logged_in(&other_admin).await,
            &admin,
            "Abuse",
        )
        .await;

        let body = client.get(&api("accounts/me")).await.ok_json();
        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"], json!({ "locked": true }));
        assert_eq!(
            client.get(&api("decks")).await.status,
            StatusCode::UNAUTHORIZED
        );
    });
}

#[test]
fn demoting_the_impersonating_admin_logs_its_session_out() {
    run(async {
        let member = create_account(Role::Member).await;
        let (admin, mut client) = impersonating(&member).await;

        set_role(&admin, "Member").await;

        assert_eq!(
            client.get(&api("decks")).await.status,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            client.get(&api("accounts/me")).await.status,
            StatusCode::UNAUTHORIZED
        );
    });
}

#[test]
fn deleting_the_impersonating_admin_logs_its_session_out() {
    run(async {
        let member = create_account(Role::Member).await;
        let (admin, mut client) = impersonating(&member).await;

        let other_admin = create_account(Role::Admin).await;
        let body = delete(
            &mut TestClient::logged_in(&other_admin).await,
            &admin,
            &admin.username,
            "Tombstone",
        )
        .await;
        assert_eq!(body, Value::Null);

        assert_eq!(
            client.get(&api("decks")).await.status,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            client.get(&api("accounts/me")).await.status,
            StatusCode::UNAUTHORIZED
        );
    });
}

#[test]
fn the_full_admin_log_lists_the_impersonation() {
    run(async {
        let member = create_account(Role::Member).await;
        let (admin, mut client) = impersonating(&member).await;
        end(&mut client).await.ok_json();

        let body = client.get(&api("admin/log?limit=100")).await.ok_json();
        let entries: Vec<Value> = body["entries"]
            .as_array()
            .expect("entries")
            .iter()
            .filter(|entry| entry["admin_username"] == admin.username.as_str())
            .cloned()
            .collect();
        assert_eq!(kinds(&entries), ["ImpersonationEnd", "ImpersonationStart"]);
    });
}
