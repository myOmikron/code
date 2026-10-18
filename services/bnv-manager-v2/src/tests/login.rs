//! Login hardening: session fixation and username enumeration

use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::json;
use url::Url;

use crate::tests::flow;
use crate::tests::harness;
use crate::tests::harness::SESSION_COOKIE;
use crate::tests::harness::TestClient;

fn sign_in_url() -> Url {
    harness::origin().join("/api/v1/auth/sign-in").unwrap()
}

fn me_url() -> Url {
    harness::origin()
        .join("/api/v1/frontend/common/me")
        .unwrap()
}

/// Starts an authorization request, so the browser holds a session before the login
async fn start_authorization(browser: &mut TestClient) {
    let client = harness::register_client("https://rp.test/callback").await;
    flow::authorize(browser, &client, &[]).await;
}

#[test]
fn login_rotates_the_session_id() {
    harness::run(async {
        let member = harness::register_member().await;
        let mut browser = TestClient::new();

        start_authorization(&mut browser).await;
        let before = browser
            .cookie(SESSION_COOKIE)
            .expect("a session before the login")
            .to_string();

        let response = browser
            .post_json(
                &sign_in_url(),
                &json!({ "username": member.username, "password": member.password }),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK);
        let after = browser
            .cookie(SESSION_COOKIE)
            .expect("a session after the login")
            .to_string();
        assert_ne!(before, after);

        let response = browser.get(&me_url()).await;
        assert_eq!(response.status, StatusCode::OK);

        let mut attacker = TestClient::new();
        attacker.set_cookie(SESSION_COOKIE, &before);
        let response = attacker.get(&me_url()).await;
        assert_eq!(response.status, StatusCode::UNAUTHORIZED);
    });
}

#[test]
fn unknown_username_and_wrong_password_are_indistinguishable() {
    harness::run(async {
        let member = harness::register_member().await;

        let unknown = TestClient::new()
            .post_json(
                &sign_in_url(),
                &json!({ "username": "no-such-member", "password": member.password }),
            )
            .await;
        let wrong_password = TestClient::new()
            .post_json(
                &sign_in_url(),
                &json!({ "username": member.username, "password": "wrong-password" }),
            )
            .await;

        assert!(unknown.status.is_client_error(), "{unknown:?}");
        assert_eq!(unknown.status, wrong_password.status);
        assert_eq!(unknown.body, wrong_password.body);
    });
}
