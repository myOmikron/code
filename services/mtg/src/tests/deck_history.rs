//! The Deck history and the Deck entries it is kept for

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::rorm::Database;
use galvyn::rorm::DatabaseConfiguration;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value as SqlValue;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::models::deck::DeckUuid;
use crate::models::deck::history::DeckChangeKind;
use crate::models::deck::history::DeckHistory;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::migrate;
use crate::tests::harness::migrated_database;
use crate::tests::harness::run;

/// The last migration before Deck entries became unique
const BEFORE_UNIQUE_ENTRIES: u16 = 45;

/// The last migration before Deck histories
const BEFORE_DECK_HISTORIES: u16 = 46;

/// A logged-in owner and one of their decks
struct Fixture {
    owner: TestClient,
    deck: String,
}

impl Fixture {
    /// A fresh Account with an empty private deck
    async fn new() -> Self {
        Self::with_visibility("Private").await
    }

    /// A fresh Account with an empty deck of the given visibility
    async fn with_visibility(visibility: &str) -> Self {
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
                    "visibility": visibility,
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

    /// One page of the deck's Deck history, newest first
    async fn history(&mut self, query: &str) -> Value {
        self.owner
            .get(&api(&format!("decks/{}/history{query}", self.deck)))
            .await
            .ok_json()
    }

    /// The kinds of the deck's Deck changes, newest first
    async fn kinds(&mut self) -> Vec<String> {
        self.history("").await["changes"]
            .as_array()
            .expect("change list")
            .iter()
            .map(|change| change["kind"].as_str().expect("kind").to_string())
            .collect()
    }

    /// The newest Deck change's entries as (zone, before, after)
    async fn latest(&mut self) -> Vec<(String, i64, i64)> {
        let history = self.history("").await;
        history["changes"][0]["entries"]
            .as_array()
            .expect("entry list")
            .iter()
            .map(|entry| {
                (
                    entry["zone"].as_str().expect("zone").to_string(),
                    entry["before"].as_i64().expect("before"),
                    entry["after"].as_i64().expect("after"),
                )
            })
            .collect()
    }

    /// Takes a Deck entry out of the deck
    async fn remove(&mut self, entry: &str) {
        self.owner
            .json(
                Method::DELETE,
                &api(&format!("decks/{}/cards/{entry}", self.deck)),
                &json!(null),
            )
            .await
            .ok_json();
    }

    /// Swaps copies of a Deck entry for another card
    async fn swap(&mut self, entry: &str, swap: Value) -> TestResponse {
        self.owner
            .json(
                Method::POST,
                &api(&format!("decks/{}/cards/{entry}/swap", self.deck)),
                &swap,
            )
            .await
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

/// A deck's id as the models take it
fn deck_uuid(uuid: Uuid) -> DeckUuid {
    uuid.to_string().parse().expect("a uuid")
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

#[test]
fn a_new_deck_starts_its_deck_history_with_its_creation() {
    run(async {
        let mut fixture = Fixture::new().await;

        assert_eq!(fixture.kinds().await, vec!["Created"]);
    });
}

#[test]
fn the_migration_introduces_existing_decks_with_their_entries() {
    run(async {
        let driver = migrated_database(Some(BEFORE_DECK_HISTORIES)).await;
        let db = Database::connect(DatabaseConfiguration::new(driver.clone()))
            .await
            .expect("connect to the test database");
        let pool = db.as_pool();

        let [identity, account, deck, empty, printing] = [(); 5].map(|()| Uuid::now_v7());
        sqlx::query("INSERT INTO identity (uuid) VALUES ($1)")
            .bind(identity)
            .execute(pool)
            .await
            .expect("insert the identity");
        sqlx::query(
            "INSERT INTO account (uuid, username, username_normalized, email, identity) \
             VALUES ($1, 'old', 'old', 'old@mtg.test', $2)",
        )
        .bind(account)
        .bind(identity)
        .execute(pool)
        .await
        .expect("insert the account");
        for uuid in [deck, empty] {
            sqlx::query(
                "INSERT INTO deck (uuid, name, format, visibility, owner) \
                 VALUES ($1, 'Old', 'modern', 'Private', $2)",
            )
            .bind(uuid)
            .bind(account)
            .execute(pool)
            .await
            .expect("insert a deck");
        }
        for (quantity, zone, foil) in [(4, "Main", false), (1, "Side", true)] {
            sqlx::query(
                "INSERT INTO deckcard (uuid, printing, quantity, zone, foil, deck) \
                 VALUES ($1, $2, $3, $4, $5, $6)",
            )
            .bind(Uuid::now_v7())
            .bind(printing)
            .bind(quantity)
            .bind(zone)
            .bind(foil)
            .bind(deck)
            .execute(pool)
            .await
            .expect("insert an entry");
        }

        migrate(&driver, None).await;

        let mut tx = db.start_transaction().await.expect("start a transaction");
        let page = DeckHistory::page(&mut tx, deck_uuid(deck), None, 10)
            .await
            .expect("read the deck history");
        let unused = DeckHistory::page(&mut tx, deck_uuid(empty), None, 10)
            .await
            .expect("read the deck history");
        tx.commit().await.expect("commit");

        assert_eq!(page.changes.len(), 1, "{page:?}");
        assert_eq!(page.changes[0].kind, DeckChangeKind::Introduced);
        let mut entries: Vec<(String, bool, i32, i32)> = page.changes[0]
            .entries
            .iter()
            .map(|entry| {
                let difference = &entry.difference;
                (
                    difference.zone.as_str().to_string(),
                    difference.foil,
                    difference.before,
                    difference.after,
                )
            })
            .collect();
        entries.sort();
        assert_eq!(
            entries,
            vec![
                ("Main".to_string(), false, 0, 4),
                ("Side".to_string(), true, 0, 1)
            ]
        );
        assert_eq!(unused.changes.len(), 1, "{unused:?}");
        assert_eq!(unused.changes[0].kind, DeckChangeKind::Introduced);
        assert!(unused.changes[0].entries.is_empty());

        db.close().await;
    });
}

#[test]
fn adding_a_card_records_one_deck_change() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();

        fixture
            .add(json!({ "printing": printing, "quantity": 2, "zone": "Main" }))
            .await;
        assert_eq!(fixture.kinds().await, vec!["Edit", "Created"]);
        assert_eq!(fixture.latest().await, vec![("Main".to_string(), 0, 2)]);
        fixture.age_latest().await;

        fixture
            .add(json!({ "printing": printing, "quantity": 1, "zone": "Main" }))
            .await;
        assert_eq!(fixture.kinds().await, vec!["Edit", "Edit", "Created"]);
        assert_eq!(fixture.latest().await, vec![("Main".to_string(), 2, 3)]);
    });
}

#[test]
fn changing_an_entrys_quantity_records_one_deck_change() {
    run(async {
        let mut fixture = Fixture::new().await;
        let entry = fixture
            .add(json!({ "printing": Uuid::new_v4(), "quantity": 3, "zone": "Side" }))
            .await;
        fixture.age_latest().await;

        fixture.patch(&entry, json!({ "quantity": 1 })).await;
        assert_eq!(fixture.kinds().await, vec!["Edit", "Edit", "Created"]);
        assert_eq!(fixture.latest().await, vec![("Side".to_string(), 3, 1)]);
        fixture.age_latest().await;

        fixture.patch(&entry, json!({ "quantity": 0 })).await;
        assert_eq!(fixture.kinds().await.len(), 4);
        assert_eq!(fixture.latest().await, vec![("Side".to_string(), 1, 0)]);
    });
}

#[test]
fn removing_an_entry_records_one_deck_change() {
    run(async {
        let mut fixture = Fixture::new().await;
        let entry = fixture
            .add(json!({ "printing": Uuid::new_v4(), "quantity": 4, "zone": "Main" }))
            .await;
        fixture.age_latest().await;

        fixture.remove(&entry).await;

        assert_eq!(fixture.kinds().await, vec!["Edit", "Edit", "Created"]);
        assert_eq!(fixture.latest().await, vec![("Main".to_string(), 4, 0)]);
    });
}

#[test]
fn the_deck_history_lists_newest_first_in_pages() {
    run(async {
        let mut fixture = Fixture::new().await;
        for quantity in 1..=4 {
            fixture
                .add(json!({ "printing": Uuid::new_v4(), "quantity": quantity, "zone": "Main" }))
                .await;
        }

        let mut afters = Vec::new();
        let mut kinds = Vec::new();
        let mut query = "?limit=2".to_string();
        loop {
            let page = fixture.history(&query).await;
            let changes = page["changes"].as_array().expect("change list");
            assert!(changes.len() <= 2, "{page}");
            for change in changes {
                kinds.push(change["kind"].as_str().expect("kind").to_string());
                if let Some(after) = change["entries"][0]["after"].as_i64() {
                    afters.push(after);
                }
            }
            match page["next_cursor"].as_str() {
                Some(cursor) => query = format!("?limit=2&after={cursor}"),
                None => break,
            }
        }

        assert_eq!(afters, vec![4, 3, 2, 1]);
        assert_eq!(kinds, vec!["Edit", "Edit", "Edit", "Edit", "Created"]);
    });
}

#[test]
fn only_the_owner_reads_the_deck_history() {
    run(async {
        let mut public = Fixture::with_visibility("Public").await;
        let mut unlisted = Fixture::with_visibility("Unlisted").await;
        let body = unlisted
            .owner
            .json(
                Method::POST,
                &api(&format!("decks/{}/share-token", unlisted.deck)),
                &json!({}),
            )
            .await
            .ok_json();
        let token = body["share_token"].as_str().expect("share token");
        let mut stranger = TestClient::logged_in(&create_account(Role::Member).await).await;
        let mut visitor = TestClient::new();
        visitor
            .get(&api(&format!("explore/decks/{}", public.deck)))
            .await
            .ok_json();
        visitor
            .get(&api(&format!("shared/decks/{token}")))
            .await
            .ok_json();

        for deck in [&public.deck, &unlisted.deck] {
            let url = api(&format!("decks/{deck}/history"));
            for client in [&mut stranger, &mut visitor] {
                let response = client.get(&url).await;
                assert_ne!(response.status, StatusCode::OK, "{response:?}");
            }
        }
        assert_eq!(public.kinds().await, vec!["Created"]);
    });
}

#[test]
fn deleting_a_deck_deletes_its_deck_history() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture
            .add(json!({ "printing": Uuid::new_v4(), "quantity": 1, "zone": "Main" }))
            .await;
        let url = api(&format!("decks/{}", fixture.deck));

