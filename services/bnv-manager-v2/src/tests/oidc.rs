//! The OpenID provider, driven like a relying party and a member's browser would

use galvyn::core::re_exports::axum::body::Body;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::http::header;
use jsonwebtoken::Algorithm;
use jsonwebtoken::DecodingKey;
use jsonwebtoken::Validation;
use serde_json::Value;
use serde_json::json;
use url::Url;

use crate::tests::flow;
use crate::tests::harness;
use crate::tests::harness::RegisteredClient;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;

fn endpoint(discovery: &Value, name: &str) -> Url {
    Url::parse(
        discovery[name]
            .as_str()
            .unwrap_or_else(|| panic!("no {name} in discovery")),
    )
    .expect("valid endpoint url")
}

#[test]
fn authorization_code_flow() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let mut relying_party = TestClient::new();
        let mut browser = TestClient::new();

        let response = relying_party
            .get(
                &harness::origin()
                    .join("/api/v1/auth/.well-known/openid-configuration")
                    .unwrap(),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK);
        let discovery: Value = response.json();

        let mut authorize = endpoint(&discovery, "authorization_endpoint");
        authorize
            .query_pairs_mut()
            .append_pair("response_type", "code")
            .append_pair("client_id", &client.client_id.to_string())
            .append_pair("redirect_uri", client.redirect_uri.as_str())
            .append_pair("scope", "openid profile email")
            .append_pair("state", "state-1")
            .append_pair("nonce", "nonce-1");
        let response = browser.get(&authorize).await;
        assert_eq!(response.status, StatusCode::FOUND);
        let login_page = response.location();
        assert_eq!(login_page.path(), "/links/oidc/auth");

        let signed_in_at = flow::unix_now();
        flow::sign_in(&mut browser, &member).await;

        let response = browser
            .get(&flow::finish_auth_url(&flow::query_param(
                &login_page,
                "request_id",
            )))
            .await;
        assert_eq!(response.status, StatusCode::FOUND);
        let callback = response.location();
        assert_eq!(
            callback.as_str().split('?').next(),
            Some(client.redirect_uri.as_str())
        );
        assert_eq!(flow::query_param(&callback, "state"), "state-1");
        let code = flow::query_param(&callback, "code");

        let response = relying_party
            .post_form(
                &endpoint(&discovery, "token_endpoint"),
                &[
                    ("grant_type", "authorization_code"),
                    ("code", &code),
                    ("redirect_uri", client.redirect_uri.as_str()),
                    ("client_id", &client.client_id.to_string()),
                    ("client_secret", &client.client_secret),
                ],
            )
            .await;
        assert_eq!(response.status, StatusCode::OK);
        let tokens: Value = response.json();
        assert_eq!(tokens["token_type"], "Bearer");
        let id_token = tokens["id_token"].as_str().expect("id_token");
        let access_token = tokens["access_token"].as_str().expect("access_token");

        let response = relying_party.get(&endpoint(&discovery, "jwks_uri")).await;
        assert_eq!(response.status, StatusCode::OK);
        let jwks: Value = response.json();
        let kid = jsonwebtoken::decode_header(id_token)
            .unwrap()
            .kid
            .expect("kid in the id token header");
        let jwk = jwks["keys"]
            .as_array()
            .expect("keys")
            .iter()
            .find(|key| key["kid"] == kid.as_str())
            .expect("the id token's key in the jwks");
        assert_eq!(jwk["kty"], "RSA");
        assert_eq!(jwk["use"], "sig");
        assert_eq!(jwk["alg"], "RS256");
        assert_eq!(
            jsonwebtoken::decode_header(access_token).unwrap().kid,
            Some(kid.clone())
        );
        let key = DecodingKey::from_rsa_components(
            jwk["n"].as_str().expect("n"),
            jwk["e"].as_str().expect("e"),
        )
        .unwrap();
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_audience(&[client.client_id.to_string()]);
        validation.set_issuer(&[discovery["issuer"].as_str().expect("issuer")]);
        validation.set_required_spec_claims(&["iss", "sub", "aud", "exp"]);
        let claims = jsonwebtoken::decode::<Value>(id_token, &key, &validation)
            .expect("id token signed with the jwks key")
            .claims;
        assert_eq!(claims["iss"], discovery["issuer"]);
        assert_eq!(claims["nonce"], "nonce-1");
        let auth_time = claims["auth_time"]
            .as_i64()
            .expect("auth_time in the id token");
        assert!(
            (signed_in_at..=claims["iat"].as_i64().unwrap()).contains(&auth_time),
            "auth_time {auth_time} is the sign-in"
        );
        assert_eq!(claims["preferred_username"], member.username.as_str());
        assert_eq!(claims["name"], member.display_name.as_str());
        assert_eq!(claims["email"], member.email.as_str());

        let response = relying_party
            .send(
                harness::request(Method::GET, &endpoint(&discovery, "userinfo_endpoint"))
                    .header(header::AUTHORIZATION, format!("Bearer {access_token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK);
        let userinfo: Value = response.json();
        assert_eq!(userinfo["sub"], claims["sub"]);
        assert_eq!(userinfo["email"], member.email.as_str());
    });
}

