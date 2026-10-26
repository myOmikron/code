//! Participants: Organizers add Accounts and Guests and remove them before the
//! first Round, Accounts sign up themselves where the Owner allows it, up to
//! the participant limit

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::rorm::Database;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value as SqlValue;
use serde_json::Value;
use serde_json::json;
use url::Url;
use uuid::Uuid;

use crate::models::account::Role;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::tournaments::Fixture;
use crate::tests::tournaments::settings;

/// The url of a path below the Fixture's Tournament
fn below(tournament: &str, path: &str) -> Url {
    api(&format!("tournaments/{tournament}/{path}"))
}

/// Adds the Account named `username` as an Organizer would, returning the body
pub(super) async fn add_account(
    client: &mut TestClient,
    tournament: &str,
    username: &str,
) -> Value {
    client
        .json(
            Method::POST,
            &below(tournament, "participants/accounts"),
            &json!({ "username": username }),
        )
        .await
        .ok_json()
}

/// Adds a Guest as an Organizer would, returning the body
pub(super) async fn add_guest(client: &mut TestClient, tournament: &str, name: &str) -> Value {
    client
        .json(
            Method::POST,
            &below(tournament, "participants/guests"),
            &json!({ "name": name }),
        )
        .await
        .ok_json()
}

/// Signs `client` up by the Tournament's id, returning the body
async fn sign_up(client: &mut TestClient, tournament: &str) -> Value {
    client
        .json(Method::POST, &below(tournament, "sign-up"), &json!({}))
        .await
        .ok_json()
}

/// The participant list as `client` reads it
pub(super) async fn roster(client: &mut TestClient, tournament: &str) -> Value {
    client
        .get(&below(tournament, "participants"))
        .await
        .ok_json()
}

/// The names on a participant list, in its order
pub(super) fn names(body: &Value) -> Vec<String> {
    body["participants"]
        .as_array()
        .expect("a list of participants")
        .iter()
        .map(|participant| participant["name"].as_str().expect("name").to_string())
        .collect()
}

/// The Owner turns self sign-up on, with `limit` as the participant limit
async fn open_sign_up(fixture: &mut Fixture, visibility: &str, limit: Option<i32>) {
    let mut request = settings(visibility);
    request["self_sign_up"] = json!(true);
    request["participant_limit"] = json!(limit);
    let url = fixture.url();
    let body = fixture
        .owner
        .json(Method::PUT, &url, &request)
        .await
        .ok_json();
    assert_eq!(body["self_sign_up"], true, "{body}");
}

/// A fresh Account and a client logged in as it
async fn player() -> (TestAccount, TestClient) {
    let account = create_account(Role::Member).await;
    let client = TestClient::logged_in(&account).await;
    (account, client)
}

/// Moves the Tournament past Registration, as starting the first Round will
pub(super) async fn start(fixture: &Fixture) {
    let uuid: Uuid = fixture.tournament.parse().expect("a uuid");
    let mut tx = Database::global()
        .start_transaction()
        .await
        .expect("start a transaction");
    (&mut tx)
        .execute::<All>(
            "UPDATE tournament SET state = 'Swiss' WHERE uuid = $1".to_string(),
            vec![SqlValue::Uuid(uuid)],
        )
        .await
        .expect("run the statement");
    tx.commit().await.expect("commit");
}

#[test]
fn the_owner_adds_accounts_and_guests_in_order() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let (alice, _) = player().await;

        let added = add_account(&mut fixture.owner, &fixture.tournament, &alice.username).await;
        assert_eq!(added["name"], alice.username.as_str(), "{added}");
        assert_eq!(added["guest"], false, "{added}");
        let guest = add_guest(&mut fixture.owner, &fixture.tournament, "  Uncle Bob ").await;
        assert_eq!(guest["name"], "Uncle Bob", "{guest}");
        assert_eq!(guest["guest"], true, "{guest}");

        let mut anonymous = TestClient::new();
        let body = roster(&mut anonymous, &fixture.tournament).await;
        assert_eq!(
            names(&body),
            vec![alice.username.clone(), "Uncle Bob".to_string()],
            "{body}"
        );
        assert_eq!(body["me"], Value::Null, "{body}");
    });
}

#[test]
fn an_account_is_a_participant_once() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let (alice, _) = player().await;
        add_account(&mut fixture.owner, &fixture.tournament, &alice.username).await;

        let again = add_account(&mut fixture.owner, &fixture.tournament, &alice.username).await;

        assert_eq!(again["result"], "Err", "{again}");
        assert_eq!(again["error"]["already_participant"], true, "{again}");
        assert_eq!(
            names(&roster(&mut fixture.owner, &fixture.tournament).await).len(),
            1
        );
    });
}

