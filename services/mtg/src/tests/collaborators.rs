//! Deck Collaborators: the owner names them, they see the deck, Editors build
//! it, and they behave around Deletion and Lock

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::tests::deletion::delete;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::lock::lock;

/// An owner with one deck, and a second Account that is not on it yet
struct Fixture {
    account: TestAccount,
    owner: TestClient,
    deck: String,
    friend: TestAccount,
}

impl Fixture {
    /// A fresh owner with an empty private deck, and a fresh friend
    async fn new() -> Self {
        Self::with_visibility("Private").await
    }

    /// A fresh owner with an empty deck of the given Visibility, and a fresh friend
    async fn with_visibility(visibility: &str) -> Self {
        let account = create_account(Role::Member).await;
        let mut owner = TestClient::logged_in(&account).await;
        let body = owner
            .json(
                Method::POST,
                &api("decks"),
                &json!({
                    "name": "Together",
                    "description": null,
                    "format": "commander",
                    "visibility": visibility,
                }),
            )
            .await
            .ok_json();
        let deck = body["uuid"].as_str().expect("deck uuid").to_string();
        Self {
            account,
            owner,
            deck,
            friend: create_account(Role::Member).await,
        }
    }

    /// The url of a route below the deck, `""` for the deck itself
    fn url(&self, path: &str) -> url::Url {
        deck_url(&self.deck, path)
    }

    /// Names `username` on the deck at `level`, returning the response body
    async fn add(&mut self, username: &str, level: &str) -> Value {
        let url = self.url("collaborators");
        self.owner
            .json(
                Method::PUT,
                &url,
                &json!({ "username": username, "level": level }),
            )
            .await
            .ok_json()
    }

    /// Names the friend on the deck at `level`
    async fn add_friend(&mut self, level: &str) {
        let username = self.friend.username.clone();
        let body = self.add(&username, level).await;
        assert_eq!(body["username"], username.as_str(), "{body}");
        assert_eq!(body["level"], level, "{body}");
    }

    /// The Collaborators as the owner lists them
    async fn list(&mut self) -> Vec<Value> {
        let url = self.url("collaborators");
        let body = self.owner.get(&url).await.ok_json();
        body["collaborators"]
            .as_array()
            .expect("a list of collaborators")
            .clone()
    }

    /// Takes the friend off the deck
    async fn remove_friend(&mut self) {
        let url = self.url(&format!("collaborators/{}", self.friend.uuid.into_inner()));
        let body = self
            .owner
            .json(Method::DELETE, &url, &json!({}))
            .await
            .ok_json();
        assert_eq!(body, Value::Null);
    }

    /// Adds copies of a printing as the owner, returning the Deck entry's uuid
    async fn add_card(&mut self, entry: Value) -> String {
        let url = self.url("cards");
        let body = self.owner.json(Method::POST, &url, &entry).await.ok_json();
        body["uuid"].as_str().expect("entry uuid").to_string()
    }

    /// Creates a deck-local tag as the owner, returning its uuid
    async fn add_tag(&mut self) -> String {
        let deck = self.deck.clone();
        self.create_tag(&deck, "Ramp", false).await
    }

    /// Creates a global tag as the owner and puts it on `card`, returning its uuid
    async fn add_global_tag(&mut self, card: &str) -> String {
        let deck = self.deck.clone();
        let tag = self.create_tag(&deck, "Combo", true).await;
        let url = self.url(&format!("cards/{card}/tags/{tag}"));
        let body = self
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();
        assert_eq!(body, Value::Null);
        tag
    }

    /// Creates a second deck of the owner with a tag local to it, returning both uuids
    async fn add_other_deck_tag(&mut self) -> (String, String) {
        let body = self
            .owner
            .json(
                Method::POST,
                &api("decks"),
                &json!({
                    "name": "Elsewhere",
                    "description": null,
                    "format": "commander",
                    "visibility": "Private",
                }),
            )
            .await
            .ok_json();
        let deck = body["uuid"].as_str().expect("deck uuid").to_string();
        let tag = self.create_tag(&deck, "Lands", false).await;
        (deck, tag)
    }

    /// Creates a tag on `deck` as the owner, returning its uuid
    async fn create_tag(&mut self, deck: &str, name: &str, global: bool) -> String {
        let body = self
            .owner
            .json(
                Method::POST,
                &deck_url(deck, "tags"),
                &json!({ "name": name, "color": "green", "icon": "tag", "global": global }),
            )
            .await
            .ok_json();
        body["uuid"].as_str().expect("tag uuid").to_string()
    }

    /// The deck's cards and tags as the owner lists them
    async fn owner_listing(&mut self) -> Value {
        let url = self.url("cards");
        self.owner.get(&url).await.ok_json()
    }
}

/// The url of a route below `deck`, `""` for the deck itself
fn deck_url(deck: &str, path: &str) -> url::Url {
    if path.is_empty() {
        api(&format!("decks/{deck}"))
    } else {
        api(&format!("decks/{deck}/{path}"))
    }
}

/// One request against a deck, its url relative to the deck
struct Operation {
    method: Method,
    path: String,
    body: Value,
}

impl Operation {
    /// An operation with a json body
    fn new(method: Method, path: impl Into<String>, body: Value) -> Self {
        Self {
            method,
            path: path.into(),
            body,
        }
    }

    /// Sends the operation against `deck` as `client`
    async fn send(&self, client: &mut TestClient, deck: &str) -> TestResponse {
        let url = deck_url(deck, &self.path);
        if self.method == Method::GET {
            client.get(&url).await
        } else {
            client.json(self.method.clone(), &url, &self.body).await
        }
    }
}

