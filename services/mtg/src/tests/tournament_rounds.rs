//! Running a one-on-one Tournament under MTR: Rounds are paired as a preview
//! only Organizers see, started, given their Results and ended, until the last
//! Swiss Round finishes the Tournament

use std::collections::HashSet;

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

/// An Owner running a one-on-one Tournament of Guests, and a stranger watching it
pub(super) struct Event {
    /// Logged in as the Owner
    pub(super) owner: TestClient,
    /// Logged in as an Account unrelated to the Tournament
    stranger: TestClient,
    /// The Tournament's uuid
    pub(super) tournament: String,
    /// The settings it was created with
    settings: Value,
    /// The Participant uuids, in the order they were added
    pub(super) players: Vec<String>,
    /// The games that win a Match
    games_to_win: i64,
}

impl Event {
    /// A public MTR Tournament played best of `best_of` with `players` Guests
    pub(super) async fn new(best_of: &str, players: usize) -> Self {
        let owner_account = create_account(Role::Member).await;
        let mut owner = TestClient::logged_in(&owner_account).await;
        let mut request = settings("Public");
        request["table_size"] = json!(2);
        request["ruleset"] = json!("Mtr");
        request["format"] = json!("modern");
        request["best_of"] = json!(best_of);
        let created = create(&mut owner, &request).await;
        let tournament = created["uuid"].as_str().expect("uuid").to_string();
        let stranger = TestClient::logged_in(&create_account(Role::Member).await).await;
        let mut event = Self {
            owner,
            stranger,
            tournament,
            settings: request,
            players: Vec::new(),
            games_to_win: if best_of == "One" { 1 } else { 2 },
        };
        for index in 0..players {
            event.add_guest(&format!("Guest {index}")).await;
        }
        event
    }

    /// The url of `path` below the Tournament
    fn url(&self, path: &str) -> Url {
        api(&format!("tournaments/{}/{path}", self.tournament))
    }

    /// Add a Guest as the Owner, returning its Participant uuid
    async fn add_guest(&mut self, name: &str) -> String {
        let url = self.url("participants/guests");
        let body = self
            .owner
            .json(Method::POST, &url, &json!({ "name": name }))
            .await
            .ok_json();
        let uuid = body["uuid"].as_str().expect("uuid").to_string();
        self.players.push(uuid.clone());
        uuid
    }

    /// Add the Account named `username` as the Owner, returning its Participant uuid
    pub(super) async fn add_account(&mut self, username: &str) -> String {
        let url = self.url("participants/accounts");
        let body = self
            .owner
            .json(Method::POST, &url, &json!({ "username": username }))
            .await
            .ok_json();
        let uuid = body["uuid"].as_str().expect("uuid").to_string();
        self.players.push(uuid.clone());
        uuid
    }

    /// Pair the next Round as the Owner, returning the body
    async fn pair(&mut self) -> Value {
        let url = self.url("rounds");
        self.owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json()
    }

    /// Start Round `number` as the Owner, returning the body
    async fn start(&mut self, number: i64) -> Value {
        let url = self.url(&format!("rounds/{number}/start"));
        self.owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json()
    }

    /// End Round `number` as the Owner, returning the body
    async fn end(&mut self, number: i64) -> Value {
        let url = self.url(&format!("rounds/{number}/end"));
        self.owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json()
    }

    /// Set the Result of `played` as the Owner, returning the body
    async fn result(&mut self, played: &str, games_won: [i64; 2], games_drawn: i64) -> Value {
        let url = self.url(&format!("matches/{played}/result"));
        self.owner
            .json(
                Method::PUT,
                &url,
                &json!({ "games_won": games_won, "games_drawn": games_drawn }),
            )
            .await
            .ok_json()
    }

    /// The Rounds as `client` reads them
    async fn rounds_of(&self, client: &mut TestClient) -> Value {
        client.get(&self.url("rounds")).await.ok_json()
    }

