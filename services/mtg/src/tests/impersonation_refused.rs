//! The actions refused while impersonating: Passkeys, self-Deletion and
//! self-Rename, Bug reports and push subscriptions

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::impersonation::impersonating;
use crate::tests::oidc::account_named;
use crate::tests::oidc::choose_username;
use crate::tests::oidc::continue_with_google;
use crate::tests::oidc::free_username;
use crate::tests::oidc::stranger;
use crate::tests::passkeys::enroll;
use crate::tests::push::new_endpoint;

/// Asserts `response` is the refusal of an action during an Impersonation
fn assert_refused(response: &TestResponse) {
    assert_eq!(response.status, StatusCode::FORBIDDEN, "{response:?}");
    let body: serde_json::Value = response.json();
    assert_eq!(body["impersonation_active"], true, "{body}");
}

/// The labels of the Passkeys the Account behind `client` sees
async fn passkey_labels(client: &mut TestClient) -> Vec<String> {
    let body = client.get(&api("accounts/passkeys")).await.ok_json();
    body["passkeys"]
        .as_array()
        .expect("passkey list")
        .iter()
        .map(|passkey| passkey["label"].as_str().expect("label").to_string())
        .collect()
}

#[test]
fn listing_passkeys_is_refused() {
    run(async {
        let member = create_account(Role::Member).await;
        enroll(&member, "Phone").await;
        let (_, mut client) = impersonating(&member).await;

        let response = client.get(&api("accounts/passkeys")).await;

        assert_refused(&response);
        let mut own = TestClient::logged_in(&member).await;
        assert_eq!(passkey_labels(&mut own).await, vec!["Phone".to_string()]);
    });
}

/// The uuid of the first Passkey the Account behind `client` sees
async fn first_passkey(client: &mut TestClient) -> String {
    let body = client.get(&api("accounts/passkeys")).await.ok_json();
    body["passkeys"][0]["uuid"]
        .as_str()
        .expect("uuid")
        .to_string()
}

#[test]
fn adding_a_passkey_is_refused() {
    run(async {
        let member = create_account(Role::Member).await;
        let (_, mut client) = impersonating(&member).await;

        let start = client
            .json(Method::POST, &api("accounts/passkeys/start"), &json!({}))
            .await;
        let finish = client
            .json(
                Method::POST,
                &api("accounts/passkeys/finish"),
                &json!({ "credential": {}, "label": "Admin's laptop" }),
            )
            .await;

        assert_refused(&start);
        assert_refused(&finish);
        let mut own = TestClient::logged_in(&member).await;
        assert!(passkey_labels(&mut own).await.is_empty());
    });
}

#[test]
fn renaming_and_deleting_a_passkey_is_refused() {
    run(async {
        let member = create_account(Role::Member).await;
        enroll(&member, "Phone").await;
        enroll(&member, "Laptop").await;
        let mut own = TestClient::logged_in(&member).await;
        let passkey = first_passkey(&mut own).await;
        let (_, mut client) = impersonating(&member).await;
        let url = api(&format!("accounts/passkeys/{passkey}"));

        let rename = client
            .json(Method::PUT, &url, &json!({ "label": "Renamed" }))
            .await;
        let delete = client.json(Method::DELETE, &url, &json!({})).await;

        assert_refused(&rename);
        assert_refused(&delete);
        assert_eq!(
            passkey_labels(&mut own).await,
            vec!["Phone".to_string(), "Laptop".to_string()]
        );
    });
}

#[test]
fn renaming_the_account_is_refused() {
    run(async {
        let member = create_account(Role::Member).await;
        let (_, mut client) = impersonating(&member).await;
        let username = format!("r{}", &Uuid::new_v4().simple().to_string()[..12]);

        let response = client
            .json(
                Method::PUT,
                &api("accounts/me/username"),
                &json!({ "username": username }),
            )
            .await;

        assert_refused(&response);
        let me = TestClient::logged_in(&member)
            .await
            .get(&api("accounts/me"))
            .await
            .ok_json();
        assert_eq!(me["username"], member.username.as_str());
    });
}

#[test]
fn deleting_the_account_is_refused() {
    run(async {
        let member = create_account(Role::Member).await;
        let (_, mut client) = impersonating(&member).await;

        let response = client
            .json(
                Method::DELETE,
                &api("accounts/me"),
                &json!({ "username": member.username }),
            )
            .await;

        assert_refused(&response);
        let me = TestClient::logged_in(&member)
            .await
            .get(&api("accounts/me"))
            .await
            .ok_json();
        assert_eq!(me["uuid"], member.uuid.into_inner().to_string());
    });
}

#[test]
fn sending_a_bug_report_is_refused() {
    run(async {
        let member = create_account(Role::Member).await;
        let (_, mut client) = impersonating(&member).await;

        let response = client
            .json(Method::POST, &api("bug-reports"), &json!({}))
            .await;

        assert_refused(&response);
    });
}

#[test]
fn subscribing_a_push_device_is_refused() {
    run(async {
        let member = create_account(Role::Member).await;
        let (_, mut client) = impersonating(&member).await;
        let endpoint = new_endpoint();

        let response = client
            .json(
                Method::POST,
                &api("accounts/me/push/devices"),
                &json!({
                    "endpoint": endpoint,
                    "p256dh": "BLn9b-VR0ca83knDNZ32dCHGyjJp-1riX9ZTN40MqV8K_LpQmLqxC_DoHvqvFXO_nGdAB4W9dogZb_sM-uV4JbY",
                    "auth": "_ordMnz7uTCmrpBTeUV4Bw",
                    "language": "De",
                }),
            )
            .await;

        assert_refused(&response);
        let check = TestClient::logged_in(&member)
            .await
            .json(
                Method::POST,
                &api("accounts/me/push/devices/check"),
                &json!({ "endpoint": endpoint }),
            )
            .await
            .ok_json();
        assert_eq!(check["subscribed"], false, "{check}");
    });
}

#[test]
fn me_describes_the_admins_own_login_while_impersonating_an_external_account() {
    run(async {
        let username = free_username();
        let mut google = TestClient::new();
        continue_with_google(&mut google, stranger()).await;
        choose_username(&mut google, &username).await.ok_json();
        let account = account_named(&username).await.expect("the account exists");
        let member = TestAccount {
            uuid: account.uuid,
            username,
        };
        let (_, mut client) = impersonating(&member).await;

        let me = client.get(&api("accounts/me")).await.ok_json();

        assert_eq!(me["username"], member.username.as_str(), "{me}");
        assert_eq!(me["external"], false, "{me}");
    });
}

#[test]
fn after_ending_the_admin_manages_its_own_passkeys_again() {
    run(async {
        let member = create_account(Role::Member).await;
        let (admin, mut client) = impersonating(&member).await;
        enroll(&admin, "Admin's key").await;

        client
            .json(
                Method::DELETE,
                &api("accounts/me/impersonation"),
                &json!({}),
            )
            .await
            .ok_json();

        assert_eq!(
            passkey_labels(&mut client).await,
            vec!["Admin's key".to_string()]
        );
    });
}
