//! Correcting Rounds: an Organizer lays out the preview by hand, and takes
//! back the latest ended Round while no later one started

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;

use crate::tests::harness::TestClient;
use crate::tests::harness::run;
use crate::tests::tournament_rounds::Event;
use crate::tests::tournament_rounds::matches;
use crate::tests::tournament_rounds::round;
use crate::tests::tournament_rounds::seated;

impl Event {
    /// Lay out the previewed Round `number` as the Owner, returning the body
    async fn arrange(&mut self, number: i64, matches: &[[&str; 2]], byes: &[&str]) -> Value {
        let url = self.url(&format!("rounds/{number}/layout"));
        self.owner
            .json(
                Method::PUT,
                &url,
                &json!({ "matches": matches, "byes": byes }),
            )
            .await
            .ok_json()
    }

    /// Take back Round `number` as the Owner, returning the body
    async fn take_back(&mut self, number: i64) -> Value {
        let url = self.url(&format!("rounds/{number}/take-back"));
        self.owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json()
    }

    /// Pair the next Round, set Seat 1 the winner of every Match and end it
    async fn play_and_end_round(&mut self) -> Value {
        let played = self.play_round().await;
        let number = played["number"].as_i64().expect("a number");
        self.end(number).await
    }
}

/// The Byes of a Round, as Participant uuids
fn byes(round: &Value) -> Vec<String> {
    round["matches"]
        .as_array()
        .expect("a list of matches")
        .iter()
        .filter(|played| played["table_number"].is_null())
        .flat_map(seated)
        .collect()
}

/// The Matches of a Round as Participant uuids in Seat order, top table first
fn layout(round: &Value) -> Vec<Vec<String>> {
    matches(round).into_iter().map(seated).collect()
}

#[test]
fn the_preview_as_an_organizer_laid_it_out_is_what_starts() {
    run(async {
        let mut event = Event::new("Three", 5).await;
        event.pair().await;
        let players = event.players.clone();
        let [a, b, c, d, e] = [0, 1, 2, 3, 4].map(|index| players[index].as_str());

        let arranged = event.arrange(1, &[[e, d], [a, c]], &[b]).await;
        assert_eq!(arranged["result"], "Ok", "{arranged}");

        let rounds = event.rounds().await;
        let preview = round(&rounds, 1);
        assert_eq!(preview["state"], "Previewed", "{rounds}");
        assert_eq!(
            layout(preview),
            vec![vec![e, d], vec![a, c]],
            "tables and Seats in the order laid out: {rounds}"
        );
        assert_eq!(byes(preview), vec![b], "{rounds}");
        let tables: Vec<&Value> = matches(preview)
            .into_iter()
            .map(|played| &played["table_number"])
            .collect();
        assert_eq!(tables, vec![&json!(1), &json!(2)], "{rounds}");

        event.start(1).await;
        let mut stranger = std::mem::replace(&mut event.stranger, TestClient::new());
        let seen = event.rounds_of(&mut stranger).await;
        let started = round(&seen, 1);
        assert_eq!(started["state"], "Running", "{seen}");
        assert_eq!(layout(started), vec![vec![e, d], vec![a, c]], "{seen}");
        assert_eq!(byes(started), vec![b], "{seen}");
    });
}

#[test]
fn a_layout_that_leaves_somebody_out_or_seats_somebody_twice_is_refused() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.pair().await;
        let before = event.rounds().await;
        let players = event.players.clone();
        let [a, b, c, _] = [0, 1, 2, 3].map(|index| players[index].as_str());

        let refused = event.arrange(1, &[[a, b], [b, c]], &[]).await;
        assert_eq!(refused["result"], "Err", "{refused}");
        assert_eq!(refused["error"]["seated_twice"], true, "{refused}");
        assert_eq!(refused["error"]["not_seated"], true, "{refused}");

        let stranger = event
            .arrange(
                1,
                &[[a, b], [c, "00000000-0000-0000-0000-000000000001"]],
                &[],
            )
            .await;
        assert_eq!(stranger["error"]["not_pairable"], true, "{stranger}");

        let url = event.url("rounds/1/layout");
        let short = event
            .owner
            .json(
                Method::PUT,
                &url,
                &json!({ "matches": [[a, b, c]], "byes": [players[3]] }),
            )
            .await
            .ok_json();
        assert_eq!(short["error"]["match_size"], true, "{short}");

        assert_eq!(event.rounds().await, before, "the preview stays as it was");
    });
}

#[test]
fn only_a_previewed_round_is_laid_out() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        let none = event.arrange(1, &[], &[]).await;
        assert_eq!(none["error"]["not_previewed"], true, "{none}");

        event.pair().await;
        event.start(1).await;
        let rounds = event.rounds().await;
        let running: Vec<Vec<String>> = layout(round(&rounds, 1));
        let tables: Vec<[&str; 2]> = running
            .iter()
            .map(|seats| [seats[1].as_str(), seats[0].as_str()])
            .collect();
        let refused = event.arrange(1, &tables, &[]).await;
        assert_eq!(refused["error"]["not_previewed"], true, "{refused}");
    });
}

