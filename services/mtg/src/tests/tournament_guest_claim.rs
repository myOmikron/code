//! Keeping a Guest seat with an Account, and Seat links from the desk: an
//! Account whose session holds a Guest seat claims its Guest, and an
//! Organizer gives a Guest that lost its seat a single-use Seat link (ADR 0007)

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::rorm::Database;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value as SqlValue;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::tournament_guest_sign_up::guest;
use crate::tests::tournament_guest_sign_up::match_of;
use crate::tests::tournament_guest_sign_up::me;
use crate::tests::tournament_guest_sign_up::open_event;
use crate::tests::tournament_guest_sign_up::recover;
use crate::tests::tournament_guest_sign_up::refusal;
use crate::tests::tournament_guest_sign_up::running_event;
use crate::tests::tournament_participants::roster;
use crate::tests::tournament_rounds::Event;
use crate::tests::tournament_rounds::matches;
use crate::tests::tournament_rounds::round;

/// Claim the Guest the session of `client` holds a seat of, returning the response
async fn claim(event: &Event, client: &mut TestClient) -> TestResponse {
    client
        .json(Method::POST, &event.url("guest-seat/claim"), &json!({}))
        .await
}

/// Issue a Seat link for `participant` as `client`, returning the response
async fn issue(event: &Event, client: &mut TestClient, participant: &str) -> TestResponse {
    let url = event.url(&format!("participants/{participant}/seat-link"));
    client.json(Method::POST, &url, &json!({})).await
}

/// Issue a Seat link for `participant` as the Owner, returning its secret
async fn seat_link(event: &mut Event, participant: &str) -> String {
    let url = event.url(&format!("participants/{participant}/seat-link"));
    let body = event
        .owner
        .json(Method::POST, &url, &json!({}))
        .await
        .ok_json();
    body["secret"].as_str().expect("a secret").to_string()
}

/// Redeem a Seat link as `client`, returning the response
async fn redeem(client: &mut TestClient, secret: &str) -> TestResponse {
    client
        .json(
            Method::POST,
            &api("tournaments/seat-links/redeem"),
            &json!({ "secret": secret }),
        )
        .await
}

/// The Participant `uuid` as the Owner reads the roster
async fn listed(event: &mut Event, uuid: &str) -> Option<Value> {
    let tournament = event.tournament.clone();
    let body = roster(&mut event.owner, &tournament).await;
    body["participants"]
        .as_array()
        .expect("participants")
        .iter()
        .find(|participant| participant["uuid"] == uuid)
        .cloned()
}

#[test]
fn claiming_rekeys_the_guest_to_the_account_and_keeps_its_results() {
    run(async {
        let (mut event, mut guests) = running_event().await;
        let played = match_of(&mut event, &guests[0].participant).await;
        let url = event.url(&format!("matches/{played}/report"));
        let ajani = &mut guests[0];
        ajani
            .client
            .json(
                Method::POST,
                &url,
                &json!({ "games_won": [1, 0], "games_drawn": 0 }),
            )
            .await
            .ok_json();
        let guest = ajani.participant.clone();
        let points_of = |standings: &Value, participant: &str| {
            standings["standings"]
                .as_array()
                .expect("standings")
                .iter()
                .find(|line| line["participant"] == participant)
                .map(|line| line["match_points"].clone())
        };
        let before = points_of(&event.standings().await, &guest).expect("on the standings");
        let account = create_account(Role::Member).await;
        ajani.client.log_in(&account).await;

        let claimed = claim(&event, &mut ajani.client).await.ok_json();

        let tournament = Uuid::parse_str(&event.tournament).expect("uuid");
        let key = Uuid::new_v3(&tournament, account.uuid.into_inner().as_bytes()).to_string();
        assert_eq!(claimed["uuid"], key.as_str(), "{claimed}");
        assert_eq!(claimed["name"], account.username.as_str(), "{claimed}");
        assert_eq!(claimed["guest"], false, "{claimed}");
        assert_eq!(listed(&mut event, &ajani.participant).await, None);
        let row = listed(&mut event, &key).await.expect("the Account's row");
        assert_eq!(row["checked_in"], true, "{row}");
        assert_eq!(me(&event, &mut ajani.client).await, key.as_str());

        let deck = ajani.client.get(&event.url("deck")).await;
        assert_eq!(
            deck.status,
            StatusCode::OK,
            "participant_of finds it: {deck:?}"
        );

        let rounds = event.rounds().await;
        let reported = matches(round(&rounds, 1))
            .into_iter()
            .find(|candidate| candidate["uuid"] == played.as_str())
            .expect("the match")
            .clone();
        assert_eq!(
            reported["result"]["reported_by"],
            key.as_str(),
            "{reported}"
        );
        assert!(
            reported["seats"]
                .as_array()
                .expect("seats")
                .iter()
                .any(|seat| seat["participant"] == key.as_str()),
            "{reported}"
        );
        let standings = event.standings().await;
        assert_eq!(points_of(&standings, &key), Some(before), "{standings}");
        assert_eq!(points_of(&standings, &guest), None, "{standings}");
    });
}

