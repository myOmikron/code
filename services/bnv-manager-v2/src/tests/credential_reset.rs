//! Credential reset hardening: wrong codes count against the rate limit

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;
use serde_json::json;
use url::Url;

use crate::models::account::Account;
use crate::models::account::ClubAccount;
use crate::tests::harness;
use crate::tests::harness::Member;
use crate::tests::harness::TestClient;

/// Failed tries the credential reset routes allow per IP and day
const MAX_TRIES: usize = 5;

fn reset_url(code: &str) -> Url {
    harness::origin()
        .join(&format!("/api/v1/frontend/credential-reset/{code}/reset"))
        .unwrap()
}

fn verify_url(code: &str) -> Url {
    harness::origin()
        .join(&format!("/api/v1/frontend/credential-reset/{code}"))
        .unwrap()
}

fn sign_in_url() -> Url {
    harness::origin().join("/api/v1/auth/sign-in").unwrap()
}

/// Issues a credential reset for `member` and returns its 6-digit code
async fn issue_reset(member: &Member) -> String {
    let account = ClubAccount::get_by_username(
        Database::global(),
        &MaxStr::new(member.username.clone()).expect("short username"),
    )
    .await
    .expect("look up the member")
    .expect("the member exists");

    Account::ClubMember(account)
        .create_credential_reset(Database::global())
        .await
        .expect("create the reset")
        .code
}

/// A 6-digit code that differs from `code`
fn wrong_code(code: &str, n: usize) -> String {
    let code: u32 = code.parse().expect("numeric code");
    format!("{:06}", (code + 1 + n as u32) % 1_000_000)
}

fn new_password() -> String {
    "correct horse battery staple reset".to_string()
}

#[test]
fn wrong_reset_code_is_a_client_error() {
    harness::run(async {
        let member = harness::register_member().await;
        let code = issue_reset(&member).await;

        let response = TestClient::new()
            .post_json(
                &reset_url(&wrong_code(&code, 0)),
                &json!({ "password": new_password() }),
            )
            .await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST, "{response:?}");
    });
}

#[test]
fn wrong_reset_codes_block_the_client() {
    harness::run(async {
        let member = harness::register_member().await;
        let code = issue_reset(&member).await;
        let mut attacker = TestClient::new();

        for n in 0..MAX_TRIES {
            let response = attacker
                .post_json(
                    &reset_url(&wrong_code(&code, n)),
                    &json!({ "password": new_password() }),
                )
                .await;
            assert_eq!(response.status, StatusCode::BAD_REQUEST, "{response:?}");
        }

        let response = attacker
            .post_json(&reset_url(&code), &json!({ "password": new_password() }))
            .await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST, "{response:?}");

        let response = TestClient::new()
            .post_json(
                &sign_in_url(),
                &json!({ "username": member.username, "password": member.password }),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK, "the password is unchanged");
    });
}

#[test]
fn success_does_not_clear_failed_tries() {
    harness::run(async {
        let member = harness::register_member().await;
        let code = issue_reset(&member).await;
        let mut attacker = TestClient::new();

        for n in 0..MAX_TRIES - 1 {
            let response = attacker.get(&verify_url(&wrong_code(&code, n))).await;
            assert_eq!(response.status, StatusCode::BAD_REQUEST, "{response:?}");
        }

        let response = attacker.get(&verify_url(&code)).await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");

        let response = attacker
            .get(&verify_url(&wrong_code(&code, MAX_TRIES)))
            .await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST, "{response:?}");

        let response = attacker
            .post_json(&reset_url(&code), &json!({ "password": new_password() }))
            .await;
        assert_eq!(
            response.status,
            StatusCode::BAD_REQUEST,
            "blocked: {response:?}"
        );

        let response = TestClient::new()
            .post_json(&reset_url(&code), &json!({ "password": new_password() }))
            .await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");
    });
}