        fixture
            .owner
            .json(Method::DELETE, &url, &json!(null))
            .await
            .ok_json();

        let response = fixture
            .owner
            .get(&api(&format!("decks/{}/history", fixture.deck)))
            .await;
        assert_ne!(response.status, StatusCode::OK, "{response:?}");
    });
}

/// The deck's Deck entries as (printing, zone, quantity), sorted
fn lines(entries: &[Value]) -> Vec<(String, String, i64)> {
    let mut lines: Vec<_> = entries
        .iter()
        .map(|entry| {
            (
                entry["printing"].as_str().expect("printing").to_string(),
                entry["zone"].as_str().expect("zone").to_string(),
                entry["quantity"].as_i64().expect("quantity"),
            )
        })
        .collect();
    lines.sort();
    lines
}

#[test]
fn swapping_replaces_copies_of_an_entry_by_another_card_in_its_zone() {
    run(async {
        let mut fixture = Fixture::new().await;
        let going = Uuid::new_v4();
        let coming = Uuid::new_v4();
        let entry = fixture
            .add(json!({ "printing": going, "quantity": 3, "zone": "Side" }))
            .await;

        fixture
            .swap(&entry, json!({ "quantity": 1, "printing": coming }))
            .await
            .ok_json();

        let mut expected = vec![
            (going.to_string(), "Side".to_string(), 2),
            (coming.to_string(), "Side".to_string(), 1),
        ];
        expected.sort();
        assert_eq!(lines(&fixture.entries().await), expected);
    });
}