    /// The Rounds as the Owner reads them
    pub(super) async fn rounds(&mut self) -> Value {
        let url = self.url("rounds");
        self.owner.get(&url).await.ok_json()
    }

    /// The standings as the Owner reads them
    pub(super) async fn standings(&mut self) -> Value {
        let url = self.url("standings");
        self.owner.get(&url).await.ok_json()
    }

    /// The Tournament's state as the Owner reads it
    async fn state(&mut self) -> String {
        let url = api(&format!("tournaments/{}", self.tournament));
        let body = self.owner.get(&url).await.ok_json();
        body["state"].as_str().expect("a state").to_string()
    }

    /// Pair and start the next Round, then let Seat 1 win every Match in it without losing a game
    pub(super) async fn play_round(&mut self) -> Value {
        let number = self.pair().await["number"].as_i64().expect("a number");
        self.start(number).await;
        let rounds = self.rounds().await;
        let round = round(&rounds, number).clone();
        for played in matches(&round) {
            let uuid = played["uuid"].as_str().expect("uuid").to_string();
            self.result(&uuid, [self.games_to_win, 0], 0).await;
        }
        round
    }
}

/// Round `number` of a rounds response
fn round(rounds: &Value, number: i64) -> &Value {
    rounds["rounds"]
        .as_array()
        .expect("a list of rounds")
        .iter()
        .find(|round| round["number"] == number)
        .expect("the round")
}

/// The Matches of a Round, Byes left out
fn matches(round: &Value) -> Vec<&Value> {
    round["matches"]
        .as_array()
        .expect("a list of matches")
        .iter()
        .filter(|played| !played["table_number"].is_null())
        .collect()
}

/// Who sits in a Match or a Bye, as Participant uuids
pub(super) fn seated(played: &Value) -> Vec<String> {
    played["seats"]
        .as_array()
        .expect("a list of seats")
        .iter()
        .map(|seat| seat["participant"].as_str().expect("uuid").to_string())
        .collect()
}

/// Every pair of Participants that met in a Round
fn pairs(round: &Value) -> HashSet<Vec<String>> {
    matches(round)
        .into_iter()
        .map(|played| {
            let mut pair = seated(played);
            pair.sort();
            pair
        })
        .collect()
}

#[test]
fn a_paired_round_is_a_preview_only_organizers_see_until_it_starts() {
    run(async {
        let mut event = Event::new("Three", 4).await;

        let paired = event.pair().await;
        assert_eq!(paired["number"], 1, "{paired}");

        let owner_view = event.rounds().await;
        assert_eq!(round(&owner_view, 1)["state"], "Previewed", "{owner_view}");
        assert_eq!(matches(round(&owner_view, 1)).len(), 2, "{owner_view}");
        let mut stranger = TestClient::new();
        std::mem::swap(&mut stranger, &mut event.stranger);
        let stranger_view = event.rounds_of(&mut stranger).await;
        assert_eq!(stranger_view["rounds"], json!([]), "{stranger_view}");
        let anonymous_view = event.rounds_of(&mut TestClient::new()).await;
        assert_eq!(anonymous_view["rounds"], json!([]), "{anonymous_view}");
        assert_eq!(event.state().await, "Registration");

        event.start(1).await;

        let stranger_view = event.rounds_of(&mut stranger).await;
        assert_eq!(
            round(&stranger_view, 1)["state"],
            "Running",
            "{stranger_view}"
        );
        assert_eq!(event.state().await, "Swiss");
    });
}

#[test]
fn every_participant_plays_once_a_round_and_an_odd_one_has_a_bye() {
    run(async {
        let mut event = Event::new("Three", 5).await;
        event.pair().await;

        let rounds = event.rounds().await;
        let round = round(&rounds, 1);
        let all = round["matches"].as_array().expect("matches");
        let byes: Vec<&Value> = all
            .iter()
            .filter(|played| played["table_number"].is_null())
            .collect();
        assert_eq!(byes.len(), 1, "{round}");
        assert_eq!(seated(byes[0]).len(), 1, "{round}");
        assert_eq!(matches(round).len(), 2, "{round}");

        let mut everybody: Vec<String> = all.iter().flat_map(seated).collect();
        everybody.sort();
        let mut players = event.players.clone();
        players.sort();
        assert_eq!(everybody, players);
        let tables: Vec<&Value> = matches(round)
            .into_iter()
            .map(|played| &played["table_number"])
            .collect();
        assert_eq!(tables, vec![&json!(1), &json!(2)]);
    });
}

