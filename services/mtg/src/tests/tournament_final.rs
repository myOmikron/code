//! The multiplayer Top cut: after the last Swiss Round the Table size best
//! play one final Match, Seats by seed, which finishes the Tournament

use galvyn::core::re_exports::axum::http::Method;
use serde_json::Value;
use serde_json::json;
use url::Url;

use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::tournaments::create;
use crate::tests::tournaments::settings;

/// An Owner running a TopDeck Tournament at Table size 4 of Guests with a final
struct Final {
    /// Logged in as the Owner
    owner: TestClient,
    /// The Tournament's uuid
    tournament: String,
}

impl Final {
    /// A public TopDeck Tournament at Table size 4 with a final, one Swiss Round and `players` Guests
    async fn new(players: usize) -> Self {
        let mut owner = TestClient::logged_in(&create_account(Role::Member).await).await;
        let mut request = settings("Public");
        assert_eq!(request["table_size"], 4);
        request["top_cut"] = json!("Final");
        request["top_cut_best_of"] = Value::Null;
        let created = create(&mut owner, &request).await;
        assert_eq!(created["top_cut"], "Final", "{created}");
        let tournament = created["uuid"].as_str().expect("uuid").to_string();
        let mut event = Self { owner, tournament };
        for index in 0..players {
            event
                .post_json(
                    "participants/guests",
                    &json!({ "name": format!("Guest {index}") }),
                )
                .await;
        }
        let url = event.url("swiss-rounds");
        event
            .owner
            .json(Method::PUT, &url, &json!({ "swiss_rounds": 1 }))
            .await
            .ok_json();
        event
    }

    /// The url of `path` below the Tournament
    fn url(&self, path: &str) -> Url {
        api(&format!("tournaments/{}/{path}", self.tournament))
    }

    /// POST `body` to `path` as the Owner, returning the answer
    async fn post_json(&mut self, path: &str, body: &Value) -> Value {
        let url = self.url(path);
        self.owner.json(Method::POST, &url, body).await.ok_json()
    }

    /// POST `{}` to `path` as the Owner, returning the answer
    async fn post(&mut self, path: &str) -> Value {
        self.post_json(path, &json!({})).await
    }

    /// The Rounds as the Owner reads them
    async fn rounds(&mut self) -> Value {
        let url = self.url("rounds");
        self.owner.get(&url).await.ok_json()
    }

    /// Round `number` as the Owner reads it
    async fn round(&mut self, number: i64) -> Value {
        self.rounds().await["rounds"]
            .as_array()
            .expect("rounds")
            .iter()
            .find(|round| round["number"] == number)
            .expect("the round")
            .clone()
    }

    /// Pair and start the next Round, returning its number
    async fn pair_and_start(&mut self) -> i64 {
        let number = self.post("rounds").await["number"]
            .as_i64()
            .expect("a number");
        self.post(&format!("rounds/{number}/start")).await;
        number
    }

    /// Set the Result of `played` to `games_won` per Seat and `games_drawn`, returning the answer
    async fn result(&mut self, played: &Value, games_won: &[i64], games_drawn: i64) -> Value {
        let uuid = played["uuid"].as_str().expect("uuid");
        let url = self.url(&format!("matches/{uuid}/result"));
        self.owner
            .json(
                Method::PUT,
                &url,
                &json!({ "games_won": games_won, "games_drawn": games_drawn }),
            )
            .await
            .ok_json()
    }

    /// Play the one Swiss Round, Seat 1 winning every Match, and end it
    ///
    /// Answers the seeds it left, the best first.
    async fn play_swiss(&mut self) -> Vec<String> {
        let number = self.pair_and_start().await;
        let round = self.round(number).await;
        for played in matches(&round) {
            let seats = played["seats"].as_array().expect("seats").len();
            let games_won: Vec<i64> = (0..seats).map(|seat| i64::from(seat == 0)).collect();
            self.result(played, &games_won, 0).await;
        }
        let ended = self.post(&format!("rounds/{number}/end")).await;
        assert_eq!(ended["state"], "TopCut", "{ended}");
        let url = self.url("standings");
        self.owner.get(&url).await.ok_json()["standings"]
            .as_array()
            .expect("standings")
            .iter()
            .map(|line| line["participant"].as_str().expect("uuid").to_string())
            .collect()
    }
}