#[test]
fn an_unknown_username_or_an_empty_guest_name_is_refused() {
    run(async {
        let mut fixture = Fixture::new("Public").await;

        let unknown = add_account(
            &mut fixture.owner,
            &fixture.tournament,
            "nobody-by-that-name",
        )
        .await;
        assert_eq!(unknown["error"]["unknown_username"], true, "{unknown}");
        let empty = add_guest(&mut fixture.owner, &fixture.tournament, "   ").await;
        assert_eq!(empty["error"]["empty_name"], true, "{empty}");

        assert!(names(&roster(&mut fixture.owner, &fixture.tournament).await).is_empty());
    });
}

#[test]
fn the_owner_removes_a_participant() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let guest = add_guest(&mut fixture.owner, &fixture.tournament, "Uncle Bob").await;
        let uuid = guest["uuid"].as_str().expect("uuid").to_string();

        fixture
            .owner
            .json(
                Method::DELETE,
                &below(&fixture.tournament, &format!("participants/{uuid}")),
                &json!({}),
            )
            .await
            .ok_json();

        assert!(names(&roster(&mut fixture.owner, &fixture.tournament).await).is_empty());
    });
}

#[test]
fn nobody_but_an_organizer_adds_or_removes_participants() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let guest = add_guest(&mut fixture.owner, &fixture.tournament, "Uncle Bob").await;
        let uuid = guest["uuid"].as_str().expect("uuid").to_string();

        let added = fixture
            .stranger
            .json(
                Method::POST,
                &below(&fixture.tournament, "participants/guests"),
                &json!({ "name": "Intruder" }),
            )
            .await;
        assert_eq!(added.status.as_u16(), 400, "{added:?}");
        let removed = fixture
            .stranger
            .json(
                Method::DELETE,
                &below(&fixture.tournament, &format!("participants/{uuid}")),
                &json!({}),
            )
            .await;
        assert_eq!(removed.status.as_u16(), 400, "{removed:?}");

        assert_eq!(
            names(&roster(&mut fixture.owner, &fixture.tournament).await),
            vec!["Uncle Bob".to_string()]
        );
    });
}

#[test]
fn a_removed_participant_stays_out_of_another_tournament() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let mut other = Fixture::new("Public").await;
        let guest = add_guest(&mut other.owner, &other.tournament, "Uncle Bob").await;
        let uuid = guest["uuid"].as_str().expect("uuid").to_string();

        let response = fixture
            .owner
            .json(
                Method::DELETE,
                &below(&fixture.tournament, &format!("participants/{uuid}")),
                &json!({}),
            )
            .await;

        assert_eq!(response.status.as_u16(), 400, "{response:?}");
        assert_eq!(
            names(&roster(&mut other.owner, &other.tournament).await).len(),
            1
        );
    });
}

#[test]
fn sign_up_and_removal_end_once_the_first_round_starts() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        open_sign_up(&mut fixture, "Public", None).await;
        let guest = add_guest(&mut fixture.owner, &fixture.tournament, "Uncle Bob").await;
        let uuid = guest["uuid"].as_str().expect("uuid").to_string();
        start(&fixture).await;

        let removed = fixture
            .owner
            .json(
                Method::DELETE,
                &below(&fixture.tournament, &format!("participants/{uuid}")),
                &json!({}),
            )
            .await;
        assert_eq!(removed.status.as_u16(), 400, "{removed:?}");
        let (_, mut late) = player().await;
        let signed = sign_up(&mut late, &fixture.tournament).await;
        assert_eq!(signed["error"]["closed"], true, "{signed}");

        assert_eq!(
            names(&roster(&mut fixture.owner, &fixture.tournament).await),
            vec!["Uncle Bob".to_string()]
        );
    });
}

#[test]
fn an_organizer_can_be_a_participant_of_its_own_tournament() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let username = fixture.owner_account.username.clone();

        let added = add_account(&mut fixture.owner, &fixture.tournament, &username).await;

        let body = roster(&mut fixture.owner, &fixture.tournament).await;
        assert_eq!(names(&body), vec![username], "{body}");
        assert_eq!(body["me"], added["uuid"], "{body}");
    });
}

#[test]
fn sign_up_is_closed_unless_the_owner_turned_it_on() {
    run(async {
        let fixture = Fixture::new("Public").await;
        let (_, mut alice) = player().await;

        let body = sign_up(&mut alice, &fixture.tournament).await;

        assert_eq!(body["result"], "Err", "{body}");
        assert_eq!(body["error"]["closed"], true, "{body}");
    });
}

#[test]
fn a_private_tournament_takes_no_self_sign_up() {
    run(async {
        let mut fixture = Fixture::new("Private").await;
        let mut request = settings("Private");
        request["self_sign_up"] = json!(true);
        let url = fixture.url();

        let body = fixture
            .owner
            .json(Method::PUT, &url, &request)
            .await
            .ok_json();

        assert_eq!(
            body["error"]["self_sign_up_needs_visibility"], true,
            "{body}"
        );
        assert_eq!(fixture.as_owner().await["self_sign_up"], false);
    });
}