#[test]
fn claiming_lets_go_of_the_seat_and_its_recovery_code() {
    run(async {
        let event = open_event().await;
        let mut ajani = guest(&event, "Ajani").await;
        let account = create_account(Role::Member).await;
        ajani.client.log_in(&account).await;
        claim(&event, &mut ajani.client).await.ok_json();

        let url = event.url("guest-seat/recover");
        let refused = recover(
            &mut TestClient::new(),
            &url,
            &ajani.participant,
            &ajani.code,
        )
        .await;
        assert_eq!(refusal(&refused)["unknown_code"], true, "{refused:?}");

        let again = claim(&event, &mut ajani.client).await;
        assert_eq!(refusal(&again)["already_participant"], true, "{again:?}");
    });
}

#[test]
fn an_account_that_plays_already_claims_no_guest() {
    run(async {
        let mut event = open_event().await;
        let account = create_account(Role::Member).await;
        event.add_account(&account.username).await;
        let mut ajani = guest(&event, "Ajani").await;
        ajani.client.log_in(&account).await;

        let refused = claim(&event, &mut ajani.client).await;
        assert_eq!(
            refusal(&refused)["already_participant"],
            true,
            "{refused:?}"
        );
        assert!(listed(&mut event, &ajani.participant).await.is_some());
    });
}

#[test]
fn claiming_needs_an_account_and_a_seat() {
    run(async {
        let event = open_event().await;
        let mut ajani = guest(&event, "Ajani").await;
        let refused = claim(&event, &mut ajani.client).await;
        assert_eq!(refused.status, StatusCode::UNAUTHORIZED, "{refused:?}");

        let mut stranger = TestClient::logged_in(&create_account(Role::Member).await).await;
        let refused = claim(&event, &mut stranger).await;
        assert_eq!(refused.status, StatusCode::BAD_REQUEST, "{refused:?}");
    });
}

#[test]
fn a_seat_link_puts_the_guest_into_a_fresh_session_once() {
    run(async {
        let mut event = open_event().await;
        let ajani = guest(&event, "Ajani").await;
        let secret = seat_link(&mut event, &ajani.participant).await;

        let mut phone = TestClient::new();
        let body = redeem(&mut phone, &secret).await.ok_json();
        assert_eq!(body["tournament"], event.tournament.as_str(), "{body}");
        assert_eq!(
            body["participant"]["uuid"],
            ajani.participant.as_str(),
            "{body}"
        );
        assert_eq!(me(&event, &mut phone).await, ajani.participant.as_str());

        let code = body["recovery_code"].as_str().expect("a code");
        let url = event.url("guest-seat/recover");
        recover(&mut TestClient::new(), &url, &ajani.participant, code)
            .await
            .ok_json();

        let refused = redeem(&mut TestClient::new(), &secret).await;
        assert_eq!(refusal(&refused)["unknown_link"], true, "{refused:?}");
    });
}

#[test]
fn of_two_redeems_of_one_seat_link_at_once_only_one_succeeds() {
    run(async {
        let mut event = open_event().await;
        let ajani = guest(&event, "Ajani").await;
        let secret = seat_link(&mut event, &ajani.participant).await;
        let (mut phone, mut tablet) = (TestClient::new(), TestClient::new());

        let (one, other) = tokio::join!(redeem(&mut phone, &secret), redeem(&mut tablet, &secret));

        let (one, other) = (one.ok_json(), other.ok_json());
        let succeeded = [&one, &other]
            .into_iter()
            .filter(|body| body.get("participant").is_some())
            .count();
        assert_eq!(succeeded, 1, "{one} {other}");
        let refused = if one.get("participant").is_some() {
            &other
        } else {
            &one
        };
        assert_eq!(refused["error"]["unknown_link"], true, "{refused}");
    });
}

