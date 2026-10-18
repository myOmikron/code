//! The admin API and its guard

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::json;

use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;

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