#[test]
fn a_round_ends_only_once_every_match_has_a_result() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.pair().await;
        event.start(1).await;

        let early = event.end(1).await;
        assert_eq!(early["error"]["results_missing"], true, "{early}");

        let rounds = event.rounds().await;
        let uuids: Vec<String> = matches(round(&rounds, 1))
            .into_iter()
            .map(|played| played["uuid"].as_str().expect("uuid").to_string())
            .collect();
        event.result(&uuids[0], [2, 1], 0).await;
        let still = event.end(1).await;
        assert_eq!(still["error"]["results_missing"], true, "{still}");
        event.result(&uuids[1], [1, 1], 1).await;

        let ended = event.end(1).await;
        assert_eq!(ended["state"], "Swiss", "{ended}");
        let rounds = event.rounds().await;
        assert_eq!(round(&rounds, 1)["state"], "Ended", "{rounds}");
        let first = matches(round(&rounds, 1))
            .into_iter()
            .find(|played| played["uuid"] == uuids[0].as_str())
            .expect("the match")
            .clone();
        assert_eq!(
            first["result"],
            json!({ "games_won": [2, 1], "games_drawn": 0 }),
            "{first}"
        );
    });
}

#[test]
fn the_next_round_waits_for_the_current_one() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.pair().await;
        let twice = event.pair().await;
        assert_eq!(twice["error"]["round_open"], true, "{twice}");

        event.start(1).await;
        let running = event.pair().await;
        assert_eq!(running["error"]["round_open"], true, "{running}");
    });
}

#[test]
fn later_rounds_pair_winners_with_winners_and_never_repeat_a_match() {
    run(async {
        let mut event = Event::new("Three", 8).await;
        let mut met: HashSet<Vec<String>> = HashSet::new();
        for number in 1..=3 {
            let round = event.play_round().await;
            for pair in pairs(&round) {
                assert!(
                    met.insert(pair.clone()),
                    "Round {number}: {pair:?} met before"
                );
            }
            if number > 1 {
                let standings = event.standings().await;
                let before: std::collections::HashMap<String, i64> = standings["standings"]
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
                for played in matches(&round) {
                    let seats = seated(played);
                    assert_eq!(
                        before[&seats[0]] - 3,
                        before[&seats[1]],
                        "Round {number}: {seats:?} came in on equal points"
                    );
                }
            }
            event.end(number).await;
        }
    });
}

#[test]
fn the_standings_show_match_points_and_a_bye_counts_as_a_win() {
    run(async {
        let mut event = Event::new("Three", 3).await;
        let round = event.play_round().await;
        let all = round["matches"].as_array().expect("matches");
        let bye = all
            .iter()
            .find(|played| played["table_number"].is_null())
            .map(|played| seated(played)[0].clone())
            .expect("a bye");
        let played = matches(&round)[0];
        let (winner, loser) = (seated(played)[0].clone(), seated(played)[1].clone());

        let standings = event.standings().await;
        let line = |participant: &str| -> Value {
            standings["standings"]
                .as_array()
                .expect("standings")
                .iter()
                .find(|line| line["participant"] == participant)
                .expect("a line")
                .clone()
        };
        assert_eq!(line(&winner)["match_points"], 3, "{standings}");
        assert_eq!(line(&winner)["wins"], 1, "{standings}");
        assert_eq!(line(&bye)["match_points"], 3, "{standings}");
        assert_eq!(line(&bye)["byes"], 1, "{standings}");
        assert_eq!(line(&loser)["match_points"], 0, "{standings}");
        assert_eq!(line(&loser)["losses"], 1, "{standings}");
        assert_eq!(line(&loser)["place"], 3, "{standings}");
        assert_eq!(line(&winner)["place"], 1, "{standings}");
        assert_eq!(line(&bye)["place"], 1, "{standings}");
    });
}

