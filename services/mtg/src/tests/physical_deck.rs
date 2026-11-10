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
        let drift = fixture
            .send(Method::GET, "collection/drift", Value::Null)
            .await
            .ok_json();
        assert_eq!(drift["has_physical_deck"], false, "{drift}");
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
        let drift = fixture
            .send(Method::GET, "collection/drift", Value::Null)
            .await
            .ok_json();
        assert_eq!(drift["has_physical_deck"], true, "{drift}");
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

        let drift = editor.get(&fixture.url("collection/drift")).await.ok_json();
        assert_eq!(drift["has_physical_deck"], true, "{drift}");
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
        for path in ["collection/drift", "sourcing"] {
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
