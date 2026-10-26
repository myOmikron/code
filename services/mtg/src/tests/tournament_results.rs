//! Participants report their own Match's Result and dispute one reported by
//! somebody else; Organizers settle disputes and correct Results at any time

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use url::Url;

use crate::models::account::Role;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::lock::lock;
use crate::tests::tournaments::create;
use crate::tests::tournaments::settings;

/// One Account playing in a Tournament
struct Player {
    /// The Account
    account: TestAccount,
    /// Logged in as it
    client: TestClient,
    /// Its Participant uuid
    participant: String,
}

/// A public best-of-three MTR Tournament of Accounts, Round 1 running
struct Event {
    /// Logged in as the Owner
    owner: TestClient,
    /// The Tournament's uuid
    tournament: String,
    /// The Participants, in the order they were added
    players: Vec<Player>,
}

impl Event {
    /// A Tournament of `players` Accounts with Round 1 started
    async fn running(players: usize) -> Self {
        let owner_account = create_account(Role::Member).await;
        let mut owner = TestClient::logged_in(&owner_account).await;
        let mut request = settings("Public");
        request["table_size"] = json!(2);
        request["ruleset"] = json!("Mtr");
        request["best_of"] = json!("Three");
        let created = create(&mut owner, &request).await;
        let tournament = created["uuid"].as_str().expect("uuid").to_string();
        let mut event = Self {
            owner,
            tournament,
            players: Vec::new(),
        };
        for _ in 0..players {
            let account = create_account(Role::Member).await;
            let url = event.url("participants/accounts");
            let body = event
                .owner
                .json(Method::POST, &url, &json!({ "username": account.username }))
                .await
                .ok_json();
            let participant = body["uuid"].as_str().expect("uuid").to_string();
            let client = TestClient::logged_in(&account).await;
            event.players.push(Player {
                account,
                client,
                participant,
            });
        }
        let url = event.url("rounds");
        let paired = event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();
        assert_eq!(paired["number"], 1, "{paired}");
        event.start().await;
        event
    }

    /// The url of `path` below the Tournament
    fn url(&self, path: &str) -> Url {
        api(&format!("tournaments/{}/{path}", self.tournament))
    }

    /// Start Round 1 as the Owner
    async fn start(&mut self) {
        let url = self.url("rounds/1/start");
        self.owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();
    }

    /// End Round 1 as the Owner, returning the body
    async fn end(&mut self) -> Value {
        let url = self.url("rounds/1/end");
        self.owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json()
    }

    /// Round 1's Match of player `index`, as the Owner reads it
    async fn match_of(&mut self, index: usize) -> Value {
        let participant = self.players[index].participant.clone();
        let url = self.url("rounds");
        let rounds = self.owner.get(&url).await.ok_json();
        rounds["rounds"][0]["matches"]
            .as_array()
            .expect("matches")
            .iter()
            .find(|played| {
                played["seats"]
                    .as_array()
                    .expect("seats")
                    .iter()
                    .any(|seat| seat["participant"] == participant.as_str())
            })
            .expect("the player's match")
            .clone()
    }

    /// The index of the player at Seat `seat` of `played`
    fn player_at(&self, played: &Value, seat: usize) -> usize {
        let participant = &played["seats"][seat]["participant"];
        self.players
            .iter()
            .position(|player| *participant == player.participant.as_str())
            .expect("a player of the event")
    }

    /// Player `index` reports `games_won` per Seat for `played`
    async fn report(&mut self, index: usize, played: &Value, games_won: [i64; 2]) -> TestResponse {
        let url = self.url(&format!(
            "matches/{}/report",
            played["uuid"].as_str().expect("uuid")
        ));
        self.players[index]
            .client
            .json(
                Method::POST,
                &url,
                &json!({ "games_won": games_won, "games_drawn": 0 }),
            )
            .await
    }

    /// Player `index` disputes the Result of `played`
    async fn dispute(&mut self, index: usize, played: &Value) -> TestResponse {
        let url = self.url(&format!(
            "matches/{}/dispute",
            played["uuid"].as_str().expect("uuid")
        ));
        self.players[index]
            .client
            .json(Method::POST, &url, &json!({}))
            .await
    }

    /// The Owner sets `games_won` per Seat as the Result of `played`
    async fn set(&mut self, played: &Value, games_won: [i64; 2]) -> Value {
        let url = self.url(&format!(
            "matches/{}/result",
            played["uuid"].as_str().expect("uuid")
        ));
        self.owner
            .json(
                Method::PUT,
                &url,
                &json!({ "games_won": games_won, "games_drawn": 0 }),
            )
            .await
            .ok_json()
    }

    /// The Match points of player `index` in the standings
    async fn match_points(&mut self, index: usize) -> Value {
        let participant = self.players[index].participant.clone();
        let url = self.url("standings");
        let standings = self.owner.get(&url).await.ok_json();
        standings["standings"]
            .as_array()
            .expect("standings")
            .iter()
            .find(|line| line["participant"] == participant.as_str())
            .expect("the player's line")["match_points"]
            .clone()
    }
}