#[test]
fn the_round_count_follows_mtr_appendix_e_and_can_be_changed() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        let rounds = event.rounds().await;
        assert_eq!(rounds["suggested_swiss_rounds"], 2, "{rounds}");
        assert_eq!(rounds["swiss_rounds"], Value::Null, "{rounds}");
        for index in 4..9 {
            event.add_guest(&format!("Late {index}")).await;
        }
        let rounds = event.rounds().await;
        assert_eq!(
            rounds["suggested_swiss_rounds"], 5,
            "nine Participants: {rounds}"
        );

        let url = event.url("swiss-rounds");
        let set = event
            .owner
            .json(Method::PUT, &url, &json!({ "swiss_rounds": 3 }))
            .await
            .ok_json();
        assert_eq!(set["state"], "Registration", "{set}");
        let rounds = event.rounds().await;
        assert_eq!(rounds["swiss_rounds"], 3, "{rounds}");

        let zero = event
            .owner
            .json(Method::PUT, &url, &json!({ "swiss_rounds": 0 }))
            .await
            .ok_json();
        assert_eq!(zero["error"]["out_of_range"], true, "{zero}");
    });
}

#[test]
fn the_first_round_settles_the_suggested_round_count() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.pair().await;
        event.start(1).await;

        let rounds = event.rounds().await;
        assert_eq!(rounds["swiss_rounds"], 2, "{rounds}");
    });
}

#[test]
fn the_tournament_is_finished_after_the_last_swiss_round() {
    run(async {
        let mut event = Event::new("One", 4).await;
        event.play_round().await;
        assert_eq!(event.end(1).await["state"], "Swiss");
        event.play_round().await;

        let ended = event.end(2).await;
        assert_eq!(ended["state"], "Finished", "{ended}");
        assert_eq!(event.state().await, "Finished");
        let more = event.pair().await;
        assert_eq!(more["error"]["tournament_over"], true, "{more}");
    });
}

#[test]
fn fewer_swiss_rounds_set_after_the_last_played_one_finish_the_tournament() {
    run(async {
        let mut event = Event::new("Three", 8).await;
        event.play_round().await;
        event.end(1).await;

        let url = event.url("swiss-rounds");
        let set = event
            .owner
            .json(Method::PUT, &url, &json!({ "swiss_rounds": 1 }))
            .await
            .ok_json();

        assert_eq!(set["state"], "Finished", "{set}");
        assert_eq!(event.state().await, "Finished");
    });
}

#[test]
fn a_result_must_fit_best_of_one_or_best_of_three() {
    run(async {
        let mut one = Event::new("One", 2).await;
        let round = one.play_round().await;
        let uuid = matches(&round)[0]["uuid"]
            .as_str()
            .expect("uuid")
            .to_string();
        let refused = one.result(&uuid, [2, 0], 0).await;
        assert_eq!(refused["error"]["invalid_score"], true, "{refused}");
        assert_eq!(one.result(&uuid, [0, 1], 0).await, Value::Null);

        let mut three = Event::new("Three", 2).await;
        let round = three.play_round().await;
        let uuid = matches(&round)[0]["uuid"]
            .as_str()
            .expect("uuid")
            .to_string();
        let refused = three.result(&uuid, [2, 2], 0).await;
        assert_eq!(refused["error"]["invalid_score"], true, "{refused}");
        assert_eq!(three.result(&uuid, [1, 2], 0).await, Value::Null);
    });
}