#[test]
fn discovery_is_served_below_the_issuer() {
    harness::run(async {
        let mut relying_party = TestClient::new();

        let response = relying_party
            .get(
                &harness::origin()
                    .join("/api/v1/auth/.well-known/openid-configuration")
                    .unwrap(),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK);
        let discovery: Value = response.json();
        let issuer = discovery["issuer"].as_str().expect("issuer");
        assert!(!issuer.ends_with('/'), "issuer {issuer} ends with a slash");

        let response = relying_party
            .get(&Url::parse(&format!("{issuer}/.well-known/openid-configuration")).unwrap())
            .await;
        assert_eq!(response.status, StatusCode::OK);
        assert_eq!(
            response.headers.get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );
        assert_eq!(response.json::<Value>(), discovery);

        for name in [
            "authorization_endpoint",
            "token_endpoint",
            "userinfo_endpoint",
            "jwks_uri",
        ] {
            let url = endpoint(&discovery, name);
            assert!(
                url.as_str().starts_with(&format!("{issuer}/")),
                "{name} {url} is not below the issuer {issuer}"
            );
        }
    });
}

#[test]
fn login_page_gets_only_a_request_id() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let mut browser = TestClient::new();

        let login_page = flow::authorize(&mut browser, &client, &[("state", "state-1")]).await;

        assert_eq!(login_page.origin(), harness::origin().origin());
        assert_eq!(login_page.path(), "/links/oidc/auth");
        let keys: Vec<_> = login_page
            .query_pairs()
            .map(|(key, _)| key.into_owned())
            .collect();
        assert_eq!(keys, ["request_id"]);
    });
}

#[test]
fn parallel_flows_complete() {
    harness::run(async {
        let first = harness::register_client("https://first.test/callback").await;
        let second = harness::register_client("https://second.test/callback").await;
        let member = harness::register_member().await;
        let mut browser = TestClient::new();

        let first_login = flow::authorize(&mut browser, &first, &[("state", "first-state")]).await;
        let second_login =
            flow::authorize(&mut browser, &second, &[("state", "second-state")]).await;
        flow::sign_in(&mut browser, &member).await;

        for (login_page, client, state) in [
            (second_login, &second, "second-state"),
            (first_login, &first, "first-state"),
        ] {
            let response = browser
                .get(&flow::finish_auth_url(&flow::query_param(
                    &login_page,
                    "request_id",
                )))
                .await;
            assert_eq!(response.status, StatusCode::FOUND);
            let callback = response.location();
            assert_eq!(
                callback.as_str().split('?').next(),
                Some(client.redirect_uri.as_str())
            );
            assert_eq!(flow::query_param(&callback, "state"), state);
            flow::query_param(&callback, "code");
        }
    });
}

#[test]
fn discovery_advertises_the_supported_metadata() {
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

        assert_eq!(discovery["response_types_supported"], json!(["code"]));
        assert_eq!(discovery["response_modes_supported"], json!(["query"]));
        assert_eq!(
            discovery["grant_types_supported"],
            json!(["authorization_code"])
        );
        assert_eq!(discovery["subject_types_supported"], json!(["public"]));
        assert_eq!(
            discovery["id_token_signing_alg_values_supported"],
            json!(["RS256"])
        );

        let listed = |name: &str| -> Vec<String> {
            discovery[name]
                .as_array()
                .unwrap_or_else(|| panic!("no {name} in discovery"))
                .iter()
                .map(|value| value.as_str().expect("string").to_string())
                .collect()
        };
        let scopes = listed("scopes_supported");
        for scope in ["openid", "profile", "email"] {
            assert!(
                scopes.iter().any(|x| x == scope),
                "{scope} not in {scopes:?}"
            );
        }
        let claims = listed("claims_supported");
        for claim in [
            "iss",
            "sub",
            "aud",
            "exp",
            "iat",
            "nonce",
            "auth_time",
            "email",
            "email_verified",
            "preferred_username",
            "name",
        ] {
            assert!(
                claims.iter().any(|x| x == claim),
                "{claim} not in {claims:?}"
            );
        }
    });
}

