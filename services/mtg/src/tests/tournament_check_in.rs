//! Check-in: where the Owner asks for it, Organizers check Participants in at
//! the desk and only those checked in are paired; with a deck required, an
//! Account checks in only with a Registered deck, which keeps following its
//! deck until the first Round starts

use galvyn::core::re_exports::axum::http::Method;
use serde_json::Value;
use serde_json::json;
use url::Url;

use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::tournament_participants::roster;
use crate::tests::tournament_rounds::Event;
use crate::tests::tournament_rounds::round;
use crate::tests::tournament_rounds::seated;
use crate::tests::tournaments::tournament_url;

/// Give the Event's Tournament the check-in `rule`, returning the body
async fn require(event: &mut Event, rule: &str) -> Value {
    event.settings["check_in"] = json!(rule);
    let url = tournament_url(&event.tournament);
    let settings = event.settings.clone();
    event
        .owner
        .json(Method::PUT, &url, &settings)
        .await
        .ok_json()
}

/// The url checking `participant` of the Event in or out
fn checked_in_url(event: &Event, participant: &str) -> Url {
    event.url(&format!("participants/{participant}/checked-in"))
}

/// Check `participant` in or out as `client`
async fn set(client: &mut TestClient, url: &Url, checked_in: bool) -> TestResponse {
    client
        .json(Method::PUT, url, &json!({ "checked_in": checked_in }))
        .await
}

/// Check `participant` in or out as the Owner, returning the body
async fn check(event: &mut Event, participant: &str, checked_in: bool) -> Value {
    let url = checked_in_url(event, participant);
    set(&mut event.owner, &url, checked_in).await.ok_json()
}

/// Check everybody in as the Owner, returning the body
async fn check_in_everyone(event: &mut Event) -> Value {
    let url = event.url("participants/check-in");
    event
        .owner
        .json(Method::POST, &url, &json!({}))
        .await
        .ok_json()
}

/// The check-in flag of every Participant on a list, by uuid
fn flags(body: &Value) -> Vec<(String, Value)> {
    body["participants"]
        .as_array()
        .expect("a list of participants")
        .iter()
        .map(|participant| {
            (
                participant["uuid"].as_str().expect("uuid").to_string(),
                participant["checked_in"].clone(),
            )
        })
        .collect()
}

/// The check-in flag of `participant` as the Owner reads the list
async fn flag(event: &mut Event, participant: &str) -> Value {
    let tournament = event.tournament.clone();
    let listed = roster(&mut event.owner, &tournament).await;
    flags(&listed)
        .into_iter()
        .find(|(uuid, _)| uuid == participant)
        .map(|(_, flag)| flag)
        .expect("the participant")
}

/// Who sits in Round `number`, as Participant uuids, sorted
async fn seated_in(event: &mut Event, number: i64) -> Vec<String> {
    let rounds = event.rounds().await;
    let mut seats: Vec<String> = round(&rounds, number)["matches"]
        .as_array()
        .expect("a list of matches")
        .iter()
        .flat_map(seated)
        .collect();
    seats.sort();
    seats
}

/// An Account added to the Event by the Owner, logged in, with a deck of its own
struct Player {
    /// Logged in as it
    client: TestClient,
    /// Its Participant uuid
    participant: String,
    /// Its deck
    deck: String,
}

impl Player {
    /// A fresh Account with an empty modern deck, added by the Owner
    async fn new(event: &mut Event) -> Self {
        let account = create_account(Role::Member).await;
        let participant = event.add_account(&account.username).await;
        let mut client = TestClient::logged_in(&account).await;
        let body = client
            .json(
                Method::POST,
                &api("decks"),
                &json!({
                    "name": "Burn",
                    "description": null,
                    "format": "modern",
                    "visibility": "Private",
                }),
            )
            .await
            .ok_json();
        let deck = body["uuid"].as_str().expect("deck uuid").to_string();
        Self {
            client,
            participant,
            deck,
        }
    }

    /// Register its deck itself
    async fn register(&mut self, event: &Event) {
        let deck = self.deck.clone();
        self.client
            .json(Method::PUT, &event.url("deck"), &json!({ "deck": deck }))
            .await
            .ok_json();
    }

    /// Its own view of its Registered deck
    async fn mine(&mut self, event: &Event) -> Value {
        self.client.get(&event.url("deck")).await.ok_json()["deck"].clone()
    }
}

#[test]
fn without_check_in_everybody_counts_as_checked_in_and_is_paired() {
    run(async {
        let mut event = Event::new("One", 2).await;
        let players = event.players.clone();
        let tournament = event.tournament.clone();
        let listed = roster(&mut event.owner, &tournament).await;
        assert!(
            flags(&listed).iter().all(|(_, flag)| flag == &json!(true)),
            "{listed}"
        );

        let refused = check(&mut event, &players[0], true).await;
        assert_eq!(refused["error"]["no_check_in"], true, "{refused}");
        let refused = check_in_everyone(&mut event).await;
        assert_eq!(refused["error"]["no_check_in"], true, "{refused}");

        event.pair().await;
        let mut expected = players.clone();
        expected.sort();
        assert_eq!(seated_in(&mut event, 1).await, expected);
    });
}