/// Every operation that changes the deck as a decklist, tags aside
///
/// In an order that succeeds when sent one after the other: `card` holds two
/// copies before and is gone after, and the deck stays a Commander deck so
/// that it can claim a bracket.
fn decklist_operations(card: &str) -> Vec<Operation> {
    let printing = Uuid::new_v4();
    vec![
        Operation::new(
            Method::PUT,
            "",
            json!({ "name": "Taken", "description": "Ours", "format": "commander" }),
        ),
        Operation::new(Method::PUT, "colors", json!({ "colors": "W" })),
        Operation::new(Method::PUT, "bracket", json!({ "bracket": 2 })),
        Operation::new(
            Method::PUT,
            "rule-zero",
            json!({
                "allow_extra_commanders": true,
                "allow_duplicates": false,
                "allow_banned": false,
                "deck_size": null,
            }),
        ),
        Operation::new(Method::GET, "advisor-settings", Value::Null),
        Operation::new(
            Method::PUT,
            "advisor-settings",
            json!({
                "themes": {},
                "targets": {},
                "pool_query": null,
                "ignored": [],
                "kept": [],
                "setup_done": true,
            }),
        ),
        Operation::new(
            Method::POST,
            "cards",
            json!({ "printing": printing, "quantity": 1, "zone": "Main" }),
        ),
        Operation::new(
            Method::POST,
            "cards/import",
            json!({
                "cards": [{ "printing": printing, "quantity": 1, "zone": "Main" }],
                "mode": "Add",
            }),
        ),
        Operation::new(
            Method::PATCH,
            format!("cards/{card}"),
            json!({ "quantity": 4 }),
        ),
        Operation::new(
            Method::PATCH,
            format!("cards/{card}"),
            json!({ "zone": "Side" }),
        ),
        Operation::new(
            Method::POST,
            format!("cards/{card}/swap"),
            json!({ "quantity": 1, "printing": printing }),
        ),
        Operation::new(Method::DELETE, format!("cards/{card}"), json!({})),
    ]
}

/// Every operation on the deck's tags
fn tag_operations(card: &str, tag: &str) -> Vec<Operation> {
    vec![
        Operation::new(
            Method::POST,
            "tags",
            json!({ "name": "Draw", "color": "blue", "icon": "tag", "global": false }),
        ),
        Operation::new(
            Method::PUT,
            format!("tags/{tag}"),
            json!({ "name": "Removal", "color": "red", "icon": "tag", "global": false }),
        ),
        Operation::new(Method::POST, format!("cards/{card}/tags/{tag}"), json!({})),
        Operation::new(
            Method::DELETE,
            format!("cards/{card}/tags/{tag}"),
            json!({}),
        ),
        Operation::new(Method::DELETE, format!("tags/{tag}"), json!({})),
    ]
}

/// Every operation that changes the deck as a decklist, its tags included
fn edit_operations(card: &str, tag: &str) -> Vec<Operation> {
    let mut operations = decklist_operations(card);
    operations.extend(tag_operations(card, tag));
    operations
}

/// Every tag write that reaches beyond this deck's own tags
///
/// `global` is a global tag the owner put on `card`, `local` a tag local to
/// this deck and `elsewhere` one local to another deck of the owner.
fn foreign_tag_operations(
    card: &str,
    global: &str,
    local: &str,
    elsewhere: &str,
) -> Vec<Operation> {
    vec![
        Operation::new(
            Method::POST,
            "tags",
            json!({ "name": "Wincon", "color": "red", "icon": "tag", "global": true }),
        ),
        Operation::new(
            Method::PUT,
            format!("tags/{global}"),
            json!({ "name": "Renamed", "color": "red", "icon": "tag", "global": true }),
        ),
        Operation::new(
            Method::PUT,
            format!("tags/{global}"),
            json!({ "name": "Combo", "color": "green", "icon": "tag", "global": false }),
        ),
        Operation::new(
            Method::PUT,
            format!("tags/{local}"),
            json!({ "name": "Ramp", "color": "green", "icon": "tag", "global": true }),
        ),
        Operation::new(
            Method::DELETE,
            format!("cards/{card}/tags/{global}"),
            json!({}),
        ),
        Operation::new(
            Method::POST,
            format!("cards/{card}/tags/{global}"),
            json!({}),
        ),
        Operation::new(Method::DELETE, format!("tags/{global}"), json!({})),
        Operation::new(
            Method::PUT,
            format!("tags/{elsewhere}"),
            json!({ "name": "Lands", "color": "green", "icon": "tag", "global": false }),
        ),
        Operation::new(
            Method::POST,
            format!("cards/{card}/tags/{elsewhere}"),
            json!({}),
        ),
        Operation::new(Method::DELETE, format!("tags/{elsewhere}"), json!({})),
    ]
}

/// Every operation on the owner's shelf, and on who may see the deck
fn owner_operations(friend: &TestAccount) -> Vec<Operation> {
    let entry = Uuid::new_v4();
    let change = Uuid::new_v4();
    vec![
        Operation::new(Method::POST, "", json!({ "visibility": "Public" })),
        Operation::new(Method::POST, "share-token", json!({})),
        Operation::new(Method::POST, "folder", json!({ "folder": null })),
        Operation::new(Method::POST, "collection", json!({})),
        Operation::new(Method::DELETE, "collection", json!({})),
        Operation::new(Method::GET, "sourcing", Value::Null),
        Operation::new(Method::GET, "collection/drift", Value::Null),
        Operation::new(
            Method::POST,
            "sourcing/take",
            json!({ "entry": entry, "quantity": 1, "slot": null }),
        ),
        Operation::new(Method::POST, "sourcing/fill", json!({ "slot": null })),
        Operation::new(
            Method::POST,
            "sourcing/return",
            json!({ "entry": entry, "quantity": 1, "target": null }),
        ),
        Operation::new(
            Method::POST,
            "sourcing/return-all",
            json!({ "target": null }),
        ),
        Operation::new(Method::GET, "history", Value::Null),
        Operation::new(Method::POST, "history/undo", json!({})),
        Operation::new(Method::POST, "history/redo", json!({})),
        Operation::new(Method::GET, format!("history/{change}"), Value::Null),
        Operation::new(Method::POST, format!("history/{change}/reset"), json!({})),
        Operation::new(
            Method::PUT,
            format!("history/{change}/checkpoint"),
            json!({ "name": "FNM" }),
        ),
        Operation::new(
            Method::DELETE,
            format!("history/{change}/checkpoint"),
            json!({}),
        ),
        Operation::new(
            Method::PUT,
            "collaborators",
            json!({ "username": friend.username, "level": "Editor" }),
        ),
        Operation::new(
            Method::DELETE,
            format!("collaborators/{}", friend.uuid.into_inner()),
            json!({}),
        ),
        Operation::new(Method::DELETE, "", json!({})),
    ]
}