#[test]
fn crafted_return_target_is_refused() {
    harness::run(async {
        let member = harness::register_member().await;
        let mut browser = TestClient::new();
        flow::sign_in(&mut browser, &member).await;

        for target in [
            "https://evil.test/",
            "javascript:alert(1)",
            "//evil.test",
            &uuid::Uuid::new_v4().to_string(),
        ] {
            let mut url = flow::finish_auth_url(target);
            url.query_pairs_mut()
                .append_pair("redirect_uri", "https://evil.test/")
                .append_pair("redirect_url", "https://evil.test/");
            let response = browser.get(&url).await;
            assert!(
                !response.status.is_success(),
                "{target}: {}",
                response.status
            );
            if response.headers.contains_key(header::LOCATION) {
                let location = response.location();
                assert_eq!(location.origin(), harness::origin().origin(), "{target}");
                assert_eq!(location.path(), "/links/oidc/error", "{target}");
            }
        }
    });
}

#[test]
fn pending_request_resumes_only_once() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let mut browser = TestClient::new();

        let login_page = flow::authorize(&mut browser, &client, &[("state", "state-1")]).await;
        flow::sign_in(&mut browser, &member).await;
        let finish = flow::finish_auth_url(&flow::query_param(&login_page, "request_id"));

        let response = browser.get(&finish).await;
        assert_eq!(response.status, StatusCode::FOUND);
        assert_eq!(response.location().host_str(), Some("rp.test"));

        let response = browser.get(&finish).await;
        assert_eq!(response.status, StatusCode::FOUND);
        let location = response.location();
        assert_eq!(location.origin(), harness::origin().origin());
        assert_eq!(location.path(), "/links/oidc/error");
        assert_eq!(flow::query_param(&location, "error"), "unknown-request");
    });
}

#[test]
fn another_session_cannot_resume_the_request() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let mut victim = TestClient::new();
        let mut attacker = TestClient::new();

        let login_page = flow::authorize(&mut victim, &client, &[("state", "state-1")]).await;
        flow::sign_in(&mut attacker, &member).await;

        let response = attacker
            .get(&flow::finish_auth_url(&flow::query_param(
                &login_page,
                "request_id",
            )))
            .await;
        assert_eq!(response.status, StatusCode::FOUND);
        assert_eq!(response.location().path(), "/links/oidc/error");
    });
}

#[test]
fn resuming_before_sign_in_returns_to_the_login_page() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let mut browser = TestClient::new();

        let login_page = flow::authorize(&mut browser, &client, &[("state", "state-1")]).await;
        let request_id = flow::query_param(&login_page, "request_id");

        let response = browser.get(&flow::finish_auth_url(&request_id)).await;
        assert_eq!(response.status, StatusCode::FOUND);
        assert_eq!(response.location(), login_page);

        flow::sign_in(&mut browser, &member).await;
        let response = browser.get(&flow::finish_auth_url(&request_id)).await;
        assert_eq!(response.status, StatusCode::FOUND);
        assert_eq!(flow::query_param(&response.location(), "state"), "state-1");
    });
}

/// The parameters of a valid authorization request of `client`
fn valid_params<'a>(client_id: &'a str, client: &'a RegisteredClient) -> Vec<(&'a str, &'a str)> {
    vec![
        ("response_type", "code"),
        ("client_id", client_id),
        ("redirect_uri", client.redirect_uri.as_str()),
        ("scope", "openid"),
        ("state", "state-1"),
    ]
}

/// `params` with the parameter `name` set to `value` instead
fn with<'a>(
    params: Vec<(&'a str, &'a str)>,
    name: &str,
    value: &'a str,
) -> Vec<(&'a str, &'a str)> {
    params
        .into_iter()
        .map(|(key, old)| (key, if key == name { value } else { old }))
        .collect()
}