#[test]
fn a_seat_link_works_for_a_guest_of_a_private_tournament() {
    run(async {
        let mut event = Event::new("One", 0).await;
        let mut request = event.settings.clone();
        request["visibility"] = json!("Private");
        event
            .owner
            .json(
                Method::PUT,
                &api(&format!("tournaments/{}", event.tournament)),
                &request,
            )
            .await
            .ok_json();
        let teferi = event.add_guest("Teferi").await;
        let secret = seat_link(&mut event, &teferi).await;

        let mut phone = TestClient::new();
        redeem(&mut phone, &secret).await.ok_json();
        let mine = phone.get(&event.url("my-match")).await.ok_json();
        assert_eq!(mine["participant"], teferi.as_str(), "{mine}");
    });
}

#[test]
fn a_wrong_or_expired_seat_link_is_refused() {
    run(async {
        let mut event = open_event().await;
        let ajani = guest(&event, "Ajani").await;
        let secret = seat_link(&mut event, &ajani.participant).await;

        let refused = redeem(&mut TestClient::new(), "not the secret").await;
        assert_eq!(refusal(&refused)["unknown_link"], true, "{refused:?}");

        Database::global()
            .execute::<All>(
                "UPDATE tournament_participant SET seat_link_expires_at = now() - interval '1 minute' \
                 WHERE uuid = $1"
                    .to_string(),
                vec![SqlValue::Uuid(
                    Uuid::parse_str(&ajani.participant).expect("uuid"),
                )],
            )
            .await
            .expect("let the link run out");
        let refused = redeem(&mut TestClient::new(), &secret).await;
        assert_eq!(refusal(&refused)["expired"], true, "{refused:?}");
    });
}

#[test]
fn a_new_seat_link_replaces_the_last() {
    run(async {
        let mut event = open_event().await;
        let ajani = guest(&event, "Ajani").await;
        let first = seat_link(&mut event, &ajani.participant).await;
        let second = seat_link(&mut event, &ajani.participant).await;

        let refused = redeem(&mut TestClient::new(), &first).await;
        assert_eq!(refusal(&refused)["unknown_link"], true, "{refused:?}");
        redeem(&mut TestClient::new(), &second).await.ok_json();
    });
}

#[test]
fn only_organizers_issue_seat_links_and_only_for_guests() {
    run(async {
        let mut event = open_event().await;
        let mut ajani = guest(&event, "Ajani").await;
        let participant = ajani.participant.clone();

        let refused = issue(&event, &mut ajani.client, &participant).await;
        assert_eq!(refused.status, StatusCode::UNAUTHORIZED, "{refused:?}");
        let mut stranger = TestClient::logged_in(&create_account(Role::Member).await).await;
        let refused = issue(&event, &mut stranger, &participant).await;
        assert_eq!(refused.status, StatusCode::BAD_REQUEST, "{refused:?}");

        let account = create_account(Role::Member).await;
        let player = event.add_account(&account.username).await;
        let url = event.url(&format!("participants/{player}/seat-link"));
        let refused = event.owner.json(Method::POST, &url, &json!({})).await;
        assert_eq!(refusal(&refused)["not_a_guest"], true, "{refused:?}");
    });
}

#[test]
fn the_seat_links_are_forgotten_once_the_tournament_is_cancelled() {
    run(async {
        let mut event = open_event().await;
        let ajani = guest(&event, "Ajani").await;
        let secret = seat_link(&mut event, &ajani.participant).await;
        let url = event.url("cancel");
        event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();

        let refused = redeem(&mut TestClient::new(), &secret).await;
        assert_eq!(refusal(&refused)["unknown_link"], true, "{refused:?}");
        let url = event.url(&format!("participants/{}/seat-link", ajani.participant));
        let refused = event.owner.json(Method::POST, &url, &json!({})).await;
        assert_eq!(refusal(&refused)["tournament_over"], true, "{refused:?}");
    });
}
