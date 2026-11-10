//! The Physical deck: it comes with the first card put in, it is taken apart
//! again, and only the owner changes it

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use url::Url;
use uuid::Uuid;

use crate::models::account::Role;
use crate::tests::default_printing::Print;
use crate::tests::default_printing::file;
use crate::tests::default_printing::file_printings;
use crate::tests::default_printing::unique;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;

/// An owner with one empty deck
struct Fixture {
    owner: TestClient,
    deck: String,
}

impl Fixture {
    /// A fresh owner with an empty private deck
    async fn new() -> Self {
        let account = create_account(Role::Member).await;
        let mut owner = TestClient::logged_in(&account).await;
        let body = owner
            .json(
                Method::POST,
                &api("decks"),
                &json!({
                    "name": "Built",
                    "description": null,
                    "format": "commander",
                    "visibility": "Private",
                }),
            )
            .await
            .ok_json();
        let deck = body["uuid"].as_str().expect("deck uuid").to_string();
        Self { owner, deck }
    }

    /// The url of a route below the deck, `""` for the deck itself
    fn url(&self, path: &str) -> Url {
        if path.is_empty() {
            api(&format!("decks/{}", self.deck))
        } else {
            api(&format!("decks/{}/{path}", self.deck))
        }
    }

    /// Sends a request below the deck as the owner
    async fn send(&mut self, method: Method, path: &str, body: Value) -> TestResponse {
        let url = self.url(path);
        self.owner.json(method, &url, &body).await
    }

    /// Adds a Deck entry as the owner, returning its uuid
    async fn add(&mut self, printing: Uuid, quantity: i32) -> String {
        let body = self
            .send(
                Method::POST,
                "cards",
                json!({ "printing": printing, "quantity": quantity, "zone": "Main" }),
            )
            .await
            .ok_json();
        body["uuid"].as_str().expect("entry uuid").to_string()
    }

    /// The deck's Deck entries as the owner lists them
    async fn entries(&mut self) -> Vec<Value> {
        let url = self.url("cards");
        let body = self.owner.get(&url).await.ok_json();
        body["cards"].as_array().expect("card list").clone()
    }

    /// The kinds of the deck's Deck changes, newest first
    async fn history(&mut self) -> Vec<Value> {
        let url = self.url("history");
        let body = self.owner.get(&url).await.ok_json();
        body["changes"].as_array().expect("change list").clone()
    }

    /// What the sourcing view reads
    async fn sourcing(&mut self) -> Value {
        let url = self.url("sourcing");
        self.owner.get(&url).await.ok_json()
    }

    /// A new collection of the owner, answering its uuid
    async fn collection(&mut self, name: &str) -> String {
        let body = self
            .owner
            .json(
                Method::POST,
                &api("collections"),
                &json!({
                    "name": name,
                    "description": "",
                    "color": "red",
                    "icon": "box",
                    "visibility": "Private",
                }),
            )
            .await
            .ok_json();
        body["uuid"].as_str().expect("collection uuid").to_string()
    }

    /// Files copies of a printing into a collection, answering the stack's uuid
    async fn file(&mut self, collection: &str, printing: Uuid, quantity: i32) -> String {
        self.owner
            .json(
                Method::POST,
                &api(&format!("collections/{collection}/entries")),
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
        self.stacks(collection)
            .await
            .into_iter()
            .find(|stack| stack["printing"] == json!(printing))
            .and_then(|stack| stack["uuid"].as_str().map(str::to_string))
            .expect("the stack just filed")
    }

    /// The stacks in a collection
    async fn stacks(&mut self, collection: &str) -> Vec<Value> {
        let body = self
            .owner
            .get(&api(&format!("collections/{collection}/entries")))
            .await
            .ok_json();
        body["entries"].as_array().expect("entry list").clone()
    }

    /// Takes copies out of a stack into the deck
    async fn take(&mut self, stack: &str, quantity: i32) -> TestResponse {
        self.send(
            Method::POST,
            "sourcing/take",
            json!({ "entry": stack, "quantity": quantity }),
        )
        .await
    }

    /// Puts Proxies into the Physical deck for a Deck entry
    async fn proxy(&mut self, entry: &str, quantity: i32) -> TestResponse {
        self.send(
            Method::POST,
            "sourcing/proxy",
            json!({ "slot": entry, "quantity": quantity }),
        )
        .await
    }

    /// How many copies of `printing` the collection holds
    async fn held(&mut self, collection: &str, printing: Uuid) -> i64 {
        self.stacks(collection)
            .await
            .iter()
            .filter(|stack| stack["printing"] == json!(printing))
            .map(|stack| stack["quantity"].as_i64().expect("quantity"))
            .sum()
    }
}

/// The stacks the sourcing answer says are in the Physical deck
fn filed(sourcing: &Value) -> Vec<Value> {
    sourcing["filed"].as_array().expect("filed list").clone()
}

/// A scanner session of the client's with one staged stack, answering its uuid
async fn scanned(client: &mut TestClient, printing: Uuid, quantity: i32) -> String {
    let body = client
        .json(
            Method::POST,
            &api("scanner-sessions"),
            &json!({ "name": "Deck box", "color": "red", "icon": "box", "collection": null }),
        )
        .await
        .ok_json();
    let session = body["uuid"].as_str().expect("session uuid").to_string();
    client
        .json(
            Method::POST,
            &api(&format!("scanner-sessions/{session}/entries")),
            &json!({
                "printing": printing,
                "quantity": quantity,
                "finish": "Nonfoil",
                "purchase_price_cents": null,
            }),
        )
        .await
        .ok_json();
    session
}

/// Files a scanner session into a deck's Physical deck
async fn file_into_deck(client: &mut TestClient, session: &str, deck: &str) -> TestResponse {
    client
        .json(
            Method::POST,
            &api(&format!("scanner-sessions/{session}/file")),
            &json!({ "collection": null, "deck": deck }),
        )
        .await
}

#[test]
fn a_deck_nobody_put_a_card_into_has_no_physical_deck() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add(Uuid::new_v4(), 1).await;