/// `params` without the parameter `name`
fn without<'a>(params: Vec<(&'a str, &'a str)>, name: &str) -> Vec<(&'a str, &'a str)> {
    params.into_iter().filter(|(key, _)| *key != name).collect()
}

/// Asserts the response sends the user to the provider's error page showing `error`
fn assert_error_page(response: &TestResponse, error: &str, case: &str) {
    assert_eq!(response.status, StatusCode::FOUND, "{case}");
    let location = response.location();
    assert_eq!(location.origin(), harness::origin().origin(), "{case}");
    assert_eq!(location.path(), "/links/oidc/error", "{case}");
    assert_eq!(flow::query_param(&location, "error"), error, "{case}");
}

/// Asserts the response is an error redirect to `client` with `error` and `state`
fn assert_error_redirect(
    response: &TestResponse,
    client: &RegisteredClient,
    error: &str,
    state: Option<&str>,
    case: &str,
) {
    assert_eq!(response.status, StatusCode::FOUND, "{case}");
    let location = response.location();
    assert_eq!(
        location.as_str().split('?').next(),
        client.redirect_uri.as_str().split('?').next(),
        "{case}"
    );
    assert_eq!(flow::query_param(&location, "error"), error, "{case}");
    let mut keys: Vec<_> = location
        .query_pairs()
        .map(|(key, _)| key.into_owned())
        .collect();
    keys.sort();
    let mut expected = vec!["error", "error_description"];
    if let Some(state) = state {
        assert_eq!(flow::query_param(&location, "state"), state, "{case}");
        expected.push("state");
    }
    assert_eq!(keys, expected, "{case}");
}

#[test]
fn unknown_client_renders_the_error_page() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let client_id = client.client_id.to_string();
        let unknown = uuid::Uuid::new_v4().to_string();

        for (case, params) in [
            (
                "unknown",
                with(valid_params(&client_id, &client), "client_id", &unknown),
            ),
            (
                "malformed",
                with(
                    valid_params(&client_id, &client),
                    "client_id",
                    "not-a-client",
                ),
            ),
            (
                "missing",
                without(valid_params(&client_id, &client), "client_id"),
            ),
            ("repeated", {
                let mut params = valid_params(&client_id, &client);
                params.push(("client_id", &client_id));
                params
            }),
        ] {
            let response = flow::authorize_raw(&mut TestClient::new(), &params).await;
            assert_error_page(&response, "unknown-client", case);
        }
    });
}

#[test]
fn redirect_uri_must_match_exactly() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback?tenant=a").await;
        let client_id = client.client_id.to_string();

        for redirect_uri in [
            "https://evil.test/callback?tenant=a",
            "https://rp.test/callback",
            "https://rp.test/callback?tenant=b",
            "https://rp.test/callback?tenant=a&extra=1",
            "https://rp.test/callback/?tenant=a",
            "https://RP.test/callback?tenant=a",
            "",
        ] {
            let params = with(
                valid_params(&client_id, &client),
                "redirect_uri",
                redirect_uri,
            );
            let response = flow::authorize_raw(&mut TestClient::new(), &params).await;
            assert_error_page(&response, "invalid-redirect-uri", redirect_uri);
        }

        let mut params = valid_params(&client_id, &client);
        params.push(("redirect_uri", client.redirect_uri.as_str()));
        let response = flow::authorize_raw(&mut TestClient::new(), &params).await;
        assert_error_page(&response, "invalid-redirect-uri", "repeated");

        let member = harness::register_member().await;
        let mut browser = TestClient::new();
        let login_page = flow::authorize(&mut browser, &client, &[("state", "state-1")]).await;
        flow::sign_in(&mut browser, &member).await;
        let response = browser
            .get(&flow::finish_auth_url(&flow::query_param(
                &login_page,
                "request_id",
            )))
            .await;
        assert_eq!(response.status, StatusCode::FOUND);
        let callback = response.location();
        assert_eq!(callback.host_str(), Some("rp.test"));
        assert_eq!(callback.path(), "/callback");
        assert_eq!(flow::query_param(&callback, "tenant"), "a");
        assert_eq!(flow::query_param(&callback, "state"), "state-1");
        flow::query_param(&callback, "code");
    });
}

