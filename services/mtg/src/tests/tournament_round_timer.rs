//! Round timer controls: Organizers pause, resume, adjust and reset the round
//! timer of the running Round, and everybody following hears of it

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::rorm::Database;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::AffectedRows;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value as SqlValue;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::run;
use crate::tests::tournament_rounds::Event;
use crate::tests::tournament_rounds::round;

/// An Event of four Guests with a 50 minute round timer and Round 1 running
async fn running_event() -> Event {
    let mut event = Event::new("Three", 4).await;
    event.set_round_minutes(json!(50)).await;
    event.pair().await;
    event.start(1).await;
    event
}

/// Send `body` to the round timer of Round `number` as `client`
async fn set_timer(
    event: &Event,
    client: &mut TestClient,
    number: i64,
    body: Value,
) -> TestResponse {
    client
        .json(
            Method::PUT,
            &event.url(&format!("rounds/{number}/timer")),
            &body,
        )
        .await
}

/// Send `body` to the round timer of Round 1 as the Owner, returning the answer
async fn owner_sets(event: &mut Event, body: Value) -> Value {
    let url = event.url("rounds/1/timer");
    event.owner.json(Method::PUT, &url, &body).await.ok_json()
}

/// The round timer of Round 1 as the Owner reads it
async fn timer(event: &mut Event) -> Value {
    let rounds = event.rounds().await;
    round(&rounds, 1)["timer"].clone()
}

/// Seconds left on `timer`
fn remaining(timer: &Value) -> i64 {
    timer["remaining_seconds"].as_i64().expect("seconds left")
}

/// Moves the stored pause and end of Round 1 ten minutes into the past, as if it was paused that long ago
async fn paused_ten_minutes_ago(event: &Event) {
    let tournament: Uuid = event.tournament.parse().expect("a uuid");
    let mut tx = Database::global()
        .start_transaction()
        .await
        .expect("start a transaction");
    (&mut tx)
        .execute::<All>(
            "UPDATE tournament_round \
             SET timer_paused_at = timer_paused_at - interval '600 seconds', \
                 timer_ends_at = timer_ends_at - interval '600 seconds' \
             WHERE tournament = $1 AND number = 1"
                .to_string(),
            vec![SqlValue::Uuid(tournament)],
        )
        .await
        .expect("run the statement");
    tx.commit().await.expect("commit");
}

#[test]
fn a_paused_timer_holds_its_time_left_across_reads() {
    run(async {
        let mut event = running_event().await;

        let paused = owner_sets(&mut event, json!({ "action": "Pause" })).await;
        assert_eq!(paused["paused"], true, "{paused}");
        paused_ten_minutes_ago(&event).await;

        let read = timer(&mut event).await;
        assert_eq!(read["paused"], true, "{read}");
        assert_eq!(remaining(&read), remaining(&paused), "{read}");
        assert_eq!(read["time_up"], false, "{read}");
    });
}

#[test]
fn resuming_gives_back_the_time_the_pause_held() {
    run(async {
        let mut event = running_event().await;
        let paused = owner_sets(&mut event, json!({ "action": "Pause" })).await;
        paused_ten_minutes_ago(&event).await;

        let resumed = owner_sets(&mut event, json!({ "action": "Resume" })).await;

        assert_eq!(resumed["paused"], false, "{resumed}");
        let left = remaining(&resumed);
        assert!(
            left <= remaining(&paused) && left >= remaining(&paused) - 2,
            "the ten paused minutes are not lost: {resumed}"
        );
    });
}

#[test]
fn adjusting_adds_and_takes_away_time_down_to_time_up() {
    run(async {
        let mut event = running_event().await;
        let paused = owner_sets(&mut event, json!({ "action": "Pause" })).await;
        let left = remaining(&paused);

        let longer = owner_sets(
            &mut event,
            json!({ "action": "Adjust", "delta_seconds": 300 }),
        )
        .await;
        assert_eq!(remaining(&longer), left + 300, "{longer}");

        let shorter = owner_sets(
            &mut event,
            json!({ "action": "Adjust", "delta_seconds": -60 }),
        )
        .await;
        assert_eq!(remaining(&shorter), left + 240, "{shorter}");

        let gone = owner_sets(
            &mut event,
            json!({ "action": "Adjust", "delta_seconds": -99_999 }),
        )
        .await;
        assert_eq!(remaining(&gone), 0, "{gone}");
        assert_eq!(gone["time_up"], true, "{gone}");

        let more = owner_sets(
            &mut event,
            json!({ "action": "Adjust", "delta_seconds": 60 }),
        )
        .await;
        assert_eq!(remaining(&more), 60, "{more}");
        assert_eq!(more["time_up"], false, "{more}");
    });
}

