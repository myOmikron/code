//! The Deck history and the Deck entries it is kept for

use galvyn::core::re_exports::axum::http::Method;
use galvyn::rorm::Database;
use galvyn::rorm::DatabaseConfiguration;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::migrate;
use crate::tests::harness::migrated_database;
use crate::tests::harness::run;

/// The last migration before Deck entries became unique
const BEFORE_UNIQUE_ENTRIES: u16 = 45;

/// A logged-in owner and one of their decks
struct Fixture {
    owner: TestClient,
    deck: String,
}

impl Fixture {
    /// A fresh Account with an empty private deck
    async fn new() -> Self {
        let account = create_account(Role::Member).await;
        let mut owner = TestClient::logged_in(&account).await;
        let body = owner
            .json(
                Method::POST,
                &api("decks"),
                &json!({
                    "name": "History",
                    "description": null,
                    "format": "modern",
                    "visibility": "Private",
                }),
            )
            .await
            .ok_json();
        let deck = body["uuid"].as_str().expect("deck uuid").to_string();
        Self { owner, deck }
    }

    /// Adds copies of a printing, returning the Deck entry's uuid
    async fn add(&mut self, entry: Value) -> String {
        let body = self
            .owner
            .json(
                Method::POST,
                &api(&format!("decks/{}/cards", self.deck)),
                &entry,
            )
            .await
            .ok_json();
        body["uuid"].as_str().expect("entry uuid").to_string()
    }

    /// Imports a decklist, adding to or replacing what is there
    async fn import(&mut self, cards: Value, replace: bool) {
        self.owner
            .json(
                Method::POST,
                &api(&format!("decks/{}/cards/import", self.deck)),
                &json!({ "cards": cards, "replace": replace }),
            )
            .await
            .ok_json();
    }

    /// Changes some fields of a Deck entry
    async fn patch(&mut self, entry: &str, patch: Value) {
        let body = self
            .owner
            .json(
                Method::PATCH,
                &api(&format!("decks/{}/cards/{entry}", self.deck)),
                &patch,
            )
            .await
            .ok_json();
        assert_eq!(body, Value::Null);
    }

    /// Creates a tag local to the deck and puts it on a Deck entry
    async fn tag(&mut self, entry: &str, name: &str) -> String {
        let body = self
            .owner
            .json(
                Method::POST,
                &api(&format!("decks/{}/tags", self.deck)),
                &json!({ "name": name, "color": "red", "icon": "tag", "global": false }),
            )
            .await
            .ok_json();
        let tag = body["uuid"].as_str().expect("tag uuid").to_string();
        self.owner
            .json(
                Method::POST,
                &api(&format!("decks/{}/cards/{entry}/tags/{tag}", self.deck)),
                &json!(null),
            )
            .await
            .ok_json();
        tag
    }

    /// The deck's Deck entries as the card list shows them
    async fn entries(&mut self) -> Vec<Value> {
        let body = self
            .owner
            .get(&api(&format!("decks/{}/cards", self.deck)))
            .await
            .ok_json();
        body["cards"].as_array().expect("card list").clone()
    }
}

/// The tags of an entry, sorted so two lists compare as sets
fn tags(entry: &Value) -> Vec<String> {
    let mut tags: Vec<String> = entry["tags"]
        .as_array()
        .expect("tag list")
        .iter()
        .map(|tag| tag.as_str().expect("tag uuid").to_string())
        .collect();
    tags.sort();
    tags
}

#[test]
fn moving_an_entry_onto_an_alike_one_merges_quantity_and_tags() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let main = fixture
            .add(json!({ "printing": printing, "quantity": 2, "zone": "Main" }))
            .await;
        let side = fixture
            .add(json!({ "printing": printing, "quantity": 3, "zone": "Side" }))
            .await;
        let ramp = fixture.tag(&main, "Ramp").await;
        let hate = fixture.tag(&side, "Hate").await;

        fixture.patch(&side, json!({ "zone": "Main" })).await;

        let entries = fixture.entries().await;
        assert_eq!(entries.len(), 1, "{entries:?}");
        assert_eq!(entries[0]["zone"], "Main");
        assert_eq!(entries[0]["quantity"], 5);
        let mut expected = vec![ramp, hate];
        expected.sort();
        assert_eq!(tags(&entries[0]), expected);
    });
}