#[test]
fn a_previewed_match_takes_no_result() {
    run(async {
        let mut event = Event::new("Three", 2).await;
        event.pair().await;
        let rounds = event.rounds().await;
        let uuid = matches(round(&rounds, 1))[0]["uuid"]
            .as_str()
            .expect("uuid")
            .to_string();

        let refused = event.result(&uuid, [2, 0], 0).await;

        assert_eq!(refused["error"]["not_started"], true, "{refused}");
    });
}

#[test]
fn an_organizer_corrects_a_result_after_the_tournament_finished() {
    run(async {
        let mut event = Event::new("Three", 2).await;
        let round = event.play_round().await;
        event.end(1).await;
        assert_eq!(event.state().await, "Finished");
        let played = matches(&round)[0];
        let uuid = played["uuid"].as_str().expect("uuid").to_string();
        let second = seated(played)[1].clone();

        event.result(&uuid, [0, 2], 0).await;

        let standings = event.standings().await;
        assert_eq!(
            standings["standings"][0]["participant"], second,
            "{standings}"
        );
        assert_eq!(standings["standings"][0]["match_points"], 3, "{standings}");
    });
}

#[test]
fn cancelling_keeps_the_rounds_played_so_far() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.play_round().await;
        event.end(1).await;
        event.pair().await;

        let url = event.url("cancel");
        event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();

        assert_eq!(event.state().await, "Cancelled");
        let rounds = event.rounds().await;
        let numbers: Vec<&Value> = rounds["rounds"]
            .as_array()
            .expect("rounds")
            .iter()
            .map(|round| &round["number"])
            .collect();
        assert_eq!(numbers, vec![&json!(1)], "the preview went: {rounds}");
        let mut stranger = TestClient::new();
        let seen = event.rounds_of(&mut stranger).await;
        assert_eq!(round(&seen, 1)["state"], "Ended", "{seen}");
        let more = event.pair().await;
        assert_eq!(more["error"]["tournament_over"], true, "{more}");
    });
}

#[test]
fn a_cancelled_tournament_cannot_be_cancelled_again() {
    run(async {
        let mut event = Event::new("Three", 2).await;
        let url = event.url("cancel");
        event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();

        let again = event.owner.json(Method::POST, &url, &json!({})).await;

        assert!(!again.status.is_success(), "{again:?}");
    });
}

#[test]
fn changing_the_participants_discards_the_preview() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.pair().await;

        event.add_guest("Latecomer").await;

        let rounds = event.rounds().await;
        assert_eq!(rounds["rounds"], json!([]), "{rounds}");
        assert_eq!(event.pair().await["number"], 1);
    });
}

#[test]
fn an_organizer_discards_a_preview_to_pair_again() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        event.pair().await;

        let url = event.url("rounds/1");
        event
            .owner
            .json(Method::DELETE, &url, &json!({}))
            .await
            .ok_json();

        assert_eq!(event.rounds().await["rounds"], json!([]));
        event.pair().await;
        event.start(1).await;
        let running = event
            .owner
            .json(Method::DELETE, &url, &json!({}))
            .await
            .ok_json();
        assert_eq!(running["error"]["not_previewed"], true, "{running}");
    });
}

#[test]
fn nobody_but_an_organizer_runs_the_rounds() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        let mut stranger = TestClient::new();
        std::mem::swap(&mut stranger, &mut event.stranger);

        let pair = stranger
            .json(Method::POST, &event.url("rounds"), &json!({}))
            .await;
        assert!(!pair.status.is_success(), "{pair:?}");
        event.pair().await;
        for (method, path) in [
            (Method::POST, "rounds/1/start"),
            (Method::POST, "rounds/1/end"),
            (Method::DELETE, "rounds/1"),
            (Method::POST, "cancel"),
            (Method::PUT, "swiss-rounds"),
        ] {
            let response = stranger
                .json(
                    method.clone(),
                    &event.url(path),
                    &json!({ "swiss_rounds": 3 }),
                )
                .await;
            assert!(
                !response.status.is_success(),
                "{method} {path}: {response:?}"
            );
        }
        let rounds = event.rounds().await;
        let uuid = matches(round(&rounds, 1))[0]["uuid"]
            .as_str()
            .expect("uuid")
            .to_string();
        let result = stranger
            .json(
                Method::PUT,
                &event.url(&format!("matches/{uuid}/result")),
                &json!({ "games_won": [2, 0], "games_drawn": 0 }),
            )
            .await;
        assert!(!result.status.is_success(), "{result:?}");
        assert_eq!(round(&event.rounds().await, 1)["state"], "Previewed");
    });
}