#[test]
fn scope_errors_are_redirected_before_the_login() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let client_id = client.client_id.to_string();

        for scope in ["profile email", "", "openid admin", "openid  profile"] {
            let params = with(valid_params(&client_id, &client), "scope", scope);
            let response = flow::authorize_raw(&mut TestClient::new(), &params).await;
            assert_error_redirect(&response, &client, "invalid_scope", Some("state-1"), scope);
        }
        let params = without(valid_params(&client_id, &client), "scope");
        let response = flow::authorize_raw(&mut TestClient::new(), &params).await;
        assert_error_redirect(
            &response,
            &client,
            "invalid_scope",
            Some("state-1"),
            "missing",
        );
    });
}

#[test]
fn unsupported_response_type_is_redirected() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let client_id = client.client_id.to_string();

        for response_type in ["token", "id_token", "code id_token"] {
            let params = with(
                valid_params(&client_id, &client),
                "response_type",
                response_type,
            );
            let response = flow::authorize_raw(&mut TestClient::new(), &params).await;
            assert_error_redirect(
                &response,
                &client,
                "unsupported_response_type",
                Some("state-1"),
                response_type,
            );
        }
    });
}

#[test]
fn malformed_request_is_redirected() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let client_id = client.client_id.to_string();
        let valid = || valid_params(&client_id, &client);
        let extended = |extra: &[(&'static str, &'static str)]| {
            let mut params = valid();
            params.extend_from_slice(extra);
            params
        };
        let long_nonce = "n".repeat(256);
        let mut too_long_nonce = valid();
        too_long_nonce.push(("nonce", &long_nonce));

        for (case, params) in [
            ("missing response_type", without(valid(), "response_type")),
            ("repeated scope", extended(&[("scope", "openid")])),
            (
                "unknown code_challenge_method",
                extended(&[
                    (
                        "code_challenge",
                        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
                    ),
                    ("code_challenge_method", "S512"),
                ]),
            ),
            (
                "too short plain code_challenge",
                extended(&[
                    ("code_challenge", "challenge"),
                    ("code_challenge_method", "plain"),
                ]),
            ),
            (
                "malformed S256 code_challenge",
                extended(&[
                    (
                        "code_challenge",
                        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM==",
                    ),
                    ("code_challenge_method", "S256"),
                ]),
            ),
            (
                "code_challenge_method without challenge",
                extended(&[("code_challenge_method", "S256")]),
            ),
            ("too long nonce", too_long_nonce),
            (
                "prompt none with login",
                extended(&[("prompt", "none login")]),
            ),
            ("max_age not a number", extended(&[("max_age", "soon")])),
            ("negative max_age", extended(&[("max_age", "-1")])),
        ] {
            let response = flow::authorize_raw(&mut TestClient::new(), &params).await;
            assert_error_redirect(&response, &client, "invalid_request", Some("state-1"), case);
        }

        let response =
            flow::authorize_raw(&mut TestClient::new(), &extended(&[("state", "state-2")])).await;
        assert_error_redirect(
            &response,
            &client,
            "invalid_request",
            None,
            "repeated state",
        );
    });
}

#[test]
fn unsupported_response_mode_is_a_bad_request() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let client_id = client.client_id.to_string();

        for response_mode in ["fragment", "form_post"] {
            let mut params = valid_params(&client_id, &client);
            params.push(("response_mode", response_mode));
            let response = flow::authorize_raw(&mut TestClient::new(), &params).await;
            assert_eq!(response.status, StatusCode::BAD_REQUEST, "{response_mode}");
            assert!(
                !response.headers.contains_key(header::LOCATION),
                "{response_mode}"
            );
        }
    });
}

#[test]
fn non_member_gets_access_denied() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let client_id = client.client_id.to_string();
        let mut admin = harness::sign_in_superadmin().await;

        let response = flow::authorize_raw(&mut admin, &valid_params(&client_id, &client)).await;
        assert_eq!(response.status, StatusCode::FOUND);
        let response = admin.get(&response.location()).await;
        assert_error_redirect(
            &response,
            &client,
            "access_denied",
            Some("state-1"),
            "admin",
        );
    });
}

