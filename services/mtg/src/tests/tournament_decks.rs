//! Registered decks: a Participant registers one of its decks, which follows
//! the deck until the first Round starts and is a copy from then on, marked by
//! a Deck checkpoint named after the Tournament (ADR 0002)

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::rorm::Database;
use serde_json::Value;
use serde_json::json;
use url::Url;
use uuid::Uuid;

use crate::models::account::Role;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::tournaments::create;
use crate::tests::tournaments::settings;

/// The name the Tournaments of these tests go by
const TOURNAMENT_NAME: &str = "Friday Night Commander";

/// A player: an Account with a deck, a Participant of the [`Event`]
struct Player {
    /// The Account
    account: TestAccount,
    /// Logged in as it
    client: TestClient,
    /// Its Participant uuid
    participant: String,
    /// One of its decks, holding one Deck entry
    deck: String,
    /// The printing that Deck entry holds
    printing: Uuid,
}

impl Player {
    /// Create a deck named `name` with three copies of a fresh printing
    async fn deck(client: &mut TestClient, name: &str) -> (String, Uuid) {
        let body = client
            .json(
                Method::POST,
                &api("decks"),
                &json!({
                    "name": name,
                    "description": null,
                    "format": "modern",
                    "visibility": "Private",
                }),
            )
            .await
            .ok_json();
        let deck = body["uuid"].as_str().expect("deck uuid").to_string();
        let printing = Uuid::new_v4();
        add_card(client, &deck, printing, 3).await;
        (deck, printing)
    }

    /// Rename its deck
    async fn rename_deck(&mut self, name: &str) {
        let url = api(&format!("decks/{}", self.deck));
        self.client
            .json(
                Method::PUT,
                &url,
                &json!({ "name": name, "description": null, "format": "modern" }),
            )
            .await
            .ok_json();
    }

    /// The Deck checkpoints of its deck's Deck history, newest first
    async fn checkpoints(&mut self) -> Vec<(String, Value)> {
        let url = api(&format!("decks/{}/history", self.deck));
        self.client.get(&url).await.ok_json()["changes"]
            .as_array()
            .expect("change list")
            .iter()
            .map(|change| {
                (
                    change["uuid"].as_str().expect("change uuid").to_string(),
                    change["checkpoint"].clone(),
                )
            })
            .collect()
    }
}

/// Add `quantity` copies of `printing` to the main deck of `deck`
async fn add_card(client: &mut TestClient, deck: &str, printing: Uuid, quantity: i32) {
    client
        .json(
            Method::POST,
            &api(&format!("decks/{deck}/cards")),
            &json!({ "printing": printing, "quantity": quantity, "zone": "Main" }),
        )
        .await
        .ok_json();
}

/// A one-on-one Tournament with two Account Participants, each with a deck
struct Event {
    /// Logged in as the Owner
    owner: TestClient,
    /// The Tournament's uuid
    tournament: String,
    /// The two players
    players: [Player; 2],
}

impl Event {
    /// A public MTR Tournament played best of one by two fresh Accounts
    async fn new() -> Self {
        let mut owner = TestClient::logged_in(&create_account(Role::Member).await).await;
        let mut request = settings("Public");
        request["name"] = json!(TOURNAMENT_NAME);
        request["table_size"] = json!(2);
        request["ruleset"] = json!("Mtr");
        request["format"] = json!("modern");
        request["best_of"] = json!("One");
        let created = create(&mut owner, &request).await;
        let tournament = created["uuid"].as_str().expect("uuid").to_string();
        let first = Self::player(&mut owner, &tournament).await;
        let second = Self::player(&mut owner, &tournament).await;
        Self {
            owner,
            tournament,
            players: [first, second],
        }
    }