/// Asserts each operation answers `client` exactly like it answers on a missing deck
async fn assert_all_denied(client: &mut TestClient, deck: &str, operations: &[Operation]) {
    let missing = Uuid::new_v4().to_string();
    for operation in operations {
        let refused = operation.send(client, deck).await;
        let gone = operation.send(client, &missing).await;
        assert_eq!(
            refused.status, gone.status,
            "{} {}: {refused:?}",
            operation.method, operation.path
        );
        assert_eq!(
            refused.body, gone.body,
            "{} {}: {refused:?}",
            operation.method, operation.path
        );
    }
}

#[test]
fn the_owner_adds_a_viewer_and_lists_them() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add_friend("Viewer").await;

        let list = fixture.list().await;
        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["username"], fixture.friend.username.as_str());
        assert_eq!(list[0]["level"], "Viewer");
        assert_eq!(
            list[0]["account"],
            fixture.friend.uuid.into_inner().to_string()
        );
    });
}

#[test]
fn adding_a_collaborator_again_changes_the_level() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add_friend("Viewer").await;
        fixture.add_friend("Editor").await;

        let list = fixture.list().await;
        assert_eq!(list.len(), 1, "{list:?}");
        assert_eq!(list[0]["level"], "Editor");

        fixture.add_friend("Viewer").await;
        let list = fixture.list().await;
        assert_eq!(list.len(), 1, "{list:?}");
        assert_eq!(list[0]["level"], "Viewer");
    });
}

#[test]
fn the_owner_cannot_add_themselves() {
    run(async {
        let mut fixture = Fixture::new().await;
        let me = fixture.owner.get(&api("accounts/me")).await.ok_json();
        let username = me["username"].as_str().expect("username").to_string();

        let body = fixture.add(&username, "Editor").await;
        assert_eq!(body["result"], "Err", "{body}");
        assert_eq!(body["error"]["own_account"], true, "{body}");
        assert_eq!(body["error"]["unknown_username"], false, "{body}");
        assert!(fixture.list().await.is_empty());
    });
}

#[test]
fn an_unknown_username_gets_its_own_error() {
    run(async {
        let mut fixture = Fixture::new().await;

        let body = fixture.add("nobody-by-this-name", "Viewer").await;
        assert_eq!(body["result"], "Err", "{body}");
        assert_eq!(body["error"]["unknown_username"], true, "{body}");
        assert_eq!(body["error"]["own_account"], false, "{body}");
        assert!(fixture.list().await.is_empty());
    });
}

#[test]
fn unknown_usernames_are_limited_per_account() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add_friend("Viewer").await;

        for _ in 0..20 {
            let body = fixture.add("nobody-by-this-name", "Viewer").await;
            assert_eq!(body["error"]["unknown_username"], true, "{body}");
            assert_eq!(body["error"]["too_many_unknown_usernames"], false, "{body}");
            fixture.add_friend("Editor").await;
        }

        let body = fixture.add("nobody-by-this-name", "Viewer").await;
        assert_eq!(body["result"], "Err", "{body}");
        assert_eq!(body["error"]["too_many_unknown_usernames"], true, "{body}");
        assert_eq!(body["error"]["unknown_username"], false, "{body}");

        fixture.remove_friend().await;
        fixture.add_friend("Viewer").await;
        let stranger = create_account(Role::Member).await;
        let body = fixture.add(&stranger.username, "Editor").await;
        assert_eq!(body["username"], stranger.username.as_str(), "{body}");
        assert_eq!(fixture.list().await.len(), 2);

        let mut other = Fixture::new().await;
        let body = other.add("nobody-by-this-name", "Viewer").await;
        assert_eq!(body["error"]["unknown_username"], true, "{body}");
    });
}

/// What a username search for `query` answers the owner with
async fn candidates(fixture: &mut Fixture, query: &str) -> Value {
    let url = fixture.url(&format!("collaborators/candidates?query={query}"));
    fixture.owner.get(&url).await.ok_json()
}

/// The usernames among a username search's answer
fn usernames(body: &Value) -> Vec<String> {
    body["accounts"]
        .as_array()
        .expect("a list of accounts")
        .iter()
        .map(|account| account["username"].as_str().expect("username").to_string())
        .collect()
}

#[test]
fn a_username_search_finds_accounts_by_prefix_ignoring_case() {
    run(async {
        let mut fixture = Fixture::new().await;
        let prefix = fixture.friend.username[..10].to_uppercase();

        let body = candidates(&mut fixture, &prefix).await;
        assert_eq!(body["too_many_searches"], false, "{body}");
        assert_eq!(usernames(&body), vec![fixture.friend.username.clone()]);
        assert_eq!(
            body["accounts"][0]["account"],
            fixture.friend.uuid.into_inner().to_string()
        );

        let body = candidates(&mut fixture, "u").await;
        assert!(usernames(&body).is_empty(), "{body}");

        let body = candidates(&mut fixture, "%25").await;
        assert!(usernames(&body).is_empty(), "{body}");
    });
}

#[test]
fn username_searches_are_limited_per_account() {
    run(async {
        let mut fixture = Fixture::new().await;
        let prefix = fixture.friend.username.clone();

        for _ in 0..120 {
            let body = candidates(&mut fixture, &prefix).await;
            assert_eq!(body["too_many_searches"], false, "{body}");
        }
        let body = candidates(&mut fixture, &prefix).await;
        assert_eq!(body["too_many_searches"], true, "{body}");
        assert!(usernames(&body).is_empty(), "{body}");

        let body = candidates(&mut fixture, "u").await;
        assert_eq!(body["too_many_searches"], false, "{body}");

        let mut other = Fixture::new().await;
        let body = candidates(&mut other, &prefix).await;
        assert_eq!(usernames(&body), vec![prefix]);
    });
}

#[test]
fn only_the_owner_searches_usernames() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add_friend("Editor").await;
        let mut friend = TestClient::logged_in(&fixture.friend).await;
        let operations = [Operation::new(
            Method::GET,
            "collaborators/candidates?query=ab",
            Value::Null,
        )];
        assert_all_denied(&mut friend, &fixture.deck, &operations).await;
    });
}

