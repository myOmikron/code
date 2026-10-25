//! Finding Tournaments: the public overview and its filters, "my Tournaments"
//! split into organizing and participating, and the Tournaments on a profile
//!
//! Every test gives its Tournaments a location of its own and filters by it,
//! so Tournaments of other tests in the shared database stay out of its lists.

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::re_exports::time::format_description::well_known::Rfc3339;
use serde_json::Value;
use serde_json::json;
use url::Url;
use uuid::Uuid;

use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::tournaments::create;
use crate::tests::tournaments::settings;
use crate::tests::tournaments::uuids;

/// A location no other test uses, to filter the overview by
fn unique_location() -> String {
    format!("Hall {}", Uuid::new_v4().simple())
}

/// A start `days` from now, in the past for negative `days`
fn days_from_now(days: i64) -> String {
    (OffsetDateTime::now_utc() + Duration::days(days))
        .format(&Rfc3339)
        .expect("a formattable timestamp")
}

/// A Tournament to create, as the test needs it
struct Planned<'a> {
    /// Who may see it
    visibility: &'a str,
    /// Where it takes place
    location: &'a str,
    /// Its format slug, `None` for any
    format: Option<&'a str>,
    /// Its start, see [`days_from_now`]
    starts_at: String,
}

impl Planned<'_> {
    /// Creates the Tournament as `client`, returning its uuid
    async fn create(&self, client: &mut TestClient) -> String {
        let mut request = settings(self.visibility);
        request["location"] = json!(self.location);
        request["format"] = json!(self.format);
        request["starts_at"] = json!(self.starts_at);
        let body = create(client, &request).await;
        body["uuid"].as_str().expect("tournament uuid").to_string()
    }
}

/// Adds the Account named `username` to `tournament` as its Organizer `client` would
async fn add_participant(client: &mut TestClient, tournament: &str, username: &str) {
    client
        .json(
            Method::POST,
            &api(&format!("tournaments/{tournament}/participants/accounts")),
            &json!({ "username": username }),
        )
        .await
        .ok_json();
}

/// The public overview with the filters in `query`
async fn overview(client: &mut TestClient, query: &[(&str, &str)]) -> Value {
    let mut url: Url = api("tournaments");
    url.query_pairs_mut().extend_pairs(query);
    client.get(&url).await.ok_json()
}

#[test]
fn the_overview_filters_by_location_text_with_case_ignored() {
    run(async {
        let account = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&account).await;
        let location = unique_location();
        let in_hall = Planned {
            visibility: "Public",
            location: &format!("Upstairs, {location}, room 2"),
            format: Some("commander"),
            starts_at: days_from_now(7),
        }
        .create(&mut client)
        .await;
        let elsewhere = Planned {
            visibility: "Public",
            location: "Somewhere else entirely",
            format: Some("commander"),
            starts_at: days_from_now(7),
        }
        .create(&mut client)
        .await;

        let mut anonymous = TestClient::new();
        let body = overview(&mut anonymous, &[("location", &location.to_uppercase())]).await;

        let listed = uuids(&body["tournaments"]);
        assert_eq!(listed, vec![in_hall], "{body}");
        assert!(!listed.contains(&elsewhere), "{body}");
    });
}

#[test]
fn the_overview_filters_by_format() {
    run(async {
        let account = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&account).await;
        let location = unique_location();
        let modern = Planned {
            visibility: "Public",
            location: &location,
            format: Some("modern"),
            starts_at: days_from_now(3),
        }
        .create(&mut client)
        .await;
        let commander = Planned {
            visibility: "Public",
            location: &location,
            format: Some("commander"),
            starts_at: days_from_now(3),
        }
        .create(&mut client)
        .await;
        let any_format = Planned {
            visibility: "Public",
            location: &location,
            format: None,
            starts_at: days_from_now(3),
        }
        .create(&mut client)
        .await;

        let mut anonymous = TestClient::new();
        let body = overview(
            &mut anonymous,
            &[("location", &location), ("format", "modern")],
        )
        .await;
        assert_eq!(uuids(&body["tournaments"]), vec![modern.clone()], "{body}");

        let body = overview(&mut anonymous, &[("location", &location)]).await;
        let listed = uuids(&body["tournaments"]);
        assert_eq!(listed.len(), 3, "{body}");
        for tournament in [&modern, &commander, &any_format] {
            assert!(listed.contains(tournament), "{body}");
        }
    });
}