/// The Matches of a Round, Byes left out
fn matches(round: &Value) -> Vec<&Value> {
    round["matches"]
        .as_array()
        .expect("matches")
        .iter()
        .filter(|played| !played["table_number"].is_null())
        .collect()
}

/// The Participants of `played` by Seat
fn seated(played: &Value) -> Vec<String> {
    played["seats"]
        .as_array()
        .expect("seats")
        .iter()
        .map(|seat| seat["participant"].as_str().expect("uuid").to_string())
        .collect()
}

/// The one Match of the final Round `number`
async fn the_final(event: &mut Final, number: i64) -> Value {
    let round = event.round(number).await;
    assert_eq!(round["stage"], "TopCut", "{round}");
    let tables = matches(&round);
    assert_eq!(tables.len(), 1, "{round}");
    assert_eq!(
        round["matches"].as_array().map(Vec::len),
        Some(1),
        "no Byes: {round}"
    );
    tables[0].clone()
}

#[test]
fn the_final_seats_the_best_by_seed_and_finishes_the_tournament() {
    run(async {
        let mut event = Final::new(12).await;
        let seeds = event.play_swiss().await;
        assert_eq!(event.rounds().await["top_cut_size"], 4);

        let number = event.pair_and_start().await;
        assert_eq!(number, 2);
        let played = the_final(&mut event, number).await;
        assert_eq!(seated(&played), seeds[..4].to_vec(), "{played}");
        assert!(event.rounds().await["top_cut_winner"].is_null());

        event.result(&played, &[0, 0, 1, 0], 0).await;
        assert_eq!(event.rounds().await["top_cut_winner"], json!(seeds[2]));
        let ended = event.post(&format!("rounds/{number}/end")).await;
        assert_eq!(ended["state"], "Finished", "{ended}");

        let refused = event.post("rounds").await;
        assert_eq!(refused["error"]["tournament_over"], true, "{refused}");
    });
}

#[test]
fn a_drawn_final_goes_to_the_top_seed() {
    run(async {
        let mut event = Final::new(8).await;
        let seeds = event.play_swiss().await;
        let number = event.pair_and_start().await;
        let played = the_final(&mut event, number).await;

        for (games_won, games_drawn) in [(vec![1, 1, 0, 0], 0), (vec![2, 0, 0, 0], 0)] {
            let refused = event.result(&played, &games_won, games_drawn).await;
            assert_eq!(
                refused["error"]["invalid_score"], true,
                "{games_won:?}: {refused}"
            );
        }
        event.result(&played, &[0, 0, 0, 0], 1).await;
        assert_eq!(event.rounds().await["top_cut_winner"], json!(seeds[0]));
        let ended = event.post(&format!("rounds/{number}/end")).await;
        assert_eq!(ended["state"], "Finished", "{ended}");
    });
}

#[test]
fn a_drop_during_the_final_does_not_stop_the_match() {
    run(async {
        let mut event = Final::new(8).await;
        let seeds = event.play_swiss().await;
        let number = event.pair_and_start().await;

        event.post(&format!("participants/{}/drop", seeds[0])).await;
        let round = event.round(number).await;
        assert_eq!(round["state"], "Running", "{round}");
        let played = the_final(&mut event, number).await;
        assert!(played["result"].is_null(), "the rest play on: {played}");
        assert_eq!(seated(&played), seeds[..4].to_vec(), "{played}");

        // The dropped top seed lost: the draw goes to the next seed.
        event.result(&played, &[0, 0, 0, 0], 1).await;
        assert_eq!(event.rounds().await["top_cut_winner"], json!(seeds[1]));
        let ended = event.post(&format!("rounds/{number}/end")).await;
        assert_eq!(ended["state"], "Finished", "{ended}");
    });
}

