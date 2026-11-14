//! A collection's card list broken into groups: keys, order, paging and totals

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::rorm::Database;
use serde::Deserialize;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::models::printing::Printing;
use crate::tests::default_printing::unique;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::utils::catalog_sync::printing_from_json;

/// The cards the frontend's deck grouping is checked against, with their expected keys
const FIXTURE: &str =
    include_str!("../../../../frontend/mtg/src/utils/card-group-keys.fixture.json");

/// One card of [`FIXTURE`]
#[derive(Deserialize)]
struct FixtureCard {
    /// The card's name
    name: String,
    /// The type line as printed
    type_line: String,
    /// Mana value
    mana_value: f64,
    /// Colour identity letters
    color_identity: String,
    /// The type group it falls into
    #[serde(rename = "type")]
    card_type: String,
    /// The mana value group it falls into
    mana: String,
    /// The colour group it falls into
    color: String,
}

/// A printing to file into the catalog
struct Card<'a> {
    /// The name, made unique by the caller where a test searches by it
    name: &'a str,
    /// The type line as printed
    type_line: &'a str,
    /// Mana value
    mana_value: f64,
    /// Colour identity letters
    color_identity: &'a str,
    /// Set code
    set: &'a str,
    /// Release date, `YYYY-MM-DD`
    released: &'a str,
    /// Non-foil EUR price, as Scryfall writes it
    eur: Option<&'a str>,
}

impl Default for Card<'_> {
    fn default() -> Self {
        Self {
            name: "Card",
            type_line: "Instant",
            mana_value: 1.0,
            color_identity: "",
            set: "tcg",
            released: "2020-01-01",
            eur: None,
        }
    }
}

/// Files a printing into the catalog and answers its id
async fn print(card: Card<'_>) -> Uuid {
    let id = Uuid::new_v4();
    let colors: Vec<String> = card.color_identity.chars().map(String::from).collect();
    let printing = printing_from_json(
        &json!({
            "id": id,
            "oracle_id": Uuid::new_v4(),
            "name": card.name,
            "type_line": card.type_line,
            "cmc": card.mana_value,
            "color_identity": colors,
            "set": card.set,
            "set_name": format!("Set {}", card.set),
            "collector_number": "1",
            "lang": "en",
            "released_at": card.released,
            "legalities": { "commander": "legal" },
            "finishes": ["nonfoil"],
            "prices": { "eur": card.eur, "eur_foil": null },
        })
        .to_string(),
    );
    let mut tx = Database::global()
        .start_transaction()
        .await
        .expect("start a transaction");
    Printing::upsert_many(&mut tx, &[printing])
        .await
        .expect("file the card");
    tx.commit().await.expect("commit");
    id
}

/// A set code no other test files a printing under
fn unique_set() -> String {
    Uuid::new_v4().simple().to_string()[..8].to_string()
}

/// An owner with one collection
struct Shelf {
    /// The owner, logged in
    owner: TestClient,
    /// The collection's uuid
    collection: String,
}

impl Shelf {
    /// A fresh member with an empty collection
    async fn new() -> Self {
        let account = create_account(Role::Member).await;
        let mut owner = TestClient::logged_in(&account).await;
        let body = owner
            .json(
                Method::POST,
                &api("collections"),
                &json!({
                    "name": "Binder",
                    "description": "",
                    "color": "red",
                    "icon": "box",
                    "visibility": "Unlisted",
                }),
            )
            .await
            .ok_json();
        let collection = body["uuid"].as_str().expect("collection uuid").to_string();
        Self { owner, collection }
    }

    /// Files copies of a printing, answering the stack's uuid
    async fn file(&mut self, printing: Uuid, quantity: i32) -> String {
        self.owner
            .json(
                Method::POST,
                &api(&format!("collections/{}/entries", self.collection)),
                &json!({ "entries": [{
                    "printing": printing,
                    "quantity": quantity,
                    "condition": "NearMint",
                    "finish": "Nonfoil",
                    "purchase_price_cents": null,
                    "acquired_at": null,
                }] }),
            )
            .await
            .ok_json();
        let page = self.cards(&format!("printing={printing}")).await;
        page["entries"][0]["uuid"]
            .as_str()
            .expect("the stack just filed")
            .to_string()
    }

    /// A new card-wide tag, answering its uuid
    async fn tag(&mut self, name: &str) -> String {
        let body = self
            .owner
            .json(
                Method::POST,
                &api("tags"),
                &json!({ "name": name, "color": "lime", "icon": "tag" }),
            )
            .await
            .ok_json();
        body["uuid"].as_str().expect("tag uuid").to_string()
    }