#[test]
fn resetting_runs_the_full_length_again() {
    run(async {
        let mut event = running_event().await;
        owner_sets(&mut event, json!({ "action": "Pause" })).await;
        owner_sets(
            &mut event,
            json!({ "action": "Adjust", "delta_seconds": -600 }),
        )
        .await;

        let reset = owner_sets(&mut event, json!({ "action": "Reset" })).await;

        assert_eq!(reset["paused"], false, "{reset}");
        assert_eq!(reset["length_seconds"], 3000, "{reset}");
        assert!(remaining(&reset) >= 2999, "{reset}");
        let read = timer(&mut event).await;
        assert_eq!(read["paused"], false, "{read}");
        assert!(remaining(&read) >= 2998, "{read}");
    });
}

#[test]
fn only_a_running_round_with_a_timer_has_one_to_change() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.set_round_minutes(json!(50)).await;
        event.pair().await;

        let previewed = owner_sets(&mut event, json!({ "action": "Pause" })).await;
        assert_eq!(previewed["error"]["not_running"], true, "{previewed}");

        let mut untimed = Event::new("Three", 4).await;
        untimed.pair().await;
        untimed.start(1).await;
        let url = untimed.url("rounds/1/timer");
        let none = untimed
            .owner
            .json(Method::PUT, &url, &json!({ "action": "Pause" }))
            .await
            .ok_json();
        assert_eq!(none["error"]["no_timer"], true, "{none}");
    });
}

#[test]
fn an_ended_round_keeps_its_timer_as_it_was() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.set_round_minutes(json!(50)).await;
        event.play_round().await;
        event.end(1).await;

        let ended = owner_sets(&mut event, json!({ "action": "Reset" })).await;
        assert_eq!(ended["error"]["not_running"], true, "{ended}");
    });
}

#[test]
fn nobody_but_an_organizer_changes_the_timer() {
    run(async {
        let mut event = running_event().await;
        let before = timer(&mut event).await;
        let mut stranger = TestClient::new();
        std::mem::swap(&mut stranger, &mut event.stranger);

        let refused = set_timer(&event, &mut stranger, 1, json!({ "action": "Pause" })).await;
        assert_eq!(refused.status, StatusCode::BAD_REQUEST, "{refused:?}");
        let anonymous = set_timer(
            &event,
            &mut TestClient::new(),
            1,
            json!({ "action": "Pause" }),
        )
        .await;
        assert_ne!(anonymous.status, StatusCode::OK, "{anonymous:?}");

        let after = timer(&mut event).await;
        assert_eq!(after["paused"], false, "{after}");
        assert_eq!(after["ends_at"], before["ends_at"], "{after}");
    });
}

#[test]
fn a_taken_back_round_drops_its_paused_timer() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.set_round_minutes(json!(50)).await;
        event.play_round().await;
        owner_sets(&mut event, json!({ "action": "Pause" })).await;
        event.end(1).await;

        let url = event.url("rounds/1/take-back");
        event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();

        assert!(timer(&mut event).await.is_null());
        let tournament: Uuid = event.tournament.parse().expect("a uuid");
        let still_paused = Database::global()
            .execute::<AffectedRows>(
                "UPDATE tournament_round SET number = number \
                 WHERE tournament = $1 AND timer_paused_at IS NOT NULL"
                    .to_string(),
                vec![SqlValue::Uuid(tournament)],
            )
            .await
            .expect("run the statement");
        assert_eq!(still_paused, 0);
    });
}

#[test]
fn followers_hear_the_timer_change() {
    run(async {
        let mut event = running_event().await;
        let mut watching = TestClient::new();
        let mut stream = watching.follow(&event.url("events")).await;
        assert_eq!(stream.status, StatusCode::OK);

        owner_sets(&mut event, json!({ "action": "Pause" })).await;

        let heard = stream.next_event().await.expect("an event");
        assert_eq!(heard, json!({ "kind": "TimerChanged", "round": 1 }));
        assert_eq!(stream.kinds().await, Vec::<String>::new());
    });
}