#[test]
fn an_organizer_cannot_name_a_participant_who_dropped_as_winner_of_the_final() {
    run(async {
        let mut event = Final::new(8).await;
        let seeds = event.play_swiss().await;
        let number = event.pair_and_start().await;
        let played = the_final(&mut event, number).await;
        event.post(&format!("participants/{}/drop", seeds[2])).await;

        let refused = event.result(&played, &[0, 0, 1, 0], 0).await;
        assert_eq!(refused["error"]["dropped_winner"], true, "{refused}");
        assert!(event.rounds().await["top_cut_winner"].is_null());

        event.result(&played, &[0, 1, 0, 0], 0).await;
        assert_eq!(event.rounds().await["top_cut_winner"], json!(seeds[1]));
    });
}

#[test]
fn a_participant_cannot_report_one_who_dropped_as_winner_of_the_final() {
    run(async {
        let mut event = Final::new(3).await;
        let player = create_account(Role::Member).await;
        let added = event
            .post_json(
                "participants/accounts",
                &json!({ "username": player.username }),
            )
            .await;
        let mine = added["uuid"].as_str().expect("uuid").to_string();
        let mut client = TestClient::logged_in(&player).await;
        event.play_swiss().await;
        let number = event.pair_and_start().await;
        let played = the_final(&mut event, number).await;
        let seats = seated(&played);
        let dropped = seats
            .iter()
            .position(|seat| *seat != mine)
            .expect("a Guest in the final");
        event
            .post(&format!("participants/{}/drop", seats[dropped]))
            .await;

        let games_won: Vec<i64> = (0..seats.len())
            .map(|seat| i64::from(seat == dropped))
            .collect();
        let uuid = played["uuid"].as_str().expect("uuid");
        let url = event.url(&format!("matches/{uuid}/report"));
        let refused = client
            .json(
                Method::POST,
                &url,
                &json!({ "games_won": games_won, "games_drawn": 0 }),
            )
            .await
            .ok_json();
        assert_eq!(refused["error"]["dropped_winner"], true, "{refused}");
    });
}

#[test]
fn a_drop_before_the_final_is_replaced_by_the_next_in_the_standings() {
    run(async {
        let mut event = Final::new(8).await;
        let seeds = event.play_swiss().await;
        event.post(&format!("participants/{}/drop", seeds[1])).await;

        let number = event.pair_and_start().await;
        let played = the_final(&mut event, number).await;
        assert_eq!(
            seated(&played),
            vec![
                seeds[0].clone(),
                seeds[2].clone(),
                seeds[3].clone(),
                seeds[4].clone()
            ],
            "{played}"
        );
    });
}

#[test]
fn the_final_shrinks_to_the_participants_left() {
    run(async {
        let mut event = Final::new(4).await;
        let seeds = event.play_swiss().await;
        event.post(&format!("participants/{}/drop", seeds[3])).await;
        assert_eq!(event.rounds().await["top_cut_size"], 3);

        let number = event.pair_and_start().await;
        let played = the_final(&mut event, number).await;
        assert_eq!(seated(&played), seeds[..3].to_vec(), "{played}");
    });
}

#[test]
fn a_final_is_multiplayer_only_and_one_game() {
    run(async {
        let mut owner = TestClient::logged_in(&create_account(Role::Member).await).await;
        let url = api("tournaments");

        let mut request = settings("Public");
        request["top_cut"] = json!("Final");
        request["top_cut_best_of"] = json!("Three");
        let refused = owner.json(Method::POST, &url, &request).await.ok_json();
        assert_eq!(
            refused["error"]["top_cut_best_of_mismatch"], true,
            "{refused}"
        );

        request["top_cut"] = json!("Top4");
        request["top_cut_best_of"] = Value::Null;
        let refused = owner.json(Method::POST, &url, &request).await.ok_json();
        assert_eq!(refused["error"]["top_cut_mismatch"], true, "{refused}");

        let mut request = settings("Public");
        request["table_size"] = json!(2);
        request["ruleset"] = json!("Mtr");
        request["format"] = json!("modern");
        request["best_of"] = json!("Three");
        request["top_cut"] = json!("Final");
        request["top_cut_best_of"] = Value::Null;
        let refused = owner.json(Method::POST, &url, &request).await.ok_json();
        assert_eq!(refused["error"]["top_cut_mismatch"], true, "{refused}");
    });
}