    /// A fresh Account with a deck, added as a Participant by the Owner
    async fn player(owner: &mut TestClient, tournament: &str) -> Player {
        let account = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&account).await;
        let body = owner
            .json(
                Method::POST,
                &api(&format!("tournaments/{tournament}/participants/accounts")),
                &json!({ "username": account.username }),
            )
            .await
            .ok_json();
        let participant = body["uuid"].as_str().expect("participant uuid").to_string();
        let (deck, printing) = Player::deck(&mut client, "Burn").await;
        Player {
            account,
            client,
            participant,
            deck,
            printing,
        }
    }

    /// The url of `path` below the Tournament
    fn url(&self, path: &str) -> Url {
        api(&format!("tournaments/{}/{path}", self.tournament))
    }

    /// Player `index` registers `deck` itself
    async fn register(&mut self, index: usize, deck: &str) -> TestResponse {
        let url = self.url("deck");
        self.players[index]
            .client
            .json(Method::PUT, &url, &json!({ "deck": deck }))
            .await
    }

    /// Player `index` registers its own deck itself, expecting success
    async fn register_own(&mut self, index: usize) {
        let deck = self.players[index].deck.clone();
        self.register(index, &deck).await.ok_json();
    }

    /// Player `index`'s own view of its Registered deck
    async fn mine(&mut self, index: usize) -> Value {
        let url = self.url("deck");
        self.players[index].client.get(&url).await.ok_json()
    }

    /// Every Registered deck as the Owner reads them
    async fn registered(&mut self) -> Value {
        let url = self.url("registered-decks");
        self.owner.get(&url).await.ok_json()
    }

    /// Pair and start Round 1 as the Owner
    async fn start(&mut self) {
        let url = self.url("rounds");
        self.owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();
        let url = self.url("rounds/1/start");
        self.owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();
    }

    /// The Deck entries of player `index`'s Registered deck as (printing, quantity)
    async fn entries(&self, index: usize) -> Vec<(Uuid, i32)> {
        let player = &self.players[index];
        let mut tx = Database::global()
            .start_transaction()
            .await
            .expect("transaction");
        let tournament: TournamentUuid =
            serde_json::from_value(json!(self.tournament)).expect("tournament uuid");
        let tournament = Tournament::get_visible(&mut tx, tournament, Some(player.account.uuid))
            .await
            .expect("read the tournament")
            .expect("visible to its participant");
        let participant = tournament
            .participant_of(&mut tx, player.account.uuid)
            .await
            .expect("read the participant")
            .expect("a participant");
        let deck = tournament
            .registered_deck(&mut tx, participant)
            .await
            .expect("read the registered deck")
            .expect("a registered deck");
        let mut entries: Vec<(Uuid, i32)> = tournament
            .registered_entries(&mut tx, &deck)
            .await
            .expect("read the entries")
            .into_iter()
            .map(|entry| (entry.key.printing, entry.quantity))
            .collect();
        tx.commit().await.expect("commit");
        entries.sort_unstable();
        entries
    }
}

#[test]
fn a_participant_registers_swaps_and_removes_its_deck_before_the_first_round() {
    run(async {
        let mut event = Event::new().await;
        assert_eq!(event.mine(0).await["deck"], Value::Null);

        event.register_own(0).await;
        let mine = event.mine(0).await;
        assert_eq!(
            mine["deck"]["deck"],
            event.players[0].deck.as_str(),
            "{mine}"
        );
        assert_eq!(mine["deck"]["name"], "Burn", "{mine}");
        assert_eq!(mine["deck"]["pinned"], false, "{mine}");
        assert_eq!(mine["changeable"], true, "{mine}");

        let (other, _) = Player::deck(&mut event.players[0].client, "Control").await;
        event.register(0, &other).await.ok_json();
        let mine = event.mine(0).await;
        assert_eq!(mine["deck"]["deck"], other.as_str(), "{mine}");
        assert_eq!(mine["deck"]["name"], "Control", "{mine}");

        let url = event.url("deck");
        event.players[0]
            .client
            .json(Method::DELETE, &url, &json!(null))
            .await
            .ok_json();
        assert_eq!(event.mine(0).await["deck"], Value::Null);
        assert_eq!(event.registered().await["decks"], json!([]));
    });
}

#[test]
fn a_participant_registers_only_its_own_decks() {
    run(async {
        let mut event = Event::new().await;
        let foreign = event.players[1].deck.clone();

        let refused = event.register(0, &foreign).await.ok_json();

        assert_eq!(refused["result"], "Err", "{refused}");
        assert_eq!(refused["error"]["not_their_deck"], true, "{refused}");
        assert_eq!(event.mine(0).await["deck"], Value::Null);
    });
}

#[test]
fn an_account_that_plays_in_no_tournament_registers_no_deck() {
    run(async {
        let mut event = Event::new().await;
        let account = create_account(Role::Member).await;
        let mut stranger = TestClient::logged_in(&account).await;
        let (deck, _) = Player::deck(&mut stranger, "Elves").await;

        let response = stranger
            .json(Method::PUT, &event.url("deck"), &json!({ "deck": deck }))
            .await;

        assert_eq!(response.status, StatusCode::BAD_REQUEST, "{response:?}");
        assert_eq!(event.registered().await["decks"], json!([]));
    });
}