#[test]
fn swapping_every_copy_removes_the_entry() {
    run(async {
        let mut fixture = Fixture::new().await;
        let coming = Uuid::new_v4();
        let entry = fixture
            .add(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;

        fixture
            .swap(&entry, json!({ "quantity": 2, "printing": coming }))
            .await
            .ok_json();

        assert_eq!(
            lines(&fixture.entries().await),
            vec![(coming.to_string(), "Main".to_string(), 2)]
        );
    });
}

#[test]
fn a_swapped_in_card_joins_its_alike_entry() {
    run(async {
        let mut fixture = Fixture::new().await;
        let going = Uuid::new_v4();
        let coming = Uuid::new_v4();
        let entry = fixture
            .add(json!({ "printing": going, "quantity": 1, "zone": "Main" }))
            .await;
        let alike = fixture
            .add(json!({ "printing": coming, "quantity": 2, "zone": "Main", "foil": true }))
            .await;
        let ramp = fixture.tag(&alike, "Ramp").await;

        let joined = fixture
            .swap(
                &entry,
                json!({ "quantity": 1, "printing": coming, "foil": true }),
            )
            .await
            .ok_json();

        assert_eq!(joined["uuid"], alike.as_str());
        let entries = fixture.entries().await;
        assert_eq!(entries.len(), 1, "{entries:?}");
        assert_eq!(entries[0]["quantity"], 3);
        assert_eq!(entries[0]["foil"], true);
        assert_eq!(tags(&entries[0]), vec![ramp]);
    });
}

#[test]
fn a_swap_that_cannot_happen_as_a_whole_changes_nothing() {
    run(async {
        let mut fixture = Fixture::new().await;
        let going = Uuid::new_v4();
        let coming = Uuid::new_v4();
        let entry = fixture
            .add(json!({ "printing": going, "quantity": 2, "zone": "Main" }))
            .await;
        fixture
            .add(json!({ "printing": coming, "quantity": 1, "zone": "Main" }))
            .await;
        let before = lines(&fixture.entries().await);

        for (target, swap) in [
            (entry.clone(), json!({ "quantity": 3, "printing": coming })),
            (entry.clone(), json!({ "quantity": 0, "printing": coming })),
            (entry.clone(), json!({ "quantity": 1, "printing": going })),
            (
                Uuid::new_v4().to_string(),
                json!({ "quantity": 1, "printing": coming }),
            ),
        ] {
            let response = fixture.swap(&target, swap.clone()).await;
            assert_eq!(response.status, StatusCode::BAD_REQUEST, "{swap}");
        }

        assert_eq!(lines(&fixture.entries().await), before);
    });
}

#[test]
fn only_the_owner_swaps() {
    run(async {
        let mut fixture = Fixture::new().await;
        let going = Uuid::new_v4();
        let entry = fixture
            .add(json!({ "printing": going, "quantity": 1, "zone": "Main" }))
            .await;
        let mut stranger = TestClient::logged_in(&create_account(Role::Member).await).await;
        let url = api(&format!("decks/{}/cards/{entry}/swap", fixture.deck));
        let swap = json!({ "quantity": 1, "printing": Uuid::new_v4() });

        let response = stranger.json(Method::POST, &url, &swap).await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST);
        let response = TestClient::new().json(Method::POST, &url, &swap).await;
        assert_eq!(response.status, StatusCode::UNAUTHORIZED);

        assert_eq!(
            lines(&fixture.entries().await),
            vec![(going.to_string(), "Main".to_string(), 1)]
        );
    });
}

#[test]
fn moving_an_entry_records_one_move() {
    run(async {
        let mut fixture = Fixture::new().await;
        let entry = fixture
            .add(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;

        fixture.patch(&entry, json!({ "zone": "Side" })).await;

        assert_eq!(fixture.kinds().await, vec!["Move", "Edit", "Created"]);
        let mut latest = fixture.latest().await;
        latest.sort();
        assert_eq!(
            latest,
            vec![("Main".to_string(), 2, 0), ("Side".to_string(), 0, 2)]
        );
    });
}

#[test]
fn a_move_merging_into_an_alike_entry_is_one_move() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture
            .add(json!({ "printing": printing, "quantity": 2, "zone": "Main" }))
            .await;
        fixture
            .add(json!({ "printing": printing, "quantity": 1, "zone": "Side" }))
            .await;

        fixture.patch(&entry, json!({ "zone": "Side" })).await;

        assert_eq!(
            fixture.kinds().await,
            vec!["Move", "Edit", "Edit", "Created"]
        );
        let mut latest = fixture.latest().await;
        latest.sort();
        assert_eq!(
            latest,
            vec![("Main".to_string(), 2, 0), ("Side".to_string(), 1, 3)]
        );
    });
}

#[test]
fn switching_printing_foil_or_proxy_records_one_switch_each() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture
            .add(json!({ "printing": printing, "quantity": 2, "zone": "Main" }))
            .await;
        let other = Uuid::new_v4();
        fixture
            .add(json!({ "printing": other, "quantity": 1, "zone": "Main", "foil": true }))
            .await;

        fixture.patch(&entry, json!({ "foil": true })).await;
        assert_eq!(fixture.kinds().await[0], "Switch");
        fixture.patch(&entry, json!({ "proxy": true })).await;
        assert_eq!(fixture.kinds().await[0], "Switch");
        fixture
            .patch(&entry, json!({ "printing": other, "proxy": false }))
            .await;

        assert_eq!(
            fixture.kinds().await,
            vec!["Switch", "Switch", "Switch", "Edit", "Edit", "Created"]
        );
        let history = fixture.history("").await;
        let mut merged: Vec<(bool, i64, i64)> = history["changes"][0]["entries"]
            .as_array()
            .expect("entry list")
            .iter()
            .map(|entry| {
                (
                    entry["printing"] == json!(other),
                    entry["before"].as_i64().expect("before"),
                    entry["after"].as_i64().expect("after"),
                )
            })
            .collect();
        merged.sort();
        assert_eq!(merged, vec![(false, 2, 0), (true, 1, 3)]);
    });
}

#[test]
fn a_swap_records_one_swap_with_both_cards() {
    run(async {
        let mut fixture = Fixture::new().await;
        let going = Uuid::new_v4();
        let coming = Uuid::new_v4();
        let entry = fixture
            .add(json!({ "printing": going, "quantity": 3, "zone": "Main" }))
            .await;
        fixture
            .add(json!({ "printing": coming, "quantity": 1, "zone": "Main" }))
            .await;

        let response = fixture
            .swap(&entry, json!({ "quantity": 2, "printing": coming }))
            .await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");

        assert_eq!(
            fixture.kinds().await,
            vec!["Swap", "Edit", "Edit", "Created"]
        );
        let history = fixture.history("").await;
        let mut swapped: Vec<(bool, i64, i64)> = history["changes"][0]["entries"]
            .as_array()
            .expect("entry list")
            .iter()
            .map(|entry| {
                (
                    entry["printing"] == json!(coming),
                    entry["before"].as_i64().expect("before"),
                    entry["after"].as_i64().expect("after"),
                )
            })
            .collect();
        swapped.sort();
        assert_eq!(swapped, vec![(false, 3, 1), (true, 1, 3)]);
    });
}

#[test]
fn an_adding_import_records_one_import() {
    run(async {
        let mut fixture = Fixture::new().await;
        let held = Uuid::new_v4();
        fixture
            .add(json!({ "printing": held, "quantity": 1, "zone": "Main" }))
            .await;

        fixture
            .import(
                json!([
                    { "printing": held, "quantity": 2, "zone": "Main" },
                    { "printing": Uuid::new_v4(), "quantity": 4, "zone": "Side" },
                ]),
                false,
            )
            .await;

        assert_eq!(fixture.kinds().await, vec!["Import", "Edit", "Created"]);
        let mut latest = fixture.latest().await;
        latest.sort();
        assert_eq!(
            latest,
            vec![("Main".to_string(), 1, 3), ("Side".to_string(), 0, 4)]
        );
    });
}