    /// Puts a tag on a stack's card
    async fn put_tag(&mut self, entry: &str, tag: &str) {
        let response = self
            .owner
            .json(
                Method::POST,
                &api(&format!(
                    "collections/{}/entries/{entry}/tags/{tag}",
                    self.collection
                )),
                &json!({}),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");
    }

    /// One page of the owner's listing, by a raw query string
    async fn cards(&mut self, query: &str) -> Value {
        self.owner
            .get(&api(&format!(
                "collections/{}/cards?{query}",
                self.collection
            )))
            .await
            .ok_json()
    }

    /// The share token of the collection
    async fn share(&mut self) -> String {
        let body = self
            .owner
            .json(
                Method::POST,
                &api(&format!("collections/{}/share-token", self.collection)),
                &json!({}),
            )
            .await
            .ok_json();
        body["share_token"].as_str().expect("a token").to_string()
    }
}

/// The group keys of a page, row by row
fn keys(page: &Value) -> Vec<String> {
    page["entries"]
        .as_array()
        .expect("entries")
        .iter()
        .map(|entry| entry["group"].as_str().expect("a group key").to_string())
        .collect()
}

/// The group keys of a page, each once, in the order they first appear
fn headings(page: &Value) -> Vec<String> {
    let mut seen = Vec::new();
    for key in keys(page) {
        if !seen.contains(&key) {
            seen.push(key);
        }
    }
    seen
}

/// The card names of a page, row by row
fn names(page: &Value) -> Vec<String> {
    page["entries"]
        .as_array()
        .expect("entries")
        .iter()
        .map(|entry| entry["card"]["name"].as_str().expect("a name").to_string())
        .collect()
}

/// The `(stacks, copies)` a page reports for a group
fn total(page: &Value, key: &str) -> (i64, i64) {
    let group = page["groups"]
        .as_array()
        .expect("groups")
        .iter()
        .find(|group| group["key"] == json!(key))
        .unwrap_or_else(|| panic!("no total for {key} in {page}"));
    (
        group["stacks"].as_i64().expect("stacks"),
        group["copies"].as_i64().expect("copies"),
    )
}

#[test]
fn the_server_files_cards_under_the_keys_the_deck_grouping_uses() {
    run(async {
        let cards: Vec<FixtureCard> = serde_json::from_str(FIXTURE).expect("a valid fixture");
        let mut shelf = Shelf::new().await;
        let mut expected = Vec::new();
        for card in &cards {
            let printing = print(Card {
                name: &card.name,
                type_line: &card.type_line,
                mana_value: card.mana_value,
                color_identity: &card.color_identity,
                ..Card::default()
            })
            .await;
            shelf.file(printing, 1).await;
            expected.push(card);
        }

        for (grouping, of) in [
            (
                "type",
                (|card: &FixtureCard| card.card_type.clone()) as fn(&FixtureCard) -> String,
            ),
            ("mana_value", |card: &FixtureCard| card.mana.clone()),
            ("color", |card: &FixtureCard| card.color.clone()),
        ] {
            let page = shelf.cards(&format!("group={grouping}&limit=200")).await;
            for entry in page["entries"].as_array().expect("entries") {
                let name = entry["card"]["name"].as_str().expect("a name");
                let card = expected
                    .iter()
                    .find(|card| card.name == name)
                    .expect("a fixture card");
                assert_eq!(
                    entry["group"].as_str(),
                    Some(of(card).as_str()),
                    "{name} grouped by {grouping}"
                );
            }
        }
    });
}

#[test]
fn groups_come_in_the_deck_order() {
    run(async {
        let mut shelf = Shelf::new().await;
        for (type_line, mana_value, color_identity) in [
            ("Basic Land — Forest", 0.0, "G"),
            ("Instant", 9.0, "UR"),
            ("Creature — Elf", 2.0, ""),
            ("Sorcery", 1.0, "W"),
            ("Artifact", 7.0, "B"),
        ] {
            let printing = print(Card {
                type_line,
                mana_value,
                color_identity,
                ..Card::default()
            })
            .await;
            shelf.file(printing, 1).await;
        }

        let by_type = shelf.cards("group=type").await;
        assert_eq!(
            headings(&by_type),
            ["creature", "sorcery", "instant", "artifact", "land"]
        );

        let by_mana = shelf.cards("group=mana_value").await;
        assert_eq!(headings(&by_mana), ["0", "1", "2", "7"]);
        assert_eq!(total(&by_mana, "7"), (2, 2), "9 and 7 share the last group");

        let by_color = shelf.cards("group=color").await;
        assert_eq!(
            headings(&by_color),
            ["W", "B", "G", "multicolor", "colorless"]
        );
    });
}

#[test]
fn sets_come_newest_first() {
    run(async {
        let mut shelf = Shelf::new().await;
        let (old, new, middle) = (unique_set(), unique_set(), unique_set());
        for (set, released) in [
            (&old, "2001-01-01"),
            (&new, "2024-06-01"),
            (&middle, "2012-03-01"),
            (&new, "2024-06-01"),
        ] {
            let printing = print(Card {
                set,
                released,
                ..Card::default()
            })
            .await;
            shelf.file(printing, 1).await;
        }

        let page = shelf.cards("group=set").await;

        assert_eq!(
            headings(&page),
            [
                new.to_uppercase(),
                middle.to_uppercase(),
                old.to_uppercase()
            ]
        );
        assert_eq!(total(&page, &new.to_uppercase()), (2, 2));
    });
}

#[test]
fn the_sort_orders_within_each_group_and_descending_reverses_only_that() {
    run(async {
        let mut shelf = Shelf::new().await;
        for (name, type_line, eur) in [
            ("Cheap Elf", "Creature — Elf", "0.10"),
            ("Pricey Elf", "Creature — Elf", "9.00"),
            ("Mid Elf", "Creature — Elf", "1.00"),
            ("Cheap Bolt", "Instant", "0.20"),
            ("Pricey Bolt", "Instant", "5.00"),
        ] {
            let printing = print(Card {
                name,
                type_line,
                eur: Some(eur),
                ..Card::default()
            })
            .await;
            shelf.file(printing, 1).await;
        }

        let ascending = shelf.cards("group=type&sort=unit_price").await;
        assert_eq!(
            names(&ascending),
            [
                "Cheap Elf",
                "Mid Elf",
                "Pricey Elf",
                "Cheap Bolt",
                "Pricey Bolt"
            ]
        );

        let descending = shelf
            .cards("group=type&sort=unit_price&descending=true")
            .await;
        assert_eq!(
            names(&descending),
            [
                "Pricey Elf",
                "Mid Elf",
                "Cheap Elf",
                "Pricey Bolt",
                "Cheap Bolt"
            ]
        );
    });
}

#[test]
fn a_group_cut_by_the_page_shows_on_both_pages_with_its_whole_size() {
    run(async {
        let mut shelf = Shelf::new().await;
        for (type_line, quantity) in [
            ("Creature — Elf", 1),
            ("Creature — Elf", 2),
            ("Creature — Elf", 3),
            ("Instant", 4),
        ] {
            let printing = print(Card {
                type_line,
                ..Card::default()
            })
            .await;
            shelf.file(printing, quantity).await;
        }

        let first = shelf.cards("group=type&limit=2&offset=0").await;
        let second = shelf.cards("group=type&limit=2&offset=2").await;

        assert_eq!(keys(&first), ["creature", "creature"]);
        assert_eq!(keys(&second), ["creature", "instant"]);
        assert_eq!(total(&first, "creature"), (3, 6));
        assert_eq!(total(&second, "creature"), (3, 6));
        assert_eq!(total(&second, "instant"), (1, 4));
        assert_eq!(first["groups"].as_array().expect("groups").len(), 1);
        assert_eq!(first["listed"], json!(4));
        assert_eq!(first["next_cursor"], Value::Null);
    });
}

#[test]
fn a_stack_is_listed_under_each_of_its_tags_and_untagged_ones_last() {
    run(async {
        let mut shelf = Shelf::new().await;
        let ramp = shelf.tag("Ramp").await;
        let combo = shelf.tag("Combo").await;
        let both = print(Card {
            name: "Both",
            ..Card::default()
        })
        .await;
        let only_ramp = print(Card {
            name: "Only Ramp",
            ..Card::default()
        })
        .await;
        let none = print(Card {
            name: "None",
            ..Card::default()
        })
        .await;
        let both = shelf.file(both, 1).await;
        let only_ramp = shelf.file(only_ramp, 2).await;
        shelf.file(none, 3).await;
        shelf.put_tag(&both, &ramp).await;
        shelf.put_tag(&both, &combo).await;
        shelf.put_tag(&only_ramp, &ramp).await;

        let page = shelf.cards("group=tag&sort=name").await;

        assert_eq!(
            keys(&page),
            [
                combo.clone(),
                ramp.clone(),
                ramp.clone(),
                "untagged".to_string()
            ]
        );
        assert_eq!(names(&page), ["Both", "Both", "Only Ramp", "None"]);
        assert_eq!(total(&page, &ramp), (2, 3));
        assert_eq!(total(&page, "untagged"), (1, 3));
        assert_eq!(
            page["total"],
            json!(3),
            "the collection still holds three stacks"
        );
        assert_eq!(page["listed"], json!(4));
    });
}

#[test]
fn a_name_search_narrows_the_groups_and_their_totals() {
    run(async {
        let mut shelf = Shelf::new().await;
        let needle = unique("Needle");
        let elf = format!("{needle} Elf");
        for (name, type_line) in [
            (elf.as_str(), "Creature — Elf"),
            ("Haystack Elf", "Creature — Elf"),
            ("Haystack Bolt", "Instant"),
        ] {
            let printing = print(Card {
                name,
                type_line,
                ..Card::default()
            })
            .await;
            shelf.file(printing, 1).await;
        }

        let page = shelf
            .cards(&format!("group=type&search={}", needle.replace(' ', "%20")))
            .await;

        assert_eq!(names(&page), [elf]);
        assert_eq!(total(&page, "creature"), (1, 1));
        assert_eq!(page["groups"].as_array().expect("groups").len(), 1);
    });
}

#[test]
fn a_shared_collection_cannot_be_grouped_by_tag() {
    run(async {
        let mut shelf = Shelf::new().await;
        let printing = print(Card::default()).await;
        shelf.file(printing, 1).await;
        let token = shelf.share().await;
        let mut visitor = TestClient::new();

        let by_tag = visitor
            .get(&api(&format!("shared/collections/{token}/cards?group=tag")))
            .await;
        let by_type = visitor
            .get(&api(&format!(
                "shared/collections/{token}/cards?group=type"
            )))
            .await;

        assert_eq!(by_tag.status, StatusCode::BAD_REQUEST, "{by_tag:?}");
        assert_eq!(keys(&by_type.ok_json()), ["instant"]);
    });
}

#[test]
fn a_public_collection_cannot_be_grouped_by_tag() {
    run(async {
        let mut shelf = Shelf::new().await;
        let printing = print(Card::default()).await;
        shelf.file(printing, 1).await;
        let response = shelf
            .owner
            .json(
                Method::POST,
                &api(&format!("collections/{}", shelf.collection)),
                &json!({ "visibility": "Public" }),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");
        let mut visitor = TestClient::logged_in(&create_account(Role::Member).await).await;

        let by_tag = visitor
            .get(&api(&format!(
                "explore/collections/{}/cards?group=tag",
                shelf.collection
            )))
            .await;
        let by_type = visitor
            .get(&api(&format!(
                "explore/collections/{}/cards?group=type",
                shelf.collection
            )))
            .await;

        assert_eq!(by_tag.status, StatusCode::BAD_REQUEST, "{by_tag:?}");
        assert_eq!(keys(&by_type.ok_json()), ["instant"]);
    });
}

#[test]
fn the_sort_orders_the_stacks_within_a_set() {
    run(async {
        let mut shelf = Shelf::new().await;
        let (old, new) = (unique_set(), unique_set());
        for (name, set, released) in [
            ("Zebra", &new, "2024-06-01"),
            ("Ant", &old, "2001-01-01"),
            ("Moth", &new, "2024-06-01"),
            ("Bee", &new, "2024-06-01"),
        ] {
            let printing = print(Card {
                name,
                set,
                released,
                ..Card::default()
            })
            .await;
            shelf.file(printing, 1).await;
        }

        let ascending = shelf.cards("group=set&sort=name").await;
        let descending = shelf.cards("group=set&sort=name&descending=true").await;

        assert_eq!(names(&ascending), ["Bee", "Moth", "Zebra", "Ant"]);
        assert_eq!(names(&descending), ["Zebra", "Moth", "Bee", "Ant"]);
    });
}

#[test]
fn without_a_grouping_the_list_is_what_it_was() {
    run(async {
        let mut shelf = Shelf::new().await;
        for _ in 0..3 {
            let printing = print(Card::default()).await;
            shelf.file(printing, 1).await;
        }

        let page = shelf.cards("limit=2").await;

        let entries = page["entries"].as_array().expect("entries");
        assert_eq!(entries.len(), 2);
        assert!(entries.iter().all(|entry| entry["group"].is_null()));
        assert_eq!(page["groups"], json!([]));
        assert_eq!(page["total"], json!(3));
        assert_eq!(page["listed"], json!(3));
        assert_eq!(page["next_cursor"], entries[1]["uuid"]);
    });
}