        let sourcing = fixture.sourcing().await;

        assert_eq!(sourcing["physical_deck"], Value::Null, "{sourcing}");
        assert!(filed(&sourcing).is_empty());
        let deviation = fixture
            .send(Method::GET, "deviation", Value::Null)
            .await
            .ok_json();
        assert_eq!(deviation["has_physical_deck"], false, "{deviation}");
        assert_eq!(deviation["entries"], json!([]), "{deviation}");
        assert_eq!(deviation["not_on_list"], json!([]), "{deviation}");
    });
}

#[test]
fn taking_copies_from_a_collection_creates_the_physical_deck_and_remembers_the_origin() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        fixture.add(printing, 2).await;
        let binder = fixture.collection("Binder").await;
        let stack = fixture.file(&binder, printing, 3).await;

        fixture.take(&stack, 2).await.ok_json();

        let sourcing = fixture.sourcing().await;
        assert_ne!(sourcing["physical_deck"], Value::Null, "{sourcing}");
        let filed = filed(&sourcing);
        assert_eq!(filed.len(), 1, "{filed:?}");
        assert_eq!(filed[0]["printing"], json!(printing));
        assert_eq!(filed[0]["quantity"], 2);
        assert_eq!(filed[0]["origin"], json!(binder));
        assert_eq!(fixture.held(&binder, printing).await, 1);
    });
}

#[test]
fn recording_bought_copies_creates_the_physical_deck_without_an_origin() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture.add(printing, 2).await;

        let answer = fixture
            .send(Method::POST, "sourcing/fill", json!({ "slot": entry }))
            .await
            .ok_json();

        assert_eq!(answer["filed"], 2);
        let sourcing = fixture.sourcing().await;
        assert_ne!(sourcing["physical_deck"], Value::Null, "{sourcing}");
        let filed = filed(&sourcing);
        assert_eq!(filed.len(), 1, "{filed:?}");
        assert_eq!(filed[0]["quantity"], 2);
        assert_eq!(filed[0]["origin"], Value::Null);
    });
}

#[test]
fn taking_another_printing_onto_a_line_leaves_the_list_and_the_history_alone() {
    run(async {
        let mut fixture = Fixture::new().await;
        let listed = Uuid::new_v4();
        let other = Uuid::new_v4();
        fixture.add(listed, 3).await;
        let entries = fixture.entries().await;
        let history = fixture.history().await;
        let binder = fixture.collection("Binder").await;
        let stack = fixture.file(&binder, other, 1).await;

        fixture.take(&stack, 1).await.ok_json();

        assert_eq!(fixture.entries().await, entries);
        assert_eq!(fixture.history().await, history);
        let deviation = fixture
            .send(Method::GET, "deviation", Value::Null)
            .await
            .ok_json();
        assert_eq!(deviation["has_physical_deck"], true, "{deviation}");
    });
}

#[test]
fn there_is_no_attaching_or_detaching_a_deck_collection_any_more() {
    run(async {
        let mut fixture = Fixture::new().await;

        for method in [Method::POST, Method::DELETE] {
            let response = fixture.send(method, "collection", Value::Null).await;
            assert!(
                matches!(
                    response.status,
                    StatusCode::NOT_FOUND | StatusCode::METHOD_NOT_ALLOWED
                ),
                "{}",
                response.status
            );
        }
    });
}

#[test]
fn taking_the_physical_deck_apart_sorts_real_cards_back_and_removes_it() {
    run(async {
        let mut fixture = Fixture::new().await;
        let taken = Uuid::new_v4();
        let bought = Uuid::new_v4();
        fixture.add(taken, 2).await;
        let entry = fixture.add(bought, 1).await;
        let binder = fixture.collection("Binder").await;
        let shelf = fixture.collection("Shelf").await;
        let stack = fixture.file(&binder, taken, 2).await;
        fixture.take(&stack, 2).await.ok_json();
        fixture
            .send(Method::POST, "sourcing/fill", json!({ "slot": entry }))
            .await
            .ok_json();

        let answer = fixture
            .send(
                Method::POST,
                "sourcing/take-apart",
                json!({ "target": shelf }),
            )
            .await
            .ok_json();

        assert_eq!(answer["returned"], 3);
        assert_eq!(fixture.held(&binder, taken).await, 2);
        assert_eq!(fixture.held(&shelf, bought).await, 1);
        assert_eq!(fixture.held(&shelf, taken).await, 0);
        let sourcing = fixture.sourcing().await;
        assert_eq!(sourcing["physical_deck"], Value::Null, "{sourcing}");
        assert!(filed(&sourcing).is_empty());
    });
}