#[test]
fn a_participants_report_counts_at_once() {
    run(async {
        let mut event = Event::running(2).await;
        let played = event.match_of(0).await;
        let first = event.player_at(&played, 0);

        let body = event.report(first, &played, [2, 1]).await.ok_json();
        assert_eq!(body, Value::Null, "{body}");

        let played = event.match_of(0).await;
        assert_eq!(
            played["result"],
            json!({
                "games_won": [2, 1],
                "games_drawn": 0,
                "state": "Reported",
                "reported_by": event.players[first].participant,
                "disputed_by": null,
            }),
            "{played}"
        );
        assert_eq!(event.match_points(first).await, 3);
        let ended = event.end().await;
        assert_eq!(ended["state"], "Finished", "{ended}");
    });
}

#[test]
fn the_reporter_corrects_its_report_and_the_opponent_may_only_agree() {
    run(async {
        let mut event = Event::running(2).await;
        let played = event.match_of(0).await;
        let first = event.player_at(&played, 0);
        let second = event.player_at(&played, 1);

        event.report(first, &played, [2, 1]).await.ok_json();
        event.report(first, &played, [1, 2]).await.ok_json();
        assert_eq!(event.match_points(second).await, 3);

        let agreed = event.report(second, &played, [1, 2]).await.ok_json();
        assert_eq!(agreed, Value::Null, "{agreed}");
        let played = event.match_of(0).await;
        assert_eq!(
            played["result"]["reported_by"],
            event.players[first].participant.as_str(),
            "{played}"
        );

        let differs = event.report(second, &played, [2, 0]).await.ok_json();
        assert_eq!(differs["error"]["reported_by_other"], true, "{differs}");
    });
}

#[test]
fn a_dispute_holds_the_round_open_until_an_organizer_settles_it() {
    run(async {
        let mut event = Event::running(2).await;
        let played = event.match_of(0).await;
        let first = event.player_at(&played, 0);
        let second = event.player_at(&played, 1);
        event.report(first, &played, [2, 0]).await.ok_json();

        let body = event.dispute(second, &played).await.ok_json();
        assert_eq!(body, Value::Null, "{body}");

        let played = event.match_of(0).await;
        assert_eq!(played["result"]["state"], "Disputed", "{played}");
        assert_eq!(
            played["result"]["disputed_by"],
            event.players[second].participant.as_str(),
            "{played}"
        );
        let held = event.end().await;
        assert_eq!(held["error"]["results_disputed"], true, "{held}");
        let again = event.report(first, &played, [2, 1]).await.ok_json();
        assert_eq!(again["error"]["disputed"], true, "{again}");
        let twice = event.dispute(second, &played).await.ok_json();
        assert_eq!(twice, Value::Null, "{twice}");

        event.set(&played, [0, 2]).await;

        let played = event.match_of(0).await;
        assert_eq!(
            played["result"],
            json!({
                "games_won": [0, 2],
                "games_drawn": 0,
                "state": "Confirmed",
                "reported_by": null,
                "disputed_by": null,
            }),
            "{played}"
        );
        assert_eq!(event.match_points(second).await, 3);
        let ended = event.end().await;
        assert_eq!(ended["state"], "Finished", "{ended}");
    });
}

#[test]
fn only_another_participant_of_the_match_disputes() {
    run(async {
        let mut event = Event::running(4).await;
        let played = event.match_of(0).await;
        let first = event.player_at(&played, 0);
        let second = event.player_at(&played, 1);
        let elsewhere = (0..4)
            .find(|index| *index != first && *index != second)
            .expect("a player at the other match");

        let early = event.dispute(second, &played).await.ok_json();
        assert_eq!(early["error"]["no_result"], true, "{early}");
        event.report(first, &played, [2, 0]).await.ok_json();

        let own = event.dispute(first, &played).await.ok_json();
        assert_eq!(own["error"]["own_report"], true, "{own}");
        let other_match = event.dispute(elsewhere, &played).await;
        assert_eq!(other_match.status, StatusCode::BAD_REQUEST);
        let not_seated = event.report(elsewhere, &played, [0, 2]).await;
        assert_eq!(not_seated.status, StatusCode::BAD_REQUEST);
        let stranger = create_account(Role::Member).await;
        let url = event.url(&format!(
            "matches/{}/dispute",
            played["uuid"].as_str().expect("uuid")
        ));
        let response = TestClient::logged_in(&stranger)
            .await
            .json(Method::POST, &url, &json!({}))
            .await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST);

        let played = event.match_of(0).await;
        assert_eq!(played["result"]["state"], "Reported", "{played}");
    });
}

#[test]
fn reports_and_disputes_end_with_the_round() {
    run(async {
        let mut event = Event::running(2).await;
        let played = event.match_of(0).await;
        let first = event.player_at(&played, 0);
        let second = event.player_at(&played, 1);
        event.report(first, &played, [2, 0]).await.ok_json();
        event.end().await;

        let late = event.dispute(second, &played).await.ok_json();
        assert_eq!(late["error"]["not_running"], true, "{late}");
        let late = event.report(first, &played, [2, 1]).await.ok_json();
        assert_eq!(late["error"]["not_running"], true, "{late}");
    });
}