#[test]
fn a_replacing_import_records_one_replace() {
    run(async {
        let mut fixture = Fixture::new().await;
        let kept = Uuid::new_v4();
        fixture
            .import(
                json!([
                    { "printing": kept, "quantity": 2, "zone": "Main" },
                    { "printing": Uuid::new_v4(), "quantity": 1, "zone": "Side" },
                ]),
                false,
            )
            .await;

        fixture
            .import(
                json!([
                    { "printing": kept, "quantity": 2, "zone": "Main" },
                    { "printing": Uuid::new_v4(), "quantity": 3, "zone": "Maybe" },
                ]),
                true,
            )
            .await;

        assert_eq!(fixture.kinds().await, vec!["Replace", "Import", "Created"]);
        let mut latest = fixture.latest().await;
        latest.sort();
        assert_eq!(
            latest,
            vec![("Maybe".to_string(), 0, 3), ("Side".to_string(), 1, 0)]
        );
    });
}

#[test]
fn an_advisor_fill_records_one_fill() {
    run(async {
        let mut fixture = Fixture::new().await;
        let deck = fixture.deck.clone();

        let body = fixture
            .owner
            .json(
                Method::POST,
                &api(&format!("decks/{deck}/cards/import")),
                &json!({
                    "cards": [{ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }],
                    "replace": false,
                    "origin": "AdvisorFill",
                }),
            )
            .await
            .ok_json();
        assert_eq!(body["added"], 1);

        assert_eq!(fixture.kinds().await, vec!["Fill", "Created"]);
        assert_eq!(fixture.latest().await, vec![("Main".to_string(), 0, 2)]);
    });
}

#[test]
fn an_advisor_fill_never_replaces() {
    run(async {
        let mut fixture = Fixture::new().await;
        let deck = fixture.deck.clone();

        let response = fixture
            .owner
            .json(
                Method::POST,
                &api(&format!("decks/{deck}/cards/import")),
                &json!({
                    "cards": [{ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }],
                    "replace": true,
                    "origin": "AdvisorFill",
                }),
            )
            .await;

        assert_eq!(response.status, StatusCode::BAD_REQUEST, "{response:?}");
        assert_eq!(fixture.kinds().await, vec!["Created"]);
    });
}

#[test]
fn a_clone_starts_its_own_deck_history() {
    run(async {
        let mut original = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = original
            .add(json!({ "printing": printing, "quantity": 3, "zone": "Main" }))
            .await;
        original.patch(&entry, json!({ "zone": "Side" })).await;
        let cards = json!([{ "printing": printing, "quantity": 3, "zone": "Side" }]);

        let body = original
            .owner
            .json(
                Method::POST,
                &api("decks"),
                &json!({
                    "name": "History (copy)",
                    "description": null,
                    "format": "modern",
                    "visibility": "Private",
                }),
            )
            .await
            .ok_json();
        let mut clone = Fixture {
            owner: original.owner,
            deck: body["uuid"].as_str().expect("deck uuid").to_string(),
        };
        clone.import(cards, false).await;

        assert_eq!(clone.kinds().await, vec!["Import", "Created"]);
        assert_eq!(clone.latest().await, vec![("Side".to_string(), 0, 3)]);
    });
}

impl Fixture {
    /// Sends a request to the deck itself or one of its settings
    async fn send(&mut self, method: Method, path: &str, body: Value) {
        let url = if path.is_empty() {
            api(&format!("decks/{}", self.deck))
        } else {
            api(&format!("decks/{}/{path}", self.deck))
        };
        self.owner.json(method, &url, &body).await.ok_json();
    }

    /// The newest Deck change's deck fields as (field, before, after)
    async fn latest_fields(&mut self) -> Vec<(String, Value, Value)> {
        let history = self.history("").await;
        history["changes"][0]["fields"]
            .as_array()
            .expect("field list")
            .iter()
            .map(|field| {
                (
                    field["field"].as_str().expect("field").to_string(),
                    field["before"].clone(),
                    field["after"].clone(),
                )
            })
            .collect()
    }
}

/// `(field, before, after)` as [`Fixture::latest_fields`] reads it
fn field(name: &str, before: Value, after: Value) -> (String, Value, Value) {
    (name.to_string(), before, after)
}

#[test]
fn renaming_a_deck_records_one_settings_change() {
    run(async {
        let mut fixture = Fixture::new().await;

        fixture
            .send(
                Method::PUT,
                "",
                json!({ "name": "Renamed", "description": null, "format": "modern" }),
            )
            .await;

        assert_eq!(fixture.kinds().await, vec!["Settings", "Created"]);
        assert_eq!(
            fixture.latest_fields().await,
            vec![field("Name", json!("History"), json!("Renamed"))]
        );
        assert!(fixture.latest().await.is_empty());
    });
}

#[test]
fn saving_unchanged_deck_settings_records_nothing() {
    run(async {
        let mut fixture = Fixture::new().await;

        fixture
            .send(
                Method::PUT,
                "",
                json!({ "name": "History", "description": null, "format": "modern" }),
            )
            .await;
        fixture
            .send(Method::PUT, "colors", json!({ "colors": null }))
            .await;

        assert_eq!(fixture.kinds().await, vec!["Created"]);
    });
}

#[test]
fn each_recorded_deck_field_records_one_settings_change() {
    run(async {
        let mut fixture = Fixture::new().await;

        fixture
            .send(
                Method::PUT,
                "",
                json!({ "name": "History", "description": "Go wide", "format": "commander" }),
            )
            .await;
        let mut fields = fixture.latest_fields().await;
        fields.sort_by(|a, b| a.0.cmp(&b.0));
        assert_eq!(
            fields,
            vec![
                field("Description", Value::Null, json!("Go wide")),
                field("Format", json!("modern"), json!("commander")),
            ]
        );

        fixture
            .send(Method::PUT, "colors", json!({ "colors": "WU" }))
            .await;
        assert_eq!(
            fixture.latest_fields().await,
            vec![field("Colors", Value::Null, json!("WU"))]
        );

        fixture
            .send(Method::PUT, "bracket", json!({ "bracket": 3 }))
            .await;
        assert_eq!(
            fixture.latest_fields().await,
            vec![field("Bracket", Value::Null, json!(3))]
        );

        fixture
            .send(
                Method::PUT,
                "rule-zero",
                json!({
                    "allow_extra_commanders": true,
                    "allow_duplicates": false,
                    "allow_banned": true,
                    "deck_size": 60,
                }),
            )
            .await;
        let mut fields = fixture.latest_fields().await;
        fields.sort_by(|a, b| a.0.cmp(&b.0));
        assert_eq!(
            fields,
            vec![
                field("AllowBanned", json!(false), json!(true)),
                field("AllowExtraCommanders", json!(false), json!(true)),
                field("DeckSize", Value::Null, json!(60)),
            ]
        );

        assert_eq!(
            fixture.kinds().await,
            vec!["Settings", "Settings", "Settings", "Settings", "Created"]
        );
    });
}

