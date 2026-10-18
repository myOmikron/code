//! The token endpoint, driven like a relying party would (RFC 6749 §2.3.1, §5.1, §5.2)

use base64ct::Base64;
use base64ct::Encoding;
use galvyn::core::re_exports::axum::body::Body;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::http::header;
use serde_json::Value;
use serde_json::json;
use url::Url;

use crate::tests::flow;
use crate::tests::harness;
use crate::tests::harness::RegisteredClient;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;

fn token_endpoint() -> Url {
    harness::origin().join("/api/v1/auth/token").unwrap()
}

/// The form of a code exchange, without client credentials
fn exchange_form<'a>(client: &'a RegisteredClient, code: &'a str) -> Vec<(&'a str, &'a str)> {
    vec![
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", client.redirect_uri.as_str()),
    ]
}

/// `POST`s the form with `client_secret_post` credentials
async fn post_with_secret(
    relying_party: &mut TestClient,
    client: &RegisteredClient,
    code: &str,
) -> TestResponse {
    let client_id = client.client_id.to_string();
    let mut form = exchange_form(client, code);
    form.extend([
        ("client_id", client_id.as_str()),
        ("client_secret", client.client_secret.as_str()),
    ]);
    relying_party.post_form(&token_endpoint(), &form).await
}

/// `POST`s the form with an `Authorization` header
async fn post_with_authorization(
    relying_party: &mut TestClient,
    authorization: &str,
    form: &[(&str, &str)],
) -> TestResponse {
    let body = url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(form)
        .finish();
    relying_party
        .send(
            harness::request(Method::POST, &token_endpoint())
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::AUTHORIZATION, authorization)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
}

/// The `Authorization` header of `client_secret_basic`
fn basic(client_id: &str, client_secret: &str) -> String {
    let encode =
        |value: &str| url::form_urlencoded::byte_serialize(value.as_bytes()).collect::<String>();
    format!(
        "Basic {}",
        Base64::encode_string(
            format!("{}:{}", encode(client_id), encode(client_secret)).as_bytes()
        )
    )
}

fn assert_no_store(response: &TestResponse) {
    assert_eq!(
        response
            .headers
            .get(header::CACHE_CONTROL)
            .map(|x| x.to_str().unwrap()),
        Some("no-store"),
        "{response:?}"
    );
    assert_eq!(
        response
            .headers
            .get(header::PRAGMA)
            .map(|x| x.to_str().unwrap()),
        Some("no-cache"),
        "{response:?}"
    );
}

/// Asserts an RFC 6749 §5.2 error object
fn assert_error(response: &TestResponse, status: StatusCode, error: &str) {
    assert_eq!(response.status, status, "{response:?}");
    let body: Value = response.json();
    assert_eq!(body["error"], error, "{body}");
    assert!(body["error_description"].is_string(), "{body}");
    assert_no_store(response);
}

/// Asserts an `invalid_client` error, which carries a `WWW-Authenticate` challenge
fn assert_invalid_client(response: &TestResponse) {
    assert_error(response, StatusCode::UNAUTHORIZED, "invalid_client");
    let challenge = response
        .headers
        .get(header::WWW_AUTHENTICATE)
        .expect("WWW-Authenticate on invalid_client")
        .to_str()
        .unwrap();
    assert!(
        challenge.to_ascii_lowercase().starts_with("basic "),
        "{challenge}"
    );
}

#[test]
fn client_secret_basic_redeems_a_code() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let code = flow::issue_code(&client, &member, &[]).await;

        let response = post_with_authorization(
            &mut TestClient::new(),
            &basic(&client.client_id.to_string(), &client.client_secret),
            &exchange_form(&client, &code),
        )
        .await;

        assert_eq!(response.status, StatusCode::OK, "{response:?}");
        assert_no_store(&response);
        let tokens: Value = response.json();
        assert_eq!(tokens["token_type"], "Bearer");
        let id_token = flow::jwt_claims(tokens["id_token"].as_str().expect("id_token"));
        assert_eq!(id_token["azp"], client.client_id.to_string());
        assert_eq!(id_token["aud"], client.client_id.to_string());
    });
}

#[test]
fn client_secret_post_redeems_a_code() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let code = flow::issue_code(&client, &member, &[]).await;

        let response = post_with_secret(&mut TestClient::new(), &client, &code).await;

        assert_eq!(response.status, StatusCode::OK, "{response:?}");
        assert_no_store(&response);
        let tokens: Value = response.json();
        assert!(tokens["access_token"].is_string());
        assert!(tokens["id_token"].is_string());
    });
}

#[test]
fn a_code_is_redeemed_only_once() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let code = flow::issue_code(&client, &member, &[]).await;
        let mut relying_party = TestClient::new();

        let response = post_with_secret(&mut relying_party, &client, &code).await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");

        let response = post_with_secret(&mut relying_party, &client, &code).await;
        assert_error(&response, StatusCode::BAD_REQUEST, "invalid_grant");
    });
}