#[test]
fn a_card_whose_origin_was_deleted_goes_to_the_target() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        fixture.add(printing, 1).await;
        let gone = fixture.collection("Sold").await;
        let shelf = fixture.collection("Shelf").await;
        let stack = fixture.file(&gone, printing, 1).await;
        fixture.take(&stack, 1).await.ok_json();
        fixture
            .owner
            .json(
                Method::DELETE,
                &api(&format!("collections/{gone}")),
                &json!({}),
            )
            .await
            .ok_json();

        fixture
            .send(
                Method::POST,
                "sourcing/take-apart",
                json!({ "target": shelf }),
            )
            .await
            .ok_json();

        assert_eq!(fixture.held(&shelf, printing).await, 1);
    });
}

#[test]
fn taking_apart_is_refused_while_a_card_has_nowhere_to_go_and_then_moves_nothing() {
    run(async {
        let mut fixture = Fixture::new().await;
        let taken = Uuid::new_v4();
        let bought = Uuid::new_v4();
        fixture.add(taken, 1).await;
        let entry = fixture.add(bought, 1).await;
        let binder = fixture.collection("Binder").await;
        let stack = fixture.file(&binder, taken, 1).await;
        fixture.take(&stack, 1).await.ok_json();
        fixture
            .send(Method::POST, "sourcing/fill", json!({ "slot": entry }))
            .await
            .ok_json();
        let before = fixture.sourcing().await;

        let refused = fixture
            .send(
                Method::POST,
                "sourcing/take-apart",
                json!({ "target": null }),
            )
            .await;
        let into_itself = fixture
            .send(
                Method::POST,
                "sourcing/take-apart",
                json!({ "target": before["physical_deck"] }),
            )
            .await;

        assert_eq!(refused.status, StatusCode::BAD_REQUEST, "{refused:?}");
        assert_eq!(
            into_itself.status,
            StatusCode::BAD_REQUEST,
            "{into_itself:?}"
        );
        assert_eq!(filed(&fixture.sourcing().await), filed(&before));
        assert_eq!(fixture.held(&binder, taken).await, 0);
    });
}

#[test]
fn a_single_card_goes_back_from_the_physical_deck() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        fixture.add(printing, 3).await;
        let binder = fixture.collection("Binder").await;
        let shelf = fixture.collection("Shelf").await;
        let stack = fixture.file(&binder, printing, 3).await;
        fixture.take(&stack, 3).await.ok_json();
        let in_deck = filed(&fixture.sourcing().await)[0]["uuid"].clone();

        fixture
            .send(
                Method::POST,
                "sourcing/return",
                json!({ "entry": in_deck, "quantity": 1, "target": null }),
            )
            .await
            .ok_json();
        fixture
            .send(
                Method::POST,
                "sourcing/return",
                json!({ "entry": in_deck, "quantity": 1, "target": shelf }),
            )
            .await
            .ok_json();

        assert_eq!(fixture.held(&binder, printing).await, 1);
        assert_eq!(fixture.held(&shelf, printing).await, 1);
        let filed = filed(&fixture.sourcing().await);
        assert_eq!(filed.len(), 1, "{filed:?}");
        assert_eq!(filed[0]["quantity"], 1);
    });
}

#[test]
fn a_deck_taken_apart_before_it_is_deleted_leaves_its_cards_on_the_shelf() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture.add(printing, 2).await;
        let shelf = fixture.collection("Shelf").await;
        fixture
            .send(Method::POST, "sourcing/fill", json!({ "slot": entry }))
            .await
            .ok_json();

        fixture
            .send(
                Method::POST,
                "sourcing/take-apart",
                json!({ "target": shelf }),
            )
            .await
            .ok_json();
        fixture.send(Method::DELETE, "", json!({})).await.ok_json();

        assert_eq!(fixture.held(&shelf, printing).await, 2);
    });
}

#[test]
fn the_physical_deck_is_listed_with_no_collections() {
    run(async {
        let mut fixture = Fixture::new().await;
        let entry = fixture.add(Uuid::new_v4(), 1).await;
        let shelf = fixture.collection("Shelf").await;
        fixture
            .send(Method::POST, "sourcing/fill", json!({ "slot": entry }))
            .await
            .ok_json();

        let listed = fixture.owner.get(&api("collections")).await.ok_json();

        let uuids: Vec<&Value> = listed
            .as_array()
            .expect("collection list")
            .iter()
            .map(|overview| &overview["collection"]["uuid"])
            .collect();
        assert_eq!(uuids, vec![&json!(shelf)]);
    });
}

#[test]
fn real_cards_in_the_physical_deck_are_still_counted_among_the_owners_copies() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = file(&unique("Sol Ring"), Print::default()).await;
        fixture.add(printing, 1).await;
        let binder = fixture.collection("Binder").await;
        let stack = fixture.file(&binder, printing, 1).await;
        fixture.take(&stack, 1).await.ok_json();
        let list = fixture
            .owner
            .json(
                Method::POST,
                &api("watch-lists"),
                &json!({ "name": "Wants", "description": "", "color": "red", "icon": "eye" }),
            )
            .await
            .ok_json();
        let list = list["uuid"].as_str().expect("list uuid").to_string();
        fixture
            .owner
            .json(
                Method::POST,
                &api(&format!("watch-lists/{list}/entries")),
                &json!({
                    "printing": printing,
                    "finish": "Nonfoil",
                    "exact_printing": true,
                    "match_finish": true,
                    "wanted": 4,
                    "note": "",
                }),
            )
            .await
            .ok_json();

        let entries = fixture
            .owner
            .get(&api(&format!("watch-lists/{list}/entries")))
            .await
            .ok_json();

        let stock = &entries["entries"][0]["stock"];
        assert_eq!(stock["sleeved"], 1, "{entries}");
        assert_eq!(stock["free"], 0, "{entries}");
    });
}

