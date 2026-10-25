//! Deletion of an Account by an Admin, and the Admin log entry it leaves

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::rorm::Database;
use serde_json::Value;
use serde_json::json;
use url::Url;
use uuid::Uuid;

use crate::models::account::Role;
use crate::models::deck::history::DeckChangeKind;
use crate::models::deck::history::DeckHistory;
use crate::models::deck::history::FieldDifference;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::tournament_organizers::add;
use crate::tests::tournament_organizers::co_organizer_names;
use crate::tests::tournament_organizers::offer;
use crate::tests::tournament_organizers::organizers_url;
use crate::tests::tournament_participants::add_account;
use crate::tests::tournament_participants::names;
use crate::tests::tournament_participants::roster;
use crate::tests::tournament_participants::start;
use crate::tests::tournament_rounds::Event;
use crate::tests::tournament_rounds::seated;
use crate::tests::tournaments::Fixture;
use crate::tests::tournaments::create;
use crate::tests::tournaments::settings;
use crate::tests::tournaments::tournament_url;
use crate::tests::tournaments::uuids;

/// Deletes `account` as the Admin behind `client`, returning the response body
pub(super) async fn delete(
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
        assert!(
            history.changes[0].fields.iter().any(|field| matches!(
                field,
                FieldDifference::Format { before, after }
                    if &**before == "commander" && &**after == "commander"
            )),
            "{history:?}"
        );
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

/// Renames `account` to `username` as the Admin behind `client`
async fn rename(client: &mut TestClient, account: &TestAccount, username: &str) {
    let response = client
        .json(
            Method::PUT,
            &api(&format!(
                "admin/accounts/{}/username",
                account.uuid.into_inner()
            )),
            &json!({ "username": username, "reason": "Asked for it", "language": "En" }),
        )
        .await;
    assert_eq!(response.status, StatusCode::OK, "{response:?}");
}

/// The Tournament at `url` as an anonymous visitor reads it, `None` if refused
async fn as_visitor(url: &Url) -> Option<Value> {
    let response = TestClient::new().get(url).await;
    response.status.is_success().then(|| response.json())
}

#[test]
fn a_deleted_accounts_participants_become_guests_named_by_its_last_username() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;
        let mut fixture = Fixture::new("Public").await;
        let member = create_account(Role::Member).await;
        let added = add_account(&mut fixture.owner, &fixture.tournament, &member.username).await;
        start(&fixture).await;
        let last = format!("d{}", &Uuid::new_v4().simple().to_string()[..12]);
        rename(&mut client, &member, &last).await;

        delete(&mut client, &member, &last, "Full").await;

        let body = roster(&mut fixture.owner, &fixture.tournament).await;
        assert_eq!(names(&body), [last.as_str()], "{body}");
        assert_eq!(body["participants"][0]["uuid"], added["uuid"], "{body}");
        assert_eq!(body["participants"][0]["guest"], true, "{body}");
    });
}

#[test]
fn a_deleted_owners_tournament_passes_to_its_co_organizer() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;
        let mut fixture = Fixture::new("Private").await;
        let heir = create_account(Role::Member).await;
        let other = create_account(Role::Member).await;
        let url = organizers_url(&fixture);
        add(&mut fixture.owner, &url, &heir.username).await;
        add(&mut fixture.owner, &url, &other.username).await;
        offer(&mut fixture.owner, &fixture.tournament, &other.username).await;

        let owner = &fixture.owner_account;
        delete(&mut client, owner, &owner.username, "Tombstone").await;

        let mut as_heir = TestClient::logged_in(&heir).await;
        let body = as_heir.get(&fixture.url()).await.ok_json();
        assert_eq!(body["owner"], heir.username.as_str(), "{body}");
        assert_eq!(body["organizer_role"], "Owner", "{body}");
        let organizers = as_heir.get(&url).await.ok_json();
        assert_eq!(
            co_organizer_names(&organizers),
            [other.username.as_str()],
            "{organizers}"
        );
        assert_eq!(organizers["handover"], Value::Null, "{organizers}");
    });
}