#[test]
fn table_size_ruleset_and_best_of_stay_once_the_first_round_started() {
    run(async {
        let mut event = Event::new("Three", 2).await;
        event.pair().await;
        event.start(1).await;
        let url = api(&format!("tournaments/{}", event.tournament));

        let mut changed = event.settings.clone();
        changed["best_of"] = json!("One");
        let refused = event
            .owner
            .json(Method::PUT, &url, &changed)
            .await
            .ok_json();
        assert_eq!(refused["error"]["rules_locked"], true, "{refused}");

        let mut renamed = event.settings.clone();
        renamed["name"] = json!("Renamed");
        let body = event
            .owner
            .json(Method::PUT, &url, &renamed)
            .await
            .ok_json();
        assert_eq!(body["name"], "Renamed", "{body}");
        assert_eq!(body["best_of"], "Three", "{body}");
    });
}

#[test]
fn a_one_on_one_tournament_needs_best_of() {
    run(async {
        let mut client = TestClient::logged_in(&create_account(Role::Member).await).await;
        let mut request = settings("Public");
        request["table_size"] = json!(2);
        request["ruleset"] = json!("Mtr");
        request["best_of"] = Value::Null;

        let refused = create(&mut client, &request).await;

        assert_eq!(refused["error"]["best_of_mismatch"], true, "{refused}");
    });
}

#[test]
fn a_multiplayer_tournament_is_not_paired_yet() {
    run(async {
        let mut client = TestClient::logged_in(&create_account(Role::Member).await).await;
        let created = create(&mut client, &settings("Public")).await;
        let tournament = created["uuid"].as_str().expect("uuid");
        for index in 0..4 {
            client
                .json(
                    Method::POST,
                    &api(&format!("tournaments/{tournament}/participants/guests")),
                    &json!({ "name": format!("Guest {index}") }),
                )
                .await
                .ok_json();
        }

        let refused = client
            .json(
                Method::POST,
                &api(&format!("tournaments/{tournament}/rounds")),
                &json!({}),
            )
            .await
            .ok_json();

        assert_eq!(refused["error"]["ruleset_not_paired"], true, "{refused}");
    });
}

#[test]
fn a_share_link_shows_the_rounds_and_standings_but_never_the_preview() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        let url = api(&format!("tournaments/{}", event.tournament));
        let mut unlisted = event.settings.clone();
        unlisted["visibility"] = json!("Unlisted");
        let body = event
            .owner
            .json(Method::PUT, &url, &unlisted)
            .await
            .ok_json();
        let token = body["share_token"].as_str().expect("a token").to_string();
        event.play_round().await;
        event.end(1).await;
        event.pair().await;

        let mut anonymous = TestClient::new();
        let rounds = anonymous
            .get(&api(&format!("shared/tournaments/{token}/rounds")))
            .await
            .ok_json();
        let standings = anonymous
            .get(&api(&format!("shared/tournaments/{token}/standings")))
            .await
            .ok_json();

        let numbers: Vec<&Value> = rounds["rounds"]
            .as_array()
            .expect("rounds")
            .iter()
            .map(|round| &round["number"])
            .collect();
        assert_eq!(numbers, vec![&json!(1)], "{rounds}");
        assert_eq!(
            standings["standings"].as_array().expect("standings").len(),
            4
        );
        let by_id = anonymous.get(&event.url("rounds")).await;
        assert!(!by_id.status.is_success(), "{by_id:?}");
    });
}