#[test]
fn an_editor_reads_the_physical_deck_but_changes_nothing_and_a_viewer_sees_nothing() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture.add(printing, 2).await;
        let binder = fixture.collection("Binder").await;
        let stack = fixture.file(&binder, printing, 2).await;
        fixture.take(&stack, 1).await.ok_json();
        let in_deck = filed(&fixture.sourcing().await)[0]["uuid"].clone();
        let editor = create_account(Role::Member).await;
        let viewer = create_account(Role::Member).await;
        for (account, level) in [(&editor, "Editor"), (&viewer, "Viewer")] {
            fixture
                .send(
                    Method::PUT,
                    "collaborators",
                    json!({ "username": account.username, "level": level }),
                )
                .await
                .ok_json();
        }
        let mut editor = TestClient::logged_in(&editor).await;
        let mut viewer = TestClient::logged_in(&viewer).await;
        let missing = Uuid::new_v4();
        let changes = [
            ("sourcing/take", json!({ "entry": stack, "quantity": 1 })),
            ("sourcing/fill", json!({ "slot": entry })),
            (
                "sourcing/return",
                json!({ "entry": in_deck, "quantity": 1, "target": binder }),
            ),
            ("sourcing/take-apart", json!({ "target": binder })),
        ];

        let deviation = editor.get(&fixture.url("deviation")).await.ok_json();
        assert_eq!(deviation["has_physical_deck"], true, "{deviation}");
        for client in [&mut editor, &mut viewer] {
            for (path, body) in &changes {
                let refused = client.json(Method::POST, &fixture.url(path), body).await;
                let gone = client
                    .json(Method::POST, &api(&format!("decks/{missing}/{path}")), body)
                    .await;
                assert_eq!(refused.status, gone.status, "{path}: {refused:?}");
                assert_eq!(refused.body, gone.body, "{path}: {refused:?}");
            }
        }
        for path in ["deviation", "sourcing"] {
            let refused = viewer.get(&fixture.url(path)).await;
            let gone = viewer.get(&api(&format!("decks/{missing}/{path}"))).await;
            assert_eq!(refused.status, gone.status, "{path}: {refused:?}");
            assert_eq!(refused.body, gone.body, "{path}: {refused:?}");
        }

        let filed = filed(&fixture.sourcing().await);
        assert_eq!(filed.len(), 1, "{filed:?}");
        assert_eq!(filed[0]["quantity"], 1);
    });
}

#[test]
fn putting_a_proxy_in_for_a_line_creates_the_physical_deck() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture.add(printing, 2).await;

        fixture.proxy(&entry, 2).await.ok_json();

        let sourcing = fixture.sourcing().await;
        assert_ne!(sourcing["physical_deck"], Value::Null, "{sourcing}");
        let filed = filed(&sourcing);
        assert_eq!(filed.len(), 1, "{filed:?}");
        assert_eq!(filed[0]["printing"], json!(printing));
        assert_eq!(filed[0]["finish"], "Nonfoil");
        assert_eq!(filed[0]["quantity"], 2);
        assert_eq!(filed[0]["proxy"], true);
        assert_eq!(filed[0]["origin"], Value::Null);
    });
}

#[test]
fn replacing_a_proxy_moves_the_real_copy_in_and_throws_the_proxy_away() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture.add(printing, 2).await;
        fixture.proxy(&entry, 2).await.ok_json();
        let binder = fixture.collection("Binder").await;
        let stack = fixture.file(&binder, printing, 3).await;
        let proxies = filed(&fixture.sourcing().await)[0]["uuid"].clone();

        fixture
            .send(
                Method::POST,
                "sourcing/replace-proxy",
                json!({ "proxy": proxies, "entry": stack, "quantity": 1 }),
            )
            .await
            .ok_json();

        let filed = filed(&fixture.sourcing().await);
        let proxy: Vec<&Value> = filed.iter().filter(|s| s["proxy"] == true).collect();
        let real: Vec<&Value> = filed.iter().filter(|s| s["proxy"] == false).collect();
        assert_eq!(proxy.len(), 1, "{filed:?}");
        assert_eq!(proxy[0]["quantity"], 1);
        assert_eq!(real.len(), 1, "{filed:?}");
        assert_eq!(real[0]["quantity"], 1);
        assert_eq!(real[0]["origin"], json!(binder));
        assert_eq!(fixture.held(&binder, printing).await, 2);
    });
}

#[test]
fn recording_a_bought_copy_for_a_proxy_line_leaves_the_list_and_the_history_alone() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let body = fixture
            .send(
                Method::POST,
                "cards",
                json!({ "printing": printing, "quantity": 1, "zone": "Main", "proxy": true }),
            )
            .await
            .ok_json();
        let entry = body["uuid"].clone();
        let entries = fixture.entries().await;
        let history = fixture.history().await;

        let answer = fixture
            .send(Method::POST, "sourcing/fill", json!({ "slot": entry }))
            .await
            .ok_json();

        assert_eq!(answer["filed"], 1);
        assert_eq!(fixture.entries().await, entries);
        assert_eq!(fixture.history().await, history);
    });
}