#[test]
fn a_format_change_clearing_the_bracket_records_both_in_one_change() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture
            .send(
                Method::PUT,
                "",
                json!({ "name": "History", "description": null, "format": "commander" }),
            )
            .await;
        fixture
            .send(Method::PUT, "bracket", json!({ "bracket": 2 }))
            .await;

        fixture
            .send(
                Method::PUT,
                "",
                json!({ "name": "History", "description": null, "format": "pioneer" }),
            )
            .await;

        assert_eq!(
            fixture.kinds().await,
            vec!["Settings", "Settings", "Settings", "Created"]
        );
        let mut fields = fixture.latest_fields().await;
        fields.sort_by(|a, b| a.0.cmp(&b.0));
        assert_eq!(
            fields,
            vec![
                field("Bracket", json!(2), Value::Null),
                field("Format", json!("commander"), json!("pioneer")),
            ]
        );
    });
}

impl Fixture {
    /// Sends a request to the deck and answers with its body
    async fn send_json(&mut self, method: Method, path: &str, body: Value) -> Value {
        let url = api(&format!("decks/{}/{path}", self.deck));
        self.owner.json(method, &url, &body).await.ok_json()
    }

    /// A new collection of the owner holding one stack, answering the uuids of both
    async fn stack(&mut self, printing: Uuid, quantity: i32, finish: &str) -> (String, String) {
        let collection = self
            .owner
            .json(
                Method::POST,
                &api("collections"),
                &json!({
                    "name": "Binder",
                    "description": "",
                    "color": "red",
                    "icon": "box",
                    "visibility": "Private",
                }),
            )
            .await
            .ok_json();
        let collection = collection["uuid"]
            .as_str()
            .expect("collection uuid")
            .to_string();
        self.owner
            .json(
                Method::POST,
                &api(&format!("collections/{collection}/entries")),
                &json!({ "entries": [{
                    "printing": printing,
                    "quantity": quantity,
                    "condition": "NearMint",
                    "finish": finish,
                    "purchase_price_cents": null,
                    "acquired_at": null,
                }] }),
            )
            .await
            .ok_json();
        let entries = self
            .owner
            .get(&api(&format!("collections/{collection}/entries")))
            .await
            .ok_json();
        let stack = entries["entries"][0]["uuid"]
            .as_str()
            .expect("stack uuid")
            .to_string();
        (collection, stack)
    }
}

#[test]
fn sourcing_another_printing_for_an_entry_records_one_sourcing_change() {
    run(async {
        let mut fixture = Fixture::new().await;
        let listed = Uuid::new_v4();
        let sourced = Uuid::new_v4();
        let entry = fixture
            .add(json!({ "printing": listed, "quantity": 3, "zone": "Main" }))
            .await;
        fixture
            .send_json(Method::POST, "collection", json!(null))
            .await;
        let (_, stack) = fixture.stack(sourced, 1, "Foil").await;

        fixture
            .send_json(
                Method::POST,
                "sourcing/take",
                json!({ "entry": stack, "quantity": 1, "slot": entry }),
            )
            .await;

        assert_eq!(fixture.kinds().await, vec!["Sourcing", "Edit", "Created"]);
        let history = fixture.history("").await;
        let mut split: Vec<(bool, bool, i64, i64)> = history["changes"][0]["entries"]
            .as_array()
            .expect("entry list")
            .iter()
            .map(|entry| {
                (
                    entry["printing"] == json!(sourced),
                    entry["foil"].as_bool().expect("foil"),
                    entry["before"].as_i64().expect("before"),
                    entry["after"].as_i64().expect("after"),
                )
            })
            .collect();
        split.sort();
        assert_eq!(split, vec![(false, false, 3, 2), (true, true, 0, 1)]);
    });
}

#[test]
fn filling_a_proxy_entry_records_one_sourcing_change() {
    run(async {
        let mut fixture = Fixture::new().await;
        let proxy = fixture
            .add(
                json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main", "proxy": true }),
            )
            .await;
        fixture
            .send_json(Method::POST, "collection", json!(null))
            .await;

        fixture
            .send_json(Method::POST, "sourcing/fill", json!({ "slot": proxy }))
            .await;

        assert_eq!(fixture.kinds().await, vec!["Sourcing", "Edit", "Created"]);
        let history = fixture.history("").await;
        let mut flags: Vec<(bool, i64, i64)> = history["changes"][0]["entries"]
            .as_array()
            .expect("entry list")
            .iter()
            .map(|entry| {
                (
                    entry["proxy"].as_bool().expect("proxy"),
                    entry["before"].as_i64().expect("before"),
                    entry["after"].as_i64().expect("after"),
                )
            })
            .collect();
        flags.sort();
        assert_eq!(flags, vec![(false, 0, 2), (true, 2, 0)]);
    });
}

#[test]
fn tags_folder_visibility_sharing_advisor_settings_and_the_deck_collection_record_nothing() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture
            .add(json!({ "printing": printing, "quantity": 2, "zone": "Main" }))
            .await;
        let before = fixture.kinds().await;

        let tag = fixture.tag(&entry, "ramp").await;
        fixture
            .send_json(
                Method::DELETE,
                &format!("cards/{entry}/tags/{tag}"),
                json!(null),
            )
            .await;
        fixture
            .send_json(
                Method::PUT,
                &format!("tags/{tag}"),
                json!({ "name": "fixing", "color": "blue", "icon": "tag", "global": false }),
            )
            .await;
        fixture
            .send_json(Method::DELETE, &format!("tags/{tag}"), json!(null))
            .await;

        let folder = fixture
            .owner
            .json(Method::POST, &api("folders"), &json!({ "name": "Shelf" }))
            .await
            .ok_json();
        fixture
            .send_json(Method::POST, "folder", json!({ "folder": folder["uuid"] }))
            .await;
        fixture
            .send(Method::POST, "", json!({ "visibility": "Unlisted" }))
            .await;
        fixture
            .send_json(Method::POST, "share-token", json!({}))
            .await;
        let mut settings = fixture
            .send_json(Method::GET, "advisor-settings", json!(null))
            .await;
        settings["setup_done"] = json!(true);
        fixture
            .send_json(Method::PUT, "advisor-settings", settings)
            .await;

        fixture
            .send_json(Method::POST, "collection", json!(null))
            .await;
        let (binder, stack) = fixture.stack(printing, 2, "Nonfoil").await;
        fixture
            .send_json(
                Method::POST,
                "sourcing/take",
                json!({ "entry": stack, "quantity": 1, "slot": entry }),
            )
            .await;
        fixture
            .send_json(Method::POST, "sourcing/fill", json!({ "slot": null }))
            .await;
        fixture
            .send_json(
                Method::POST,
                "sourcing/return-all",
                json!({ "target": binder }),
            )
            .await;
        fixture
            .send_json(Method::DELETE, "collection", json!(null))
            .await;

        assert_eq!(fixture.kinds().await, before);
    });
}

