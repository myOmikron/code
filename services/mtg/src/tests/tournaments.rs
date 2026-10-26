//! Tournaments: an Account creates one and owns it, its Visibility decides who
//! sees it, and only the Owner edits and deletes it

use galvyn::core::re_exports::axum::http::Method;
use serde_json::Value;
use serde_json::json;
use url::Url;

use crate::models::account::Role;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;

/// Every setting of a Tournament, as a create or update request takes them
pub(super) fn settings(visibility: &str) -> Value {
    json!({
        "name": "Friday Night Commander",
        "description": "Bring a deck of bracket 3",
        "location": "The back room of the store",
        "starts_at": "2026-11-07T18:30:00Z",
        "table_size": 4,
        "ruleset": "TopDeck",
        "format": "commander",
        "visibility": visibility,
        "participant_limit": null,
        "self_sign_up": false,
        "round_minutes": null,
    })
}

/// The url of a Tournament
pub(super) fn tournament_url(tournament: &str) -> Url {
    api(&format!("tournaments/{tournament}"))
}

/// An Owner with one Tournament, and a second Account that has nothing to do with it
pub(super) struct Fixture {
    /// The Account that created the Tournament
    pub owner_account: TestAccount,
    /// Logged in as the Owner
    pub owner: TestClient,
    /// The Tournament's uuid
    pub tournament: String,
    /// Logged in as an Account unrelated to the Tournament
    pub stranger: TestClient,
}

impl Fixture {
    /// A fresh Owner with a Tournament at `visibility`, and a fresh stranger
    pub async fn new(visibility: &str) -> Self {
        let owner_account = create_account(Role::Member).await;
        let mut owner = TestClient::logged_in(&owner_account).await;
        let created = create(&mut owner, &settings(visibility)).await;
        let tournament = created["uuid"]
            .as_str()
            .expect("tournament uuid")
            .to_string();
        let stranger = TestClient::logged_in(&create_account(Role::Member).await).await;
        Self {
            owner_account,
            owner,
            tournament,
            stranger,
        }
    }

    /// The Tournament's url
    pub fn url(&self) -> Url {
        tournament_url(&self.tournament)
    }

    /// The Tournament as its Owner reads it
    pub async fn as_owner(&mut self) -> Value {
        let url = self.url();
        self.owner.get(&url).await.ok_json()
    }
}

/// Creates a Tournament, returning the response body
pub(super) async fn create(client: &mut TestClient, settings: &Value) -> Value {
    client
        .json(Method::POST, &api("tournaments"), settings)
        .await
        .ok_json()
}

/// Whether `client` may read the Tournament at `url`
async fn sees(client: &mut TestClient, url: &Url) -> bool {
    let response = client.get(url).await;
    response.status.is_success()
}

/// The uuids in a list of Tournaments
pub(super) fn uuids(list: &Value) -> Vec<String> {
    list.as_array()
        .expect("a list of tournaments")
        .iter()
        .map(|tournament| tournament["uuid"].as_str().expect("uuid").to_string())
        .collect()
}

#[test]
fn an_account_creates_a_tournament_with_every_setting_and_owns_it() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let body = fixture.as_owner().await;

        assert_eq!(body["name"], "Friday Night Commander", "{body}");
        assert_eq!(body["description"], "Bring a deck of bracket 3", "{body}");
        assert_eq!(body["location"], "The back room of the store", "{body}");
        assert_eq!(body["starts_at"], "2026-11-07T18:30:00Z", "{body}");
        assert_eq!(body["table_size"], 4, "{body}");
        assert_eq!(body["ruleset"], "TopDeck", "{body}");
        assert_eq!(body["format"], "commander", "{body}");
        assert_eq!(body["visibility"], "Public", "{body}");
        assert_eq!(body["state"], "Registration", "{body}");
        assert_eq!(
            body["owner"],
            fixture.owner_account.username.as_str(),
            "{body}"
        );
        assert_eq!(body["organizer_role"], "Owner", "{body}");
    });
}

#[test]
fn format_description_and_location_are_optional() {
    run(async {
        let account = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&account).await;
        let mut request = settings("Private");
        request["format"] = Value::Null;
        request["description"] = Value::Null;
        request["location"] = Value::Null;

        let body = create(&mut client, &request).await;

        assert_eq!(body["format"], Value::Null, "{body}");
        assert_eq!(body["description"], Value::Null, "{body}");
        assert_eq!(body["location"], Value::Null, "{body}");
    });
}