#[test]
fn proxies_of_a_line_count_as_held_when_recording_bought_copies() {
    run(async {
        let mut fixture = Fixture::new().await;
        let entry = fixture.add(Uuid::new_v4(), 2).await;
        fixture.proxy(&entry, 1).await.ok_json();

        let answer = fixture
            .send(Method::POST, "sourcing/fill", json!({ "slot": null }))
            .await
            .ok_json();

        assert_eq!(answer["filed"], 1);
    });
}

#[test]
fn returning_a_proxy_throws_it_away() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture.add(printing, 3).await;
        fixture.proxy(&entry, 3).await.ok_json();
        let shelf = fixture.collection("Shelf").await;
        let proxies = filed(&fixture.sourcing().await)[0]["uuid"].clone();

        fixture
            .send(
                Method::POST,
                "sourcing/return",
                json!({ "entry": proxies, "quantity": 1, "target": null }),
            )
            .await
            .ok_json();
        fixture
            .send(
                Method::POST,
                "sourcing/return",
                json!({ "entry": proxies, "quantity": 1, "target": shelf }),
            )
            .await
            .ok_json();

        let filed = filed(&fixture.sourcing().await);
        assert_eq!(filed.len(), 1, "{filed:?}");
        assert_eq!(filed[0]["quantity"], 1);
        assert_eq!(fixture.held(&shelf, printing).await, 0);
    });
}

#[test]
fn taking_the_physical_deck_apart_throws_proxies_away() {
    run(async {
        let mut fixture = Fixture::new().await;
        let taken = Uuid::new_v4();
        let proxied = Uuid::new_v4();
        fixture.add(taken, 1).await;
        let entry = fixture.add(proxied, 2).await;
        let binder = fixture.collection("Binder").await;
        let stack = fixture.file(&binder, taken, 1).await;
        fixture.take(&stack, 1).await.ok_json();
        fixture.proxy(&entry, 2).await.ok_json();

        let answer = fixture
            .send(
                Method::POST,
                "sourcing/take-apart",
                json!({ "target": null }),
            )
            .await
            .ok_json();

        assert_eq!(answer["returned"], 1);
        assert_eq!(fixture.held(&binder, taken).await, 1);
        assert_eq!(fixture.held(&binder, proxied).await, 0);
        let sourcing = fixture.sourcing().await;
        assert_eq!(sourcing["physical_deck"], Value::Null, "{sourcing}");
    });
}

#[test]
fn proxies_are_not_counted_among_the_owners_copies() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = file(&unique("Mana Crypt"), Print::default()).await;
        let entry = fixture.add(printing, 1).await;
        fixture.proxy(&entry, 1).await.ok_json();
        let list = fixture
            .owner
            .json(
                Method::POST,
                &api("watch-lists"),
                &json!({ "name": "Wants", "description": "", "color": "red", "icon": "eye" }),
            )
            .await
            .ok_json();
        let list = list["uuid"].as_str().expect("list uuid").to_string();
        fixture
            .owner
            .json(
                Method::POST,
                &api(&format!("watch-lists/{list}/entries")),
                &json!({
                    "printing": printing,
                    "finish": "Nonfoil",
                    "exact_printing": true,
                    "match_finish": true,
                    "wanted": 4,
                    "note": "",
                }),
            )
            .await
            .ok_json();

        let entries = fixture
            .owner
            .get(&api(&format!("watch-lists/{list}/entries")))
            .await
            .ok_json();
        let watched = entries["entries"][0]["uuid"]
            .as_str()
            .expect("entry uuid")
            .to_string();
        let copies = fixture
            .owner
            .get(&api(&format!(
                "watch-lists/{list}/entries/{watched}/copies"
            )))
            .await
            .ok_json();

        let stock = &entries["entries"][0]["stock"];
        assert_eq!(stock["sleeved"], 0, "{entries}");
        assert_eq!(stock["free"], 0, "{entries}");
        assert_eq!(copies["copies"], json!([]), "{copies}");
    });
}

#[test]
fn proxies_are_never_offered_as_sourcing_candidates() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = file(&unique("Gaea's Cradle"), Print::default()).await;
        let entry = fixture.add(printing, 1).await;
        fixture.proxy(&entry, 1).await.ok_json();
        let mut other = Fixture {
            deck: String::new(),
            ..fixture
        };
        let body = other
            .owner
            .json(
                Method::POST,
                &api("decks"),
                &json!({
                    "name": "Second",
                    "description": null,
                    "format": "commander",
                    "visibility": "Private",
                }),
            )
            .await
            .ok_json();
        other.deck = body["uuid"].as_str().expect("deck uuid").to_string();
        other.add(printing, 1).await;

        let sourcing = other.sourcing().await;

        assert_eq!(sourcing["candidates"], json!([]), "{sourcing}");
    });
}

