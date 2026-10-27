//! My Match: a Participant finds its table, opponents and Seat in the running
//! Round, and everybody sees the round timer count down from the start of the
//! Round to time up, with the Ruleset's extra turns

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::rorm::Database;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value as SqlValue;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::tournament_rounds::Event;
use crate::tests::tournaments::create;
use crate::tests::tournaments::settings;

/// A one-on-one Event of three Guests and one Account, with that Account's client and Participant uuid
async fn event_with_a_player() -> (Event, TestClient, String) {
    let mut event = Event::new("Three", 3).await;
    let account = create_account(Role::Member).await;
    let participant = event.add_account(&account.username).await;
    let client = TestClient::logged_in(&account).await;
    (event, client, participant)
}

/// GET my-match of the Event's Tournament as `client`, checking it succeeds
async fn my_match(event: &Event, client: &mut TestClient) -> Value {
    client.get(&event.url("my-match")).await.ok_json()
}

/// The running Round of a rounds response
fn running(rounds: &Value) -> &Value {
    rounds["rounds"]
        .as_array()
        .expect("a list of rounds")
        .iter()
        .find(|round| round["state"] == "Running")
        .expect("a running round")
}

/// Moves the round timer of the Event's Round `number` so that time was up a second ago
async fn run_out(event: &Event, number: i16) {
    let tournament: Uuid = event.tournament.parse().expect("a uuid");
    let mut tx = Database::global()
        .start_transaction()
        .await
        .expect("start a transaction");
    (&mut tx)
        .execute::<All>(
            "UPDATE tournament_round SET timer_ends_at = now() - interval '1 second' \
             WHERE tournament = $1 AND number = $2"
                .to_string(),
            vec![SqlValue::Uuid(tournament), SqlValue::I16(number)],
        )
        .await
        .expect("run the statement");
    tx.commit().await.expect("commit");
}

#[test]
fn a_participant_sees_its_table_its_opponent_and_its_seat() {
    run(async {
        let (mut event, mut player, me) = event_with_a_player().await;
        event.pair().await;
        event.start(1).await;

        let body = my_match(&event, &mut player).await;
        assert_eq!(body["participant"], me, "{body}");
        assert_eq!(body["round"]["number"], 1, "{body}");
        let mine = &body["round"]["my_match"];
        assert!(mine["table_number"].as_i64().is_some(), "{body}");
        let seats = mine["seats"].as_array().expect("a list of seats");
        assert_eq!(seats.len(), 2, "{body}");
        let own: Vec<&Value> = seats
            .iter()
            .filter(|seat| seat["participant"] == me)
            .collect();
        assert_eq!(own.len(), 1, "{body}");
        assert!(
            [1, 2].contains(&own[0]["seat"].as_i64().expect("a seat")),
            "{body}"
        );
        let opponent = seats
            .iter()
            .find(|seat| seat["participant"] != me)
            .expect("an opponent");
        assert!(
            opponent["name"]
                .as_str()
                .expect("a name")
                .starts_with("Guest "),
            "{body}"
        );

        let rounds = event.rounds().await;
        let same = running(&rounds)["matches"]
            .as_array()
            .expect("a list of matches")
            .iter()
            .find(|played| played["uuid"] == mine["uuid"])
            .expect("the same match in the rounds");
        assert_eq!(same["table_number"], mine["table_number"], "{rounds}");
    });
}

#[test]
fn a_participant_with_a_bye_sees_the_bye() {
    run(async {
        let mut event = Event::new("Three", 2).await;
        let account = create_account(Role::Member).await;
        let me = event.add_account(&account.username).await;
        let mut player = TestClient::logged_in(&account).await;
        event.pair().await;
        event.start(1).await;

        let body = my_match(&event, &mut player).await;
        let rounds = event.rounds().await;
        let bye = running(&rounds)["matches"]
            .as_array()
            .expect("a list of matches")
            .iter()
            .find(|played| played["table_number"].is_null())
            .expect("a bye")
            .clone();
        let mine = &body["round"]["my_match"];
        let seated_me = mine["seats"]
            .as_array()
            .expect("a list of seats")
            .iter()
            .any(|seat| seat["participant"] == me);
        assert!(seated_me, "{body}");
        if bye["seats"][0]["participant"] == me {
            assert!(mine["table_number"].is_null(), "{body}");
            assert_eq!(mine["seats"].as_array().map(Vec::len), Some(1), "{body}");
        } else {
            assert!(mine["table_number"].as_i64().is_some(), "{body}");
        }
    });
}

#[test]
fn a_previewed_round_shows_no_match_until_it_starts() {
    run(async {
        let (mut event, mut player, me) = event_with_a_player().await;
        let before = my_match(&event, &mut player).await;
        assert_eq!(before["participant"], me, "{before}");
        assert!(before["round"].is_null(), "{before}");

        event.pair().await;
        let previewed = my_match(&event, &mut player).await;
        assert!(previewed["round"].is_null(), "{previewed}");

        event.start(1).await;
        let started = my_match(&event, &mut player).await;
        assert_eq!(started["round"]["number"], 1, "{started}");
    });
}