#[test]
fn a_new_decks_first_deck_change_holds_its_settings() {
    run(async {
        let mut fixture = Fixture::new().await;

        let mut fields = fixture.latest_fields().await;
        fields.sort_by(|a, b| a.0.cmp(&b.0));

        assert_eq!(
            fields,
            vec![
                field("AllowBanned", json!(false), json!(false)),
                field("AllowDuplicates", json!(false), json!(false)),
                field("AllowExtraCommanders", json!(false), json!(false)),
                field("Bracket", Value::Null, Value::Null),
                field("Colors", Value::Null, Value::Null),
                field("DeckSize", Value::Null, Value::Null),
                field("Description", Value::Null, Value::Null),
                field("Format", json!("modern"), json!("modern")),
                field("Name", json!("History"), json!("History")),
            ]
        );
    });
}

impl Fixture {
    /// Makes the newest Deck change look older than the coalescing window
    async fn age_latest(&mut self) {
        let mut tx = Database::global()
            .start_transaction()
            .await
            .expect("start a transaction");
        (&mut tx)
            .execute::<All>(
                "UPDATE deck_change SET changed_at = changed_at - INTERVAL '2 minutes' \
                 WHERE uuid = (SELECT uuid FROM deck_change WHERE deck = $1 \
                 ORDER BY uuid DESC LIMIT 1)"
                    .to_string(),
                vec![SqlValue::Uuid(self.deck.parse().expect("deck uuid"))],
            )
            .await
            .expect("backdate the newest Deck change");
        tx.commit().await.expect("commit");
    }
}

#[test]
fn quick_additions_to_one_entry_become_one_deck_change() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture
            .add(json!({ "printing": printing, "quantity": 1, "zone": "Main" }))
            .await;

        fixture.patch(&entry, json!({ "quantity": 2 })).await;
        fixture
            .add(json!({ "printing": printing, "quantity": 1, "zone": "Main" }))
            .await;

        assert_eq!(fixture.kinds().await, vec!["Edit", "Created"]);
        assert_eq!(fixture.latest().await, vec![("Main".to_string(), 0, 3)]);
    });
}

#[test]
fn quick_description_saves_become_one_deck_change() {
    run(async {
        let mut fixture = Fixture::new().await;

        for description in ["Go", "Go wide", "Go wide fast"] {
            fixture
                .send(
                    Method::PUT,
                    "",
                    json!({ "name": "History", "description": description, "format": "modern" }),
                )
                .await;
        }

        assert_eq!(fixture.kinds().await, vec!["Settings", "Created"]);
        assert_eq!(
            fixture.latest_fields().await,
            vec![field("Description", Value::Null, json!("Go wide fast"))]
        );
    });
}

#[test]
fn adding_and_taking_away_a_copy_quickly_leaves_no_deck_change() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture
            .add(json!({ "printing": printing, "quantity": 2, "zone": "Main" }))
            .await;
        fixture.age_latest().await;

        fixture.patch(&entry, json!({ "quantity": 3 })).await;
        fixture.patch(&entry, json!({ "quantity": 2 })).await;

        assert_eq!(fixture.kinds().await, vec!["Edit", "Created"]);
        assert_eq!(fixture.latest().await, vec![("Main".to_string(), 0, 2)]);
    });
}

#[test]
fn quick_edits_of_different_entries_or_fields_stay_apart() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        fixture
            .add(json!({ "printing": printing, "quantity": 1, "zone": "Main" }))
            .await;
        fixture
            .add(json!({ "printing": printing, "quantity": 1, "zone": "Side" }))
            .await;
        fixture
            .add(json!({ "printing": Uuid::new_v4(), "quantity": 1, "zone": "Side" }))
            .await;
        fixture
            .send(Method::PUT, "colors", json!({ "colors": "WU" }))
            .await;
        fixture
            .send(
                Method::PUT,
                "",
                json!({ "name": "Renamed", "description": null, "format": "modern" }),
            )
            .await;

        assert_eq!(
            fixture.kinds().await,
            vec!["Settings", "Settings", "Edit", "Edit", "Edit", "Created"]
        );
    });
}

#[test]
fn an_edit_after_the_window_stays_apart() {
    run(async {
        let mut fixture = Fixture::new().await;
        let entry = fixture
            .add(json!({ "printing": Uuid::new_v4(), "quantity": 1, "zone": "Main" }))
            .await;
        fixture
            .send(Method::PUT, "colors", json!({ "colors": "WU" }))
            .await;
        fixture.age_latest().await;
        fixture
            .send(Method::PUT, "colors", json!({ "colors": "B" }))
            .await;
        fixture.patch(&entry, json!({ "quantity": 2 })).await;
        fixture.age_latest().await;

        fixture.patch(&entry, json!({ "quantity": 3 })).await;

        assert_eq!(
            fixture.kinds().await,
            vec!["Edit", "Edit", "Settings", "Settings", "Edit", "Created"]
        );
        assert_eq!(fixture.latest().await, vec![("Main".to_string(), 2, 3)]);
    });
}

#[test]
fn moves_never_join_quick_edits() {
    run(async {
        let mut fixture = Fixture::new().await;
        let entry = fixture
            .add(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;

        fixture.patch(&entry, json!({ "zone": "Side" })).await;
        fixture.patch(&entry, json!({ "zone": "Main" })).await;
        fixture.patch(&entry, json!({ "quantity": 3 })).await;

        assert_eq!(
            fixture.kinds().await,
            vec!["Edit", "Move", "Move", "Edit", "Created"]
        );
    });
}

#[test]
fn imports_never_join_quick_edits() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let card = json!([{ "printing": printing, "quantity": 1, "zone": "Main" }]);
        fixture
            .add(json!({ "printing": printing, "quantity": 1, "zone": "Main" }))
            .await;

        fixture.import(card.clone(), false).await;
        fixture.import(card, false).await;
        fixture
            .add(json!({ "printing": printing, "quantity": 1, "zone": "Main" }))
            .await;

        assert_eq!(
            fixture.kinds().await,
            vec!["Edit", "Import", "Import", "Edit", "Created"]
        );
    });
}