#[test]
fn an_account_signs_up_for_a_public_tournament_at_once() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        open_sign_up(&mut fixture, "Public", None).await;
        let (alice, mut client) = player().await;

        let signed = sign_up(&mut client, &fixture.tournament).await;
        assert_eq!(signed["name"], alice.username.as_str(), "{signed}");

        let body = roster(&mut client, &fixture.tournament).await;
        assert_eq!(names(&body), vec![alice.username.clone()], "{body}");
        assert_eq!(body["me"], signed["uuid"], "{body}");
        let again = sign_up(&mut client, &fixture.tournament).await;
        assert_eq!(again["error"]["already_participant"], true, "{again}");
    });
}

#[test]
fn signing_up_needs_an_account() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        open_sign_up(&mut fixture, "Public", None).await;
        let mut anonymous = TestClient::new();

        let response = anonymous
            .json(
                Method::POST,
                &below(&fixture.tournament, "sign-up"),
                &json!({}),
            )
            .await;

        assert_eq!(response.status.as_u16(), 401, "{response:?}");
    });
}

#[test]
fn an_unlisted_tournament_is_signed_up_for_through_its_share_link() {
    run(async {
        let mut fixture = Fixture::new("Unlisted").await;
        open_sign_up(&mut fixture, "Unlisted", None).await;
        let token = fixture.as_owner().await["share_token"]
            .as_str()
            .expect("a share link")
            .to_string();
        let (alice, mut client) = player().await;

        let by_id = client
            .json(
                Method::POST,
                &below(&fixture.tournament, "sign-up"),
                &json!({}),
            )
            .await;
        assert_eq!(by_id.status.as_u16(), 400, "{by_id:?}");

        let signed = client
            .json(
                Method::POST,
                &api(&format!("shared/tournaments/{token}/sign-up")),
                &json!({}),
            )
            .await
            .ok_json();
        assert_eq!(signed["name"], alice.username.as_str(), "{signed}");

        let by_link = client
            .get(&api(&format!("shared/tournaments/{token}/participants")))
            .await
            .ok_json();
        assert_eq!(by_link["me"], signed["uuid"], "{by_link}");
        let url = fixture.url();
        let seen = client.get(&url).await.ok_json();
        assert_eq!(seen["uuid"], fixture.tournament.as_str(), "{seen}");
    });
}

#[test]
fn sign_up_is_refused_once_the_limit_is_reached() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        open_sign_up(&mut fixture, "Public", Some(2)).await;
        add_guest(&mut fixture.owner, &fixture.tournament, "Uncle Bob").await;
        let (_, mut alice) = player().await;
        let (_, mut carol) = player().await;

        let first = sign_up(&mut alice, &fixture.tournament).await;
        assert_eq!(first["guest"], false, "{first}");
        let second = sign_up(&mut carol, &fixture.tournament).await;
        assert_eq!(second["result"], "Err", "{second}");
        assert_eq!(second["error"]["full"], true, "{second}");

        let added = add_guest(
            &mut fixture.owner,
            &fixture.tournament,
            "Organizers may go past it",
        )
        .await;
        assert_eq!(added["guest"], true, "{added}");
        assert_eq!(
            names(&roster(&mut fixture.owner, &fixture.tournament).await).len(),
            3
        );
    });
}

#[test]
fn a_participant_limit_takes_at_least_two() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let mut request = settings("Public");
        request["participant_limit"] = json!(1);
        let url = fixture.url();

        let body = fixture
            .owner
            .json(Method::PUT, &url, &request)
            .await
            .ok_json();

        assert_eq!(body["error"]["participant_limit_too_small"], true, "{body}");
    });
}

#[test]
fn an_account_withdraws_its_sign_up_before_the_first_round() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        open_sign_up(&mut fixture, "Public", None).await;
        let (_, mut alice) = player().await;
        sign_up(&mut alice, &fixture.tournament).await;

        alice
            .json(
                Method::DELETE,
                &below(&fixture.tournament, "sign-up"),
                &json!({}),
            )
            .await
            .ok_json();

        let body = roster(&mut alice, &fixture.tournament).await;
        assert!(names(&body).is_empty(), "{body}");
        assert_eq!(body["me"], Value::Null, "{body}");
    });
}

#[test]
fn a_participant_sees_a_private_tournament() {
    run(async {
        let mut fixture = Fixture::new("Private").await;
        let (alice, mut client) = player().await;
        let url = fixture.url();
        assert_eq!(client.get(&url).await.status.as_u16(), 400);

        add_account(&mut fixture.owner, &fixture.tournament, &alice.username).await;

        let seen = client.get(&url).await.ok_json();
        assert_eq!(seen["uuid"], fixture.tournament.as_str(), "{seen}");
        let body = roster(&mut client, &fixture.tournament).await;
        assert_eq!(names(&body), vec![alice.username.clone()], "{body}");
        let strangers = fixture
            .stranger
            .get(&below(&fixture.tournament, "participants"))
            .await;
        assert_eq!(strangers.status.as_u16(), 400, "{strangers:?}");
    });
}