#[test]
fn an_account_playing_in_none_sees_the_round_but_no_match() {
    run(async {
        let (mut event, _player, _me) = event_with_a_player().await;
        event.set_round_minutes(json!(50)).await;
        event.pair().await;
        event.start(1).await;
        let mut watcher = TestClient::logged_in(&create_account(Role::Member).await).await;

        let body = my_match(&event, &mut watcher).await;
        assert!(body["participant"].is_null(), "{body}");
        assert_eq!(body["round"]["number"], 1, "{body}");
        assert!(body["round"]["my_match"].is_null(), "{body}");
        assert_eq!(body["round"]["timer"]["length_seconds"], 3000, "{body}");
    });
}

#[test]
fn my_match_needs_an_account_that_sees_the_tournament() {
    run(async {
        let owner_account = create_account(Role::Member).await;
        let mut owner = TestClient::logged_in(&owner_account).await;
        let mut request = settings("Private");
        request["table_size"] = json!(2);
        request["ruleset"] = json!("Mtr");
        request["best_of"] = json!("Three");
        let created = create(&mut owner, &request).await;
        let url = api(&format!(
            "tournaments/{}/my-match",
            created["uuid"].as_str().expect("uuid")
        ));

        let mut stranger = TestClient::logged_in(&create_account(Role::Member).await).await;
        let refused = stranger.get(&url).await;
        assert!(!refused.status.is_success(), "{refused:?}");
        let anonymous = TestClient::new().get(&url).await;
        assert!(!anonymous.status.is_success(), "{anonymous:?}");
        owner.get(&url).await.ok_json();
    });
}

#[test]
fn the_round_timer_starts_with_the_round() {
    run(async {
        let (mut event, mut player, _me) = event_with_a_player().await;
        event.set_round_minutes(json!(50)).await;
        event.pair().await;
        let previewed = event.rounds().await;
        assert!(previewed["rounds"][0]["timer"].is_null(), "{previewed}");

        event.start(1).await;
        let body = my_match(&event, &mut player).await;
        let timer = &body["round"]["timer"];
        assert_eq!(timer["length_seconds"], 3000, "{body}");
        let remaining = timer["remaining_seconds"].as_i64().expect("seconds left");
        assert!((2900..=3000).contains(&remaining), "{body}");
        assert_eq!(timer["time_up"], false, "{body}");
        assert_eq!(timer["extra_turns"], 5, "{body}");
        assert!(timer["ends_at"].as_str().is_some(), "{body}");
        assert!(body["server_time"].as_str().is_some(), "{body}");

        let rounds = event.rounds().await;
        assert_eq!(
            running(&rounds)["timer"]["ends_at"],
            timer["ends_at"],
            "{rounds}"
        );
        assert!(rounds["server_time"].as_str().is_some(), "{rounds}");
    });
}

#[test]
fn time_up_shows_with_the_extra_turns() {
    run(async {
        let (mut event, mut player, _me) = event_with_a_player().await;
        event.set_round_minutes(json!(50)).await;
        event.pair().await;
        event.start(1).await;
        run_out(&event, 1).await;

        let body = my_match(&event, &mut player).await;
        let timer = &body["round"]["timer"];
        assert_eq!(timer["time_up"], true, "{body}");
        assert_eq!(timer["remaining_seconds"], 0, "{body}");
        assert_eq!(timer["extra_turns"], 5, "{body}");
    });
}

#[test]
fn without_a_round_timer_length_no_timer_is_shown() {
    run(async {
        let (mut event, mut player, _me) = event_with_a_player().await;
        event.pair().await;
        event.start(1).await;

        let body = my_match(&event, &mut player).await;
        assert_eq!(body["round"]["number"], 1, "{body}");
        assert!(body["round"]["timer"].is_null(), "{body}");
        let rounds = event.rounds().await;
        assert!(running(&rounds)["timer"].is_null(), "{rounds}");
    });
}

#[test]
fn a_new_timer_length_applies_from_the_next_round() {
    run(async {
        let (mut event, mut player, _me) = event_with_a_player().await;
        event.set_round_minutes(json!(50)).await;
        event.pair().await;
        event.start(1).await;
        event.set_round_minutes(json!(30)).await;

        let body = my_match(&event, &mut player).await;
        assert_eq!(body["round"]["timer"]["length_seconds"], 3000, "{body}");

        event.set_round_minutes(Value::Null).await;
        let body = my_match(&event, &mut player).await;
        assert_eq!(body["round"]["timer"]["length_seconds"], 3000, "{body}");
    });
}

