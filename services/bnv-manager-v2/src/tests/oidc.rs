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

use crate::tests::harness;
use crate::tests::harness::TestClient;

fn query_param(url: &Url, name: &str) -> String {
    url.query_pairs()
        .find(|(key, _)| key == name)
        .unwrap_or_else(|| panic!("no {name} in {url}"))
        .1
        .into_owned()
}

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
        assert_eq!(response.status, StatusCode::TEMPORARY_REDIRECT);
        let login_page = response.location();
        assert_eq!(login_page.path(), "/links/oidc/auth");

        let response = browser
            .post_json(
                &harness::origin().join("/api/v1/auth/sign-in").unwrap(),
                &json!({ "username": member.username, "password": member.password }),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK);

        let finish_auth = Url::parse(&query_param(&login_page, "redirect_url")).unwrap();
        let response = browser.get(&finish_auth).await;
        assert_eq!(response.status, StatusCode::TEMPORARY_REDIRECT);
        let callback = response.location();
        assert_eq!(
            callback.as_str().split('?').next(),
            Some(client.redirect_uri.as_str())
        );
        assert_eq!(query_param(&callback, "state"), "state-1");
        let code = query_param(&callback, "code");

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
        let key = DecodingKey::from_rsa_components(
            jwk["n"].as_str().expect("n"),
            jwk["e"].as_str().expect("e"),
        )
        .unwrap();
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_audience(&[client.client_id.to_string()]);
        let claims = jsonwebtoken::decode::<Value>(id_token, &key, &validation)
            .expect("id token signed with the jwks key")
            .claims;
        assert_eq!(claims["nonce"], "nonce-1");
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
