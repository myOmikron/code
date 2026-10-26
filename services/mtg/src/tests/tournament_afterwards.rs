//! A Tournament entered afterwards: run on paper, recorded later with a past
//! date, every pairing and Result set by its Organizers, nobody asked to report

use galvyn::core::re_exports::axum::http::Method;
use serde_json::Value;
use serde_json::json;

use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::tournament_rounds::Event;
use crate::tests::tournament_rounds::matches;
use crate::tests::tournament_rounds::round;
use crate::tests::tournament_rounds::seated;
use crate::tests::tournaments::create;
use crate::tests::tournaments::settings;

/// A date long gone when the test runs
const PAST: &str = "2024-03-01T18:00:00Z";

/// Settings of a public Tournament entered afterwards, dated [`PAST`]
fn afterwards(table_size: i64, ruleset: &str) -> Value {
    let mut request = settings("Public");
    request["starts_at"] = json!(PAST);
    request["table_size"] = json!(table_size);
    request["ruleset"] = json!(ruleset);
    request["format"] = json!("modern");
    request["best_of"] = if table_size == 2 {
        json!("One")
    } else {
        Value::Null
    };
    request["entered_afterwards"] = json!(true);
    request
}

/// An Owner entering a Tournament of `players` Guests afterwards
async fn entered(table_size: i64, ruleset: &str, players: usize) -> Event {
    let owner_account = create_account(Role::Member).await;
    let mut owner = TestClient::logged_in(&owner_account).await;
    let request = afterwards(table_size, ruleset);
    let created = create(&mut owner, &request).await;
    let tournament = created["uuid"].as_str().expect("uuid").to_string();
    let stranger = TestClient::logged_in(&create_account(Role::Member).await).await;
    let mut event = Event {
        owner,
        stranger,
        tournament,
        settings: request,
        players: Vec::new(),
        games_to_win: 1,
    };
    for index in 0..players {
        event.add_guest(&format!("Guest {index}")).await;
    }
    event
}

