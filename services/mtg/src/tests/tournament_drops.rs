//! Drops and late Participants: a Participant Drops itself or is Dropped by an
//! Organizer and is not paired again, but stays in the standings; once the
//! first Round started, only Organizers add Participants, who start with no
//! Match points and play from the next Round

use galvyn::core::re_exports::axum::http::Method;
use serde_json::Value;
use serde_json::json;

use crate::models::account::Role;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::tournament_rounds::Event;
use crate::tests::tournament_rounds::round;
use crate::tests::tournament_rounds::seated;

/// A fresh Account and a client logged in as it
async fn player() -> (TestAccount, TestClient) {
    let account = create_account(Role::Member).await;
    let client = TestClient::logged_in(&account).await;
    (account, client)
}

/// Add `account` as the Owner, returning the body
async fn add_account(event: &mut Event, account: &TestAccount) -> Value {
    let url = event.url("participants/accounts");
    let body = event
        .owner
        .json(Method::POST, &url, &json!({ "username": account.username }))
        .await
        .ok_json();
    if let Some(uuid) = body["uuid"].as_str() {
        event.players.push(uuid.to_string());
    }
    body
}

/// Add a Guest as the Owner, returning the body
async fn add_guest(event: &mut Event, name: &str) -> Value {
    let url = event.url("participants/guests");
    event
        .owner
        .json(Method::POST, &url, &json!({ "name": name }))
        .await
        .ok_json()
}

/// Drop `participant` as the Owner, returning the body
async fn drop_as_owner(event: &mut Event, participant: &str) -> Value {
    let url = event.url(&format!("participants/{participant}/drop"));
    event
        .owner
        .json(Method::POST, &url, &json!({}))
        .await
        .ok_json()
}

/// Drop `client` itself out of the Tournament, returning the body
async fn drop_self(event: &Event, client: &mut TestClient) -> Value {
    client
        .json(Method::POST, &event.url("drop"), &json!({}))
        .await
        .ok_json()
}

/// The Participant `uuid` on the participant list, as the Owner reads it
async fn listed(event: &mut Event, uuid: &str) -> Value {
    let url = event.url("participants");
    let body = event.owner.get(&url).await.ok_json();
    body["participants"]
        .as_array()
        .expect("a list of participants")
        .iter()
        .find(|participant| participant["uuid"] == uuid)
        .cloned()
        .expect("the participant is listed")
}

/// The line of `uuid` in the standings
async fn standing(event: &mut Event, uuid: &str) -> Value {
    let body = event.standings().await;
    body["standings"]
        .as_array()
        .expect("a list of lines")
        .iter()
        .find(|line| line["participant"] == uuid)
        .cloned()
        .expect("a line for the participant")
}

/// Everybody seated in Round `number`, Byes included
async fn seated_in(event: &mut Event, number: i64) -> Vec<String> {
    let rounds = event.rounds().await;
    round(&rounds, number)["matches"]
        .as_array()
        .expect("a list of matches")
        .iter()
        .flat_map(seated)
        .collect()
}

/// Play a Round to its end, Seat 1 winning every Match
async fn play_and_end(event: &mut Event) -> i64 {
    let number = event.play_round().await["number"]
        .as_i64()
        .expect("a number");
    event.end(number).await;
    number
}

#[test]
fn a_participant_drops_itself_and_is_not_paired_again() {
    run(async {
        let mut event = Event::new("Three", 3).await;
        let (alice, mut client) = player().await;
        let added = add_account(&mut event, &alice).await;
        let uuid = added["uuid"].as_str().expect("uuid").to_string();
        play_and_end(&mut event).await;
        let points_before = standing(&mut event, &uuid).await["match_points"].clone();

        let dropped = drop_self(&event, &mut client).await;
        assert_eq!(dropped, Value::Null, "{dropped}");

        assert_eq!(listed(&mut event, &uuid).await["dropped_after_round"], 1);
        event.pair().await;
        assert!(!seated_in(&mut event, 2).await.contains(&uuid));
        let line = standing(&mut event, &uuid).await;
        assert_eq!(line["match_points"], points_before, "{line}");
        assert_eq!(line["dropped_after_round"], 1, "{line}");
    });
}

#[test]
fn an_organizer_drops_a_participant() {
    run(async {
        let mut event = Event::new("Three", 5).await;
        play_and_end(&mut event).await;
        let no_show = event.players[0].clone();

        let dropped = drop_as_owner(&mut event, &no_show).await;
        assert_eq!(dropped, Value::Null, "{dropped}");

        event.pair().await;
        let seated = seated_in(&mut event, 2).await;
        assert_eq!(seated.len(), 4, "{seated:?}");
        assert!(!seated.contains(&no_show));
        assert_eq!(
            standing(&mut event, &no_show).await["dropped_after_round"],
            1
        );
    });
}

#[test]
fn a_drop_during_a_running_round_keeps_its_match() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.pair().await;
        event.start(1).await;
        let leaver = event.players[1].clone();

        drop_as_owner(&mut event, &leaver).await;

        assert!(seated_in(&mut event, 1).await.contains(&leaver));
        let rounds = event.rounds().await;
        for played in round(&rounds, 1)["matches"].as_array().expect("matches") {
            let uuid = played["uuid"].as_str().expect("uuid").to_string();
            event.result(&uuid, [2, 0], 0).await;
        }
        let ended = event.end(1).await;
        assert_eq!(ended["state"], "Swiss", "{ended}");
        event.pair().await;
        assert!(!seated_in(&mut event, 2).await.contains(&leaver));
        assert_eq!(listed(&mut event, &leaver).await["dropped_after_round"], 1);
    });
}