#[test]
fn the_overview_shows_upcoming_soonest_first_and_past_latest_first() {
    run(async {
        let account = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&account).await;
        let location = unique_location();
        let at = |days| Planned {
            visibility: "Public",
            location: &location,
            format: None,
            starts_at: days_from_now(days),
        };
        let next_month = at(30).create(&mut client).await;
        let next_week = at(7).create(&mut client).await;
        let last_month = at(-30).create(&mut client).await;
        let last_week = at(-7).create(&mut client).await;

        let mut anonymous = TestClient::new();
        let upcoming = overview(
            &mut anonymous,
            &[("location", &location), ("timeframe", "Upcoming")],
        )
        .await;
        assert_eq!(
            uuids(&upcoming["tournaments"]),
            vec![next_week.clone(), next_month.clone()],
            "{upcoming}"
        );

        let past = overview(
            &mut anonymous,
            &[("location", &location), ("timeframe", "Past")],
        )
        .await;
        assert_eq!(
            uuids(&past["tournaments"]),
            vec![last_week.clone(), last_month.clone()],
            "{past}"
        );

        let both = overview(&mut anonymous, &[("location", &location)]).await;
        assert_eq!(
            uuids(&both["tournaments"]),
            vec![next_month, next_week, last_week, last_month],
            "{both}"
        );
    });
}

#[test]
fn private_and_unlisted_tournaments_stay_out_of_the_overview_whatever_the_filters() {
    run(async {
        let account = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&account).await;
        let location = unique_location();
        for visibility in ["Private", "Unlisted"] {
            Planned {
                visibility,
                location: &location,
                format: Some("commander"),
                starts_at: days_from_now(5),
            }
            .create(&mut client)
            .await;
        }

        for query in [
            vec![("location", location.as_str())],
            vec![
                ("location", location.as_str()),
                ("format", "commander"),
                ("timeframe", "Upcoming"),
            ],
        ] {
            let as_owner = overview(&mut client, &query).await;
            assert!(uuids(&as_owner["tournaments"]).is_empty(), "{as_owner}");
        }
    });
}

#[test]
fn my_tournaments_separates_organizing_from_participating() {
    run(async {
        let account = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&account).await;
        let location = unique_location();
        let mut organized = Vec::new();
        for visibility in ["Public", "Unlisted", "Private"] {
            let tournament = Planned {
                visibility,
                location: &location,
                format: None,
                starts_at: days_from_now(2),
            }
            .create(&mut client)
            .await;
            organized.push(tournament);
        }

        let mine = client.get(&api("tournaments/mine")).await.ok_json();
        let organizing = uuids(&mine["organizing"]);
        assert_eq!(organizing.len(), 3, "{mine}");
        for tournament in &organized {
            assert!(organizing.contains(tournament), "{mine}");
        }
        assert!(uuids(&mine["participating"]).is_empty(), "{mine}");

        let mut stranger = TestClient::logged_in(&create_account(Role::Member).await).await;
        let theirs = stranger.get(&api("tournaments/mine")).await.ok_json();
        assert!(uuids(&theirs["organizing"]).is_empty(), "{theirs}");
        assert!(uuids(&theirs["participating"]).is_empty(), "{theirs}");
    });
}

