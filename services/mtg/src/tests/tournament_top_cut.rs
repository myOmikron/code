//! The one-on-one Top cut: after the last Swiss Round the best Participants
//! play single elimination, seeded by the standings, until the final finishes
//! the Tournament

use galvyn::core::re_exports::axum::http::Method;
use serde_json::Value;
use serde_json::json;

use crate::tests::harness::api;
use crate::tests::harness::run;
use crate::tests::tournament_rounds::Event;
use crate::tests::tournament_rounds::matches;
use crate::tests::tournament_rounds::round;
use crate::tests::tournament_rounds::seated;

/// Set the Top cut and its best-of as the Owner, returning the body
pub(super) async fn set_top_cut(event: &mut Event, top_cut: Value, best_of: Value) -> Value {
    let mut request = event.settings.clone();
    request["top_cut"] = top_cut;
    request["top_cut_best_of"] = best_of;
    let url = api(&format!("tournaments/{}", event.tournament));
    let body = event
        .owner
        .json(Method::PUT, &url, &request)
        .await
        .ok_json();
    event.settings = request;
    body
}

/// Set how many Swiss Rounds are played, returning the body
pub(super) async fn set_swiss_rounds(event: &mut Event, swiss_rounds: i64) -> Value {
    let url = event.url("swiss-rounds");
    event
        .owner
        .json(Method::PUT, &url, &json!({ "swiss_rounds": swiss_rounds }))
        .await
        .ok_json()
}

/// Drop `participant` as the Owner
async fn drop_out(event: &mut Event, participant: &str) {
    let url = event.url(&format!("participants/{participant}/drop"));
    event
        .owner
        .json(Method::POST, &url, &json!({}))
        .await
        .ok_json();
}

/// Take back Round `number` as the Owner, returning the body
async fn take_back(event: &mut Event, number: i64) -> Value {
    let url = event.url(&format!("rounds/{number}/take-back"));
    event
        .owner
        .json(Method::POST, &url, &json!({}))
        .await
        .ok_json()
}

/// The Participants by their place in the standings: seed 1 first
pub(super) async fn standing_order(event: &mut Event) -> Vec<String> {
    event.standings().await["standings"]
        .as_array()
        .expect("standings")
        .iter()
        .map(|line| line["participant"].as_str().expect("uuid").to_string())
        .collect()
}

/// The Matches of Round `number` as Seat lists of seeds, 1 for the best
async fn seeded_tables(event: &mut Event, seeds: &[String], number: i64) -> Vec<Vec<usize>> {
    let rounds = event.rounds().await;
    matches(round(&rounds, number))
        .into_iter()
        .map(|played| {
            seated(played)
                .iter()
                .map(|participant| {
                    seeds
                        .iter()
                        .position(|seed| seed == participant)
                        .expect("a seed")
                        + 1
                })
                .collect()
        })
        .collect()
}

/// An event of `players` Guests with a Top 4 played best of `best_of`, after one Swiss Round
///
/// Answers the seeds the Swiss Round left.
async fn after_swiss(players: usize, best_of: &str) -> (Event, Vec<String>) {
    let mut event = Event::new("Three", players).await;
    set_top_cut(&mut event, json!("Top4"), json!(best_of)).await;
    set_swiss_rounds(&mut event, 1).await;
    event.play_round().await;
    let ended = event.end(1).await;
    assert_eq!(ended["state"], "TopCut", "{ended}");
    let seeds = standing_order(&mut event).await;
    (event, seeds)
}

/// Pair and start the next Round, returning its number
async fn pair_and_start(event: &mut Event) -> i64 {
    let number = event.pair().await["number"].as_i64().expect("a number");
    event.start(number).await;
    number
}

/// Let Seat 1 win every Match of Round `number` by `games` to 0, then end it
async fn seat_1_wins(event: &mut Event, number: i64, games: i64) -> Value {
    let rounds = event.rounds().await;
    for played in matches(round(&rounds, number)) {
        let uuid = played["uuid"].as_str().expect("uuid").to_string();
        event.result(&uuid, [games, 0], 0).await;
    }
    event.end(number).await
}

