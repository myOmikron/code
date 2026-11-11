//! What a deck is worth: its List value, its Physical value and what replacing
//! its Proxies would cost, and who gets to see which

use galvyn::core::re_exports::axum::http::Method;
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
                    "name": "Priced",
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

    /// The url of a route below the deck
    fn url(&self, path: &str) -> Url {
        api(&format!("decks/{}/{path}", self.deck))
    }

    /// Sends a request below the deck as the owner
    async fn send(&mut self, method: Method, path: &str, body: Value) -> TestResponse {
        let url = self.url(path);
        self.owner.json(method, &url, &body).await
    }

    /// Adds a Deck entry in `zone` as the owner, returning its uuid
    async fn add(&mut self, printing: Uuid, quantity: i32, zone: &str) -> String {
        let body = self
            .send(
                Method::POST,
                "cards",
                json!({ "printing": printing, "quantity": quantity, "zone": zone }),
            )
            .await
            .ok_json();
        body["uuid"].as_str().expect("entry uuid").to_string()
    }

    /// A new collection of the owner holding `quantity` copies of `printing`,
    /// answering the stack's uuid
    async fn stack(&mut self, printing: Uuid, quantity: i32) -> String {
        let body = self
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
        let collection = body["uuid"].as_str().expect("collection uuid").to_string();
        let entries = api(&format!("collections/{collection}/entries"));
        self.owner
            .json(
                Method::POST,
                &entries,
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
        let body = self.owner.get(&entries).await.ok_json();
        body["entries"][0]["uuid"]
            .as_str()
            .expect("stack uuid")
            .to_string()
    }

    /// Takes copies out of a stack into the Physical deck
    async fn take(&mut self, stack: &str, quantity: i32) {
        self.send(
            Method::POST,
            "sourcing/take",
            json!({ "entry": stack, "quantity": quantity }),
        )
        .await
        .ok_json();
    }

    /// Puts Proxies into the Physical deck for a Deck entry
    async fn proxy(&mut self, entry: &str, quantity: i32) {
        self.send(
            Method::POST,
            "sourcing/proxy",
            json!({ "slot": entry, "quantity": quantity }),
        )
        .await
        .ok_json();
    }

    /// What the deck is worth, as the owner reads it
    async fn values(&mut self) -> Value {
        let url = self.url("values");
        self.owner.get(&url).await.ok_json()
    }

    /// Names a fresh Account a Collaborator at `level`, answering its client
    async fn collaborator(&mut self, level: &str) -> TestClient {
        let account = create_account(Role::Member).await;
        self.send(
            Method::PUT,
            "collaborators",
            json!({ "username": account.username, "level": level }),
        )
        .await
        .ok_json();
        TestClient::logged_in(&account).await
    }
}

/// A printing whose non-foil copy costs `eur`
async fn priced(name: &str, eur: &str) -> Uuid {
    file(&unique(name), Print::priced(eur)).await
}

/// A deck asking for 2 Sol Rings at 3.50 and 1 Mana Crypt at 12.00, with one
/// Sol Ring real, one Sol Ring and the Mana Crypt Proxies, and a Black Lotus
/// at 100.00 on the maybe board
async fn built() -> Fixture {
    let mut fixture = Fixture::new().await;
    let sol_ring = priced("Sol Ring", "3.50").await;
    let mana_crypt = priced("Mana Crypt", "12.00").await;
    let black_lotus = priced("Black Lotus", "100.00").await;
    let rings = fixture.add(sol_ring, 2, "Main").await;
    let crypt = fixture.add(mana_crypt, 1, "Main").await;
    fixture.add(black_lotus, 1, "Maybe").await;
    let stack = fixture.stack(sol_ring, 1).await;
    fixture.take(&stack, 1).await;
    fixture.proxy(&rings, 1).await;
    fixture.proxy(&crypt, 1).await;
    fixture
}

#[test]
fn list_value_physical_value_and_replacement_cost_of_a_deck_with_proxies() {
    run(async {
        let mut fixture = built().await;

        let values = fixture.values().await;

        assert_eq!(values["list_value_cents"], 1900, "{values}");
        assert_eq!(values["physical"]["physical_value_cents"], 350, "{values}");
        assert_eq!(
            values["physical"]["proxy_replacement_cents"], 1550,
            "{values}"
        );
        assert_eq!(values["physical"]["proxies"], 2, "{values}");
    });
}

#[test]
fn a_deck_without_a_physical_deck_has_a_list_value_and_nothing_physical() {
    run(async {
        let mut fixture = Fixture::new().await;
        let sol_ring = priced("Sol Ring", "3.50").await;
        fixture.add(sol_ring, 2, "Main").await;

        let values = fixture.values().await;

        assert_eq!(values["list_value_cents"], 700, "{values}");
        assert_eq!(values["physical"], Value::Null, "{values}");
    });
}

#[test]
fn an_editor_reads_the_values_and_a_viewer_sees_nothing() {
    run(async {
        let mut fixture = built().await;
        let mut editor = fixture.collaborator("Editor").await;
        let mut viewer = fixture.collaborator("Viewer").await;
        let missing = Uuid::new_v4();

        let read = editor.get(&fixture.url("values")).await.ok_json();
        let refused = viewer.get(&fixture.url("values")).await;
        let gone = viewer.get(&api(&format!("decks/{missing}/values"))).await;

        assert_eq!(read, fixture.values().await);
        assert_eq!(refused.status, gone.status, "{refused:?}");
        assert_eq!(refused.body, gone.body, "{refused:?}");
    });
}

#[test]
fn the_deck_overview_counts_proxies_for_the_owner_and_editors_only() {
    run(async {
        let mut fixture = built().await;
        let mut editor = fixture.collaborator("Editor").await;
        let mut viewer = fixture.collaborator("Viewer").await;

        let owned = fixture.owner.get(&api("decks")).await.ok_json();
        let edited = shared_with(&mut editor).await;
        let viewed = shared_with(&mut viewer).await;

        assert_eq!(owned[0]["proxies"], 2, "{owned}");
        assert_eq!(edited[0]["overview"]["proxies"], 2, "{edited:?}");
        assert_eq!(viewed[0]["overview"]["proxies"], Value::Null, "{viewed:?}");
    });
}

#[test]
fn the_deck_overview_prices_proxied_lines_like_any_other() {
    run(async {
        let mut fixture = Fixture::new().await;
        let mana_crypt = priced("Mana Crypt", "12.00").await;
        fixture
            .send(
                Method::POST,
                "cards",
                json!({ "printing": mana_crypt, "quantity": 1, "zone": "Main", "proxy": true }),
            )
            .await
            .ok_json();

        let owned = fixture.owner.get(&api("decks")).await.ok_json();

        assert_eq!(owned[0]["price_eur_cents"], 1200, "{owned}");
    });
}

/// The decks shared with the Account behind `client`, as "Shared with me" lists them
async fn shared_with(client: &mut TestClient) -> Vec<Value> {
    let body = client.get(&api("decks/shared-with-me")).await.ok_json();
    body["decks"].as_array().expect("a list of decks").clone()
}