#[test]
fn the_tombstone_cannot_be_added() {
    run(async {
        let mut fixture = Fixture::new().await;

        let body = fixture.add("#deleted", "Viewer").await;
        assert_eq!(body["result"], "Err", "{body}");
        assert_eq!(body["error"]["unknown_username"], true, "{body}");
        assert!(fixture.list().await.is_empty());
    });
}

#[test]
fn a_viewer_sees_a_private_deck_without_the_proxy_flag() {
    run(async {
        let mut fixture = Fixture::new().await;
        let printing = Uuid::new_v4();
        fixture
            .add_card(json!({ "printing": printing, "quantity": 1, "zone": "Main", "proxy": true }))
            .await;
        fixture.add_tag().await;
        fixture.add_friend("Viewer").await;
        let mut viewer = TestClient::logged_in(&fixture.friend).await;

        let deck = viewer.get(&fixture.url("")).await.ok_json();
        assert_eq!(deck["name"], "Together");
        assert_eq!(deck["visibility"], "Private");
        assert_eq!(deck["role"], "Viewer");
        assert_eq!(deck["share_token"], Value::Null);

        let listing = viewer.get(&fixture.url("cards")).await.ok_json();
        let cards = listing["cards"].as_array().expect("cards");
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0]["printing"], printing.to_string());
        assert_eq!(cards[0]["proxy"], false);
        let tags = listing["tags"].as_array().expect("tags");
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0]["name"], "Ramp");

        let owners = fixture.owner.get(&fixture.url("cards")).await.ok_json();
        assert_eq!(owners["cards"][0]["proxy"], true);
        let deck = fixture.owner.get(&fixture.url("")).await.ok_json();
        assert_eq!(deck["role"], "Owner");
    });
}

#[test]
fn a_viewer_is_denied_every_edit_and_owner_operation() {
    run(async {
        let mut fixture = Fixture::new().await;
        let card = fixture
            .add_card(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;
        let tag = fixture.add_tag().await;
        fixture.add_friend("Viewer").await;
        let mut viewer = TestClient::logged_in(&fixture.friend).await;

        let stranger = create_account(Role::Member).await;
        assert_all_denied(&mut viewer, &fixture.deck, &edit_operations(&card, &tag)).await;
        assert_all_denied(&mut viewer, &fixture.deck, &owner_operations(&stranger)).await;

        let deck = fixture.owner.get(&fixture.url("")).await.ok_json();
        assert_eq!(deck["name"], "Together");
        let listing = fixture.owner.get(&fixture.url("cards")).await.ok_json();
        assert_eq!(listing["cards"][0]["quantity"], 2);
        assert_eq!(fixture.list().await.len(), 1);
    });
}

#[test]
fn an_editor_succeeds_on_every_decklist_operation() {
    run(async {
        let mut fixture = Fixture::new().await;
        let card = fixture
            .add_card(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;
        fixture.add_friend("Editor").await;
        let mut editor = TestClient::logged_in(&fixture.friend).await;

        let deck = editor.get(&fixture.url("")).await.ok_json();
        assert_eq!(deck["role"], "Editor");

        for operation in decklist_operations(&card) {
            let response = operation.send(&mut editor, &fixture.deck).await;
            assert_eq!(
                response.status,
                StatusCode::OK,
                "{} {}: {response:?}",
                operation.method,
                operation.path
            );
        }

        let deck = fixture.owner.get(&fixture.url("")).await.ok_json();
        assert_eq!(deck["name"], "Taken", "{deck}");
        assert_eq!(deck["description"], "Ours", "{deck}");
        assert_eq!(deck["bracket"], 2, "{deck}");
        let settings = fixture
            .owner
            .get(&fixture.url("advisor-settings"))
            .await
            .ok_json();
        assert_eq!(settings["setup_done"], true, "{settings}");
        let listing = fixture.owner.get(&fixture.url("cards")).await.ok_json();
        let cards = listing["cards"].as_array().expect("cards");
        assert!(
            cards.iter().all(|slot| slot["uuid"] != card.as_str()),
            "{listing}"
        );
        let copies: i64 = cards
            .iter()
            .map(|slot| slot["quantity"].as_i64().expect("quantity"))
            .sum();
        assert_eq!(copies, 3, "{listing}");
    });
}

#[test]
fn an_editor_is_denied_every_owner_operation() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture
            .add_card(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;
        fixture.add_friend("Editor").await;
        let mut editor = TestClient::logged_in(&fixture.friend).await;

        let stranger = create_account(Role::Member).await;
        assert_all_denied(&mut editor, &fixture.deck, &owner_operations(&stranger)).await;

        let deck = fixture.owner.get(&fixture.url("")).await.ok_json();
        assert_eq!(deck["name"], "Together");
        assert_eq!(deck["visibility"], "Private");
        assert_eq!(fixture.list().await.len(), 1);
    });
}