#[test]
fn switching_printing_foil_or_proxy_onto_an_alike_entry_merges() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let other = Uuid::new_v4();
        let target = fixture
            .add(json!({ "printing": printing, "quantity": 1, "zone": "Main", "foil": true, "proxy": true }))
            .await;
        let kept = fixture.tag(&target, "Kept").await;

        let reprint = fixture
            .add(json!({ "printing": other, "quantity": 1, "zone": "Main", "foil": true, "proxy": true }))
            .await;
        fixture
            .patch(&reprint, json!({ "printing": printing }))
            .await;
        let nonfoil = fixture
            .add(json!({ "printing": printing, "quantity": 2, "zone": "Main", "proxy": true }))
            .await;
        let carried = fixture.tag(&nonfoil, "Carried").await;
        fixture.patch(&nonfoil, json!({ "foil": true })).await;
        let real = fixture
            .add(json!({ "printing": printing, "quantity": 4, "zone": "Main", "foil": true }))
            .await;
        fixture.patch(&real, json!({ "proxy": true })).await;

        let entries = fixture.entries().await;
        assert_eq!(entries.len(), 1, "{entries:?}");
        assert_eq!(entries[0]["uuid"], target.as_str());
        assert_eq!(entries[0]["quantity"], 8);
        let mut expected = vec![kept, carried];
        expected.sort();
        assert_eq!(tags(&entries[0]), expected);
    });
}

#[test]
fn adding_a_card_with_an_alike_entry_raises_its_quantity() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let first = fixture
            .add(json!({ "printing": printing, "quantity": 2, "zone": "Side" }))
            .await;
        let second = fixture
            .add(json!({ "printing": printing, "quantity": 1, "zone": "Side" }))
            .await;
        fixture
            .add(json!({ "printing": printing, "quantity": 1, "zone": "Main" }))
            .await;

        assert_eq!(first, second);
        let entries = fixture.entries().await;
        assert_eq!(entries.len(), 2, "{entries:?}");
        let side = entries
            .iter()
            .find(|entry| entry["zone"] == "Side")
            .expect("side entry");
        assert_eq!(side["quantity"], 3);
    });
}

#[test]
fn importing_cards_with_alike_entries_raises_their_quantity() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let other = Uuid::new_v4();
        fixture
            .add(json!({ "printing": printing, "quantity": 2, "zone": "Main" }))
            .await;

        fixture
            .import(
                json!([
                    { "printing": printing, "quantity": 1, "zone": "Main" },
                    { "printing": other, "quantity": 1, "zone": "Main" },
                    { "printing": other, "quantity": 3, "zone": "Main" },
                ]),
                false,
            )
            .await;

        let mut entries: Vec<(String, i64)> = fixture
            .entries()
            .await
            .iter()
            .map(|entry| {
                (
                    entry["printing"].as_str().expect("printing").to_string(),
                    entry["quantity"].as_i64().expect("quantity"),
                )
            })
            .collect();
        entries.sort();
        let mut expected = vec![(printing.to_string(), 3), (other.to_string(), 4)];
        expected.sort();
        assert_eq!(entries, expected);
    });
}

#[test]
fn a_replacing_import_naming_a_card_twice_makes_one_entry() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        fixture
            .add(json!({ "printing": printing, "quantity": 2, "zone": "Main" }))
            .await;

        fixture
            .import(
                json!([
                    { "printing": printing, "quantity": 1, "zone": "Main" },
                    { "printing": printing, "quantity": 1, "zone": "Main" },
                ]),
                true,
            )
            .await;

        let entries = fixture.entries().await;
        assert_eq!(entries.len(), 1, "{entries:?}");
        assert_eq!(entries[0]["quantity"], 2);
    });
}

