//! The userinfo endpoint, called like a relying party would (OIDC Core §5.3, RFC 6750)

use galvyn::core::Module;
use galvyn::core::re_exports::axum::body::Body;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::http::header;
use serde_json::Value;
use serde_json::json;
use url::Url;

use crate::modules::oidc::Oidc;
use crate::tests::flow;
use crate::tests::harness;
use crate::tests::harness::Member;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;

fn userinfo_url() -> Url {
    flow::url("/api/v1/auth/userinfo")
}

/// Tokens of a completed authorization code flow
struct Tokens {
    id_token: String,
    access_token: String,
}

impl Tokens {
    /// The ID token's claims
    fn id_token_claims(&self) -> Value {
        flow::jwt_claims(&self.id_token)
    }
}

/// Runs the authorization code flow for `member`, requesting `scope`
async fn tokens(member: &Member, scope: &str) -> Tokens {
    let client = harness::register_client("https://rp.test/callback").await;
    let code = flow::issue_code(&client, member, &[("scope", scope)]).await;
    let tokens = flow::redeem(&client, &code).await;
    Tokens {
        id_token: tokens["id_token"].as_str().expect("id_token").to_string(),
        access_token: tokens["access_token"]
            .as_str()
            .expect("access_token")
            .to_string(),
    }
}

/// Calls the userinfo endpoint with this `Authorization` header
async fn userinfo(method: Method, authorization: Option<&str>) -> TestResponse {
    let mut request = harness::request(method, &userinfo_url());
    if let Some(authorization) = authorization {
        request = request.header(header::AUTHORIZATION, authorization);
    }
    TestClient::new()
        .send(request.body(Body::empty()).unwrap())
        .await
}

fn www_authenticate(response: &TestResponse) -> &str {
    response
        .headers
        .get(header::WWW_AUTHENTICATE)
        .unwrap_or_else(|| panic!("no WWW-Authenticate in {response:?}"))
        .to_str()
        .unwrap()
}