#[test]
fn the_top_cut_is_seeded_by_the_standings_and_the_final_finishes_the_tournament() {
    run(async {
        let (mut event, seeds) = after_swiss(8, "One").await;

        let rounds = event.rounds().await;
        assert_eq!(rounds["top_cut_size"], 4, "{rounds}");
        let semifinals = pair_and_start(&mut event).await;
        assert_eq!(semifinals, 2);
        let rounds = event.rounds().await;
        assert_eq!(round(&rounds, 2)["stage"], "TopCut", "{rounds}");
        assert_eq!(round(&rounds, 1)["stage"], "Swiss", "{rounds}");
        assert_eq!(
            seeded_tables(&mut event, &seeds, 2).await,
            vec![vec![1, 4], vec![2, 3]]
        );

        let ended = seat_1_wins(&mut event, 2, 1).await;
        assert_eq!(ended["state"], "TopCut", "{ended}");
        let fin = pair_and_start(&mut event).await;
        assert_eq!(
            seeded_tables(&mut event, &seeds, fin).await,
            vec![vec![1, 2]]
        );

        let ended = seat_1_wins(&mut event, fin, 1).await;
        assert_eq!(ended["state"], "Finished", "{ended}");
        assert_eq!(event.state().await, "Finished");
        // The cut does not count for the standings.
        assert_eq!(standing_order(&mut event).await, seeds);
    });
}

#[test]
fn without_a_top_cut_the_last_swiss_round_finishes_the_tournament() {
    run(async {
        let mut event = Event::new("One", 4).await;
        set_swiss_rounds(&mut event, 1).await;
        event.play_round().await;
        let ended = event.end(1).await;
        assert_eq!(ended["state"], "Finished", "{ended}");
        let rounds = event.rounds().await;
        assert!(rounds["top_cut_size"].is_null(), "{rounds}");
    });
}

#[test]
fn a_drop_before_the_cut_starts_is_replaced_by_the_next_in_the_standings() {
    run(async {
        let (mut event, seeds) = after_swiss(8, "One").await;
        event.pair().await;

        drop_out(&mut event, &seeds[1]).await;
        let rounds = event.rounds().await;
        assert_eq!(
            rounds["rounds"].as_array().map(Vec::len),
            Some(1),
            "{rounds}"
        );

        pair_and_start(&mut event).await;
        assert_eq!(
            seeded_tables(&mut event, &seeds, 2).await,
            vec![vec![1, 5], vec![3, 4]]
        );
    });
}

#[test]
fn a_drop_during_the_cut_loses_the_running_match_and_the_opponent_advances() {
    run(async {
        let (mut event, seeds) = after_swiss(8, "Three").await;
        pair_and_start(&mut event).await;

        drop_out(&mut event, &seeds[0]).await;
        let rounds = event.rounds().await;
        let semifinal = matches(round(&rounds, 2))[0].clone();
        assert_eq!(semifinal["result"]["games_won"], json!([0, 2]), "{rounds}");
        assert_eq!(semifinal["result"]["state"], "Confirmed", "{rounds}");

        let other = matches(round(&rounds, 2))[1]["uuid"]
            .as_str()
            .expect("uuid")
            .to_string();
        event.result(&other, [2, 1], 0).await;
        event.end(2).await;
        pair_and_start(&mut event).await;
        assert_eq!(seeded_tables(&mut event, &seeds, 3).await, vec![vec![2, 4]]);
    });
}

#[test]
fn a_drop_during_the_cut_announces_the_forfeited_result() {
    run(async {
        let (mut event, seeds) = after_swiss(8, "Three").await;
        pair_and_start(&mut event).await;
        let url = event.url("events");
        let mut stream = event.stranger.follow(&url).await;

        drop_out(&mut event, &seeds[0]).await;

        let heard = stream.kinds().await;
        assert!(
            heard.iter().any(|kind| kind == "ResultSet"),
            "the forfeit is announced: {heard:?}"
        );
        assert!(
            heard.iter().any(|kind| kind == "ParticipantsChanged"),
            "{heard:?}"
        );
    });
}

#[test]
fn a_top_cut_match_is_played_to_its_own_best_of_and_has_a_winner() {
    run(async {
        let (mut event, _) = after_swiss(4, "One").await;
        pair_and_start(&mut event).await;
        let rounds = event.rounds().await;
        let played = matches(round(&rounds, 2))[0]["uuid"]
            .as_str()
            .expect("uuid")
            .to_string();
        let url = event.url(&format!("matches/{played}/result"));

        for (games_won, drawn) in [([0, 0], 0), ([0, 0], 1), ([2, 0], 0)] {
            let refused = event
                .owner
                .json(
                    Method::PUT,
                    &url,
                    &json!({ "games_won": games_won, "games_drawn": drawn }),
                )
                .await
                .ok_json();
            assert_eq!(refused["error"]["invalid_score"], true, "{refused}");
        }
        assert_eq!(event.result(&played, [0, 1], 0).await, Value::Null);
    });
}