#[test]
fn a_registered_deck_follows_its_deck_until_the_first_round() {
    run(async {
        let mut event = Event::new().await;
        event.register_own(0).await;
        let deck = event.players[0].deck.clone();
        let late = Uuid::new_v4();

        event.players[0].rename_deck("Burn, tuned").await;
        add_card(&mut event.players[0].client, &deck, late, 2).await;

        assert_eq!(event.mine(0).await["deck"]["name"], "Burn, tuned");
        let mut expected = vec![(event.players[0].printing, 3), (late, 2)];
        expected.sort_unstable();
        assert_eq!(event.entries(0).await, expected);
    });
}

#[test]
fn starting_the_first_round_pins_a_copy_and_sets_a_deck_checkpoint() {
    run(async {
        let mut event = Event::new().await;
        event.register_own(0).await;

        event.start().await;

        let mine = event.mine(0).await;
        assert_eq!(mine["deck"]["pinned"], true, "{mine}");
        assert_eq!(mine["deck"]["name"], "Burn", "{mine}");
        assert_eq!(mine["changeable"], false, "{mine}");
        let checkpoints = event.players[0].checkpoints().await;
        assert_eq!(checkpoints[0].1, TOURNAMENT_NAME, "{checkpoints:?}");
        assert_eq!(
            event.players[1].checkpoints().await[0].1,
            Value::Null,
            "an unregistered deck gets no Deck checkpoint"
        );
    });
}

#[test]
fn edits_to_the_deck_after_the_first_round_leave_the_registered_deck_unchanged() {
    run(async {
        let mut event = Event::new().await;
        event.register_own(0).await;
        event.start().await;
        let deck = event.players[0].deck.clone();
        let printing = event.players[0].printing;

        event.players[0].rename_deck("Burn, after").await;
        add_card(&mut event.players[0].client, &deck, Uuid::new_v4(), 4).await;

        let registered = event.registered().await;
        assert_eq!(registered["decks"][0]["name"], "Burn", "{registered}");
        assert_eq!(event.entries(0).await, vec![(printing, 3)]);
        let checkpoints = event.players[0].checkpoints().await;
        assert!(
            checkpoints
                .iter()
                .skip(1)
                .any(|(_, checkpoint)| checkpoint == TOURNAMENT_NAME),
            "the Deck checkpoint stays on the pinned Deck change: {checkpoints:?}"
        );
    });
}

#[test]
fn a_registered_deck_survives_deleting_its_deck() {
    run(async {
        let mut event = Event::new().await;
        event.register_own(0).await;
        event.start().await;
        let printing = event.players[0].printing;
        let url = api(&format!("decks/{}", event.players[0].deck));

        event.players[0]
            .client
            .json(Method::DELETE, &url, &json!(null))
            .await
            .ok_json();

        let mine = event.mine(0).await;
        assert_eq!(mine["deck"]["deck"], Value::Null, "{mine}");
        assert_eq!(mine["deck"]["name"], "Burn", "{mine}");
        assert_eq!(mine["deck"]["pinned"], true, "{mine}");
        assert_eq!(event.entries(0).await, vec![(printing, 3)]);
    });
}

#[test]
fn a_deck_deleted_before_the_first_round_leaves_its_participant_without_one() {
    run(async {
        let mut event = Event::new().await;
        event.register_own(0).await;
        let url = api(&format!("decks/{}", event.players[0].deck));

        event.players[0]
            .client
            .json(Method::DELETE, &url, &json!(null))
            .await
            .ok_json();
        assert_eq!(event.mine(0).await["deck"], Value::Null);
        event.start().await;

        assert_eq!(event.mine(0).await["deck"], Value::Null);
        assert_eq!(event.registered().await["decks"], json!([]));
    });
}

#[test]
fn renaming_or_removing_the_deck_checkpoint_leaves_the_tournament_alone() {
    run(async {
        let mut event = Event::new().await;
        event.register_own(0).await;
        event.start().await;
        let printing = event.players[0].printing;
        let (change, _) = event.players[0].checkpoints().await.remove(0);
        let url = api(&format!(
            "decks/{}/history/{change}/checkpoint",
            event.players[0].deck
        ));

        event.players[0]
            .client
            .json(Method::PUT, &url, &json!({ "name": "My FNM list" }))
            .await
            .ok_json();
        assert_eq!(event.players[0].checkpoints().await[0].1, "My FNM list");
        assert_eq!(event.mine(0).await["deck"]["pinned"], true);
        event.players[0]
            .client
            .json(Method::DELETE, &url, &json!(null))
            .await
            .ok_json();

        let mine = event.mine(0).await;
        assert_eq!(mine["deck"]["name"], "Burn", "{mine}");
        assert_eq!(mine["deck"]["pinned"], true, "{mine}");
        assert_eq!(event.entries(0).await, vec![(printing, 3)]);
    });
}