#[test]
fn an_editor_sees_proxies_fulfil_the_list_but_may_not_change_them() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture.add(printing, 1).await;
        fixture.proxy(&entry, 1).await.ok_json();
        let binder = fixture.collection("Binder").await;
        let stack = fixture.file(&binder, printing, 1).await;
        let proxies = filed(&fixture.sourcing().await)[0]["uuid"].clone();
        let editor = create_account(Role::Member).await;
        let viewer = create_account(Role::Member).await;
        for (account, level) in [(&editor, "Editor"), (&viewer, "Viewer")] {
            fixture
                .send(
                    Method::PUT,
                    "collaborators",
                    json!({ "username": account.username, "level": level }),
                )
                .await
                .ok_json();
        }
        let mut editor = TestClient::logged_in(&editor).await;
        let mut viewer = TestClient::logged_in(&viewer).await;
        let missing = Uuid::new_v4();
        let changes = [
            ("sourcing/proxy", json!({ "slot": entry, "quantity": 1 })),
            (
                "sourcing/replace-proxy",
                json!({ "proxy": proxies, "entry": stack, "quantity": 1 }),
            ),
            (
                "sourcing/return",
                json!({ "entry": proxies, "quantity": 1, "target": null }),
            ),
        ];

        let deviation = editor.get(&fixture.url("deviation")).await.ok_json();
        assert_eq!(deviation["has_physical_deck"], true, "{deviation}");
        let fulfilled = line(&deviation, &entry);
        assert_eq!(fulfilled["missing"], 0, "{deviation}");
        assert_eq!(fulfilled["proxies"], 1, "{deviation}");
        for client in [&mut editor, &mut viewer] {
            for (path, body) in &changes {
                let refused = client.json(Method::POST, &fixture.url(path), body).await;
                let gone = client
                    .json(Method::POST, &api(&format!("decks/{missing}/{path}")), body)
                    .await;
                assert_eq!(refused.status, gone.status, "{path}: {refused:?}");
                assert_eq!(refused.body, gone.body, "{path}: {refused:?}");
            }
        }

        let filed = filed(&fixture.sourcing().await);
        assert_eq!(filed.len(), 1, "{filed:?}");
        assert_eq!(filed[0]["proxy"], true);
    });
}

#[test]
fn replacing_more_proxies_than_there_are_changes_nothing() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture.add(printing, 2).await;
        fixture.proxy(&entry, 1).await.ok_json();
        let binder = fixture.collection("Binder").await;
        let stack = fixture.file(&binder, printing, 3).await;
        let before = fixture.sourcing().await;
        let proxies = filed(&before)[0]["uuid"].clone();

        let refused = fixture
            .send(
                Method::POST,
                "sourcing/replace-proxy",
                json!({ "proxy": proxies, "entry": stack, "quantity": 2 }),
            )
            .await;

        assert_eq!(refused.status, StatusCode::BAD_REQUEST, "{refused:?}");
        assert_eq!(filed(&fixture.sourcing().await), filed(&before));
        assert_eq!(fixture.held(&binder, printing).await, 3);
    });
}

#[test]
fn filing_a_scanner_session_into_an_unbuilt_deck_creates_its_physical_deck() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        fixture.add(printing, 2).await;
        let session = scanned(&mut fixture.owner, printing, 2).await;

        let answer = file_into_deck(&mut fixture.owner, &session, &fixture.deck)
            .await
            .ok_json();

        assert_eq!(answer["copies"], 2, "{answer}");
        assert_eq!(answer["deck"], json!(fixture.deck), "{answer}");
        let sourcing = fixture.sourcing().await;
        assert_ne!(sourcing["physical_deck"], Value::Null, "{sourcing}");
        let filed = filed(&sourcing);
        assert_eq!(filed.len(), 1, "{filed:?}");
        assert_eq!(filed[0]["printing"], json!(printing));
        assert_eq!(filed[0]["quantity"], 2);
        assert_eq!(filed[0]["origin"], Value::Null);
    });
}

#[test]
fn filing_a_scanner_session_into_a_built_deck_adds_to_its_physical_deck() {
    run(async {
        let mut fixture = Fixture::new().await;
        let taken = Uuid::new_v4();
        let printing = Uuid::new_v4();
        fixture.add(taken, 1).await;
        fixture.add(printing, 3).await;
        let binder = fixture.collection("Binder").await;
        let stack = fixture.file(&binder, taken, 1).await;
        fixture.take(&stack, 1).await.ok_json();
        let physical_deck = fixture.sourcing().await["physical_deck"].clone();
        let session = scanned(&mut fixture.owner, printing, 3).await;

        file_into_deck(&mut fixture.owner, &session, &fixture.deck)
            .await
            .ok_json();

        let sourcing = fixture.sourcing().await;
        assert_eq!(sourcing["physical_deck"], physical_deck, "{sourcing}");
        let filed = filed(&sourcing);
        assert_eq!(filed.len(), 2, "{filed:?}");
        let scanned = filed
            .iter()
            .find(|stack| stack["printing"] == json!(printing))
            .expect("the scanned stack");
        assert_eq!(scanned["quantity"], 3);
        assert_eq!(scanned["origin"], Value::Null);
        let session = fixture
            .owner
            .get(&api(&format!("scanner-sessions/{session}")))
            .await
            .ok_json();
        assert!(
            session["entries"].as_array().expect("entries").is_empty(),
            "{session}"
        );
    });
}

