//! Web Push devices and the tournament opt-out: an Account subscribes each
//! device, and turns tournament pushes off for all of them at once

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;

/// A device endpoint no other test uses
pub(super) fn new_endpoint() -> String {
    format!("https://push.test/{}", Uuid::new_v4())
}

/// Subscribe the device at `endpoint` for `client`'s Account, in `language`
pub(super) async fn subscribe(client: &mut TestClient, endpoint: &str, language: &str) -> Value {
    client
        .json(
            Method::POST,
            &api("accounts/me/push/devices"),
            &json!({
                "endpoint": endpoint,
                "p256dh": "BLn9b-VR0ca83knDNZ32dCHGyjJp-1riX9ZTN40MqV8K_LpQmLqxC_DoHvqvFXO_nGdAB4W9dogZb_sM-uV4JbY",
                "auth": "_ordMnz7uTCmrpBTeUV4Bw",
                "language": language,
            }),
        )
        .await
        .ok_json()
}

/// Turn `client`'s tournament pushes on or off
pub(super) async fn set_tournament_pushes(client: &mut TestClient, enabled: bool) {
    client
        .json(
            Method::PUT,
            &api("accounts/me/push"),
            &json!({ "tournament_pushes": enabled }),
        )
        .await
        .ok_json();
}

/// Whether the device at `endpoint` gets `client`'s pushes
async fn subscribed(client: &mut TestClient, endpoint: &str) -> bool {
    let body = client
        .json(
            Method::POST,
            &api("accounts/me/push/devices/check"),
            &json!({ "endpoint": endpoint }),
        )
        .await
        .ok_json();
    body["subscribed"].as_bool().expect("a flag")
}

#[test]
fn tournament_pushes_are_on_until_turned_off() {
    run(async {
        let mut client = TestClient::logged_in(&create_account(Role::Member).await).await;

        let settings = client.get(&api("accounts/me/push")).await.ok_json();
        assert_eq!(settings["tournament_pushes"], true, "{settings}");
        assert!(settings["public_key"].is_string(), "{settings}");

        set_tournament_pushes(&mut client, false).await;
        let settings = client.get(&api("accounts/me/push")).await.ok_json();
        assert_eq!(settings["tournament_pushes"], false, "{settings}");

        set_tournament_pushes(&mut client, true).await;
        let settings = client.get(&api("accounts/me/push")).await.ok_json();
        assert_eq!(settings["tournament_pushes"], true, "{settings}");
    });
}

#[test]
fn a_device_subscribes_and_unsubscribes() {
    run(async {
        let mut client = TestClient::logged_in(&create_account(Role::Member).await).await;
        let endpoint = new_endpoint();
        assert!(!subscribed(&mut client, &endpoint).await);

        subscribe(&mut client, &endpoint, "De").await;
        assert!(subscribed(&mut client, &endpoint).await);

        client
            .json(
                Method::POST,
                &api("accounts/me/push/devices/unsubscribe"),
                &json!({ "endpoint": endpoint }),
            )
            .await
            .ok_json();
        assert!(!subscribed(&mut client, &endpoint).await);
    });
}

#[test]
fn a_device_belongs_to_the_account_that_subscribed_it_last() {
    run(async {
        let mut first = TestClient::logged_in(&create_account(Role::Member).await).await;
        let mut second = TestClient::logged_in(&create_account(Role::Member).await).await;
        let endpoint = new_endpoint();

        subscribe(&mut first, &endpoint, "De").await;
        subscribe(&mut second, &endpoint, "En").await;

        assert!(!subscribed(&mut first, &endpoint).await);
        assert!(subscribed(&mut second, &endpoint).await);
    });
}

#[test]
fn nobody_unsubscribes_another_accounts_device() {
    run(async {
        let mut owner = TestClient::logged_in(&create_account(Role::Member).await).await;
        let mut other = TestClient::logged_in(&create_account(Role::Member).await).await;
        let endpoint = new_endpoint();
        subscribe(&mut owner, &endpoint, "De").await;

        other
            .json(
                Method::POST,
                &api("accounts/me/push/devices/unsubscribe"),
                &json!({ "endpoint": endpoint }),
            )
            .await
            .ok_json();

        assert!(subscribed(&mut owner, &endpoint).await);
    });
}

#[test]
fn a_device_needs_an_https_endpoint() {
    run(async {
        let mut client = TestClient::logged_in(&create_account(Role::Member).await).await;

        let body = client
            .json(
                Method::POST,
                &api("accounts/me/push/devices"),
                &json!({
                    "endpoint": "http://push.test/plain",
                    "p256dh": "x",
                    "auth": "y",
                    "language": "De",
                }),
            )
            .await
            .ok_json();

        assert_eq!(body["error"]["invalid_endpoint"], true, "{body}");
    });
}

#[test]
fn push_settings_need_a_login() {
    run(async {
        let mut client = TestClient::new();
        let response = client.get(&api("accounts/me/push")).await;
        assert_eq!(response.status, StatusCode::UNAUTHORIZED, "{response:?}");
    });
}