#[test]
fn an_editor_uses_the_deck_local_tags() {
    run(async {
        let mut fixture = Fixture::new().await;
        let card = fixture
            .add_card(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;
        let tag = fixture.add_tag().await;
        fixture.add_friend("Editor").await;
        let mut editor = TestClient::logged_in(&fixture.friend).await;

        for operation in tag_operations(&card, &tag) {
            let response = operation.send(&mut editor, &fixture.deck).await;
            assert_eq!(
                response.status,
                StatusCode::OK,
                "{} {}: {response:?}",
                operation.method,
                operation.path
            );
        }

        let listing = fixture.owner_listing().await;
        let tags = listing["tags"].as_array().expect("tags");
        assert_eq!(tags.len(), 1, "{listing}");
        assert_eq!(tags[0]["name"], "Draw", "{listing}");
        assert_eq!(tags[0]["deck"], fixture.deck.as_str(), "{listing}");
    });
}

#[test]
fn a_tag_an_editor_creates_is_the_owners() {
    run(async {
        let mut fixture = Fixture::new().await;
        let card = fixture
            .add_card(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;
        fixture.add_friend("Editor").await;
        let mut editor = TestClient::logged_in(&fixture.friend).await;

        let created = editor
            .json(
                Method::POST,
                &fixture.url("tags"),
                &json!({ "name": "Draw", "color": "blue", "icon": "tag", "global": false }),
            )
            .await
            .ok_json();
        let tag = created["uuid"].as_str().expect("tag uuid").to_string();
        assert_eq!(created["deck"], fixture.deck.as_str(), "{created}");
        let url = fixture.url(&format!("cards/{card}/tags/{tag}"));
        let body = editor.json(Method::POST, &url, &json!({})).await.ok_json();
        assert_eq!(body, Value::Null);

        fixture.remove_friend().await;

        let listing = fixture.owner_listing().await;
        assert_eq!(listing["tags"][0]["uuid"], tag.as_str(), "{listing}");
        assert_eq!(listing["cards"][0]["tags"], json!([tag]), "{listing}");
        let url = fixture.url(&format!("tags/{tag}"));
        let body = fixture
            .owner
            .json(
                Method::PUT,
                &url,
                &json!({ "name": "Cards", "color": "blue", "icon": "tag", "global": true }),
            )
            .await
            .ok_json();
        assert_eq!(body, Value::Null);
        let body = fixture
            .owner
            .json(Method::DELETE, &url, &json!({}))
            .await
            .ok_json();
        assert_eq!(body, Value::Null);
        let listing = fixture.owner_listing().await;
        assert_eq!(listing["tags"], json!([]), "{listing}");
    });
}

#[test]
fn an_editor_sees_the_global_tags_too() {
    run(async {
        let mut fixture = Fixture::new().await;
        let card = fixture
            .add_card(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;
        let local = fixture.add_tag().await;
        let global = fixture.add_global_tag(&card).await;
        fixture.add_friend("Editor").await;
        let mut editor = TestClient::logged_in(&fixture.friend).await;

        let listing = editor.get(&fixture.url("cards")).await.ok_json();
        let mut tags: Vec<&str> = listing["tags"]
            .as_array()
            .expect("tags")
            .iter()
            .map(|tag| tag["uuid"].as_str().expect("tag uuid"))
            .collect();
        tags.sort_unstable();
        let mut expected = vec![local.as_str(), global.as_str()];
        expected.sort_unstable();
        assert_eq!(tags, expected, "{listing}");
        assert_eq!(listing["cards"][0]["tags"], json!([global]), "{listing}");
    });
}

#[test]
fn an_editor_is_denied_the_global_tags_and_other_decks_tags() {
    run(async {
        let mut fixture = Fixture::new().await;
        let card = fixture
            .add_card(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;
        let local = fixture.add_tag().await;
        let global = fixture.add_global_tag(&card).await;
        let (other, elsewhere) = fixture.add_other_deck_tag().await;
        fixture.add_friend("Editor").await;
        let mut editor = TestClient::logged_in(&fixture.friend).await;

        let operations = foreign_tag_operations(&card, &global, &local, &elsewhere);
        assert_all_denied(&mut editor, &fixture.deck, &operations).await;

        let listing = fixture.owner_listing().await;
        let tags = listing["tags"].as_array().expect("tags");
        assert_eq!(tags.len(), 2, "{listing}");
        for tag in tags {
            if tag["uuid"] == global.as_str() {
                assert_eq!(tag["name"], "Combo", "{listing}");
                assert_eq!(tag["deck"], Value::Null, "{listing}");
            } else {
                assert_eq!(tag["uuid"], local.as_str(), "{listing}");
                assert_eq!(tag["deck"], fixture.deck.as_str(), "{listing}");
            }
        }
        assert_eq!(listing["cards"][0]["tags"], json!([global]), "{listing}");
        let elsewhere_listing = fixture
            .owner
            .get(&deck_url(&other, "cards"))
            .await
            .ok_json();
        let tags = &elsewhere_listing["tags"];
        assert_eq!(
            tags.as_array().map(Vec::len),
            Some(2),
            "{elsewhere_listing}"
        );
        assert!(
            tags.as_array()
                .expect("tags")
                .iter()
                .any(|tag| tag["uuid"] == elsewhere.as_str() && tag["deck"] == other.as_str()),
            "{elsewhere_listing}"
        );
    });
}

#[test]
fn an_editors_card_update_leaves_the_proxy_flag_in_place() {
    run(async {
        let mut fixture = Fixture::new().await;
        let card = fixture
            .add_card(json!({
                "printing": Uuid::new_v4(),
                "quantity": 1,
                "zone": "Main",
                "proxy": true,
            }))
            .await;
        fixture.add_friend("Editor").await;
        let mut editor = TestClient::logged_in(&fixture.friend).await;

        let listing = editor.get(&fixture.url("cards")).await.ok_json();
        assert_eq!(listing["cards"][0]["proxy"], false, "{listing}");

        let url = fixture.url(&format!("cards/{card}"));
        for update in [
            json!({ "quantity": 3 }),
            json!({ "zone": "Side", "proxy": false }),
        ] {
            let body = editor.json(Method::PATCH, &url, &update).await.ok_json();
            assert_eq!(body, Value::Null);
        }

        let listing = fixture.owner.get(&fixture.url("cards")).await.ok_json();
        let cards = listing["cards"].as_array().expect("cards");
        assert_eq!(cards.len(), 1, "{listing}");
        assert_eq!(cards[0]["uuid"], card.as_str(), "{listing}");
        assert_eq!(cards[0]["quantity"], 3, "{listing}");
        assert_eq!(cards[0]["zone"], "Side", "{listing}");
        assert_eq!(cards[0]["proxy"], true, "{listing}");
    });
}

#[test]
fn an_editor_never_sets_the_proxy_flag() {
    run(async {
        let mut fixture = Fixture::new().await;
        let card = fixture
            .add_card(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;
        fixture.add_friend("Editor").await;
        let mut editor = TestClient::logged_in(&fixture.friend).await;

        let added = editor
            .json(
                Method::POST,
                &fixture.url("cards"),
                &json!({
                    "printing": Uuid::new_v4(),
                    "quantity": 1,
                    "zone": "Main",
                    "proxy": true,
                }),
            )
            .await
            .ok_json();
        assert_eq!(added["proxy"], false, "{added}");
        editor
            .json(
                Method::POST,
                &fixture.url("cards/import"),
                &json!({
                    "cards": [{
                        "printing": Uuid::new_v4(),
                        "quantity": 1,
                        "zone": "Side",
                        "proxy": true,
                    }],
                    "mode": "Add",
                }),
            )
            .await
            .ok_json();
        let swapped = editor
            .json(
                Method::POST,
                &fixture.url(&format!("cards/{card}/swap")),
                &json!({ "quantity": 1, "printing": Uuid::new_v4(), "proxy": true }),
            )
            .await
            .ok_json();
        assert_eq!(swapped["proxy"], false, "{swapped}");
        let body = editor
            .json(
                Method::PATCH,
                &fixture.url(&format!("cards/{card}")),
                &json!({ "proxy": true }),
            )
            .await
            .ok_json();
        assert_eq!(body, Value::Null);

        let listing = fixture.owner.get(&fixture.url("cards")).await.ok_json();
        let cards = listing["cards"].as_array().expect("cards");
        assert_eq!(cards.len(), 4, "{listing}");
        assert!(cards.iter().all(|slot| slot["proxy"] == false), "{listing}");
    });
}

#[test]
fn an_editors_edits_are_deck_changes_only_the_owner_sees() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add_friend("Editor").await;
        let mut editor = TestClient::logged_in(&fixture.friend).await;

        let added = editor
            .json(
                Method::POST,
                &fixture.url("cards"),
                &json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }),
            )
            .await
            .ok_json();
        assert_eq!(added["quantity"], 2, "{added}");

        let deck = editor.get(&fixture.url("")).await.ok_json();
        assert_eq!(deck["can_undo"], false, "{deck}");
        let history = fixture.owner.get(&fixture.url("history")).await.ok_json();
        assert_eq!(history["changes"][0]["kind"], "Quantity", "{history}");
        assert_eq!(history["can_undo"], true, "{history}");
    });
}