#[test]
fn with_check_in_only_who_is_checked_in_is_paired() {
    run(async {
        let mut event = Event::new("One", 3).await;
        let body = require(&mut event, "Required").await;
        assert_eq!(body["check_in"], "Required", "{body}");
        let players = event.players.clone();
        assert_eq!(flag(&mut event, &players[0]).await, false);

        let refused = event.pair().await;
        assert_eq!(refused["error"]["too_few_participants"], true, "{refused}");

        check(&mut event, &players[0], true).await;
        check(&mut event, &players[1], true).await;
        assert_eq!(flag(&mut event, &players[0]).await, true);
        event.pair().await;
        let mut expected = players[..2].to_vec();
        expected.sort();
        assert_eq!(seated_in(&mut event, 1).await, expected);

        check(&mut event, &players[2], true).await;
        let rounds = event.rounds().await;
        assert_eq!(
            rounds["rounds"],
            json!([]),
            "the preview is discarded: {rounds}"
        );
    });
}

#[test]
fn changing_the_check_in_rule_discards_a_previewed_round() {
    run(async {
        let mut event = Event::new("One", 2).await;
        event.pair().await;
        require(&mut event, "Required").await;
        let rounds = event.rounds().await;
        assert_eq!(
            rounds["rounds"],
            json!([]),
            "the preview paired who is not checked in: {rounds}"
        );
    });
}

#[test]
fn a_participant_that_dropped_is_not_checked_in() {
    run(async {
        let mut event = Event::new("One", 3).await;
        require(&mut event, "Required").await;
        let players = event.players.clone();
        check(&mut event, &players[0], true).await;
        check(&mut event, &players[1], true).await;
        event.pair().await;
        event.start(1).await;
        let url = event.url(&format!("participants/{}/drop", players[2]));
        event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();

        let refused = check(&mut event, &players[2], true).await;
        assert_eq!(refused["error"]["dropped"], true, "{refused}");
        assert_eq!(flag(&mut event, &players[2]).await, false);
    });
}

#[test]
fn a_participant_is_checked_out_again_before_the_first_round() {
    run(async {
        let mut event = Event::new("One", 1).await;
        require(&mut event, "Required").await;
        let guest = event.players[0].clone();
        check(&mut event, &guest, true).await;
        check(&mut event, &guest, false).await;
        assert_eq!(flag(&mut event, &guest).await, false);
    });
}

#[test]
fn with_a_deck_required_an_account_checks_in_only_with_a_registered_deck() {
    run(async {
        let mut event = Event::new("One", 0).await;
        require(&mut event, "RequiredWithDeck").await;
        let mut player = Player::new(&mut event).await;

        let refused = check(&mut event, &player.participant, true).await;
        assert_eq!(refused["error"]["no_registered_deck"], true, "{refused}");
        assert_eq!(flag(&mut event, &player.participant).await, false);

        player.register(&event).await;
        let body = check(&mut event, &player.participant, true).await;
        assert!(body.is_null(), "{body}");
        assert_eq!(flag(&mut event, &player.participant).await, true);
    });
}

#[test]
fn with_a_deck_required_a_guest_is_checked_in_without_one() {
    run(async {
        let mut event = Event::new("One", 1).await;
        require(&mut event, "RequiredWithDeck").await;
        let guest = event.players[0].clone();
        let body = check(&mut event, &guest, true).await;
        assert!(body.is_null(), "{body}");
        assert_eq!(flag(&mut event, &guest).await, true);
    });
}

#[test]
fn checking_in_leaves_the_registered_deck_following_its_deck_until_the_first_round() {
    run(async {
        let mut event = Event::new("One", 1).await;
        require(&mut event, "RequiredWithDeck").await;
        let guest = event.players[0].clone();
        let mut player = Player::new(&mut event).await;
        player.register(&event).await;
        check(&mut event, &player.participant, true).await;
        check(&mut event, &guest, true).await;

        let url = api(&format!("decks/{}", player.deck));
        player
            .client
            .json(
                Method::PUT,
                &url,
                &json!({ "name": "Burn, tuned", "description": null, "format": "modern" }),
            )
            .await
            .ok_json();
        let mine = player.mine(&event).await;
        assert_eq!(mine["pinned"], false, "{mine}");
        assert_eq!(mine["name"], "Burn, tuned", "{mine}");

        event.pair().await;
        event.start(1).await;
        let mine = player.mine(&event).await;
        assert_eq!(mine["pinned"], true, "{mine}");
    });
}