impl Event {
    /// Lay out the previewed Round `number` as the Owner, returning the body
    async fn enter_layout(&mut self, number: i64, matches: &[[&str; 2]], byes: &[&str]) -> Value {
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

    /// Set Seat 1 the winner of every Match of the running Round `number`
    async fn first_seats_win(&mut self, number: i64) {
        let rounds = self.rounds().await;
        for played in matches(round(&rounds, number)) {
            let uuid = played["uuid"].as_str().expect("uuid").to_string();
            let body = self.result(&uuid, [1, 0], 0).await;
            assert_ne!(body["result"], "Err", "{body}");
        }
    }
}

/// The Matches of a Round as Participant uuids in Seat order, top table first
fn layout(round: &Value) -> Vec<Vec<String>> {
    matches(round).into_iter().map(seated).collect()
}

#[test]
fn a_tournament_entered_afterwards_takes_a_past_date() {
    run(async {
        let event = entered(2, "Mtr", 0).await;
        let mut owner = event.owner;
        let body = owner
            .get(&crate::tests::tournaments::tournament_url(
                &event.tournament,
            ))
            .await
            .ok_json();
        assert_eq!(body["entered_afterwards"], true, "{body}");
        assert_eq!(body["starts_at"], PAST, "{body}");
    });
}

#[test]
fn a_tournament_is_run_live_unless_said_otherwise() {
    run(async {
        let owner_account = create_account(Role::Member).await;
        let mut owner = TestClient::logged_in(&owner_account).await;
        let created = create(&mut owner, &settings("Public")).await;
        assert_eq!(created["entered_afterwards"], false, "{created}");
    });
}

#[test]
fn the_preview_of_a_tournament_entered_afterwards_seats_in_roster_order() {
    run(async {
        let mut event = entered(2, "Mtr", 5).await;
        let paired = event.pair().await;
        assert_eq!(paired["number"], 1, "{paired}");
        let rounds = event.rounds().await;
        let preview = round(&rounds, 1);
        let p = &event.players;
        assert_eq!(
            layout(preview),
            vec![
                vec![p[0].clone(), p[1].clone()],
                vec![p[2].clone(), p[3].clone()]
            ],
            "{rounds}"
        );
    });
}

#[test]
fn a_ruleset_the_engine_does_not_pair_is_entered_afterwards_all_the_same() {
    run(async {
        let mut event = entered(4, "MultiplayerAddendum", 9).await;
        let paired = event.pair().await;
        assert_eq!(paired["number"], 1, "no pairing engine needed: {paired}");
        let rounds = event.rounds().await;
        let sizes: Vec<usize> = layout(round(&rounds, 1)).iter().map(Vec::len).collect();
        assert_eq!(sizes, vec![3, 3, 3], "{rounds}");
    });
}

#[test]
fn a_fully_entered_tournament_ends_finished() {
    run(async {
        let mut event = entered(2, "Mtr", 4).await;
        let players = event.players.clone();
        let [a, b, c, d] = [0, 1, 2, 3].map(|index| players[index].as_str());

        event.pair().await;
        let laid = event.enter_layout(1, &[[a, c], [b, d]], &[]).await;
        assert_ne!(laid["result"], "Err", "{laid}");
        event.start(1).await;
        event.first_seats_win(1).await;
        let ended = event.end(1).await;
        assert_ne!(ended["result"], "Err", "{ended}");

        event.pair().await;
        let laid = event.enter_layout(2, &[[a, b], [d, c]], &[]).await;
        assert_ne!(laid["result"], "Err", "{laid}");
        event.start(2).await;
        event.first_seats_win(2).await;
        let ended = event.end(2).await;
        assert_ne!(ended["result"], "Err", "{ended}");

        assert_eq!(event.state().await, "Finished");
        let rounds = event.rounds().await;
        assert_eq!(
            layout(round(&rounds, 2)),
            vec![vec![a, b], vec![d, c]],
            "the Rounds as entered: {rounds}"
        );
        let standings = event.standings().await;
        let points: Vec<(String, i64)> = standings["standings"]
            .as_array()
            .expect("standings")
            .iter()
            .map(|line| {
                (
                    line["participant"].as_str().expect("uuid").to_string(),
                    line["match_points"].as_i64().expect("points"),
                )
            })
            .collect();
        assert_eq!(points[0], (a.to_string(), 6), "{standings}");
        assert_eq!(points[3], (c.to_string(), 0), "{standings}");
    });
}

#[test]
fn participants_of_a_tournament_entered_afterwards_neither_report_nor_dispute() {
    run(async {
        let mut event = entered(2, "Mtr", 0).await;
        let first = create_account(Role::Member).await;
        let second = create_account(Role::Member).await;
        event.add_account(first.username.as_str()).await;
        event.add_account(second.username.as_str()).await;
        event.pair().await;
        event.start(1).await;
        let rounds = event.rounds().await;
        let played = matches(round(&rounds, 1))[0]["uuid"]
            .as_str()
            .expect("uuid")
            .to_string();

        let mut participant = TestClient::logged_in(&first).await;
        let report = participant
            .json(
                Method::POST,
                &event.url(&format!("matches/{played}/report")),
                &json!({ "games_won": [1, 0], "games_drawn": 0 }),
            )
            .await
            .ok_json();
        assert_eq!(report["error"]["entered_afterwards"], true, "{report}");

        event.result(&played, [1, 0], 0).await;
        let mut other = TestClient::logged_in(&second).await;
        let dispute = other
            .json(
                Method::POST,
                &event.url(&format!("matches/{played}/dispute")),
                &json!({}),
            )
            .await
            .ok_json();
        assert_eq!(dispute["error"]["entered_afterwards"], true, "{dispute}");
    });
}

#[test]
fn entering_afterwards_is_settled_once_the_first_round_started() {
    run(async {
        let mut event = entered(2, "Mtr", 2).await;
        let url = crate::tests::tournaments::tournament_url(&event.tournament);
        let mut live = event.settings.clone();
        live["entered_afterwards"] = json!(false);
        let switched = event.owner.json(Method::PUT, &url, &live).await.ok_json();
        assert_eq!(
            switched["entered_afterwards"], false,
            "open while in Registration: {switched}"
        );
        let back = event
            .owner
            .json(Method::PUT, &url, &event.settings.clone())
            .await
            .ok_json();
        assert_eq!(back["entered_afterwards"], true, "{back}");

        event.pair().await;
        event.start(1).await;
        let refused = event.owner.json(Method::PUT, &url, &live).await.ok_json();
        assert_eq!(refused["error"]["rules_locked"], true, "{refused}");
    });
}