#[test]
fn a_deck_checkpoint_the_owner_named_keeps_its_name() {
    run(async {
        let mut event = Event::new().await;
        event.register_own(0).await;
        let (change, _) = event.players[0].checkpoints().await.remove(0);
        let url = api(&format!(
            "decks/{}/history/{change}/checkpoint",
            event.players[0].deck
        ));
        event.players[0]
            .client
            .json(Method::PUT, &url, &json!({ "name": "Final list" }))
            .await
            .ok_json();

        event.start().await;

        assert_eq!(event.players[0].checkpoints().await[0].1, "Final list");
        assert_eq!(event.mine(0).await["deck"]["pinned"], true);
    });
}

#[test]
fn after_the_first_round_the_participant_no_longer_changes_its_deck() {
    run(async {
        let mut event = Event::new().await;
        event.register_own(0).await;
        event.start().await;
        let (other, _) = Player::deck(&mut event.players[0].client, "Control").await;

        let swapped = event.register(0, &other).await.ok_json();
        let url = event.url("deck");
        let removed = event.players[0]
            .client
            .json(Method::DELETE, &url, &json!(null))
            .await
            .ok_json();

        assert_eq!(swapped["error"]["registration_over"], true, "{swapped}");
        assert_eq!(removed["error"]["registration_over"], true, "{removed}");
        assert_eq!(event.mine(0).await["deck"]["name"], "Burn");
    });
}

#[test]
fn an_organizer_swaps_a_deck_after_the_first_round_and_pins_it_at_once() {
    run(async {
        let mut event = Event::new().await;
        event.start().await;
        let (other, printing) = Player::deck(&mut event.players[1].client, "Control").await;
        let url = event.url(&format!(
            "participants/{}/deck",
            event.players[1].participant
        ));

        event
            .owner
            .json(Method::PUT, &url, &json!({ "deck": other }))
            .await
            .ok_json();

        let mine = event.mine(1).await;
        assert_eq!(mine["deck"]["deck"], other.as_str(), "{mine}");
        assert_eq!(mine["deck"]["pinned"], true, "{mine}");
        assert_eq!(event.entries(1).await, vec![(printing, 3)]);
        let history = event.players[1]
            .client
            .get(&api(&format!("decks/{other}/history")))
            .await
            .ok_json();
        assert_eq!(
            history["changes"][0]["checkpoint"], TOURNAMENT_NAME,
            "{history}"
        );

        event
            .owner
            .json(Method::DELETE, &url, &json!(null))
            .await
            .ok_json();
        assert_eq!(event.mine(1).await["deck"], Value::Null);
    });
}

#[test]
fn an_organizer_picks_among_the_participants_decks() {
    run(async {
        let mut event = Event::new().await;
        let url = event.url(&format!(
            "participants/{}/decks",
            event.players[0].participant
        ));

        let decks = event.owner.get(&url).await.ok_json();

        assert_eq!(
            decks["decks"][0]["uuid"],
            event.players[0].deck.as_str(),
            "{decks}"
        );
        assert_eq!(decks["decks"].as_array().map(Vec::len), Some(1), "{decks}");
        let foreign = event.players[1].deck.clone();
        let url = event.url(&format!(
            "participants/{}/deck",
            event.players[0].participant
        ));
        let refused = event
            .owner
            .json(Method::PUT, &url, &json!({ "deck": foreign }))
            .await
            .ok_json();
        assert_eq!(refused["error"]["not_their_deck"], true, "{refused}");
    });
}

#[test]
fn a_guest_has_no_decks_to_register() {
    run(async {
        let mut event = Event::new().await;
        let guest = event
            .owner
            .json(
                Method::POST,
                &event.url("participants/guests"),
                &json!({ "name": "Uncle Bob" }),
            )
            .await
            .ok_json();
        let guest = guest["uuid"].as_str().expect("guest uuid");
        let deck = event.players[0].deck.clone();

        let refused = event
            .owner
            .json(
                Method::PUT,
                &event.url(&format!("participants/{guest}/deck")),
                &json!({ "deck": deck }),
            )
            .await
            .ok_json();

        assert_eq!(refused["error"]["guest"], true, "{refused}");
    });
}

#[test]
fn only_organizers_read_every_registered_deck() {
    run(async {
        let mut event = Event::new().await;
        event.register_own(0).await;

        let registered = event.registered().await;
        let url = event.url("registered-decks");
        let response = event.players[1].client.get(&url).await;

        assert_eq!(
            registered["decks"][0]["participant"],
            event.players[0].participant.as_str(),
            "{registered}"
        );
        assert_eq!(response.status, StatusCode::BAD_REQUEST, "{response:?}");
    });
}