#[test]
fn a_level_change_to_viewer_takes_effect_on_the_next_request() {
    run(async {
        let mut fixture = Fixture::new().await;
        let card = fixture
            .add_card(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;
        let tag = fixture.add_tag().await;
        fixture.add_friend("Editor").await;
        let mut friend = TestClient::logged_in(&fixture.friend).await;
        let url = fixture.url(&format!("cards/{card}"));
        let body = friend
            .json(Method::PATCH, &url, &json!({ "quantity": 3 }))
            .await
            .ok_json();
        assert_eq!(body, Value::Null);

        fixture.add_friend("Viewer").await;

        let deck = friend.get(&fixture.url("")).await.ok_json();
        assert_eq!(deck["role"], "Viewer");
        assert_all_denied(&mut friend, &fixture.deck, &edit_operations(&card, &tag)).await;
        let listing = fixture.owner.get(&fixture.url("cards")).await.ok_json();
        assert_eq!(listing["cards"][0]["quantity"], 3, "{listing}");
    });
}

#[test]
fn a_stranger_sees_a_shared_private_deck_as_missing() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add_friend("Viewer").await;
        let stranger = create_account(Role::Member).await;
        let mut stranger = TestClient::logged_in(&stranger).await;

        let missing = Uuid::new_v4().to_string();
        for path in ["", "cards"] {
            let refused = stranger.get(&fixture.url(path)).await;
            let gone = stranger.get(&deck_url(&missing, path)).await;
            assert_eq!(refused.status, gone.status, "{path}: {refused:?}");
            assert_eq!(refused.body, gone.body, "{path}: {refused:?}");
            assert_ne!(refused.status, StatusCode::OK, "{path}");
        }
    });
}

#[test]
fn a_removed_collaborator_loses_access_on_the_next_request() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add_friend("Editor").await;
        let mut friend = TestClient::logged_in(&fixture.friend).await;
        assert_eq!(friend.get(&fixture.url("")).await.status, StatusCode::OK);

        fixture.remove_friend().await;

        assert!(fixture.list().await.is_empty());
        let missing = Uuid::new_v4().to_string();
        for path in ["", "cards"] {
            let refused = friend.get(&fixture.url(path)).await;
            let gone = friend.get(&deck_url(&missing, path)).await;
            assert_eq!(refused.status, gone.status, "{path}: {refused:?}");
            assert_eq!(refused.body, gone.body, "{path}: {refused:?}");
        }
    });
}

#[test]
fn only_the_owner_manages_collaborators() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add_friend("Editor").await;
        let mut editor = TestClient::logged_in(&fixture.friend).await;
        let third = create_account(Role::Member).await;

        let operations = [
            Operation::new(
                Method::PUT,
                "collaborators",
                json!({ "username": third.username, "level": "Viewer" }),
            ),
            Operation::new(
                Method::DELETE,
                format!("collaborators/{}", fixture.friend.uuid.into_inner()),
                json!({}),
            ),
        ];
        assert_all_denied(&mut editor, &fixture.deck, &operations).await;

        let list = fixture.list().await;
        assert_eq!(list.len(), 1, "{list:?}");
        assert_eq!(list[0]["username"], fixture.friend.username.as_str());
    });
}

#[test]
fn visibility_and_share_link_behave_as_before() {
    run(async {
        let mut fixture = Fixture::with_visibility("Unlisted").await;
        fixture.add_friend("Viewer").await;
        let deck = fixture.owner.get(&fixture.url("")).await.ok_json();
        let token = deck["share_token"]
            .as_str()
            .expect("share token")
            .to_string();

        let shared = TestClient::new()
            .get(&api(&format!("shared/decks/{token}")))
            .await
            .ok_json();
        assert_eq!(shared["name"], "Together");

        let body = fixture
            .owner
            .json(
                Method::POST,
                &fixture.url(""),
                &json!({ "visibility": "Public" }),
            )
            .await
            .ok_json();
        assert_eq!(body, Value::Null);
        let stranger = create_account(Role::Member).await;
        let deck = TestClient::logged_in(&stranger)
            .await
            .get(&fixture.url(""))
            .await
            .ok_json();
        assert_eq!(deck["name"], "Together");
        assert_eq!(deck["role"], Value::Null);
        let public = TestClient::new()
            .get(&api(&format!("explore/decks/{}", fixture.deck)))
            .await
            .ok_json();
        assert_eq!(public["name"], "Together");
    });
}