#[test]
fn the_top_cut_changes_until_the_swiss_rounds_are_over() {
    run(async {
        let mut event = Event::new("Three", 8).await;
        set_swiss_rounds(&mut event, 1).await;
        let number = event.pair().await["number"].as_i64().expect("a number");
        event.start(number).await;

        let changed = set_top_cut(&mut event, json!("Top8"), json!("Three")).await;
        assert_eq!(changed["top_cut"], "Top8", "{changed}");
        let changed = set_top_cut(&mut event, json!("Top4"), json!("One")).await;
        assert_eq!(changed["top_cut_best_of"], "One", "{changed}");

        seat_1_wins(&mut event, number, 2).await;
        assert_eq!(event.state().await, "TopCut");
        let locked = set_top_cut(&mut event, json!("Top8"), json!("One")).await;
        assert_eq!(locked["error"]["top_cut_locked"], true, "{locked}");
        let unchanged = set_top_cut(&mut event, json!("Top4"), json!("One")).await;
        assert_eq!(unchanged["top_cut"], "Top4", "{unchanged}");
        let swiss = set_swiss_rounds(&mut event, 2).await;
        assert_eq!(swiss["error"]["out_of_range"], true, "{swiss}");
    });
}

#[test]
fn a_top_cut_needs_its_best_of() {
    run(async {
        let mut event = Event::new("Three", 2).await;
        let refused = set_top_cut(&mut event, json!("Top8"), Value::Null).await;
        assert_eq!(
            refused["error"]["top_cut_best_of_mismatch"], true,
            "{refused}"
        );
    });
}

#[test]
fn a_top_8_of_seven_plays_a_top_4() {
    run(async {
        let mut event = Event::new("One", 7).await;
        set_top_cut(&mut event, json!("Top8"), json!("One")).await;
        set_swiss_rounds(&mut event, 1).await;
        event.play_round().await;
        event.end(1).await;
        let seeds = standing_order(&mut event).await;

        let rounds = event.rounds().await;
        assert_eq!(rounds["top_cut_size"], 4, "{rounds}");
        pair_and_start(&mut event).await;
        assert_eq!(
            seeded_tables(&mut event, &seeds, 2).await,
            vec![vec![1, 4], vec![2, 3]]
        );
    });
}

#[test]
fn taking_back_a_round_reopens_the_part_it_belongs_to() {
    run(async {
        let (mut event, _) = after_swiss(4, "One").await;
        let semifinals = pair_and_start(&mut event).await;
        seat_1_wins(&mut event, semifinals, 1).await;
        let fin = pair_and_start(&mut event).await;
        let ended = seat_1_wins(&mut event, fin, 1).await;
        assert_eq!(ended["state"], "Finished", "{ended}");

        let taken_back = take_back(&mut event, fin).await;
        assert_eq!(taken_back["state"], "TopCut", "{taken_back}");
        let ended = event.end(fin).await;
        assert_eq!(ended["state"], "Finished", "{ended}");

        let (mut event, _) = after_swiss(4, "One").await;
        event.pair().await;
        let taken_back = take_back(&mut event, 1).await;
        assert_eq!(taken_back["state"], "Swiss", "{taken_back}");
        let rounds = event.rounds().await;
        assert_eq!(
            rounds["rounds"].as_array().map(Vec::len),
            Some(1),
            "{rounds}"
        );
    });
}

#[test]
fn a_top_cut_preview_keeps_its_seeding() {
    run(async {
        let (mut event, seeds) = after_swiss(4, "One").await;
        event.pair().await;
        let url = event.url("rounds/2/layout");
        let refused = event
            .owner
            .json(
                Method::PUT,
                &url,
                &json!({ "matches": [[seeds[0], seeds[1]], [seeds[2], seeds[3]]], "byes": [] }),
            )
            .await
            .ok_json();
        assert_eq!(refused["error"]["top_cut"], true, "{refused}");
    });
}