#[test]
fn a_previewed_match_takes_no_report() {
    run(async {
        let mut event = Event::running(2).await;
        let played = event.match_of(0).await;
        let first = event.player_at(&played, 0);
        event.report(first, &played, [2, 0]).await.ok_json();
        let url = event.url("swiss-rounds");
        event
            .owner
            .json(Method::PUT, &url, &json!({ "swiss_rounds": 2 }))
            .await
            .ok_json();
        event.end().await;
        let url = event.url("rounds");
        event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();
        let rounds = event.owner.get(&url).await.ok_json();
        let preview = rounds["rounds"][1]["matches"][0].clone();
        assert_eq!(rounds["rounds"][1]["state"], "Previewed", "{rounds}");
        let reporter = event.player_at(&preview, 0);

        let body = event.report(reporter, &preview, [2, 0]).await.ok_json();
        assert_eq!(body["error"]["not_running"], true, "{body}");
    });
}

#[test]
fn a_report_must_fit_best_of_three() {
    run(async {
        let mut event = Event::running(2).await;
        let played = event.match_of(0).await;
        let first = event.player_at(&played, 0);

        let body = event.report(first, &played, [3, 0]).await.ok_json();
        assert_eq!(body["error"]["invalid_score"], true, "{body}");
    });
}

#[test]
fn an_organizers_result_stands_against_the_participants() {
    run(async {
        let mut event = Event::running(2).await;
        let played = event.match_of(0).await;
        let first = event.player_at(&played, 0);
        let second = event.player_at(&played, 1);
        event.set(&played, [2, 1]).await;

        let report = event.report(second, &played, [1, 2]).await.ok_json();
        assert_eq!(report["error"]["confirmed"], true, "{report}");
        let dispute = event.dispute(second, &played).await.ok_json();
        assert_eq!(dispute["error"]["confirmed"], true, "{dispute}");
        let same = event.report(first, &played, [2, 1]).await.ok_json();
        assert_eq!(same, Value::Null, "{same}");

        let played = event.match_of(0).await;
        assert_eq!(played["result"]["state"], "Confirmed", "{played}");
    });
}

#[test]
fn a_correction_after_finished_recomputes_the_standings_without_pairing_again() {
    run(async {
        let mut event = Event::running(4).await;
        let mut winners = Vec::new();
        for index in 0..4 {
            let played = event.match_of(index).await;
            if played["result"].is_null() {
                let first = event.player_at(&played, 0);
                event.report(first, &played, [2, 0]).await.ok_json();
                winners.push(first);
            }
        }
        let url = event.url("swiss-rounds");
        event
            .owner
            .json(Method::PUT, &url, &json!({ "swiss_rounds": 1 }))
            .await
            .ok_json();
        let ended = event.end().await;
        assert_eq!(ended["state"], "Finished", "{ended}");
        let before = event.owner.get(&event.url("rounds")).await.ok_json();

        let played = event.match_of(winners[0]).await;
        let loser = event.player_at(&played, 1);
        event.set(&played, [0, 2]).await;

        assert_eq!(event.match_points(winners[0]).await, 0);
        assert_eq!(event.match_points(loser).await, 3);
        let after = event.owner.get(&event.url("rounds")).await.ok_json();
        assert_eq!(
            after["rounds"].as_array().expect("rounds").len(),
            1,
            "{after}"
        );
        let seats = |rounds: &Value| -> Vec<Value> {
            rounds["rounds"][0]["matches"]
                .as_array()
                .expect("matches")
                .iter()
                .map(|played| played["seats"].clone())
                .collect()
        };
        assert_eq!(seats(&before), seats(&after));
        let late = event.report(loser, &played, [0, 2]).await.ok_json();
        assert_eq!(late["error"]["not_running"], true, "{late}");
    });
}

#[test]
fn a_locked_account_cannot_report_or_dispute_and_an_organizer_reports_for_it() {
    run(async {
        let mut event = Event::running(2).await;
        let played = event.match_of(0).await;
        let first = event.player_at(&played, 0);
        let second = event.player_at(&played, 1);
        event.report(second, &played, [0, 2]).await.ok_json();
        let admin = create_account(Role::Admin).await;
        let mut admin = TestClient::logged_in(&admin).await;
        let account = TestAccount {
            uuid: event.players[first].account.uuid,
            username: event.players[first].account.username.clone(),
        };
        lock(&mut admin, &account, "Spam").await;

        let report = event.report(first, &played, [2, 0]).await;
        assert_eq!(report.status, StatusCode::UNAUTHORIZED, "{report:?}");
        let dispute = event.dispute(first, &played).await;
        assert_eq!(dispute.status, StatusCode::UNAUTHORIZED, "{dispute:?}");
        let played = event.match_of(0).await;
        assert_eq!(played["result"]["state"], "Reported", "{played}");

        event.set(&played, [2, 1]).await;

        assert_eq!(event.match_points(first).await, 3);
    });
}