#[test]
fn once_the_first_round_started_participants_are_checked_in_but_not_out() {
    run(async {
        let mut event = Event::new("One", 2).await;
        require(&mut event, "Required").await;
        let players = event.players.clone();
        for participant in &players {
            check(&mut event, participant, true).await;
        }
        event.pair().await;
        event.start(1).await;

        let late = event.add_guest("Late").await;
        assert_eq!(flag(&mut event, &late).await, false);
        let body = check(&mut event, &late, true).await;
        assert!(body.is_null(), "{body}");
        let refused = check(&mut event, &players[0], false).await;
        assert_eq!(refused["error"]["round_started"], true, "{refused}");
        assert_eq!(flag(&mut event, &players[0]).await, true);
    });
}

#[test]
fn nobody_is_checked_in_once_the_tournament_is_over() {
    run(async {
        let mut event = Event::new("One", 1).await;
        require(&mut event, "Required").await;
        let guest = event.players[0].clone();
        let url = event.url("cancel");
        event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();

        let refused = check(&mut event, &guest, true).await;
        assert_eq!(refused["error"]["tournament_over"], true, "{refused}");
        let refused = check_in_everyone(&mut event).await;
        assert_eq!(refused["error"]["tournament_over"], true, "{refused}");
    });
}

#[test]
fn checking_everybody_in_names_the_accounts_without_a_registered_deck() {
    run(async {
        let mut event = Event::new("One", 1).await;
        require(&mut event, "RequiredWithDeck").await;
        let guest = event.players[0].clone();
        let without = Player::new(&mut event).await;
        let mut with = Player::new(&mut event).await;
        with.register(&event).await;

        let body = check_in_everyone(&mut event).await;
        assert_eq!(
            body["no_registered_deck"],
            json!([without.participant]),
            "{body}"
        );
        assert_eq!(flag(&mut event, &guest).await, true);
        assert_eq!(flag(&mut event, &with.participant).await, true);
        assert_eq!(flag(&mut event, &without.participant).await, false);
    });
}

#[test]
fn only_organizers_check_participants_in() {
    run(async {
        let mut event = Event::new("One", 1).await;
        require(&mut event, "Required").await;
        let guest = event.players[0].clone();
        let mut player = Player::new(&mut event).await;

        let url = checked_in_url(&event, &guest);
        let refused = set(&mut event.stranger, &url, true).await;
        assert!(!refused.status.is_success(), "{refused:?}");
        let url = checked_in_url(&event, &player.participant);
        let refused = set(&mut player.client, &url, true).await;
        assert!(!refused.status.is_success(), "{refused:?}");
        let url = event.url("participants/check-in");
        let refused = event.stranger.json(Method::POST, &url, &json!({})).await;
        assert!(!refused.status.is_success(), "{refused:?}");
        let refused = player.client.json(Method::POST, &url, &json!({})).await;
        assert!(!refused.status.is_success(), "{refused:?}");

        assert_eq!(flag(&mut event, &guest).await, false);
        assert_eq!(flag(&mut event, &player.participant).await, false);
    });
}

#[test]
fn only_organizers_and_the_participant_itself_learn_who_is_checked_in() {
    run(async {
        let mut event = Event::new("One", 1).await;
        require(&mut event, "Required").await;
        let guest = event.players[0].clone();
        let mut player = Player::new(&mut event).await;
        check(&mut event, &player.participant, true).await;
        let tournament = event.tournament.clone();

        let as_player = roster(&mut player.client, &tournament).await;
        assert_eq!(
            flags(&as_player),
            vec![
                (guest.clone(), Value::Null),
                (player.participant.clone(), json!(true))
            ],
            "{as_player}"
        );
        let as_stranger = roster(&mut event.stranger, &tournament).await;
        assert!(
            flags(&as_stranger).iter().all(|(_, flag)| flag.is_null()),
            "{as_stranger}"
        );
        let anonymous = TestClient::new()
            .get(&event.url("participants"))
            .await
            .ok_json();
        assert!(
            flags(&anonymous).iter().all(|(_, flag)| flag.is_null()),
            "{anonymous}"
        );
    });
}

#[test]
fn the_check_in_rule_is_fixed_once_the_first_round_started() {
    run(async {
        let mut event = Event::new("One", 2).await;
        require(&mut event, "Required").await;
        let players = event.players.clone();
        for participant in &players {
            check(&mut event, participant, true).await;
        }
        event.pair().await;
        event.start(1).await;

        let refused = require(&mut event, "Off").await;
        assert_eq!(refused["error"]["rules_locked"], true, "{refused}");
        let refused = require(&mut event, "RequiredWithDeck").await;
        assert_eq!(refused["error"]["rules_locked"], true, "{refused}");
    });
}

#[test]
fn a_limited_tournament_does_not_ask_for_decks_at_check_in() {
    run(async {
        let mut event = Event::new("One", 0).await;
        event.settings["format"] = json!("draft");
        let refused = require(&mut event, "RequiredWithDeck").await;
        assert_eq!(
            refused["error"]["check_in_deck_for_limited"], true,
            "{refused}"
        );
        let body = require(&mut event, "Required").await;
        assert_eq!(body["check_in"], "Required", "{body}");
    });
}