#[test]
fn only_rulesets_fitting_the_table_size_are_taken() {
    run(async {
        let account = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&account).await;

        for (table_size, ruleset, fits) in [
            (2, "Mtr", true),
            (2, "TopDeck", false),
            (2, "MultiplayerAddendum", false),
            (3, "Mtr", false),
            (3, "TopDeck", true),
            (5, "MultiplayerAddendum", true),
            (4, "Mtr", false),
        ] {
            let mut request = settings("Private");
            request["table_size"] = json!(table_size);
            request["ruleset"] = json!(ruleset);
            if table_size == 2 {
                request["best_of"] = json!("Three");
            }
            let body = client
                .json(Method::POST, &api("tournaments"), &request)
                .await
                .ok_json();
            if fits {
                assert_eq!(body["ruleset"], ruleset, "{body}");
            } else {
                assert_eq!(body["result"], "Err", "{table_size} {ruleset}: {body}");
                assert_eq!(body["error"]["ruleset_mismatch"], true, "{body}");
            }
        }
    });
}

#[test]
fn a_table_seats_two_to_five() {
    run(async {
        let account = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&account).await;

        for table_size in [0, 1, 6] {
            let mut request = settings("Private");
            request["table_size"] = json!(table_size);
            let body = client
                .json(Method::POST, &api("tournaments"), &request)
                .await
                .ok_json();
            assert_eq!(body["result"], "Err", "{table_size}: {body}");
            assert_eq!(body["error"]["table_size_out_of_range"], true, "{body}");
        }
    });
}

#[test]
fn a_format_must_be_one_on_offer() {
    run(async {
        let account = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&account).await;
        let mut request = settings("Private");
        request["format"] = json!("calvinball");

        let body = client
            .json(Method::POST, &api("tournaments"), &request)
            .await
            .ok_json();

        assert_eq!(body["result"], "Err", "{body}");
        assert_eq!(body["error"]["unknown_format"], true, "{body}");
    });
}

#[test]
fn creating_needs_an_account() {
    run(async {
        let mut anonymous = TestClient::new();

        let response = anonymous
            .json(Method::POST, &api("tournaments"), &settings("Public"))
            .await;

        assert_eq!(response.status.as_u16(), 401, "{response:?}");
    });
}

#[test]
fn a_public_tournament_is_seen_by_everyone_and_in_the_overview() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let url = fixture.url();
        let mut anonymous = TestClient::new();

        assert!(sees(&mut anonymous, &url).await);
        assert!(sees(&mut fixture.stranger, &url).await);
        let as_stranger = fixture.stranger.get(&url).await.ok_json();
        assert_eq!(as_stranger["organizer_role"], Value::Null, "{as_stranger}");
        assert_eq!(as_stranger["share_token"], Value::Null, "{as_stranger}");

        let overview = anonymous.get(&api("tournaments")).await.ok_json();
        assert!(
            uuids(&overview["tournaments"]).contains(&fixture.tournament),
            "{overview}"
        );
    });
}

#[test]
fn an_unlisted_tournament_is_seen_by_its_share_link_only() {
    run(async {
        let mut fixture = Fixture::new("Unlisted").await;
        let url = fixture.url();
        let owned = fixture.as_owner().await;
        let token = owned["share_token"]
            .as_str()
            .expect("an unlisted tournament has a share link")
            .to_string();
        let shared = api(&format!("shared/tournaments/{token}"));
        let mut anonymous = TestClient::new();

        assert!(!sees(&mut anonymous, &url).await);
        assert!(!sees(&mut fixture.stranger, &url).await);
        let by_link = anonymous.get(&shared).await.ok_json();
        assert_eq!(by_link["uuid"], fixture.tournament.as_str(), "{by_link}");
        assert_eq!(by_link["share_token"], Value::Null, "{by_link}");
        assert!(sees(&mut fixture.stranger, &shared).await);

        let overview = anonymous.get(&api("tournaments")).await.ok_json();
        assert!(
            !uuids(&overview["tournaments"]).contains(&fixture.tournament),
            "{overview}"
        );
    });
}

#[test]
fn a_private_tournament_is_seen_by_its_owner_only() {
    run(async {
        let mut fixture = Fixture::new("Private").await;
        let url = fixture.url();
        let mut anonymous = TestClient::new();

        assert!(sees(&mut fixture.owner, &url).await);
        assert!(!sees(&mut anonymous, &url).await);
        assert!(!sees(&mut fixture.stranger, &url).await);
        assert_eq!(fixture.as_owner().await["share_token"], Value::Null);

        let overview = anonymous.get(&api("tournaments")).await.ok_json();
        assert!(
            !uuids(&overview["tournaments"]).contains(&fixture.tournament),
            "{overview}"
        );
    });
}

