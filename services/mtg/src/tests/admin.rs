//! The admin API and its guard

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::json;

use crate::models::account::Role;
use crate::tests::harness::App;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::oidc::choose_username;
use crate::tests::oidc::continue_with_google;
use crate::tests::oidc::free_username;
use crate::tests::oidc::stranger;

#[test]
fn anonymous_is_refused_the_admin_api() {
    run(async {
        let response = TestClient::new().get(&api("admin/accounts")).await;
        assert_eq!(response.status, StatusCode::UNAUTHORIZED);
    });
}

#[test]
fn a_member_is_refused_the_admin_api() {
    run(async {
        let member = create_account(Role::Member).await;
        let response = TestClient::logged_in(&member)
            .await
            .get(&api("admin/accounts"))
            .await;
        assert_eq!(response.status, StatusCode::FORBIDDEN);
    });
}

#[test]
fn an_admin_lists_accounts() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let body = TestClient::logged_in(&admin)
            .await
            .get(&api(&format!("admin/accounts?search={}", admin.username)))
            .await
            .ok_json();
        assert_eq!(body["accounts"][0]["username"], admin.username.as_str());
        assert_eq!(body["accounts"][0]["role"], "Admin");
    });
}

#[test]
fn an_admin_cannot_demote_itself() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;

        let body = client
            .json(
                Method::PUT,
                &api(&format!("admin/accounts/{}/role", admin.uuid.into_inner())),
                &json!({ "role": "Member" }),
            )
            .await
            .ok_json();
        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["own_account"], true);

        let detail = client
            .get(&api(&format!("admin/accounts/{}", admin.uuid.into_inner())))
            .await
            .ok_json();
        assert_eq!(detail["account"]["role"], "Admin");
    });
}

#[test]
fn an_admin_demotes_another_admin() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let other = create_account(Role::Admin).await;

        let body = TestClient::logged_in(&admin)
            .await
            .json(
                Method::PUT,
                &api(&format!("admin/accounts/{}/role", other.uuid.into_inner())),
                &json!({ "role": "Member" }),
            )
            .await
            .ok_json();
        assert_eq!(body, serde_json::Value::Null);

        let response = TestClient::logged_in(&other)
            .await
            .get(&api("admin/accounts"))
            .await;
        assert_eq!(response.status, StatusCode::FORBIDDEN);
    });
}

#[test]
fn the_logged_in_account_sees_its_role() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let me = TestClient::logged_in(&admin)
            .await
            .get(&api("accounts/me"))
            .await
            .ok_json();
        assert_eq!(me["role"], "Admin");
    });
}

/// The list entry and the detail of the Account named `username`, as `admin` sees them
async fn listed_and_detail(
    admin: &TestAccount,
    username: &str,
) -> (serde_json::Value, serde_json::Value) {
    let mut client = TestClient::logged_in(admin).await;
    let list = client
        .get(&api(&format!("admin/accounts?search={username}")))
        .await
        .ok_json();
    let listed = list["accounts"][0].clone();
    assert_eq!(listed["username"], username, "{list}");
    let uuid = listed["uuid"].as_str().expect("a uuid").to_string();
    let detail = client
        .get(&api(&format!("admin/accounts/{uuid}")))
        .await
        .ok_json();
    (listed, detail)
}

#[test]
fn an_admin_sees_a_local_account_without_an_openid_provider() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let local = create_account(Role::Member).await;

        let (listed, detail) = listed_and_detail(&admin, &local.username).await;

        assert_eq!(
            listed.get("openid_provider"),
            Some(&json!(null)),
            "{listed}"
        );
        assert_eq!(
            detail["account"].get("openid_provider"),
            Some(&json!(null)),
            "{detail}"
        );
    });
}

#[test]
fn an_admin_sees_an_external_account_with_its_openid_provider() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let username = free_username();
        let mut client = TestClient::new();
        continue_with_google(&mut client, stranger()).await;
        choose_username(&mut client, &username).await.ok_json();

        let (listed, detail) = listed_and_detail(&admin, &username).await;

        let provider = json!({
            "issuer": App::fake().await.issuer(),
            "display_name": "Fake google",
        });
        assert_eq!(listed["openid_provider"], provider, "{listed}");
        assert_eq!(detail["account"]["openid_provider"], provider, "{detail}");
    });
}