#[test]
fn setting_an_entrys_quantity_to_zero_removes_it() {
    run(async {
        let mut fixture = Fixture::new().await;
        let entry = fixture
            .add(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;

        fixture.patch(&entry, json!({ "quantity": 0 })).await;

        assert_eq!(fixture.entries().await, Vec::<Value>::new());
    });
}

#[test]
fn the_migration_merges_alike_entries_and_keeps_their_tags() {
    run(async {
        let driver = migrated_database(Some(BEFORE_UNIQUE_ENTRIES)).await;
        let db = Database::connect(DatabaseConfiguration::new(driver.clone()))
            .await
            .expect("connect to the test database");
        let pool = db.as_pool();

        let [identity, account, deck, printing] = [(); 4].map(|()| Uuid::now_v7());
        let [ramp, draw, hate] = [(); 3].map(|()| Uuid::now_v7());
        let [first, second, third, side] = [(); 4].map(|()| Uuid::now_v7());
        sqlx::query("INSERT INTO identity (uuid) VALUES ($1)")
            .bind(identity)
            .execute(pool)
            .await
            .expect("insert the identity");
        sqlx::query(
            "INSERT INTO account (uuid, username, username_normalized, email, identity) \
             VALUES ($1, 'dupes', 'dupes', 'dupes@mtg.test', $2)",
        )
        .bind(account)
        .bind(identity)
        .execute(pool)
        .await
        .expect("insert the account");
        sqlx::query(
            "INSERT INTO deck (uuid, name, format, visibility, owner) \
             VALUES ($1, 'Dupes', 'modern', 'Private', $2)",
        )
        .bind(deck)
        .bind(account)
        .execute(pool)
        .await
        .expect("insert the deck");
        for tag in [ramp, draw, hate] {
            sqlx::query(
                "INSERT INTO deck_tag (uuid, name, color, owner, deck) \
                 VALUES ($1, 'Tag', 'red', $2, $3)",
            )
            .bind(tag)
            .bind(account)
            .bind(deck)
            .execute(pool)
            .await
            .expect("insert a tag");
        }
        for (entry, quantity, zone) in [
            (first, 2, "Main"),
            (second, 3, "Main"),
            (third, 1, "Main"),
            (side, 1, "Side"),
        ] {
            sqlx::query(
                "INSERT INTO deckcard (uuid, printing, quantity, zone, deck) \
                 VALUES ($1, $2, $3, $4, $5)",
            )
            .bind(entry)
            .bind(printing)
            .bind(quantity)
            .bind(zone)
            .bind(deck)
            .execute(pool)
            .await
            .expect("insert an entry");
        }
        for (entry, tag) in [(first, ramp), (second, ramp), (second, draw), (third, hate)] {
            sqlx::query("INSERT INTO deck_card_tag (uuid, deck_card, tag) VALUES ($1, $2, $3)")
                .bind(Uuid::now_v7())
                .bind(entry)
                .bind(tag)
                .execute(pool)
                .await
                .expect("insert an assignment");
        }

        migrate(&driver, None).await;

        let mut entries: Vec<(String, i32)> =
            sqlx::query_as("SELECT zone, quantity FROM deckcard WHERE deck = $1")
                .bind(deck)
                .fetch_all(pool)
                .await
                .expect("read the entries");
        entries.sort();
        assert_eq!(
            entries,
            vec![("Main".to_string(), 6), ("Side".to_string(), 1)]
        );

        let mut tags: Vec<Uuid> = sqlx::query_scalar(
            "SELECT a.tag FROM deck_card_tag a \
             JOIN deckcard c ON c.uuid = a.deck_card \
             WHERE c.deck = $1 AND c.zone = 'Main'",
        )
        .bind(deck)
        .fetch_all(pool)
        .await
        .expect("read the assignments");
        tags.sort();
        let mut expected = vec![ramp, draw, hate];
        expected.sort();
        assert_eq!(tags, expected);

        let duplicate = sqlx::query(
            "INSERT INTO deckcard (uuid, printing, quantity, zone, deck) \
             VALUES ($1, $2, 1, 'Side', $3)",
        )
        .bind(Uuid::now_v7())
        .bind(printing)
        .bind(deck)
        .execute(pool)
        .await;
        assert!(duplicate.is_err(), "a second alike entry was accepted");

        db.close().await;
    });
}

#[test]
fn filling_a_proxy_entry_merges_it_into_the_real_alike_entry() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        fixture
            .add(json!({ "printing": printing, "quantity": 2, "zone": "Main" }))
            .await;
        let proxy = fixture
            .add(json!({ "printing": printing, "quantity": 1, "zone": "Main", "proxy": true }))
            .await;
        let deck = fixture.deck.clone();
        fixture
            .owner
            .json(
                Method::POST,
                &api(&format!("decks/{deck}/collection")),
                &json!(null),
            )
            .await
            .ok_json();

        fixture
            .owner
            .json(
                Method::POST,
                &api(&format!("decks/{deck}/sourcing/fill")),
                &json!({ "slot": proxy }),
            )
            .await
            .ok_json();

        let entries = fixture.entries().await;
        assert_eq!(entries.len(), 1, "{entries:?}");
        assert_eq!(entries[0]["proxy"], false);
        assert_eq!(entries[0]["quantity"], 3);
    });
}