#[test]
fn an_ended_round_shows_no_timer() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.set_round_minutes(json!(50)).await;
        event.play_round().await;
        let url = event.url("rounds/1/end");
        event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();

        let rounds = event.rounds().await;
        assert_eq!(rounds["rounds"][0]["state"], "Ended", "{rounds}");
        assert!(rounds["rounds"][0]["timer"].is_null(), "{rounds}");
    });
}

#[test]
fn the_round_timer_length_runs_one_minute_to_four_hours() {
    run(async {
        let mut owner = TestClient::logged_in(&create_account(Role::Member).await).await;
        for (minutes, valid) in [(0, false), (1, true), (240, true), (241, false)] {
            let mut request = settings("Public");
            request["round_minutes"] = json!(minutes);
            let body = owner
                .json(Method::POST, &api("tournaments"), &request)
                .await
                .ok_json();
            if valid {
                assert_eq!(body["round_minutes"], minutes, "{body}");
            } else {
                assert_eq!(body["result"], "Err", "{body}");
                assert_eq!(body["error"]["round_minutes_out_of_range"], true, "{body}");
            }
        }
    });
}

#[test]
fn participation_and_recorded_results_remain_available_between_rounds() {
    run(async {
        let (mut event, mut player, me) = event_with_a_player().await;
        let roster = player.get(&event.url("participants")).await.ok_json();
        assert_eq!(roster["me"], me, "{roster}");
        event.pair().await;
        event.start(1).await;
        let rounds = event.rounds_of(&mut player).await;
        for played in rounds["rounds"][0]["matches"].as_array().expect("Matches") {
            event
                .result(played["uuid"].as_str().expect("Match id"), [2, 0], 0)
                .await;
        }
        event.end(1).await;
        let personal = my_match(&event, &mut player).await;
        assert_eq!(personal["participant"], me, "{personal}");
        assert!(personal["round"].is_null(), "{personal}");
        let rounds = event.rounds_of(&mut player).await;
        let round = &rounds["rounds"][0];
        assert_eq!(round["state"], "Ended", "{rounds}");
        let played = round["matches"]
            .as_array()
            .expect("Matches")
            .iter()
            .find(|played| {
                played["seats"]
                    .as_array()
                    .expect("Seats")
                    .iter()
                    .any(|seat| seat["participant"] == me)
            })
            .expect("own Match");
        assert_eq!(played["result"]["games_won"], json!([2, 0]), "{rounds}");
        assert!(round["timer"].is_null(), "{rounds}");
    });
}

#[test]
fn match_play_context_is_limited_to_its_players_and_organizers() {
    run(async {
        let (mut event, mut player, me) = event_with_a_player().await;
        event.set_round_minutes(json!(50)).await;
        event.pair().await;
        event.start(1).await;
        let rounds = event.rounds().await;
        let matches = running(&rounds)["matches"].as_array().expect("Matches");
        let own = matches
            .iter()
            .find(|played| {
                played["seats"]
                    .as_array()
                    .expect("Seats")
                    .iter()
                    .any(|seat| seat["participant"] == me)
            })
            .expect("own Match");
        let guests = matches
            .iter()
            .find(|played| played["uuid"] != own["uuid"])
            .expect("Guest Match");
        let own_id = own["uuid"].as_str().expect("Match id");
        let url = event.url(&format!("matches/{own_id}/play"));
        let context = player.get(&url).await.ok_json();
        assert_eq!(context["participant"], me, "{context}");
        assert_eq!(
            context["round"]["matches"][0]["seats"], own["seats"],
            "{context}"
        );
        assert_eq!(
            context["round"]["timer"]["ends_at"],
            running(&rounds)["timer"]["ends_at"],
            "{context}"
        );
        run_out(&event, 1).await;
        let expired = player.get(&url).await.ok_json();
        assert_eq!(expired["round"]["timer"]["time_up"], true, "{expired}");
        assert_eq!(expired["round"]["state"], "Running", "{expired}");
        assert!(
            expired["round"]["matches"][0]["result"].is_null(),
            "{expired}"
        );
        let guest_url = event.url(&format!(
            "matches/{}/play",
            guests["uuid"].as_str().expect("Match id")
        ));
        assert!(!player.get(&guest_url).await.status.is_success());
        let guest_context = event.owner.get(&guest_url).await.ok_json();
        assert_eq!(
            guest_context["round"]["matches"][0]["seats"], guests["seats"],
            "{guest_context}"
        );
        let mut stranger = TestClient::logged_in(&create_account(Role::Member).await).await;
        assert!(!stranger.get(&url).await.status.is_success());
        assert!(!TestClient::new().get(&url).await.status.is_success());
        let mut other = Event::new("Three", 4).await;
        let wrong_tournament = other.url(&format!("matches/{own_id}/play"));
        assert!(!other.owner.get(&wrong_tournament).await.status.is_success());
    });
}