#[test]
fn a_scanner_session_is_not_filed_into_a_deck_the_account_only_edits() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        fixture.add(printing, 1).await;
        let editor = create_account(Role::Member).await;
        fixture
            .send(
                Method::PUT,
                "collaborators",
                json!({ "username": editor.username, "level": "Editor" }),
            )
            .await
            .ok_json();
        let mut editor = TestClient::logged_in(&editor).await;
        let session = scanned(&mut editor, printing, 1).await;

        let refused = file_into_deck(&mut editor, &session, &fixture.deck).await;
        let gone = file_into_deck(&mut editor, &session, &Uuid::new_v4().to_string()).await;

        assert_ne!(refused.status, StatusCode::OK, "{refused:?}");
        assert_eq!(refused.status, gone.status, "{refused:?}");
        assert_eq!(refused.body, gone.body, "{refused:?}");
        let sourcing = fixture.sourcing().await;
        assert_eq!(sourcing["physical_deck"], Value::Null, "{sourcing}");
        let session = editor
            .get(&api(&format!("scanner-sessions/{session}")))
            .await
            .ok_json();
        assert_eq!(session["session"]["copies"], 1, "{session}");
    });
}

impl Fixture {
    /// The Deviation as the owner reads it
    async fn deviation(&mut self) -> Value {
        let url = self.url("deviation");
        self.owner.get(&url).await.ok_json()
    }

    /// Adds a Deck entry as described by `body`, returning its uuid
    async fn add_entry(&mut self, body: Value) -> String {
        let body = self.send(Method::POST, "cards", body).await.ok_json();
        body["uuid"].as_str().expect("entry uuid").to_string()
    }

    /// Changes some fields of a Deck entry
    async fn patch(&mut self, entry: &str, body: Value) {
        self.send(Method::PATCH, &format!("cards/{entry}"), body)
            .await
            .ok_json();
    }

    /// Takes copies of a printing out of a fresh binder into the deck
    async fn take_fresh(&mut self, printing: Uuid, quantity: i32) {
        let binder = self.collection("Binder").await;
        let stack = self.file(&binder, printing, quantity).await;
        self.take(&stack, quantity).await.ok_json();
    }
}

/// The copies the Deviation lists, as (printing, quantity, foil, proxy)
fn copies(list: &Value) -> Vec<(Value, Value, Value, Value)> {
    list.as_array()
        .expect("copies list")
        .iter()
        .map(|copies| {
            (
                copies["printing"].clone(),
                copies["quantity"].clone(),
                copies["foil"].clone(),
                copies["proxy"].clone(),
            )
        })
        .collect()
}

#[test]
fn another_printing_in_the_deck_stands_in_for_a_line_as_a_deviation() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printings = file_printings(&unique("Sol Ring"), 2).await;
        let entry = fixture.add(printings[0], 1).await;
        fixture.take_fresh(printings[1], 1).await;

        let deviation = fixture.deviation().await;

        let line = line(&deviation, &entry);
        assert_eq!(line["in_deck"], 0, "{line}");
        assert_eq!(line["missing"], 0, "{line}");
        assert_eq!(
            copies(&line["other_printing"]),
            vec![(json!(printings[1]), json!(1), json!(false), json!(false))],
        );
        assert_eq!(deviation["not_on_list"], json!([]), "{deviation}");
    });
}

#[test]
fn another_finish_of_the_listed_printing_is_a_deviation() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture
            .add_entry(json!({ "printing": printing, "quantity": 1, "zone": "Main", "foil": true }))
            .await;
        fixture.take_fresh(printing, 1).await;

        let line = line(&fixture.deviation().await, &entry);

        assert_eq!(line["in_deck"], 0, "{line}");
        assert_eq!(
            copies(&line["other_printing"]),
            vec![(json!(printing), json!(1), json!(false), json!(false))],
        );
    });
}

#[test]
fn copies_beyond_what_the_line_asks_for_are_surplus() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture.add(printing, 1).await;
        fixture.take_fresh(printing, 3).await;

        let line = line(&fixture.deviation().await, &entry);

        assert_eq!(line["in_deck"], 1, "{line}");
        assert_eq!(line["missing"], 0, "{line}");
        assert_eq!(line["surplus"], 2, "{line}");
    });
}

#[test]
fn a_card_the_list_does_not_name_is_not_on_the_list() {
    run(async {
        let mut fixture = Fixture::new().await;
        let listed = Uuid::new_v4();
        let stray = Uuid::new_v4();
        let entry = fixture.add(listed, 1).await;
        fixture.take_fresh(stray, 2).await;

        let deviation = fixture.deviation().await;

        assert_eq!(line(&deviation, &entry)["missing"], 1, "{deviation}");
        assert_eq!(
            copies(&deviation["not_on_list"]),
            vec![(json!(stray), json!(2), json!(false), json!(false))],
        );
    });
}

#[test]
fn the_maybe_board_never_counts_and_its_cards_in_the_deck_are_not_on_the_list() {
    run(async {
        let mut fixture = Fixture::new().await;
        let maybe = Uuid::new_v4();
        let idea = Uuid::new_v4();
        let entry = fixture
            .add_entry(json!({ "printing": maybe, "quantity": 1, "zone": "Maybe" }))
            .await;
        fixture
            .add_entry(json!({ "printing": idea, "quantity": 1, "zone": "Maybe" }))
            .await;
        fixture.take_fresh(maybe, 1).await;

        let deviation = fixture.deviation().await;

        let lines = deviation["entries"].as_array().expect("entry list");
        assert!(
            lines.iter().all(|line| line["entry"] != json!(entry)),
            "{deviation}"
        );
        assert!(lines.is_empty(), "{deviation}");
        assert_eq!(
            copies(&deviation["not_on_list"]),
            vec![(json!(maybe), json!(1), json!(false), json!(false))],
        );
    });
}