#[test]
fn member_removed_after_sign_in_gets_access_denied() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let member = harness::register_member().await;
        let mut browser = TestClient::new();
        let login_page = flow::authorize(&mut browser, &client, &[("state", "state-1")]).await;
        flow::sign_in(&mut browser, &member).await;

        harness::remove_member(&member).await;

        let response = browser
            .get(&flow::finish_auth_url(&flow::query_param(
                &login_page,
                "request_id",
            )))
            .await;
        assert_error_redirect(
            &response,
            &client,
            "access_denied",
            Some("state-1"),
            "removed member",
        );
    });
}

#[test]
fn state_round_trips_unchanged() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let client_id = client.client_id.to_string();
        let member = harness::register_member().await;
        let state = "a&b=c%20d e+f%%?#/ü";

        let mut browser = TestClient::new();
        let login_page = flow::authorize(&mut browser, &client, &[("state", state)]).await;
        flow::sign_in(&mut browser, &member).await;
        let response = browser
            .get(&flow::finish_auth_url(&flow::query_param(
                &login_page,
                "request_id",
            )))
            .await;
        assert_eq!(response.status, StatusCode::FOUND);
        let callback = response.location();
        assert_eq!(flow::query_param(&callback, "state"), state);
        let keys: Vec<_> = callback
            .query_pairs()
            .map(|(key, _)| key.into_owned())
            .collect();
        assert_eq!(keys, ["code", "state"]);

        let params = with(
            with(valid_params(&client_id, &client), "state", state),
            "scope",
            "profile",
        );
        let response = flow::authorize_raw(&mut TestClient::new(), &params).await;
        assert_error_redirect(&response, &client, "invalid_scope", Some(state), "error");
    });
}

/// Redeems `code` and returns the claims of the ID token
///
/// `authorization_code_flow` checks the signature, this only reads the claims.
async fn id_token_claims(client: &RegisteredClient, code: &str) -> Value {
    let tokens = flow::redeem(client, code).await;
    flow::jwt_claims(tokens["id_token"].as_str().expect("id_token"))
}

/// Asserts the response sends the user to the provider's login page
fn assert_login_page(response: &TestResponse, case: &str) -> Url {
    assert_eq!(response.status, StatusCode::FOUND, "{case}");
    let location = response.location();
    assert_eq!(location.path(), "/links/oidc/auth", "{case}");
    location
}

/// Follows the redirects within the provider, never via the login page, to the client
async fn follow_to_client(browser: &mut TestClient, mut response: TestResponse) -> Url {
    loop {
        assert_eq!(response.status, StatusCode::FOUND);
        let location = response.location();
        assert_ne!(location.path(), "/links/oidc/auth", "no login page");
        if location.origin() != harness::origin().origin() {
            return location;
        }
        response = browser.get(&location).await;
    }
}

#[test]
fn prompt_none_without_session_returns_login_required() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let client_id = client.client_id.to_string();

        let mut params = valid_params(&client_id, &client);
        params.push(("prompt", "none"));
        let response = flow::authorize_raw(&mut TestClient::new(), &params).await;
        assert_error_redirect(
            &response,
            &client,
            "login_required",
            Some("state-1"),
            "no session",
        );
    });
}

#[test]
fn prompt_none_with_session_issues_a_code_without_ui() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let client_id = client.client_id.to_string();
        let member = harness::register_member().await;
        let mut browser = TestClient::new();
        flow::sign_in(&mut browser, &member).await;

        let mut params = valid_params(&client_id, &client);
        params.push(("prompt", "none"));
        let response = flow::authorize_raw(&mut browser, &params).await;
        let callback = follow_to_client(&mut browser, response).await;
        assert_eq!(callback.host_str(), Some("rp.test"));
        assert_eq!(flow::query_param(&callback, "state"), "state-1");
        let claims = id_token_claims(&client, &flow::query_param(&callback, "code")).await;
        assert!(claims["auth_time"].is_i64(), "auth_time in {claims}");
    });
}