#[test]
fn swaps_never_join_quick_edits() {
    run(async {
        let mut fixture = Fixture::new().await;
        let incoming = Uuid::new_v4();
        let entry = fixture
            .add(json!({ "printing": Uuid::new_v4(), "quantity": 3, "zone": "Main" }))
            .await;

        let response = fixture
            .swap(&entry, json!({ "quantity": 1, "printing": incoming }))
            .await;
        let swapped_in = response.ok_json()["uuid"]
            .as_str()
            .expect("entry uuid")
            .to_string();
        fixture.patch(&entry, json!({ "quantity": 1 })).await;
        fixture.patch(&swapped_in, json!({ "quantity": 2 })).await;

        assert_eq!(
            fixture.kinds().await,
            vec!["Edit", "Edit", "Swap", "Edit", "Created"]
        );
    });
}

impl Fixture {
    /// Undoes the latest Deck change that is not undone yet
    async fn undo(&mut self) -> TestResponse {
        let url = api(&format!("decks/{}/history/undo", self.deck));
        self.owner.json(Method::POST, &url, &json!(null)).await
    }

    /// Redoes the latest undone Deck change
    async fn redo(&mut self) -> TestResponse {
        let url = api(&format!("decks/{}/history/redo", self.deck));
        self.owner.json(Method::POST, &url, &json!(null)).await
    }

    /// Whether the newest Deck changes are undone, newest first
    async fn undone(&mut self) -> Vec<bool> {
        self.history("").await["changes"]
            .as_array()
            .expect("change list")
            .iter()
            .map(|change| change["undone"].as_bool().expect("undone"))
            .collect()
    }
}

#[test]
fn undoing_an_added_card_takes_it_out_again() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture
            .add(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;

        fixture.undo().await.ok_json();

        assert!(fixture.entries().await.is_empty());
        assert_eq!(fixture.kinds().await, vec!["Undo", "Edit", "Created"]);
        assert_eq!(fixture.undone().await, vec![false, true, false]);
        assert_eq!(fixture.latest().await, vec![("Main".to_string(), 2, 0)]);
        let history = fixture.history("").await;
        assert_eq!(
            history["changes"][0]["reference"],
            history["changes"][1]["uuid"]
        );
    });
}

impl Fixture {
    /// The deck's Deck entries and recorded deck fields, to compare two states
    async fn state(&mut self) -> (Vec<(String, String, i64)>, Value) {
        let deck = self
            .owner
            .get(&api(&format!("decks/{}", self.deck)))
            .await
            .ok_json();
        let fields = json!([
            deck["name"],
            deck["description"],
            deck["format"],
            deck["allowed_color_identity"],
            deck["bracket"],
            deck["allow_extra_commanders"],
            deck["allow_duplicates"],
            deck["allow_banned"],
            deck["deck_size"],
        ]);
        (lines(&self.entries().await), fields)
    }
}

#[test]
fn undo_and_redo_step_through_every_kind_of_deck_change() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let other = Uuid::new_v4();
        let mut states = vec![fixture.state().await];

        let entry = fixture
            .add(json!({ "printing": printing, "quantity": 3, "zone": "Main" }))
            .await;
        states.push(fixture.state().await);
        fixture
            .send(
                Method::PUT,
                "",
                json!({ "name": "Renamed", "description": "Go wide", "format": "commander" }),
            )
            .await;
        states.push(fixture.state().await);
        fixture
            .send(Method::PUT, "bracket", json!({ "bracket": 3 }))
            .await;
        states.push(fixture.state().await);
        fixture
            .send(
                Method::PUT,
                "",
                json!({ "name": "Renamed", "description": "Go wide", "format": "modern" }),
            )
            .await;
        states.push(fixture.state().await);
        fixture
            .send(
                Method::PUT,
                "rule-zero",
                json!({
                    "allow_extra_commanders": true,
                    "allow_duplicates": false,
                    "allow_banned": true,
                    "deck_size": 80,
                }),
            )
            .await;
        states.push(fixture.state().await);
        fixture.patch(&entry, json!({ "zone": "Side" })).await;
        states.push(fixture.state().await);
        fixture
            .swap(&entry, json!({ "quantity": 1, "printing": other }))
            .await
            .ok_json();
        states.push(fixture.state().await);
        fixture
            .import(
                json!([{ "printing": other, "quantity": 4, "zone": "Main" }]),
                false,
            )
            .await;
        states.push(fixture.state().await);
        fixture
            .import(
                json!([{ "printing": printing, "quantity": 1, "zone": "Commander" }]),
                true,
            )
            .await;
        let last = fixture.state().await;

        let mut expected = states.clone();
        while let Some(state) = expected.pop() {
            fixture.undo().await.ok_json();
            assert_eq!(fixture.state().await, state);
        }
        states.push(last);
        for state in states.iter().skip(1) {
            fixture.redo().await.ok_json();
            assert_eq!(&fixture.state().await, state);
        }
    });
}

impl Fixture {
    /// Whether the deck view offers undo and redo, as (undo, redo)
    async fn offers(&mut self) -> (bool, bool) {
        let deck = self
            .owner
            .get(&api(&format!("decks/{}", self.deck)))
            .await
            .ok_json();
        let history = self.history("").await;
        assert_eq!(history["can_undo"], deck["can_undo"]);
        assert_eq!(history["can_redo"], deck["can_redo"]);
        (
            deck["can_undo"].as_bool().expect("can_undo"),
            deck["can_redo"].as_bool().expect("can_redo"),
        )
    }
}

#[test]
fn a_new_edit_after_undoing_makes_redo_impossible() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture
            .add(json!({ "printing": printing, "quantity": 1, "zone": "Main" }))
            .await;
        fixture.age_latest().await;
        fixture.patch(&entry, json!({ "quantity": 2 })).await;
        fixture.undo().await.ok_json();
        assert_eq!(fixture.offers().await, (true, true));

        fixture
            .add(json!({ "printing": Uuid::new_v4(), "quantity": 1, "zone": "Side" }))
            .await;

        assert_eq!(fixture.offers().await, (true, false));
        let response = fixture.redo().await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST, "{response:?}");
        assert_eq!(
            fixture.kinds().await,
            vec!["Edit", "Undo", "Edit", "Edit", "Created"]
        );
    });
}

#[test]
fn undo_stops_at_the_decks_creation() {
    run(async {
        let mut fixture = Fixture::new().await;
        assert_eq!(fixture.offers().await, (false, false));
        fixture
            .add(json!({ "printing": Uuid::new_v4(), "quantity": 1, "zone": "Main" }))
            .await;
        fixture.undo().await.ok_json();

        let response = fixture.undo().await;

        assert_eq!(response.status, StatusCode::BAD_REQUEST, "{response:?}");
        assert_eq!(fixture.offers().await, (false, true));
        assert_eq!(fixture.kinds().await, vec!["Undo", "Edit", "Created"]);
    });
}

