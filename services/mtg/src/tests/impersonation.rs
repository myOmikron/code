//! An Admin's Impersonation of a Member Account: start, acting as the Account, end, Admin log

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
async fn impersonating(account: &TestAccount) -> (TestAccount, TestClient) {
    let admin = create_account(Role::Admin).await;
    let mut client = TestClient::logged_in(&admin).await;
    let body = impersonate(&mut client, account, "Debugging").await.ok_json();
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
        assert_eq!(me["impersonation"]["admin_username"], admin.username.as_str());
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

        let body = impersonate(&mut client, &other, "Debugging").await.ok_json();
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

        let body = impersonate(&mut client, &admin, "Debugging").await.ok_json();
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
