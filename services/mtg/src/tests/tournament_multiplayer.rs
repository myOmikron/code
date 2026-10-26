//! Running a multiplayer Tournament under TopDeck: full Matches, then one
//! smaller Match or Byes, a winner or a draw per Match, and TopDeck's Tiebreakers;
//! and under the Multiplayer Addendum: smaller Matches instead of Byes and its
//! Tiebreakers

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

/// An Owner running a TopDeck Tournament at Table size 4 of Guests
struct Pods {
    /// Logged in as the Owner
    owner: TestClient,
    /// The Tournament's uuid
    tournament: String,
}

impl Pods {
    /// A public TopDeck Tournament at Table size 4 with `players` Guests
    async fn new(players: usize) -> Self {
        Self::under("TopDeck", players).await
    }

    /// A public Tournament under `ruleset` at Table size 4 with `players` Guests
    async fn under(ruleset: &str, players: usize) -> Self {
        let mut owner = TestClient::logged_in(&create_account(Role::Member).await).await;
        let mut request = settings("Public");
        assert_eq!(request["table_size"], 4);
        request["ruleset"] = json!(ruleset);
        let created = create(&mut owner, &request).await;
        let tournament = created["uuid"].as_str().expect("uuid").to_string();
        let mut pods = Self { owner, tournament };
        for index in 0..players {
            let url = pods.url("participants/guests");
            pods.owner
                .json(
                    Method::POST,
                    &url,
                    &json!({ "name": format!("Guest {index}") }),
                )
                .await
                .ok_json();
        }
        pods
    }

    /// The url of `path` below the Tournament
    fn url(&self, path: &str) -> Url {
        api(&format!("tournaments/{}/{path}", self.tournament))
    }

    /// POST `{}` to `path` as the Owner, returning the body
    async fn post(&mut self, path: &str) -> Value {
        let url = self.url(path);
        self.owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json()
    }

    /// Pair and start the next Round, returning it as the Owner reads it
    async fn start_round(&mut self) -> Value {
        let number = self.post("rounds").await["number"]
            .as_i64()
            .expect("a number");
        self.post(&format!("rounds/{number}/start")).await;
        let url = self.url("rounds");
        let rounds = self.owner.get(&url).await.ok_json();
        rounds["rounds"]
            .as_array()
            .expect("rounds")
            .iter()
            .find(|round| round["number"] == number)
            .expect("the round")
            .clone()
    }

    /// Set the Result of `played` to `games_won` per Seat and `games_drawn`, returning the body
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

    /// The standings as the Owner reads them
    async fn standings(&mut self) -> Value {
        let url = self.url("standings");
        self.owner.get(&url).await.ok_json()
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

/// The Byes of a Round
fn byes(round: &Value) -> Vec<&Value> {
    round["matches"]
        .as_array()
        .expect("matches")
        .iter()
        .filter(|played| played["table_number"].is_null())
        .collect()
}

/// How many Seats each Match of a Round has, top table first
fn sizes(round: &Value) -> Vec<usize> {
    matches(round)
        .iter()
        .map(|played| played["seats"].as_array().expect("seats").len())
        .collect()
}

/// The standings line of the Participant in Seat `seat` of `played`
fn line<'a>(standings: &'a Value, played: &Value, seat: usize) -> &'a Value {
    let participant = &played["seats"][seat]["participant"];
    standings["standings"]
        .as_array()
        .expect("standings")
        .iter()
        .find(|line| line["participant"] == *participant)
        .expect("a line")
}

#[test]
fn eleven_players_play_two_full_matches_and_one_of_three() {
    run(async {
        let mut pods = Pods::new(11).await;
        let round = pods.start_round().await;
        assert_eq!(sizes(&round), vec![4, 4, 3], "{round}");
        assert!(byes(&round).is_empty(), "{round}");
    });
}

#[test]
fn nine_and_ten_players_get_one_and_two_byes() {
    run(async {
        for (players, expected) in [(9, 1), (10, 2)] {
            let mut pods = Pods::new(players).await;
            let round = pods.start_round().await;
            assert_eq!(sizes(&round), vec![4, 4], "{round}");
            assert_eq!(byes(&round).len(), expected, "{round}");
        }
    });
}