#[test]
fn concurrent_redemptions_of_one_code_yield_one_success() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let code = flow::issue_code(&client, &member, &[]).await;
        let mut first = TestClient::new();
        let mut second = TestClient::new();

        let (first, second) = tokio::join!(
            post_with_secret(&mut first, &client, &code),
            post_with_secret(&mut second, &client, &code),
        );

        let (success, failure) = match (first.status, second.status) {
            (StatusCode::OK, _) => (first, second),
            (_, StatusCode::OK) => (second, first),
            _ => panic!("no redemption succeeded: {first:?} {second:?}"),
        };
        assert!(success.json::<Value>()["id_token"].is_string());
        assert_error(&failure, StatusCode::BAD_REQUEST, "invalid_grant");
    });
}

#[test]
fn both_authentication_methods_at_once_are_rejected() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let code = flow::issue_code(&client, &member, &[]).await;
        let client_id = client.client_id.to_string();
        let mut form = exchange_form(&client, &code);
        form.extend([
            ("client_id", client_id.as_str()),
            ("client_secret", client.client_secret.as_str()),
        ]);

        let response = post_with_authorization(
            &mut TestClient::new(),
            &basic(&client_id, &client.client_secret),
            &form,
        )
        .await;

        assert_error(&response, StatusCode::BAD_REQUEST, "invalid_request");
    });
}

#[test]
fn missing_client_authentication_is_rejected() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let code = flow::issue_code(&client, &member, &[]).await;
        let client_id = client.client_id.to_string();
        let mut form = exchange_form(&client, &code);
        form.push(("client_id", client_id.as_str()));

        let response = TestClient::new().post_form(&token_endpoint(), &form).await;

        assert_invalid_client(&response);
    });
}

#[test]
fn wrong_client_secret_is_rejected() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let code = flow::issue_code(&client, &member, &[]).await;
        let client_id = client.client_id.to_string();

        let response = post_with_authorization(
            &mut TestClient::new(),
            &basic(&client_id, "wrong-secret"),
            &exchange_form(&client, &code),
        )
        .await;
        assert_invalid_client(&response);

        let mut form = exchange_form(&client, &code);
        form.extend([
            ("client_id", client_id.as_str()),
            ("client_secret", "wrong-secret"),
        ]);
        let response = TestClient::new().post_form(&token_endpoint(), &form).await;
        assert_invalid_client(&response);

        let response = post_with_secret(&mut TestClient::new(), &client, &code).await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");
    });
}

#[test]
fn unknown_client_is_rejected() {
    harness::run(async {
        let response = post_with_authorization(
            &mut TestClient::new(),
            &basic(&uuid::Uuid::new_v4().to_string(), "secret"),
            &[
                ("grant_type", "authorization_code"),
                ("code", "code"),
                ("redirect_uri", "https://rp.test/callback"),
            ],
        )
        .await;

        assert_invalid_client(&response);
    });
}

#[test]
fn code_of_another_client_is_rejected() {
    harness::run(async {
        let owner = harness::register_client("https://rp.test/callback").await;
        let other = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let code = flow::issue_code(&owner, &member, &[]).await;

        let response = post_with_secret(&mut TestClient::new(), &other, &code).await;

        assert_error(&response, StatusCode::BAD_REQUEST, "invalid_grant");
    });
}

#[test]
fn mismatching_redirect_uri_is_rejected() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let code = flow::issue_code(&client, &member, &[]).await;

        let response = post_with_authorization(
            &mut TestClient::new(),
            &basic(&client.client_id.to_string(), &client.client_secret),
            &[
                ("grant_type", "authorization_code"),
                ("code", &code),
                ("redirect_uri", "https://rp.test/other"),
            ],
        )
        .await;

        assert_error(&response, StatusCode::BAD_REQUEST, "invalid_grant");
    });
}

#[test]
fn redirect_uri_is_compared_as_sent() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/").await;
        let member = harness::register_member().await;
        let code = flow::issue_code(&client, &member, &[]).await;

        let response = post_with_authorization(
            &mut TestClient::new(),
            &basic(&client.client_id.to_string(), &client.client_secret),
            &[
                ("grant_type", "authorization_code"),
                ("code", &code),
                ("redirect_uri", "https://rp.test"),
            ],
        )
        .await;

        assert_error(&response, StatusCode::BAD_REQUEST, "invalid_grant");
    });
}

#[test]
fn unsupported_grant_type_is_rejected() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;

        let response = post_with_authorization(
            &mut TestClient::new(),
            &basic(&client.client_id.to_string(), &client.client_secret),
            &[
                ("grant_type", "password"),
                ("username", "x"),
                ("password", "y"),
            ],
        )
        .await;

        assert_error(&response, StatusCode::BAD_REQUEST, "unsupported_grant_type");
    });
}

#[test]
fn malformed_requests_are_rejected() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let authorization = basic(&client.client_id.to_string(), &client.client_secret);

        for form in [
            vec![
                ("code", "code"),
                ("redirect_uri", "https://rp.test/callback"),
            ],
            vec![
                ("grant_type", "authorization_code"),
                ("redirect_uri", "https://rp.test/callback"),
            ],
            vec![
                ("grant_type", "authorization_code"),
                ("grant_type", "authorization_code"),
                ("code", "code"),
                ("redirect_uri", "https://rp.test/callback"),
            ],
        ] {
            let response =
                post_with_authorization(&mut TestClient::new(), &authorization, &form).await;
            assert_error(&response, StatusCode::BAD_REQUEST, "invalid_request");
        }
    });
}