#[test]
fn a_deleted_owners_public_and_unlisted_tournaments_go_to_the_tombstone() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;
        let owner = create_account(Role::Member).await;
        let mut as_owner = TestClient::logged_in(&owner).await;
        let public = create(&mut as_owner, &settings("Public")).await;
        let unlisted = create(&mut as_owner, &settings("Unlisted")).await;
        let token = unlisted["share_token"].as_str().expect("a share token");

        delete(&mut client, &owner, &owner.username, "Tombstone").await;

        let uuid = public["uuid"].as_str().expect("tournament uuid");
        let body = as_visitor(&tournament_url(uuid))
            .await
            .expect("the public Tournament stays");
        assert_eq!(body["owner"], Value::Null, "{body}");
        let by_link = TestClient::new()
            .get(&api(&format!("shared/tournaments/{token}")))
            .await
            .ok_json();
        assert_eq!(by_link["uuid"], unlisted["uuid"], "{by_link}");
        assert_eq!(by_link["owner"], Value::Null, "{by_link}");
    });
}

#[test]
fn a_deleted_owners_private_tournament_is_deleted() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;
        let mut fixture = Fixture::new("Private").await;
        let member = create_account(Role::Member).await;
        add_account(&mut fixture.owner, &fixture.tournament, &member.username).await;
        let mut as_member = TestClient::logged_in(&member).await;
        assert!(as_member.get(&fixture.url()).await.status.is_success());

        let owner = &fixture.owner_account;
        delete(&mut client, owner, &owner.username, "Tombstone").await;

        let response = as_member.get(&fixture.url()).await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST);
        let mine = as_member.get(&api("tournaments/mine")).await.ok_json();
        assert!(uuids(&mine["participating"]).is_empty(), "{mine}");
    });
}

#[test]
fn a_full_deletion_takes_the_tournaments_nobody_runs_with_the_owner() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;
        let mut fixture = Fixture::new("Public").await;
        let heir = create_account(Role::Member).await;
        let alone = create(&mut fixture.owner, &settings("Public")).await;
        let url = organizers_url(&fixture);
        add(&mut fixture.owner, &url, &heir.username).await;

        let owner = &fixture.owner_account;
        delete(&mut client, owner, &owner.username, "Full").await;

        let uuid = alone["uuid"].as_str().expect("tournament uuid");
        assert!(as_visitor(&tournament_url(uuid)).await.is_none());
        let kept = as_visitor(&fixture.url())
            .await
            .expect("the Co-organizer's Tournament stays");
        assert_eq!(kept["owner"], heir.username.as_str(), "{kept}");
    });
}

#[test]
fn an_account_deleting_itself_leaves_its_public_tournament_with_the_tombstone() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let username = fixture.owner_account.username.clone();

        let response = fixture
            .owner
            .json(
                Method::DELETE,
                &api("accounts/me"),
                &json!({ "username": username }),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");

        let body = as_visitor(&fixture.url())
            .await
            .expect("the public Tournament stays");
        assert_eq!(body["owner"], Value::Null, "{body}");
    });
}

/// The standings line of `participant`
fn line<'a>(standings: &'a Value, participant: &str) -> &'a Value {
    standings["standings"]
        .as_array()
        .expect("standings")
        .iter()
        .find(|line| line["participant"] == participant)
        .expect("a line")
}

#[test]
fn a_deleted_accounts_matches_and_standings_stay_under_its_last_username() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;
        let member = create_account(Role::Member).await;
        let mut event = Event::new("One", 1).await;
        let participant = event.add_account(&member.username).await;
        event.play_round().await;
        let before = event.standings().await;

        delete(&mut client, &member, &member.username, "Tombstone").await;

        let after = event.standings().await;
        let kept = line(&after, &participant);
        assert_eq!(kept["name"], member.username.as_str(), "{after}");
        assert_eq!(kept["guest"], true, "{after}");
        assert_eq!(
            kept["match_points"],
            line(&before, &participant)["match_points"],
            "{after}"
        );
        let rounds = event.rounds().await;
        let seats: Vec<String> = rounds["rounds"][0]["matches"]
            .as_array()
            .expect("matches")
            .iter()
            .flat_map(seated)
            .collect();
        assert!(seats.contains(&participant), "{rounds}");
    });
}
