//! Deletion of an Account by an Admin, and the Admin log entry it leaves

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::rorm::Database;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::models::deck::history::DeckChangeKind;
use crate::models::deck::history::DeckHistory;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;

/// Deletes `account` as the Admin behind `client`, returning the response body
async fn delete(
    client: &mut TestClient,
    account: &TestAccount,
    username: &str,
    mode: &str,
) -> Value {
    client
        .json(
            Method::DELETE,
            &api(&format!("admin/accounts/{}", account.uuid.into_inner())),
            &json!({ "username": username, "mode": mode }),
        )
        .await
        .ok_json()
}

/// Creates a public deck owned by `account`, returning its uuid
async fn public_deck(account: &TestAccount) -> String {
    let body = TestClient::logged_in(account)
        .await
        .json(
            Method::POST,
            &api("decks"),
            &json!({
                "name": "Shown",
                "description": null,
                "format": "commander",
                "visibility": "Public",
            }),
        )
        .await
        .ok_json();
    body["uuid"].as_str().expect("deck uuid").to_string()
}

/// Whether the admin dashboard still knows `account`
async fn exists(client: &mut TestClient, account: &TestAccount) -> bool {
    let response = client
        .get(&api(&format!(
            "admin/accounts/{}",
            account.uuid.into_inner()
        )))
        .await;
    match response.status {
        StatusCode::OK => true,
        StatusCode::BAD_REQUEST => false,
        status => panic!("unexpected status {status}"),
    }
}

#[test]
fn a_tombstone_deletion_hands_public_decks_to_the_tombstone() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let deck = public_deck(&member).await;
        let mut client = TestClient::logged_in(&admin).await;

        let body = delete(&mut client, &member, &member.username, "Tombstone").await;
        assert_eq!(body, Value::Null);

        assert!(!exists(&mut client, &member).await);
        let deck = TestClient::new()
            .get(&api(&format!("explore/decks/{deck}")))
            .await
            .ok_json();
        assert_eq!(deck["name"], "Shown");
        assert_eq!(deck["owner"], Value::Null);
    });
}

#[test]
fn a_public_deck_reaches_the_tombstone_with_only_its_current_state_as_deck_history() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let deck = public_deck(&member).await;
        let mut owner = TestClient::logged_in(&member).await;
        let [kept, raised] = [(); 2].map(|()| Uuid::new_v4());
        let cards = api(&format!("decks/{deck}/cards"));
        owner
            .json(
                Method::POST,
                &cards,
                &json!({ "printing": kept, "quantity": 1, "zone": "Side" }),
            )
            .await
            .ok_json();
        let entry = owner
            .json(
                Method::POST,
                &cards,
                &json!({ "printing": raised, "quantity": 2, "zone": "Main" }),
            )
            .await
            .ok_json();
        let entry = entry["uuid"].as_str().expect("entry uuid");
        owner
            .json(
                Method::PATCH,
                &api(&format!("decks/{deck}/cards/{entry}")),
                &json!({ "quantity": 3 }),
            )
            .await
            .ok_json();

        let mut client = TestClient::logged_in(&admin).await;
        delete(&mut client, &member, &member.username, "Tombstone").await;

        let mut tx = Database::global()
            .start_transaction()
            .await
            .expect("start a transaction");
        let history = DeckHistory::page(&mut tx, deck.parse().expect("a uuid"), None, 100)
            .await
            .expect("read the deck history");
        tx.commit().await.expect("commit");
        let kinds: Vec<_> = history.changes.iter().map(|change| change.kind).collect();
        assert_eq!(kinds, vec![DeckChangeKind::Introduced]);
        let mut entries: Vec<_> = history.changes[0]
            .entries
            .iter()
            .map(|entry| {
                let difference = &entry.difference;
                (difference.printing, difference.before, difference.after)
            })
            .collect();
        entries.sort();
        let mut expected = vec![(kept, 0, 1), (raised, 0, 3)];
        expected.sort();
        assert_eq!(entries, expected);
    });
}

#[test]
fn a_full_deletion_takes_public_decks_too() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let deck = public_deck(&member).await;
        let mut client = TestClient::logged_in(&admin).await;

        let body = delete(&mut client, &member, &member.username, "Full").await;
        assert_eq!(body, Value::Null);

        assert!(!exists(&mut client, &member).await);
        let response = TestClient::new()
            .get(&api(&format!("explore/decks/{deck}")))
            .await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST);
    });
}

#[test]
fn an_admin_cannot_delete_itself() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;

        let body = delete(&mut client, &admin, &admin.username, "Tombstone").await;
        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["own_account"], true);
        assert!(exists(&mut client, &admin).await);
    });
}

#[test]
fn an_admin_deletes_another_admin() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let other = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;

        let body = delete(&mut client, &other, &other.username, "Tombstone").await;
        assert_eq!(body, Value::Null);
        assert!(!exists(&mut client, &other).await);
    });
}

#[test]
fn a_deletion_needs_the_accounts_username() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&admin).await;

        let body = delete(&mut client, &member, &admin.username, "Tombstone").await;
        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["username_mismatch"], true);
        assert!(exists(&mut client, &member).await);
    });
}

#[test]
fn a_deletion_stays_in_the_admin_log_after_the_account_is_gone() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&admin).await;

        delete(&mut client, &member, &member.username, "Full").await;

        let body = client.get(&api("admin/log?limit=100")).await.ok_json();
        let entry = body["entries"]
            .as_array()
            .expect("entries")
            .iter()
            .find(|entry| entry["account_username"] == member.username.as_str())
            .expect("the Deletion is logged");
        assert_eq!(entry["action"]["kind"], "Deletion");
        assert_eq!(entry["action"]["mode"], "Full");
        assert_eq!(entry["account"], Value::Null);
        assert_eq!(entry["admin_username"], admin.username.as_str());
    });
}