#[test]
fn a_profile_lists_the_public_tournaments_its_account_owns() {
    run(async {
        let account = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&account).await;
        let location = unique_location();
        let earlier = Planned {
            visibility: "Public",
            location: &location,
            format: None,
            starts_at: days_from_now(-3),
        }
        .create(&mut client)
        .await;
        let later = Planned {
            visibility: "Public",
            location: &location,
            format: None,
            starts_at: days_from_now(3),
        }
        .create(&mut client)
        .await;
        for visibility in ["Private", "Unlisted"] {
            Planned {
                visibility,
                location: &location,
                format: None,
                starts_at: days_from_now(1),
            }
            .create(&mut client)
            .await;
        }
        let profile = api(&format!("explore/profiles/{}", account.username));

        let mut anonymous = TestClient::new();
        let body = anonymous.get(&profile).await.ok_json();
        assert_eq!(
            uuids(&body["tournaments"]),
            vec![later.clone(), earlier.clone()],
            "{body}"
        );
        assert_eq!(
            body["tournaments"][0]["owner"],
            account.username.as_str(),
            "{body}"
        );

        let as_owner = client.get(&profile).await.ok_json();
        assert_eq!(
            uuids(&as_owner["tournaments"]),
            vec![later, earlier],
            "{as_owner}"
        );
    });
}

#[test]
fn a_profile_without_tournaments_lists_none() {
    run(async {
        let account = create_account(Role::Member).await;
        let profile = api(&format!("explore/profiles/{}", account.username));

        let mut anonymous = TestClient::new();
        let body = anonymous.get(&profile).await.ok_json();

        assert_eq!(body["tournaments"], json!([]), "{body}");
    });
}

#[test]
fn my_tournaments_lists_the_ones_the_account_plays_in_under_participating() {
    run(async {
        let owner = create_account(Role::Member).await;
        let mut organizer = TestClient::logged_in(&owner).await;
        let player = create_account(Role::Member).await;
        let mut playing = TestClient::logged_in(&player).await;
        let location = unique_location();
        let mut entered = Vec::new();
        for (visibility, days) in [("Private", 4), ("Public", 9)] {
            let tournament = Planned {
                visibility,
                location: &location,
                format: None,
                starts_at: days_from_now(days),
            }
            .create(&mut organizer)
            .await;
            add_participant(&mut organizer, &tournament, &player.username).await;
            entered.push(tournament);
        }

        let mine = playing.get(&api("tournaments/mine")).await.ok_json();
        assert_eq!(
            uuids(&mine["participating"]),
            vec![entered[1].clone(), entered[0].clone()],
            "{mine}"
        );
        assert!(uuids(&mine["organizing"]).is_empty(), "{mine}");

        let theirs = organizer.get(&api("tournaments/mine")).await.ok_json();
        assert!(uuids(&theirs["participating"]).is_empty(), "{theirs}");
        assert_eq!(uuids(&theirs["organizing"]).len(), 2, "{theirs}");
    });
}

#[test]
fn a_profile_lists_the_public_tournaments_its_account_plays_in_once() {
    run(async {
        let owner = create_account(Role::Member).await;
        let mut organizer = TestClient::logged_in(&owner).await;
        let player = create_account(Role::Member).await;
        let location = unique_location();
        let mut public = None;
        for visibility in ["Public", "Unlisted", "Private"] {
            let tournament = Planned {
                visibility,
                location: &location,
                format: None,
                starts_at: days_from_now(6),
            }
            .create(&mut organizer)
            .await;
            add_participant(&mut organizer, &tournament, &player.username).await;
            if visibility == "Public" {
                public = Some(tournament);
            }
        }
        let public = public.expect("a public tournament");
        add_participant(&mut organizer, &public, &owner.username).await;

        let mut anonymous = TestClient::new();
        let as_player = anonymous
            .get(&api(&format!("explore/profiles/{}", player.username)))
            .await
            .ok_json();
        assert_eq!(
            uuids(&as_player["tournaments"]),
            vec![public.clone()],
            "{as_player}"
        );
        assert_eq!(
            as_player["tournaments"][0]["owner"],
            owner.username.as_str(),
            "{as_player}"
        );

        let as_owner = anonymous
            .get(&api(&format!("explore/profiles/{}", owner.username)))
            .await
            .ok_json();
        assert_eq!(uuids(&as_owner["tournaments"]), vec![public], "{as_owner}");
    });
}