#[test]
fn a_drop_discards_the_preview() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        play_and_end(&mut event).await;
        event.pair().await;
        let leaver = event.players[2].clone();

        drop_as_owner(&mut event, &leaver).await;

        let rounds = event.rounds().await;
        assert_eq!(
            rounds["rounds"].as_array().map(Vec::len),
            Some(1),
            "{rounds}"
        );
        assert_eq!(event.pair().await["number"], 2);
        assert!(!seated_in(&mut event, 2).await.contains(&leaver));
    });
}

#[test]
fn dropping_twice_changes_nothing() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        play_and_end(&mut event).await;
        let leaver = event.players[0].clone();
        drop_as_owner(&mut event, &leaver).await;
        play_and_end(&mut event).await;

        let again = drop_as_owner(&mut event, &leaver).await;
        assert_eq!(again, Value::Null, "{again}");
        assert_eq!(listed(&mut event, &leaver).await["dropped_after_round"], 1);
    });
}

#[test]
fn nobody_drops_before_the_first_round_or_after_the_tournament_is_over() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        let (alice, mut client) = player().await;
        add_account(&mut event, &alice).await;

        let early = drop_self(&event, &mut client).await;
        assert_eq!(early["error"]["not_started"], true, "{early}");
        event.pair().await;
        let previewed = drop_self(&event, &mut client).await;
        assert_eq!(previewed["error"]["not_started"], true, "{previewed}");

        event.start(1).await;
        let url = event.url("cancel");
        event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();
        let late = drop_self(&event, &mut client).await;
        assert_eq!(late["error"]["tournament_over"], true, "{late}");
    });
}

#[test]
fn nobody_but_an_organizer_drops_another_participant() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        play_and_end(&mut event).await;
        let victim = event.players[0].clone();
        let (alice, mut client) = player().await;
        add_account(&mut event, &alice).await;

        let url = event.url(&format!("participants/{victim}/drop"));
        for caller in [&mut event.stranger, &mut client] {
            let refused = caller.json(Method::POST, &url, &json!({})).await;
            assert_eq!(refused.status.as_u16(), 400, "{refused:?}");
        }
        let anonymous = TestClient::new().json(Method::POST, &url, &json!({})).await;
        assert!(!anonymous.status.is_success(), "{anonymous:?}");
        let own = event.url("drop");
        let outsider = event.stranger.json(Method::POST, &own, &json!({})).await;
        assert_eq!(outsider.status.as_u16(), 400, "{outsider:?}");

        assert_eq!(
            listed(&mut event, &victim).await["dropped_after_round"],
            Value::Null
        );
    });
}

#[test]
fn sign_up_closes_when_the_first_round_starts() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        let mut request = event.settings.clone();
        request["self_sign_up"] = json!(true);
        let url = crate::tests::tournaments::tournament_url(&event.tournament);
        event
            .owner
            .json(Method::PUT, &url, &request)
            .await
            .ok_json();
        event.pair().await;
        event.start(1).await;

        let (_, mut late) = player().await;
        let signed = late
            .json(Method::POST, &event.url("sign-up"), &json!({}))
            .await
            .ok_json();
        assert_eq!(signed["error"]["closed"], true, "{signed}");
    });
}

#[test]
fn a_late_participant_starts_with_no_match_points_and_plays_from_the_next_round() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.pair().await;
        event.start(1).await;

        let late = add_guest(&mut event, "Latecomer").await;
        let uuid = late["uuid"].as_str().expect("uuid").to_string();
        assert_eq!(late["late_from_round"], 2, "{late}");
        let (alice, _) = player().await;
        let account = add_account(&mut event, &alice).await;
        assert_eq!(account["late_from_round"], 2, "{account}");

        assert!(!seated_in(&mut event, 1).await.contains(&uuid));
        let rounds = event.rounds().await;
        for played in round(&rounds, 1)["matches"].as_array().expect("matches") {
            let played = played["uuid"].as_str().expect("uuid").to_string();
            event.result(&played, [2, 0], 0).await;
        }
        event.end(1).await;
        let line = standing(&mut event, &uuid).await;
        assert_eq!(
            (&line["match_points"], &line["losses"]),
            (&json!(0), &json!(0)),
            "{line}"
        );

        event.pair().await;
        let seated = seated_in(&mut event, 2).await;
        assert!(seated.contains(&uuid), "{seated:?}");
        assert_eq!(listed(&mut event, &uuid).await["late_from_round"], 2);
    });
}

#[test]
fn participants_added_before_the_first_round_are_not_late() {
    run(async {
        let mut event = Event::new("Three", 3).await;
        event.pair().await;

        let added = add_guest(&mut event, "Just in time").await;

        assert_eq!(added["late_from_round"], Value::Null, "{added}");
    });
}

#[test]
fn no_late_participant_joins_a_tournament_that_is_over() {
    run(async {
        let mut event = Event::new("Three", 2).await;
        play_and_end(&mut event).await;
        assert_eq!(event.state().await, "Finished", "two play one Round");

        let added = add_guest(&mut event, "Too late").await;
        assert_eq!(added["error"]["roster_closed"], true, "{added}");
        let (alice, _) = player().await;
        let account = add_account(&mut event, &alice).await;
        assert_eq!(account["error"]["roster_closed"], true, "{account}");
    });
}

#[test]
fn the_round_count_suggestion_leaves_dropped_participants_out() {
    run(async {
        let mut event = Event::new("Three", 9).await;
        assert_eq!(event.rounds().await["suggested_swiss_rounds"], 5);
        play_and_end(&mut event).await;

        let leavers = [event.players[0].clone(), event.players[1].clone()];
        for leaver in leavers {
            drop_as_owner(&mut event, &leaver).await;
        }

        assert_eq!(event.rounds().await["suggested_swiss_rounds"], 3);
    });
}