/// Asserts the RFC 6750 `invalid_token` error
fn assert_invalid_token(response: &TestResponse, case: &str) {
    assert_eq!(response.status, StatusCode::UNAUTHORIZED, "{case}");
    let challenge = www_authenticate(response);
    assert!(
        challenge.starts_with("Bearer "),
        "{case}: challenge {challenge}"
    );
    assert!(
        challenge.contains(r#"error="invalid_token""#),
        "{case}: challenge {challenge}"
    );
}

#[test]
fn get_and_post_return_the_claims() {
    harness::run(async {
        let member = harness::register_member().await;
        let tokens = tokens(&member, "openid email").await;
        let bearer = format!("Bearer {}", tokens.access_token);

        for method in [Method::GET, Method::POST] {
            let response = userinfo(method.clone(), Some(&bearer)).await;
            assert_eq!(response.status, StatusCode::OK, "{method}");
            let claims: Value = response.json();
            assert_eq!(claims["email"], member.email.as_str(), "{method}");
        }
    });
}

#[test]
fn scheme_is_case_insensitive() {
    harness::run(async {
        let member = harness::register_member().await;
        let tokens = tokens(&member, "openid").await;

        for scheme in ["bearer", "BEARER", "Bearer"] {
            let response = userinfo(
                Method::GET,
                Some(&format!("{scheme} {}", tokens.access_token)),
            )
            .await;
            assert_eq!(response.status, StatusCode::OK, "{scheme}");
        }
    });
}

#[test]
fn sub_equals_the_id_token_sub() {
    harness::run(async {
        let member = harness::register_member().await;
        let tokens = tokens(&member, "openid").await;

        let response = userinfo(
            Method::GET,
            Some(&format!("Bearer {}", tokens.access_token)),
        )
        .await;
        assert_eq!(response.status, StatusCode::OK);
        let sub = &response.json::<Value>()["sub"];
        assert!(sub.is_string(), "sub {sub}");
        assert_eq!(*sub, tokens.id_token_claims()["sub"]);
    });
}

#[test]
fn missing_token_is_challenged_without_error() {
    harness::run(async {
        for authorization in [None, Some("Basic dXNlcjpwYXNz")] {
            let response = userinfo(Method::GET, authorization).await;
            assert_eq!(
                response.status,
                StatusCode::UNAUTHORIZED,
                "{authorization:?}"
            );
            let challenge = www_authenticate(&response);
            assert!(
                challenge.starts_with("Bearer "),
                "{authorization:?}: {challenge}"
            );
            assert!(
                !challenge.contains("error="),
                "{authorization:?}: {challenge}"
            );
        }
    });
}

#[test]
fn malformed_token_is_invalid() {
    harness::run(async {
        let member = harness::register_member().await;
        let tokens = tokens(&member, "openid").await;

        for authorization in [
            "Bearer not-a-jwt".to_string(),
            "Bearer a.b.c".to_string(),
            format!("Bearer {}x", tokens.access_token),
            format!("Bearer {}", tokens.id_token),
        ] {
            let response = userinfo(Method::GET, Some(&authorization)).await;
            assert_invalid_token(&response, &authorization);
        }
    });
}

/// Asserts the RFC 6750 `invalid_request` error
fn assert_invalid_request(response: &TestResponse, case: &str) {
    assert_eq!(response.status, StatusCode::BAD_REQUEST, "{case}");
    let challenge = www_authenticate(response);
    assert!(
        challenge.starts_with("Bearer "),
        "{case}: challenge {challenge}"
    );
    assert!(
        challenge.contains(r#"error="invalid_request""#),
        "{case}: challenge {challenge}"
    );
}

#[test]
fn malformed_authorization_is_an_invalid_request() {
    harness::run(async {
        let member = harness::register_member().await;
        let tokens = tokens(&member, "openid").await;

        for authorization in [
            "Bearer".to_string(),
            "Bearer ".to_string(),
            "Bearer a,b".to_string(),
            format!("Bearer {} extra", tokens.access_token),
        ] {
            let response = userinfo(Method::GET, Some(&authorization)).await;
            assert_invalid_request(&response, &authorization);
        }
    });
}

#[test]
fn more_than_one_token_is_an_invalid_request() {
    harness::run(async {
        let member = harness::register_member().await;
        let tokens = tokens(&member, "openid").await;
        let bearer = format!("Bearer {}", tokens.access_token);

        let request = harness::request(Method::GET, &userinfo_url())
            .header(header::AUTHORIZATION, &bearer)
            .header(header::AUTHORIZATION, &bearer)
            .body(Body::empty())
            .unwrap();
        let response = TestClient::new().send(request).await;
        assert_invalid_request(&response, "two headers");

        let mut url = userinfo_url();
        url.query_pairs_mut()
            .append_pair("access_token", &tokens.access_token);
        let request = harness::request(Method::GET, &url)
            .header(header::AUTHORIZATION, &bearer)
            .body(Body::empty())
            .unwrap();
        let response = TestClient::new().send(request).await;
        assert_invalid_request(&response, "header and query");

        let request = harness::request(Method::POST, &userinfo_url())
            .header(header::AUTHORIZATION, &bearer)
            .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(Body::from(format!("access_token={}", tokens.access_token)))
            .unwrap();
        let response = TestClient::new().send(request).await;
        assert_invalid_request(&response, "header and body");
    });
}

#[test]
fn token_outside_the_header_is_an_invalid_request() {
    harness::run(async {
        let member = harness::register_member().await;
        let tokens = tokens(&member, "openid").await;

        let mut url = userinfo_url();
        url.query_pairs_mut()
            .append_pair("access_token", &tokens.access_token);
        let response = TestClient::new().get(&url).await;
        assert_invalid_request(&response, "query");

        let response = TestClient::new()
            .post_form(
                &userinfo_url(),
                &[("access_token", tokens.access_token.as_str())],
            )
            .await;
        assert_invalid_request(&response, "body");
    });
}

#[test]
fn expired_token_is_invalid() {
    harness::run(async {
        let member = harness::register_member().await;
        let tokens = tokens(&member, "openid email").await;
        let sub = tokens.id_token_claims()["sub"].clone();

        let oidc = Oidc::global();
        let expired = jsonwebtoken::encode(
            &oidc.jwt_header(),
            &json!({
                "iss": "http://bnv.test/api/v1/auth",
                "sub": sub,
                "aud": userinfo_url().as_str(),
                "iat": flow::unix_now() - 3600,
                "exp": flow::unix_now() - 3000,
                "scope": "openid email",
            }),
            &oidc.encoding_key,
        )
        .unwrap();

        let response = userinfo(Method::GET, Some(&format!("Bearer {expired}"))).await;
        assert_invalid_token(&response, "expired");
    });
}

#[test]
fn removed_member_is_rejected() {
    harness::run(async {
        let member = harness::register_member().await;
        let tokens = tokens(&member, "openid email").await;
        let bearer = format!("Bearer {}", tokens.access_token);
        assert_eq!(
            userinfo(Method::GET, Some(&bearer)).await.status,
            StatusCode::OK
        );

        harness::remove_member(&member).await;

        let response = userinfo(Method::GET, Some(&bearer)).await;
        assert_invalid_token(&response, "removed member");
    });
}

#[test]
fn claims_follow_the_granted_scopes() {
    harness::run(async {
        let member = harness::register_member().await;

        for (scope, present, absent) in [
            (
                "openid",
                &[][..],
                &[
                    "email",
                    "email_verified",
                    "preferred_username",
                    "name",
                    "mailcow_template",
                ][..],
            ),
            (
                "openid email",
                &["email", "email_verified"][..],
                &["preferred_username", "name", "mailcow_template"][..],
            ),
            (
                "openid profile",
                &["preferred_username", "name"][..],
                &["email", "email_verified", "mailcow_template"][..],
            ),
            (
                "openid mailcow_template",
                &["mailcow_template"][..],
                &["email", "email_verified", "preferred_username", "name"][..],
            ),
        ] {
            let tokens = tokens(&member, scope).await;
            let response = userinfo(
                Method::GET,
                Some(&format!("Bearer {}", tokens.access_token)),
            )
            .await;
            assert_eq!(response.status, StatusCode::OK, "{scope}");
            let claims: Value = response.json();
            for claim in present {
                assert!(claims.get(claim).is_some(), "{scope}: {claim} in {claims}");
            }
            for claim in absent {
                assert!(claims.get(claim).is_none(), "{scope}: {claim} in {claims}");
            }
        }
    });
}

#[test]
fn mailcow_template_is_a_string_in_userinfo_and_id_token() {
    harness::run(async {
        let member = harness::register_member().await;
        let tokens = tokens(&member, "openid profile email mailcow_template").await;

        let response = userinfo(
            Method::GET,
            Some(&format!("Bearer {}", tokens.access_token)),
        )
        .await;
        assert_eq!(response.status, StatusCode::OK);
        let claims: Value = response.json();
        assert_eq!(claims["mailcow_template"], "default");
        assert_eq!(claims["email"], member.email.as_str());
        assert_eq!(claims["name"], member.display_name.as_str());
        assert_eq!(tokens.id_token_claims()["mailcow_template"], "default");
    });
}