#[test]
fn a_deleted_collaborator_leaves_the_owners_list() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add_friend("Editor").await;
        let admin = create_account(Role::Admin).await;
        let mut admin = TestClient::logged_in(&admin).await;

        let friend = &fixture.friend;
        let body = delete(&mut admin, friend, &friend.username, "Tombstone").await;
        assert_eq!(body, Value::Null);

        assert!(fixture.list().await.is_empty());
    });
}

#[test]
fn a_public_deck_reaches_the_tombstone_without_its_collaborators() {
    run(async {
        let mut fixture = Fixture::with_visibility("Public").await;
        let card = fixture
            .add_card(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;
        let tag = fixture.add_tag().await;
        fixture.add_friend("Editor").await;
        let mut friend = TestClient::logged_in(&fixture.friend).await;
        assert_eq!(shared_with(&mut friend).await.len(), 1);
        let admin = create_account(Role::Admin).await;
        let mut admin = TestClient::logged_in(&admin).await;

        let body = delete(
            &mut admin,
            &fixture.account,
            &fixture.account.username,
            "Tombstone",
        )
        .await;
        assert_eq!(body, Value::Null);

        let public = TestClient::new()
            .get(&api(&format!("explore/decks/{}", fixture.deck)))
            .await
            .ok_json();
        assert_eq!(public["name"], "Together");
        assert_eq!(public["owner"], Value::Null);
        let deck = friend.get(&fixture.url("")).await.ok_json();
        assert_eq!(deck["name"], "Together");
        assert_eq!(deck["role"], Value::Null, "{deck}");
        assert_all_denied(&mut friend, &fixture.deck, &edit_operations(&card, &tag)).await;
        assert!(shared_with(&mut friend).await.is_empty());
    });
}

#[test]
fn a_private_deck_leaves_with_its_owner_and_its_collaborators_lose_it() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add_friend("Editor").await;
        let mut friend = TestClient::logged_in(&fixture.friend).await;
        assert_eq!(shared_with(&mut friend).await.len(), 1);
        let admin = create_account(Role::Admin).await;
        let mut admin = TestClient::logged_in(&admin).await;

        delete(
            &mut admin,
            &fixture.account,
            &fixture.account.username,
            "Tombstone",
        )
        .await;

        let missing = Uuid::new_v4().to_string();
        for path in ["", "cards"] {
            let refused = friend.get(&fixture.url(path)).await;
            let gone = friend.get(&deck_url(&missing, path)).await;
            assert_eq!(refused.status, gone.status, "{path}: {refused:?}");
            assert_eq!(refused.body, gone.body, "{path}: {refused:?}");
        }
    });
}

#[test]
fn with_the_owner_locked_a_viewer_still_views() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture
            .add_card(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;
        fixture.add_friend("Viewer").await;
        let mut viewer = TestClient::logged_in(&fixture.friend).await;
        let admin = create_account(Role::Admin).await;

        let body = lock(
            &mut TestClient::logged_in(&admin).await,
            &fixture.account,
            "Spam",
        )
        .await;
        assert_eq!(body, Value::Null);

        let deck = viewer.get(&fixture.url("")).await.ok_json();
        assert_eq!(deck["name"], "Together");
        assert_eq!(deck["role"], "Viewer");
        let listing = viewer.get(&fixture.url("cards")).await.ok_json();
        assert_eq!(listing["cards"][0]["quantity"], 2);
    });
}

#[test]
fn with_the_owner_locked_an_editor_still_edits() {
    run(async {
        let mut fixture = Fixture::new().await;
        let card = fixture
            .add_card(json!({ "printing": Uuid::new_v4(), "quantity": 2, "zone": "Main" }))
            .await;
        fixture.add_friend("Editor").await;
        let mut editor = TestClient::logged_in(&fixture.friend).await;
        let admin = create_account(Role::Admin).await;

        lock(
            &mut TestClient::logged_in(&admin).await,
            &fixture.account,
            "Spam",
        )
        .await;

        editor
            .json(
                Method::PATCH,
                &fixture.url(&format!("cards/{card}")),
                &json!({ "quantity": 4 }),
            )
            .await
            .ok_json();
        let listing = editor.get(&fixture.url("cards")).await.ok_json();
        assert_eq!(listing["cards"][0]["quantity"], 4, "{listing}");
    });
}

#[test]
fn a_locked_collaborator_is_refused_like_any_locked_session() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add_friend("Editor").await;
        let mut friend = TestClient::logged_in(&fixture.friend).await;
        assert_eq!(friend.get(&fixture.url("")).await.status, StatusCode::OK);
        let admin = create_account(Role::Admin).await;

        lock(
            &mut TestClient::logged_in(&admin).await,
            &fixture.friend,
            "Spam",
        )
        .await;

        let body = friend.get(&api("accounts/me")).await.ok_json();
        assert_eq!(body["result"], "Err", "{body}");
        assert_eq!(body["error"], json!({ "locked": true }));
        for path in ["", "cards", "collaborators"] {
            assert_eq!(
                friend.get(&fixture.url(path)).await.status,
                StatusCode::UNAUTHORIZED,
                "{path}"
            );
        }
        let refused = friend
            .json(
                Method::PUT,
                &fixture.url("colors"),
                &json!({ "colors": "W" }),
            )
            .await;
        assert_eq!(refused.status, StatusCode::UNAUTHORIZED, "{refused:?}");
        assert_eq!(fixture.list().await.len(), 1);
    });
}

/// The decks shared with the Account behind `client`, as "Shared with me" lists them
async fn shared_with(client: &mut TestClient) -> Vec<Value> {
    let body = client.get(&api("decks/shared-with-me")).await.ok_json();
    body["decks"].as_array().expect("a list of decks").clone()
}

/// The username of the Account behind `client`
async fn username_of(client: &mut TestClient) -> String {
    let me = client.get(&api("accounts/me")).await.ok_json();
    me["username"].as_str().expect("username").to_string()
}

/// Renames the Account behind `client` to a fresh username, returning it
async fn rename(client: &mut TestClient) -> String {
    let username = format!("r{}", &Uuid::new_v4().simple().to_string()[..12]);
    let body = client
        .json(
            Method::PUT,
            &api("accounts/me/username"),
            &json!({ "username": username }),
        )
        .await
        .ok_json();
    assert_eq!(body["username"], username.as_str(), "{body}");
    username
}

