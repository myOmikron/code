//! Steps of the authorization code flow, driven like a member's browser and a relying
//! party would, and helpers to read what the provider answers

use base64ct::Base64UrlUnpadded;
use base64ct::Encoding;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use url::Url;

use crate::tests::harness;
use crate::tests::harness::Member;
use crate::tests::harness::RegisteredClient;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;

/// The service's url of `path`
pub fn url(path: &str) -> Url {
    harness::origin().join(path).unwrap()
}

/// The value of the query parameter `name`, which has to be present
pub fn query_param(url: &Url, name: &str) -> String {
    url.query_pairs()
        .find(|(key, _)| key == name)
        .unwrap_or_else(|| panic!("no {name} in {url}"))
        .1
        .into_owned()
}

/// Seconds since the epoch
pub fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

/// The claims of a JWT, read without verifying it
pub fn jwt_claims(jwt: &str) -> Value {
    let payload = jwt.split('.').nth(1).expect("jwt payload");
    serde_json::from_slice(&Base64UrlUnpadded::decode_vec(payload).expect("base64url payload"))
        .expect("json claims")
}

/// Sends an authorization request with exactly these query parameters
pub async fn authorize_raw(browser: &mut TestClient, params: &[(&str, &str)]) -> TestResponse {
    let mut authorize = url("/api/v1/auth/auth");
    authorize.query_pairs_mut().extend_pairs(params);
    browser.get(&authorize).await
}

/// Starts an authorization request of `client` in the browser, returning the login page it
/// lands on
///
/// The request asks for `response_type=code` and `scope=openid` at the client's
/// `redirect_uri`; `params` add parameters or replace these.
pub async fn authorize(
    browser: &mut TestClient,
    client: &RegisteredClient,
    params: &[(&str, &str)],
) -> Url {
    let client_id = client.client_id.to_string();
    let mut request = vec![
        ("response_type", "code"),
        ("client_id", client_id.as_str()),
        ("redirect_uri", client.redirect_uri.as_str()),
        ("scope", "openid"),
    ];
    for &(name, value) in params {
        match request.iter_mut().find(|(key, _)| *key == name) {
            Some(param) => param.1 = value,
            None => request.push((name, value)),
        }
    }
    let response = authorize_raw(browser, &request).await;
    assert_eq!(response.status, StatusCode::FOUND, "{response:?}");
    let login_page = response.location();
    assert_eq!(login_page.path(), "/links/oidc/auth", "{login_page}");
    login_page
}

/// Signs in like the login page does
pub async fn sign_in(browser: &mut TestClient, member: &Member) {
    let response = browser
        .post_json(
            &url("/api/v1/auth/sign-in"),
            &json!({ "username": member.username, "password": member.password }),
        )
        .await;
    assert_eq!(response.status, StatusCode::OK);
}

/// The url the login page resumes a pending authorization request with
pub fn finish_auth_url(request_id: &str) -> Url {
    let mut url = url("/api/v1/auth/finish-auth");
    url.query_pairs_mut().append_pair("request_id", request_id);
    url
}

/// Runs the browser side of the flow in a new browser, returning the code the client
/// receives
///
/// `params` go into the authorization request like in [`authorize`].
pub async fn issue_code(
    client: &RegisteredClient,
    member: &Member,
    params: &[(&str, &str)],
) -> String {
    let mut browser = TestClient::new();
    let login_page = authorize(&mut browser, client, params).await;
    sign_in(&mut browser, member).await;
    let response = browser
        .get(&finish_auth_url(&query_param(&login_page, "request_id")))
        .await;
    assert_eq!(response.status, StatusCode::FOUND, "{response:?}");
    query_param(&response.location(), "code")
}

/// Redeems `code` with `client_secret_post`, returning the token response
pub async fn redeem(client: &RegisteredClient, code: &str) -> Value {
    let response = TestClient::new()
        .post_form(
            &url("/api/v1/auth/token"),
            &[
                ("grant_type", "authorization_code"),
                ("code", code),
                ("redirect_uri", client.redirect_uri.as_str()),
                ("client_id", &client.client_id.to_string()),
                ("client_secret", &client.client_secret),
            ],
        )
        .await;
    assert_eq!(response.status, StatusCode::OK, "{response:?}");
    response.json()
}