#[test]
fn discovery_lists_the_client_authentication_methods() {
    harness::run(async {
        let response = TestClient::new()
            .get(
                &harness::origin()
                    .join("/api/v1/auth/.well-known/openid-configuration")
                    .unwrap(),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK);
        let discovery: Value = response.json();

        assert_eq!(
            discovery["token_endpoint_auth_methods_supported"],
            json!(["client_secret_basic", "client_secret_post"])
        );
    });
}

/// The code verifier of RFC 7636 Appendix B
const VERIFIER: &str = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
/// The `S256` code challenge of [`VERIFIER`], from RFC 7636 Appendix B
const S256_CHALLENGE: &str = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

/// Exchanges the code with `client_secret_post` and an optional `code_verifier`
async fn post_with_verifier(
    client: &RegisteredClient,
    code: &str,
    verifier: Option<&str>,
) -> TestResponse {
    let client_id = client.client_id.to_string();
    let mut form = exchange_form(client, code);
    form.extend([
        ("client_id", client_id.as_str()),
        ("client_secret", client.client_secret.as_str()),
    ]);
    form.extend(verifier.map(|verifier| ("code_verifier", verifier)));
    TestClient::new().post_form(&token_endpoint(), &form).await
}

#[test]
fn s256_challenge_is_redeemed_with_its_verifier() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let code = flow::issue_code(
            &client,
            &member,
            &[
                ("code_challenge", S256_CHALLENGE),
                ("code_challenge_method", "S256"),
            ],
        )
        .await;

        let response = post_with_verifier(&client, &code, Some(VERIFIER)).await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");
    });
}

#[test]
fn plain_challenge_is_redeemed_with_its_verifier() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let code = flow::issue_code(
            &client,
            &member,
            &[
                ("code_challenge", VERIFIER),
                ("code_challenge_method", "plain"),
            ],
        )
        .await;

        let response = post_with_verifier(&client, &code, Some(VERIFIER)).await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");
    });
}

#[test]
fn challenge_without_method_is_plain() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;

        let code = flow::issue_code(&client, &member, &[("code_challenge", VERIFIER)]).await;
        let response = post_with_verifier(&client, &code, Some(VERIFIER)).await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");

        let code = flow::issue_code(&client, &member, &[("code_challenge", S256_CHALLENGE)]).await;
        let response = post_with_verifier(&client, &code, Some(VERIFIER)).await;
        assert_error(&response, StatusCode::BAD_REQUEST, "invalid_grant");
    });
}

#[test]
fn code_with_challenge_requires_a_verifier() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let code = flow::issue_code(
            &client,
            &member,
            &[
                ("code_challenge", S256_CHALLENGE),
                ("code_challenge_method", "S256"),
            ],
        )
        .await;

        let response = post_with_verifier(&client, &code, None).await;
        assert_error(&response, StatusCode::BAD_REQUEST, "invalid_grant");
    });
}

#[test]
fn wrong_verifier_is_rejected() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let code = flow::issue_code(
            &client,
            &member,
            &[
                ("code_challenge", S256_CHALLENGE),
                ("code_challenge_method", "S256"),
            ],
        )
        .await;

        let wrong = "a".repeat(43);
        let response = post_with_verifier(&client, &code, Some(&wrong)).await;
        assert_error(&response, StatusCode::BAD_REQUEST, "invalid_grant");
    });
}

#[test]
fn malformed_verifier_is_rejected() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let code = flow::issue_code(
            &client,
            &member,
            &[
                ("code_challenge", S256_CHALLENGE),
                ("code_challenge_method", "S256"),
            ],
        )
        .await;

        let short = &VERIFIER[..42];
        let long = "a".repeat(129);
        let forbidden = format!("{}+", &VERIFIER[..42]);
        for verifier in [short, long.as_str(), forbidden.as_str()] {
            let response = post_with_verifier(&client, &code, Some(verifier)).await;
            assert_error(&response, StatusCode::BAD_REQUEST, "invalid_request");
        }
    });
}

#[test]
fn verifier_without_challenge_is_rejected() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let code = flow::issue_code(&client, &member, &[]).await;

        let response = post_with_verifier(&client, &code, Some(VERIFIER)).await;
        assert_error(&response, StatusCode::BAD_REQUEST, "invalid_grant");
    });
}

#[test]
fn discovery_lists_the_code_challenge_methods() {
    harness::run(async {
        let response = TestClient::new()
            .get(
                &harness::origin()
                    .join("/api/v1/auth/.well-known/openid-configuration")
                    .unwrap(),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK);
        let discovery: Value = response.json();

        assert_eq!(
            discovery["code_challenge_methods_supported"],
            json!(["S256", "plain"])
        );
    });
}