#[test]
fn a_rematch_laid_out_by_hand_is_flagged() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        let first = event.play_round().await;
        event.end(1).await;
        event.pair().await;
        let rounds = event.rounds().await;
        assert!(
            matches(round(&rounds, 2))
                .iter()
                .all(|played| played["rematch"] == false),
            "four Participants pair Round 2 without a rematch: {rounds}"
        );

        let again = layout(&first);
        let tables: Vec<[&str; 2]> = again
            .iter()
            .map(|seats| [seats[0].as_str(), seats[1].as_str()])
            .collect();
        let arranged = event.arrange(2, &tables, &[]).await;
        assert_eq!(
            arranged["result"], "Ok",
            "a rematch is the Organizer's call: {arranged}"
        );

        let rounds = event.rounds().await;
        assert!(
            matches(round(&rounds, 2))
                .iter()
                .all(|played| played["rematch"] == true),
            "{rounds}"
        );
        assert!(
            matches(round(&rounds, 1))
                .iter()
                .all(|played| played["rematch"] == false),
            "{rounds}"
        );
    });
}

#[test]
fn nobody_but_an_organizer_corrects_rounds() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.pair().await;
        let rounds = event.rounds().await;
        let tables = layout(round(&rounds, 1));

        let url = event.url("rounds/1/layout");
        let arranged = event
            .stranger
            .json(Method::PUT, &url, &json!({ "matches": tables, "byes": [] }))
            .await;
        assert_eq!(arranged.status, StatusCode::BAD_REQUEST, "{arranged:?}");

        event.start(1).await;
        let rounds = event.rounds().await;
        for played in matches(round(&rounds, 1)) {
            let uuid = played["uuid"].as_str().expect("uuid").to_string();
            event.result(&uuid, [2, 0], 0).await;
        }
        event.end(1).await;
        let url = event.url("rounds/1/take-back");
        let taken = event.stranger.json(Method::POST, &url, &json!({})).await;
        assert_eq!(taken.status, StatusCode::BAD_REQUEST, "{taken:?}");
        let rounds = event.rounds().await;
        assert_eq!(round(&rounds, 1)["state"], "Ended", "{rounds}");
    });
}

#[test]
fn a_taken_back_round_runs_again_with_its_results() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.play_and_end_round().await;
        let ended = event.rounds().await;

        let taken = event.take_back(1).await;
        assert_eq!(taken["state"], "Swiss", "{taken}");
        let rounds = event.rounds().await;
        let again = round(&rounds, 1);
        assert_eq!(again["state"], "Running", "{rounds}");
        let results = |rounds: &Value| -> Vec<Value> {
            matches(round(rounds, 1))
                .into_iter()
                .map(|played| played["result"].clone())
                .collect()
        };
        assert_eq!(results(&rounds), results(&ended), "the Results stay");

        let first = matches(again)[0]["uuid"]
            .as_str()
            .expect("uuid")
            .to_string();
        event.result(&first, [0, 2], 0).await;
        let ended = event.end(1).await;
        assert_eq!(ended["state"], "Swiss", "{ended}");
    });
}

#[test]
fn taking_back_a_round_discards_the_preview_paired_on_it() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.play_and_end_round().await;
        event.pair().await;

        event.take_back(1).await;
        let rounds = event.rounds().await;
        assert_eq!(
            rounds["rounds"].as_array().expect("rounds").len(),
            1,
            "{rounds}"
        );
        assert_eq!(round(&rounds, 1)["state"], "Running", "{rounds}");
    });
}

#[test]
fn only_the_latest_ended_round_is_taken_back_while_no_later_one_started() {
    run(async {
        let mut event = Event::new("Three", 8).await;
        let running = event.play_round().await;
        let refused = event.take_back(1).await;
        assert_eq!(refused["error"]["not_ended"], true, "{refused}");
        assert!(running["number"] == 1);
        event.end(1).await;

        event.pair().await;
        event.start(2).await;
        let refused = event.take_back(1).await;
        assert_eq!(refused["error"]["later_round_started"], true, "{refused}");

        let rounds = event.rounds().await;
        for played in matches(round(&rounds, 2)) {
            let uuid = played["uuid"].as_str().expect("uuid").to_string();
            event.result(&uuid, [2, 0], 0).await;
        }
        event.end(2).await;
        let refused = event.take_back(1).await;
        assert_eq!(refused["error"]["later_round_started"], true, "{refused}");
        let taken = event.take_back(2).await;
        assert_eq!(taken["state"], "Swiss", "{taken}");

        let missing = event.take_back(7).await;
        assert_eq!(missing["error"]["not_ended"], true, "{missing}");
    });
}

#[test]
fn taking_back_the_last_swiss_round_reopens_a_finished_tournament() {
    run(async {
        let mut event = Event::new("One", 4).await;
        let url = event.url("swiss-rounds");
        event
            .owner
            .json(Method::PUT, &url, &json!({ "swiss_rounds": 1 }))
            .await
            .ok_json();
        let ended = event.play_and_end_round().await;
        assert_eq!(ended["state"], "Finished", "{ended}");

        let taken = event.take_back(1).await;
        assert_eq!(taken["state"], "Swiss", "{taken}");
        assert_eq!(event.state().await, "Swiss");

        let ended = event.end(1).await;
        assert_eq!(ended["state"], "Finished", "{ended}");
    });
}

#[test]
fn a_cancelled_tournament_takes_back_no_round() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.play_and_end_round().await;
        let url = event.url("cancel");
        event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();

        let refused = event.take_back(1).await;
        assert_eq!(refused["error"]["tournament_over"], true, "{refused}");
    });
}