#[test]
fn prompt_login_shows_the_login_page_despite_a_session() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let client_id = client.client_id.to_string();
        let member = harness::register_member().await;
        let mut browser = TestClient::new();
        flow::sign_in(&mut browser, &member).await;

        let mut params = valid_params(&client_id, &client);
        params.push(("prompt", "login"));
        let response = flow::authorize_raw(&mut browser, &params).await;
        let login_page = assert_login_page(&response, "prompt=login");
        let request_id = flow::query_param(&login_page, "request_id");

        let response = browser.get(&flow::finish_auth_url(&request_id)).await;
        assert_login_page(&response, "resumed without a new login");

        flow::sign_in(&mut browser, &member).await;
        let response = browser.get(&flow::finish_auth_url(&request_id)).await;
        let callback = follow_to_client(&mut browser, response).await;
        flow::query_param(&callback, "code");

        let mut params = valid_params(&client_id, &client);
        params.push(("max_age", "0"));
        let response = flow::authorize_raw(&mut browser, &params).await;
        assert_login_page(&response, "max_age=0");
    });
}

#[test]
fn max_age_older_than_the_login_forces_reauthentication() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let client_id = client.client_id.to_string();
        let member = harness::register_member().await;
        let mut browser = TestClient::new();
        flow::sign_in(&mut browser, &member).await;
        let signed_in_at = flow::unix_now();
        tokio::time::sleep(std::time::Duration::from_millis(2100)).await;

        let mut recent_enough = valid_params(&client_id, &client);
        recent_enough.push(("max_age", "3600"));
        let response = flow::authorize_raw(&mut browser, &recent_enough).await;
        let callback = follow_to_client(&mut browser, response).await;
        let claims = id_token_claims(&client, &flow::query_param(&callback, "code")).await;
        let auth_time = claims["auth_time"].as_i64().expect("auth_time");
        assert!(
            auth_time <= signed_in_at,
            "auth_time {auth_time} is the old login"
        );

        let mut too_old = valid_params(&client_id, &client);
        too_old.push(("max_age", "1"));
        let response = flow::authorize_raw(&mut browser, &too_old).await;
        let login_page = assert_login_page(&response, "max_age=1");

        let mut silent = too_old.clone();
        silent.push(("prompt", "none"));
        let response = flow::authorize_raw(&mut browser, &silent).await;
        assert_error_redirect(
            &response,
            &client,
            "login_required",
            Some("state-1"),
            "prompt=none with max_age=1",
        );

        let reauthenticated_at = flow::unix_now();
        flow::sign_in(&mut browser, &member).await;
        let response = browser
            .get(&flow::finish_auth_url(&flow::query_param(
                &login_page,
                "request_id",
            )))
            .await;
        let callback = follow_to_client(&mut browser, response).await;
        let claims = id_token_claims(&client, &flow::query_param(&callback, "code")).await;
        let auth_time = claims["auth_time"].as_i64().expect("auth_time");
        assert!(
            auth_time >= reauthenticated_at,
            "auth_time {auth_time} is the new login"
        );
    });
}

#[test]
fn consent_and_select_account_are_ignored() {
    harness::run(async {
        let client = harness::register_client("https://rp.test/callback").await;
        let client_id = client.client_id.to_string();
        let member = harness::register_member().await;
        let mut browser = TestClient::new();
        flow::sign_in(&mut browser, &member).await;

        let mut params = valid_params(&client_id, &client);
        params.push(("prompt", "consent select_account"));
        let response = flow::authorize_raw(&mut browser, &params).await;
        let callback = follow_to_client(&mut browser, response).await;
        flow::query_param(&callback, "code");
    });
}

#[test]
fn redirect_uri_is_used_as_registered() {
    harness::run(async {
        let member = harness::register_member().await;

        for (registered, callback) in [
            ("https://rp.test", "https://rp.test?"),
            ("https://RP.test/callback", "https://RP.test/callback?"),
            ("https://rp.test/cb?q=%7e", "https://rp.test/cb?q=%7e&"),
            ("https://rp.test/cb?", "https://rp.test/cb?code="),
        ] {
            let client = harness::register_client(registered).await;
            let mut browser = TestClient::new();
            let login_page = flow::authorize(&mut browser, &client, &[]).await;
            flow::sign_in(&mut browser, &member).await;
            let response = browser
                .get(&flow::finish_auth_url(&flow::query_param(
                    &login_page,
                    "request_id",
                )))
                .await;
            assert_eq!(response.status, StatusCode::FOUND, "{registered}");
            let location = response.headers[header::LOCATION].to_str().unwrap();
            assert!(location.starts_with(callback), "{registered}: {location}");

            let code = flow::query_param(&response.location(), "code");
            flow::redeem(&client, &code).await;
        }
    });
}