#[test]
fn proxies_of_the_lines_printing_fulfil_it() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture.add(printing, 2).await;
        fixture.proxy(&entry, 2).await.ok_json();

        let deviation = fixture.deviation().await;

        let line = line(&deviation, &entry);
        assert_eq!(line["in_deck"], 2, "{line}");
        assert_eq!(line["proxies"], 2, "{line}");
        assert_eq!(line["missing"], 0, "{line}");
        assert_eq!(line["surplus"], 0, "{line}");
        assert_eq!(line["other_printing"], json!([]), "{line}");
    });
}

#[test]
fn a_proxy_of_another_printing_is_a_deviation_like_a_real_card() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printings = file_printings(&unique("Sol Ring"), 2).await;
        let entry = fixture.add(printings[0], 1).await;
        fixture.proxy(&entry, 1).await.ok_json();
        let filed_before = filed(&fixture.sourcing().await);

        fixture
            .patch(&entry, json!({ "printing": printings[1] }))
            .await;

        let line = line(&fixture.deviation().await, &entry);
        assert_eq!(line["in_deck"], 0, "{line}");
        assert_eq!(line["proxies"], 0, "{line}");
        assert_eq!(
            copies(&line["other_printing"]),
            vec![(json!(printings[0]), json!(1), json!(false), json!(true))],
        );
        assert_eq!(filed(&fixture.sourcing().await), filed_before);
    });
}

#[test]
fn an_editors_list_change_shows_as_deviation_and_leaves_the_physical_deck_alone() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture.add(printing, 2).await;
        fixture.take_fresh(printing, 2).await;
        let filed_before = filed(&fixture.sourcing().await);
        let editor = create_account(Role::Member).await;
        fixture
            .send(
                Method::PUT,
                "collaborators",
                json!({ "username": editor.username, "level": "Editor" }),
            )
            .await
            .ok_json();
        let mut editor = TestClient::logged_in(&editor).await;

        editor
            .json(
                Method::PATCH,
                &fixture.url(&format!("cards/{entry}")),
                &json!({ "quantity": 3 }),
            )
            .await
            .ok_json();

        let deviation = editor.get(&fixture.url("deviation")).await.ok_json();
        assert_eq!(line(&deviation, &entry)["missing"], 1, "{deviation}");
        assert_eq!(filed(&fixture.sourcing().await), filed_before);
    });
}

#[test]
fn undoing_a_list_change_leaves_the_physical_deck_alone_and_shows_as_deviation() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        fixture.add(printing, 2).await;
        fixture.take_fresh(printing, 2).await;
        let filed_before = filed(&fixture.sourcing().await);

        fixture
            .send(Method::POST, "history/undo", Value::Null)
            .await
            .ok_json();

        assert!(fixture.entries().await.is_empty());
        assert_eq!(filed(&fixture.sourcing().await), filed_before);
        let deviation = fixture.deviation().await;
        assert_eq!(
            copies(&deviation["not_on_list"]),
            vec![(json!(printing), json!(2), json!(false), json!(false))],
        );
    });
}

#[test]
fn resetting_the_list_leaves_the_physical_deck_alone_and_shows_as_deviation() {
    run(async {
        let mut fixture = Fixture::new().await;
        let kept = Uuid::new_v4();
        let dropped = Uuid::new_v4();
        let entry = fixture.add(kept, 1).await;
        let point = fixture.history().await[0]["uuid"]
            .as_str()
            .expect("change uuid")
            .to_string();
        fixture.add(dropped, 1).await;
        fixture.take_fresh(kept, 1).await;
        fixture.take_fresh(dropped, 1).await;
        let filed_before = filed(&fixture.sourcing().await);

        fixture
            .send(Method::POST, &format!("history/{point}/reset"), Value::Null)
            .await
            .ok_json();

        assert_eq!(filed(&fixture.sourcing().await), filed_before);
        let deviation = fixture.deviation().await;
        assert_eq!(line(&deviation, &entry)["missing"], 0, "{deviation}");
        assert_eq!(
            copies(&deviation["not_on_list"]),
            vec![(json!(dropped), json!(1), json!(false), json!(false))],
        );
    });
}

/// What the Deviation says about one Deck entry
fn line(deviation: &Value, entry: &str) -> Value {
    deviation["entries"]
        .as_array()
        .expect("entry list")
        .iter()
        .find(|line| line["entry"] == json!(entry))
        .cloned()
        .unwrap_or_else(|| panic!("no line for {entry}: {deviation}"))
}

#[test]
fn a_line_says_how_many_of_its_copies_are_missing() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        let entry = fixture.add(printing, 3).await;
        let binder = fixture.collection("Binder").await;
        let stack = fixture.file(&binder, printing, 1).await;
        fixture.take(&stack, 1).await.ok_json();

        let deviation = fixture.deviation().await;

        assert_eq!(deviation["has_physical_deck"], true, "{deviation}");
        let line = line(&deviation, &entry);
        assert_eq!(line["in_deck"], 1, "{line}");
        assert_eq!(line["proxies"], 0, "{line}");
        assert_eq!(line["missing"], 2, "{line}");
        assert_eq!(line["surplus"], 0, "{line}");
        assert_eq!(line["other_printing"], json!([]), "{line}");
        assert_eq!(deviation["not_on_list"], json!([]), "{deviation}");
    });
}