#[test]
fn a_match_is_won_by_one_seat_or_drawn_by_all() {
    run(async {
        let mut pods = Pods::new(11).await;
        let round = pods.start_round().await;
        let tables = matches(&round);

        for (games_won, games_drawn) in [
            (vec![1, 1, 0, 0], 0),
            (vec![0, 0, 0, 0], 0),
            (vec![2, 0, 0, 0], 0),
            (vec![1, 0], 0),
            (vec![1, 0, 0, 0], 1),
        ] {
            let refused = pods.result(tables[0], &games_won, games_drawn).await;
            assert_eq!(
                refused["error"]["invalid_score"], true,
                "{games_won:?} {games_drawn}: {refused}"
            );
        }

        pods.result(tables[0], &[0, 1, 0, 0], 0).await;
        pods.result(tables[1], &[0, 0, 0, 0], 1).await;
        pods.result(tables[2], &[1, 0, 0], 0).await;
        let ended = pods.post(&format!("rounds/{}/end", round["number"])).await;
        assert_eq!(ended["state"], "Swiss", "{ended}");

        let standings = pods.standings().await;
        assert_eq!(
            standings["tiebreakers"],
            json!(["OpponentWinRate", "WinRate"]),
            "{standings}"
        );
        assert_eq!(line(&standings, tables[0], 1)["match_points"], 5);
        assert_eq!(line(&standings, tables[0], 0)["match_points"], 0);
        assert_eq!(line(&standings, tables[1], 2)["match_points"], 1);
        assert_eq!(line(&standings, tables[2], 0)["match_points"], 5);
        let loser = line(&standings, tables[0], 3);
        assert_eq!(loser["tiebreakers"][1], 0.2, "the floor: {loser}");
    });
}

#[test]
fn topdeck_suggests_its_round_count_and_finishes_after_the_last_round() {
    run(async {
        let mut pods = Pods::new(9).await;
        let url = pods.url("rounds");
        let rounds = pods.owner.get(&url).await.ok_json();
        assert_eq!(rounds["suggested_swiss_rounds"], 3, "{rounds}");

        for number in 1..=3 {
            let round = pods.start_round().await;
            assert_eq!(byes(&round).len(), 1, "{round}");
            for played in matches(&round) {
                pods.result(played, &[1, 0, 0, 0], 0).await;
            }
            pods.post(&format!("rounds/{number}/end")).await;
        }

        let url = api(&format!("tournaments/{}", pods.tournament));
        let tournament = pods.owner.get(&url).await.ok_json();
        assert_eq!(tournament["state"], "Finished", "{tournament}");
    });
}

#[test]
fn under_the_addendum_nine_ten_and_eleven_players_play_smaller_matches_and_no_bye() {
    run(async {
        for (players, expected) in [(9, vec![3, 3, 3]), (10, vec![4, 3, 3]), (11, vec![4, 4, 3])] {
            let mut pods = Pods::under("MultiplayerAddendum", players).await;
            let round = pods.start_round().await;
            assert_eq!(sizes(&round), expected, "{round}");
            assert!(byes(&round).is_empty(), "{round}");
        }
    });
}

#[test]
fn under_the_addendum_five_players_play_one_match_of_five() {
    run(async {
        let mut pods = Pods::under("MultiplayerAddendum", 5).await;
        let round = pods.start_round().await;
        assert_eq!(sizes(&round), vec![5], "{round}");
        let played = matches(&round)[0];
        pods.result(played, &[0, 0, 0, 0, 1], 0).await;
        let standings = pods.standings().await;
        assert_eq!(
            line(&standings, played, 4)["match_points"],
            7,
            "{standings}"
        );
    });
}

#[test]
fn the_addendum_scores_seven_a_win_and_breaks_ties_by_mw_oamp_and_omw() {
    run(async {
        let mut pods = Pods::under("MultiplayerAddendum", 10).await;
        let url = pods.url("rounds");
        let rounds = pods.owner.get(&url).await.ok_json();
        assert_eq!(rounds["suggested_swiss_rounds"], 2, "{rounds}");

        let round = pods.start_round().await;
        let tables = matches(&round);
        pods.result(tables[0], &[1, 0, 0, 0], 0).await;
        pods.result(tables[1], &[0, 1, 0], 0).await;
        pods.result(tables[2], &[0, 0, 0], 1).await;

        let standings = pods.standings().await;
        assert_eq!(
            standings["tiebreakers"],
            json!([
                "MatchWinPercentage",
                "OpponentAverageMatchPoints",
                "OpponentMatchWinPercentage"
            ]),
            "{standings}"
        );
        let winner = line(&standings, tables[0], 0);
        assert_eq!(winner["match_points"], 7, "{winner}");
        assert_eq!(winner["tiebreakers"][0], 1.0, "{winner}");
        assert_eq!(winner["tiebreakers"][1], 0.0, "{winner}");
        let smaller = line(&standings, tables[1], 1);
        assert_eq!(
            smaller["match_points"], 7,
            "the same in a smaller Match: {smaller}"
        );
        let loser = line(&standings, tables[1], 0);
        assert_eq!(
            loser["tiebreakers"][0], 0.0,
            "no floor on the own MW%: {loser}"
        );
        let oamp = loser["tiebreakers"][1].as_f64().expect("a number");
        assert!(
            (oamp - 7.0 / 3.0).abs() < 1e-6,
            "the winner, a loser and a phantom: {loser}"
        );
        let drawn = line(&standings, tables[2], 0);
        assert_eq!(drawn["match_points"], 1, "{drawn}");
    });
}
