//! Managing OIDC clients, driven like a superadmin's browser would

use galvyn::core::re_exports::axum::body::Body;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use url::Url;

use crate::tests::flow;
use crate::tests::harness;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;

fn clients_url() -> Url {
    harness::origin()
        .join("/api/v1/frontend/admin/oidc-clients")
        .unwrap()
}

async fn create_client(admin: &mut TestClient, redirect_uri: &str) -> TestResponse {
    admin
        .post_json(
            &clients_url(),
            &json!({ "name": "Relying party", "redirect_uri": redirect_uri }),
        )
        .await
}

/// Starts an authorization request and tells whether it led to the login page
async fn authorize_reaches_login(client_id: &str, redirect_uri: &str) -> bool {
    let response = flow::authorize_raw(
        &mut TestClient::new(),
        &[
            ("response_type", "code"),
            ("client_id", client_id),
            ("redirect_uri", redirect_uri),
            ("scope", "openid"),
            ("state", "state-1"),
        ],
    )
    .await;
    response.status.is_redirection() && response.location().path() == "/links/oidc/auth"
}

#[test]
fn invalid_redirect_uris_are_rejected() {
    harness::run(async {
        let mut admin = harness::sign_in_superadmin().await;

        for redirect_uri in [
            "http://rp.test/callback",
            "https://rp.test/callback#fragment",
            "http://localhost/callback#",
            "ftp://rp.test/callback",
            "com.example.app:/callback",
            "not a url",
            "/callback",
        ] {
            let response = create_client(&mut admin, redirect_uri).await;
            assert_eq!(response.status, StatusCode::OK, "{redirect_uri}");
            let result: Value = response.json();
            assert_eq!(
                result,
                json!({ "result": "Err", "error": { "invalid_redirect_uri": true } }),
                "{redirect_uri}"
            );
        }

        for redirect_uri in [
            "https://rp.test/callback",
            "https://rp.test:8443/callback?tenant=1",
            "http://localhost:8080/callback",
            "http://127.0.0.1/callback",
            "http://[::1]/callback",
        ] {
            let response = create_client(&mut admin, redirect_uri).await;
            assert_eq!(response.status, StatusCode::OK, "{redirect_uri}");
            let result: Value = response.json();
            assert_eq!(result["result"], "Ok", "{redirect_uri}: {result}");
        }

        let response = admin.get(&clients_url()).await;
        let registered: Vec<Value> = response.json();
        assert!(
            registered
                .iter()
                .all(|client| client["redirect_uri"] != "http://rp.test/callback"),
            "rejected client was registered"
        );
    })
}

#[test]
fn secret_is_returned_on_creation_only() {
    harness::run(async {
        let mut admin = harness::sign_in_superadmin().await;

        let response = create_client(&mut admin, "https://rp.test/secret-once").await;
        assert_eq!(response.status, StatusCode::OK);
        let created: Value = response.json();
        assert_eq!(created["result"], "Ok", "{created}");
        let client_id = created["value"]["client_id"].as_str().unwrap().to_string();
        let client_secret = created["value"]["client_secret"].as_str().unwrap();
        assert!(!client_secret.is_empty());

        let response = admin.get(&clients_url()).await;
        assert_eq!(response.status, StatusCode::OK);
        let clients: Vec<Value> = response.json();
        let listed = clients
            .iter()
            .find(|client| client["client_id"] == client_id.as_str())
            .expect("the new client is listed");
        assert_eq!(listed["redirect_uri"], "https://rp.test/secret-once");
        for client in &clients {
            assert!(client.get("client_secret").is_none(), "{client}");
        }
        assert!(
            !String::from_utf8_lossy(&response.body).contains(client_secret),
            "the secret appears in the list"
        );
    })
}

#[test]
fn deleted_client_can_no_longer_authorize() {
    harness::run(async {
        let mut admin = harness::sign_in_superadmin().await;
        let redirect_uri = "https://rp.test/deleted";

        let created: Value = create_client(&mut admin, redirect_uri).await.json();
        let client_id = created["value"]["client_id"].as_str().unwrap().to_string();
        assert!(authorize_reaches_login(&client_id, redirect_uri).await);

        let response = admin
            .send(
                harness::request(
                    Method::DELETE,
                    &Url::parse(&format!("{}/{client_id}", clients_url())).unwrap(),
                )
                .body(Body::empty())
                .unwrap(),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK);

        let clients: Vec<Value> = admin.get(&clients_url()).await.json();
        assert!(
            clients
                .iter()
                .all(|client| client["client_id"] != client_id.as_str()),
            "the deleted client is still listed"
        );
        assert!(!authorize_reaches_login(&client_id, redirect_uri).await);
    })
}
