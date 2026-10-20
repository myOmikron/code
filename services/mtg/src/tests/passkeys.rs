//! Renaming the logged-in Account's passkeys

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;
use galvyn_identity::IdentityModule;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Account;
use crate::models::account::Role;
use crate::models::account::Username;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;

/// Enrolls a passkey labelled `label` for `account`
pub(super) async fn enroll(account: &TestAccount, label: &str) {
    let mut tx = Database::global()
        .start_transaction()
        .await
        .expect("start a transaction");
    let identity = Account::get_by_username(
        &mut tx,
        &Username::new(account.username.clone()).expect("valid username"),
    )
    .await
    .expect("look the account up")
    .expect("the account exists")
    .identity;
    IdentityModule::global()
        .enroll_passkey_without_ceremony(
            &mut tx,
            identity,
            MaxStr::new(label.to_string()).expect("short label"),
        )
        .await
        .expect("enroll the passkey");
    tx.commit().await.expect("commit");
}

/// The labels of the passkeys `client` sees, oldest first, and the uuid of the first
async fn passkeys(client: &mut TestClient) -> (Vec<String>, String) {
    let body = client.get(&api("accounts/passkeys")).await.ok_json();
    let passkeys = body["passkeys"].as_array().expect("passkey list");
    let labels = passkeys
        .iter()
        .map(|passkey| passkey["label"].as_str().expect("label").to_string())
        .collect();
    let first = passkeys[0]["uuid"].as_str().expect("uuid").to_string();
    (labels, first)
}

/// Renames the passkey `uuid` through `client`, returning the response body
async fn rename(client: &mut TestClient, uuid: &str, label: &str) -> Value {
    client
        .json(
            Method::PUT,
            &api(&format!("accounts/passkeys/{uuid}")),
            &json!({ "label": label }),
        )
        .await
        .ok_json()
}

#[test]
fn an_account_renames_its_own_passkey_with_the_label_trimmed() {
    run(async {
        let member = create_account(Role::Member).await;
        enroll(&member, "Google Password Manager").await;
        enroll(&member, "YubiKey 5 Series").await;
        let mut client = TestClient::logged_in(&member).await;
        let (_, first) = passkeys(&mut client).await;

        let body = rename(&mut client, &first, "  Laptop  ").await;

        assert!(body.is_null(), "{body}");
        assert_eq!(
            passkeys(&mut client).await.0,
            vec!["Laptop".to_string(), "YubiKey 5 Series".to_string()]
        );
    });
}

#[test]
fn a_blank_label_is_refused() {
    run(async {
        let member = create_account(Role::Member).await;
        enroll(&member, "Phone").await;
        let mut client = TestClient::logged_in(&member).await;
        let (_, first) = passkeys(&mut client).await;

        let body = rename(&mut client, &first, "   ").await;

        assert_eq!(body["result"], "Err", "{body}");
        assert_eq!(body["error"]["empty_label"], true, "{body}");
        assert_eq!(passkeys(&mut client).await.0, vec!["Phone".to_string()]);
    });
}

#[test]
fn another_accounts_passkey_reads_as_unknown_and_keeps_its_label() {
    run(async {
        let owner = create_account(Role::Member).await;
        let other = create_account(Role::Member).await;
        enroll(&owner, "Phone").await;
        let mut owner_client = TestClient::logged_in(&owner).await;
        let (_, foreign) = passkeys(&mut owner_client).await;
        let mut other_client = TestClient::logged_in(&other).await;

        let body = rename(&mut other_client, &foreign, "Mine now").await;

        assert_eq!(body["result"], "Err", "{body}");
        assert_eq!(body["error"]["unknown_passkey"], true, "{body}");
        assert_eq!(
            passkeys(&mut owner_client).await.0,
            vec!["Phone".to_string()]
        );
    });
}

#[test]
fn an_unknown_passkey_is_refused() {
    run(async {
        let member = create_account(Role::Member).await;
        enroll(&member, "Phone").await;
        let mut client = TestClient::logged_in(&member).await;

        let body = rename(&mut client, &Uuid::new_v4().to_string(), "Laptop").await;

        assert_eq!(body["result"], "Err", "{body}");
        assert_eq!(body["error"]["unknown_passkey"], true, "{body}");
    });
}