#[test]
fn undo_stops_at_the_decks_introduction() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture
            .add(json!({ "printing": Uuid::new_v4(), "quantity": 1, "zone": "Main" }))
            .await;
        let mut tx = Database::global()
            .start_transaction()
            .await
            .expect("start a transaction");
        DeckHistory::introduce(&mut tx, &[fixture.deck.parse().expect("deck uuid")])
            .await
            .expect("introduce the deck");
        tx.commit().await.expect("commit");

        let response = fixture.undo().await;

        assert_eq!(response.status, StatusCode::BAD_REQUEST, "{response:?}");
        assert_eq!(fixture.entries().await.len(), 1);
        assert_eq!(fixture.kinds().await, vec!["Introduced"]);
    });
}

#[test]
fn undo_after_undo_and_redo_takes_back_the_redone_change() {
    run(async {
        let mut fixture = Fixture::new().await;
        let first = Uuid::new_v4();
        let second = Uuid::new_v4();
        fixture
            .add(json!({ "printing": first, "quantity": 1, "zone": "Main" }))
            .await;
        fixture
            .add(json!({ "printing": second, "quantity": 1, "zone": "Main" }))
            .await;

        fixture.undo().await.ok_json();
        fixture.undo().await.ok_json();
        fixture.redo().await.ok_json();
        assert_eq!(
            lines(&fixture.entries().await),
            vec![(first.to_string(), "Main".to_string(), 1)]
        );
        fixture.undo().await.ok_json();
        assert!(fixture.entries().await.is_empty());
        fixture.redo().await.ok_json();
        fixture.redo().await.ok_json();

        let mut expected = vec![
            (first.to_string(), "Main".to_string(), 1),
            (second.to_string(), "Main".to_string(), 1),
        ];
        expected.sort();
        assert_eq!(lines(&fixture.entries().await), expected);
        assert_eq!(fixture.offers().await, (true, false));
        assert_eq!(
            fixture.kinds().await,
            vec![
                "Redo", "Redo", "Undo", "Redo", "Undo", "Undo", "Edit", "Edit", "Created"
            ]
        );
        assert!(fixture.undone().await.iter().all(|undone| !undone));
    });
}

#[test]
fn undo_restores_entries_without_tags_and_merges_keep_theirs() {
    run(async {
        let mut fixture = Fixture::new().await;
        let moved = Uuid::new_v4();
        let merged = Uuid::new_v4();
        let target = fixture
            .add(json!({ "printing": merged, "quantity": 1, "zone": "Main" }))
            .await;
        let hate = fixture.tag(&target, "Hate").await;
        let source = fixture
            .add(json!({ "printing": merged, "quantity": 2, "zone": "Side" }))
            .await;
        let keep = fixture.tag(&source, "Keep").await;
        let lone = fixture
            .add(json!({ "printing": moved, "quantity": 2, "zone": "Main" }))
            .await;
        fixture.tag(&lone, "Ramp").await;
        fixture.patch(&source, json!({ "zone": "Main" })).await;
        fixture.patch(&lone, json!({ "zone": "Side" })).await;

        fixture.undo().await.ok_json();
        fixture.undo().await.ok_json();

        let entries = fixture.entries().await;
        let find = |printing: Uuid, zone: &str| {
            entries
                .iter()
                .find(|entry| entry["printing"] == json!(printing) && entry["zone"] == zone)
                .unwrap_or_else(|| panic!("{printing} in {zone}: {entries:?}"))
        };
        assert!(tags(find(moved, "Main")).is_empty());
        let mut both = vec![hate, keep];
        both.sort();
        assert_eq!(tags(find(merged, "Main")), both);
        assert_eq!(find(merged, "Main")["quantity"], 1);
        assert!(tags(find(merged, "Side")).is_empty());
        assert_eq!(find(merged, "Side")["quantity"], 2);
        assert_eq!(entries.len(), 3, "{entries:?}");
    });
}

#[test]
fn undoing_sourcing_leaves_the_deck_collection_alone() {
    run(async {
        let mut fixture = Fixture::new().await;
        let listed = Uuid::new_v4();
        let sourced = Uuid::new_v4();
        let entry = fixture
            .add(json!({ "printing": listed, "quantity": 3, "zone": "Main" }))
            .await;
        let collection = fixture
            .send_json(Method::POST, "collection", json!(null))
            .await;
        let url = api(&format!(
            "collections/{}/entries",
            collection["uuid"].as_str().expect("collection uuid")
        ));
        let (_, stack) = fixture.stack(sourced, 1, "Foil").await;
        fixture
            .send_json(
                Method::POST,
                "sourcing/take",
                json!({ "entry": stack, "quantity": 1, "slot": entry }),
            )
            .await;
        let filed = fixture.owner.get(&url).await.ok_json();

        fixture.undo().await.ok_json();

        assert_eq!(
            lines(&fixture.entries().await),
            vec![(listed.to_string(), "Main".to_string(), 3)]
        );
        assert_eq!(fixture.owner.get(&url).await.ok_json(), filed);
        assert_eq!(filed["entries"].as_array().expect("entries").len(), 1);
    });
}

#[test]
fn only_the_owner_undoes_and_redoes() {
    run(async {
        let mut public = Fixture::with_visibility("Public").await;
        let mut unlisted = Fixture::with_visibility("Unlisted").await;
        let body = unlisted
            .send_json(Method::POST, "share-token", json!({}))
            .await;
        let token = body["share_token"].as_str().expect("share token");
        for fixture in [&mut public, &mut unlisted] {
            fixture
                .add(json!({ "printing": Uuid::new_v4(), "quantity": 1, "zone": "Main" }))
                .await;
            fixture
                .add(json!({ "printing": Uuid::new_v4(), "quantity": 1, "zone": "Main" }))
                .await;
            fixture.undo().await.ok_json();
        }
        let mut stranger = TestClient::logged_in(&create_account(Role::Member).await).await;
        let mut visitor = TestClient::new();
        visitor
            .get(&api(&format!("explore/decks/{}", public.deck)))
            .await
            .ok_json();
        visitor
            .get(&api(&format!("shared/decks/{token}")))
            .await
            .ok_json();
        let seen = stranger
            .get(&api(&format!("decks/{}", public.deck)))
            .await
            .ok_json();
        assert_eq!(seen["can_undo"], false);
        assert_eq!(seen["can_redo"], false);

        for deck in [&public.deck, &unlisted.deck] {
            for step in ["undo", "redo"] {
                let url = api(&format!("decks/{deck}/history/{step}"));
                for client in [&mut stranger, &mut visitor] {
                    let response = client.json(Method::POST, &url, &json!(null)).await;
                    assert_ne!(response.status, StatusCode::OK, "{response:?}");
                }
            }
        }
        for fixture in [&mut public, &mut unlisted] {
            assert_eq!(fixture.entries().await.len(), 1);
            assert_eq!(
                fixture.kinds().await,
                vec!["Undo", "Edit", "Edit", "Created"]
            );
        }
    });
}