/// Leaving the deck, as a request against it
fn leave() -> Operation {
    Operation::new(Method::POST, "leave", json!({}))
}

#[test]
fn any_collaborator_reads_the_collaborator_list() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add_friend("Viewer").await;
        let third = create_account(Role::Member).await;
        fixture.add(&third.username, "Editor").await;

        for account in [&fixture.friend, &third] {
            let mut collaborator = TestClient::logged_in(account).await;
            let body = collaborator
                .get(&fixture.url("collaborators"))
                .await
                .ok_json();
            let list = body["collaborators"].as_array().expect("collaborators");
            assert_eq!(list.len(), 2, "{body}");
            assert_eq!(
                body["owner"]["username"],
                fixture.account.username.as_str(),
                "{body}"
            );
            assert_eq!(
                body["owner"]["account"],
                fixture.account.uuid.into_inner().to_string(),
                "{body}"
            );
            let level_of = |username: &str| {
                list.iter()
                    .find(|entry| entry["username"] == username)
                    .map(|entry| entry["level"].clone())
            };
            assert_eq!(
                level_of(&fixture.friend.username),
                Some(json!("Viewer")),
                "{body}"
            );
            assert_eq!(level_of(&third.username), Some(json!("Editor")), "{body}");
        }

        let stranger = create_account(Role::Member).await;
        let mut stranger = TestClient::logged_in(&stranger).await;
        let operations = [Operation::new(Method::GET, "collaborators", Value::Null)];
        assert_all_denied(&mut stranger, &fixture.deck, &operations).await;
    });
}

#[test]
fn a_shared_deck_shows_up_under_shared_with_me() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture
            .add_card(
                json!({ "printing": Uuid::new_v4(), "quantity": 3, "zone": "Main", "proxy": true }),
            )
            .await;
        fixture.add_friend("Viewer").await;
        let owner = username_of(&mut fixture.owner).await;
        let mut friend = TestClient::logged_in(&fixture.friend).await;

        let shared = shared_with(&mut friend).await;
        assert_eq!(shared.len(), 1, "{shared:?}");
        let entry = &shared[0];
        assert_eq!(entry["owner_username"], owner.as_str(), "{entry}");
        assert_eq!(entry["level"], "Viewer", "{entry}");
        assert_eq!(entry["overview"]["deck"]["uuid"], fixture.deck.as_str());
        assert_eq!(entry["overview"]["deck"]["name"], "Together");
        assert_eq!(entry["overview"]["deck"]["role"], "Viewer");
        assert_eq!(entry["overview"]["deck"]["share_token"], Value::Null);
        assert_eq!(entry["overview"]["deck"]["folder"], Value::Null);
        assert_eq!(entry["overview"]["cards"], 3);

        let own = friend.get(&api("decks")).await.ok_json();
        assert_eq!(own, json!([]), "shared decks are not the friend's own");
        assert!(shared_with(&mut fixture.owner).await.is_empty());
        let owners = fixture.owner.get(&api("decks")).await.ok_json();
        assert_eq!(owners[0]["deck"]["uuid"], fixture.deck.as_str());
    });
}

#[test]
fn a_level_change_shows_up_under_shared_with_me_on_the_next_request() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add_friend("Viewer").await;
        let mut friend = TestClient::logged_in(&fixture.friend).await;
        assert_eq!(shared_with(&mut friend).await[0]["level"], "Viewer");

        fixture.add_friend("Editor").await;

        let shared = shared_with(&mut friend).await;
        assert_eq!(shared.len(), 1, "{shared:?}");
        assert_eq!(shared[0]["level"], "Editor");
    });
}

#[test]
fn leaving_drops_the_deck_and_its_access() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add_friend("Editor").await;
        let mut friend = TestClient::logged_in(&fixture.friend).await;
        assert_eq!(shared_with(&mut friend).await.len(), 1);

        let body = leave().send(&mut friend, &fixture.deck).await.ok_json();
        assert_eq!(body, Value::Null);

        assert!(shared_with(&mut friend).await.is_empty());
        assert!(fixture.list().await.is_empty());
        let missing = Uuid::new_v4().to_string();
        for path in ["", "cards", "collaborators"] {
            let refused = friend.get(&fixture.url(path)).await;
            let gone = friend.get(&deck_url(&missing, path)).await;
            assert_eq!(refused.status, gone.status, "{path}: {refused:?}");
            assert_eq!(refused.body, gone.body, "{path}: {refused:?}");
        }
        assert!(shared_with(&mut friend).await.is_empty());
    });
}

#[test]
fn the_owner_cannot_leave_their_own_deck() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add_friend("Viewer").await;

        let deck = fixture.deck.clone();
        assert_all_denied(&mut fixture.owner, &deck, &[leave()]).await;

        let body = fixture.owner.get(&fixture.url("")).await.ok_json();
        assert_eq!(body["role"], "Owner");
        assert_eq!(fixture.list().await.len(), 1);
    });
}

#[test]
fn a_stranger_cannot_leave_a_deck() {
    run(async {
        let mut fixture = Fixture::with_visibility("Public").await;
        fixture.add_friend("Viewer").await;
        let stranger = create_account(Role::Member).await;
        let mut stranger = TestClient::logged_in(&stranger).await;

        assert_all_denied(&mut stranger, &fixture.deck, &[leave()]).await;

        assert_eq!(fixture.list().await.len(), 1);
    });
}

#[test]
fn access_survives_a_rename_of_the_owner_and_the_collaborator() {
    run(async {
        let mut fixture = Fixture::new().await;
        fixture.add_friend("Viewer").await;
        let mut friend = TestClient::logged_in(&fixture.friend).await;

        let owner = rename(&mut fixture.owner).await;
        let collaborator = rename(&mut friend).await;

        let deck = friend.get(&fixture.url("")).await.ok_json();
        assert_eq!(deck["role"], "Viewer");
        let shared = shared_with(&mut friend).await;
        assert_eq!(shared.len(), 1, "{shared:?}");
        assert_eq!(shared[0]["owner_username"], owner.as_str());
        let list = fixture.list().await;
        assert_eq!(list.len(), 1, "{list:?}");
        assert_eq!(list[0]["username"], collaborator.as_str());
    });
}