#[test]
fn leaving_unlisted_withdraws_the_share_link() {
    run(async {
        let mut fixture = Fixture::new("Unlisted").await;
        let token = fixture.as_owner().await["share_token"]
            .as_str()
            .expect("a share link")
            .to_string();
        let shared = api(&format!("shared/tournaments/{token}"));
        let url = fixture.url();

        let body = fixture
            .owner
            .json(Method::PUT, &url, &settings("Private"))
            .await
            .ok_json();
        assert_eq!(body["visibility"], "Private", "{body}");

        let mut anonymous = TestClient::new();
        assert!(!sees(&mut anonymous, &shared).await);
    });
}

#[test]
fn the_owner_changes_the_settings() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let url = fixture.url();
        let mut request = settings("Public");
        request["name"] = json!("Saturday Duels");
        request["table_size"] = json!(2);
        request["ruleset"] = json!("Mtr");
        request["best_of"] = json!("Three");
        request["format"] = json!("modern");
        request["location"] = Value::Null;

        fixture
            .owner
            .json(Method::PUT, &url, &request)
            .await
            .ok_json();

        let body = fixture.as_owner().await;
        assert_eq!(body["name"], "Saturday Duels", "{body}");
        assert_eq!(body["table_size"], 2, "{body}");
        assert_eq!(body["ruleset"], "Mtr", "{body}");
        assert_eq!(body["format"], "modern", "{body}");
        assert_eq!(body["location"], Value::Null, "{body}");
    });
}

#[test]
fn changed_settings_are_validated_like_new_ones() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let url = fixture.url();
        let mut request = settings("Public");
        request["table_size"] = json!(2);

        let body = fixture
            .owner
            .json(Method::PUT, &url, &request)
            .await
            .ok_json();

        assert_eq!(body["error"]["ruleset_mismatch"], true, "{body}");
        assert_eq!(fixture.as_owner().await["table_size"], 4);
    });
}

#[test]
fn nobody_but_the_owner_changes_the_settings() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let url = fixture.url();
        let mut request = settings("Public");
        request["name"] = json!("Taken over");

        let response = fixture.stranger.json(Method::PUT, &url, &request).await;

        assert_eq!(response.status.as_u16(), 400, "{response:?}");
        assert_eq!(fixture.as_owner().await["name"], "Friday Night Commander");
    });
}

#[test]
fn the_owner_deletes_the_tournament() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let url = fixture.url();

        let body = fixture
            .owner
            .json(Method::DELETE, &url, &json!({}))
            .await
            .ok_json();
        assert_eq!(body, Value::Null);

        assert!(!sees(&mut fixture.owner, &url).await);
        let mine = fixture.owner.get(&api("tournaments/mine")).await.ok_json();
        assert!(
            !uuids(&mine["organizing"]).contains(&fixture.tournament),
            "{mine}"
        );
    });
}

#[test]
fn nobody_but_the_owner_deletes_the_tournament() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let url = fixture.url();

        let response = fixture
            .stranger
            .json(Method::DELETE, &url, &json!({}))
            .await;
        assert_eq!(response.status.as_u16(), 400, "{response:?}");

        let mut anonymous = TestClient::new();
        let response = anonymous.json(Method::DELETE, &url, &json!({})).await;
        assert_eq!(response.status.as_u16(), 401, "{response:?}");

        assert!(sees(&mut fixture.owner, &url).await);
    });
}

#[test]
fn my_tournaments_lists_the_ones_the_account_organizes() {
    run(async {
        let mut fixture = Fixture::new("Private").await;
        let second = create(&mut fixture.owner, &settings("Public")).await;
        let second = second["uuid"].as_str().expect("uuid").to_string();

        let mine = fixture.owner.get(&api("tournaments/mine")).await.ok_json();
        let listed = uuids(&mine["organizing"]);
        assert_eq!(listed.len(), 2, "{mine}");
        assert!(listed.contains(&fixture.tournament), "{mine}");
        assert!(listed.contains(&second), "{mine}");

        let theirs = fixture
            .stranger
            .get(&api("tournaments/mine"))
            .await
            .ok_json();
        assert!(uuids(&theirs["organizing"]).is_empty(), "{theirs}");
    });
}
