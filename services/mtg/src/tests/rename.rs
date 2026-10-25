//! An Account renaming itself

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::passkeys::enroll;
use crate::tests::tournament_organizers::add;
use crate::tests::tournament_organizers::co_organizer_names;
use crate::tests::tournament_organizers::organizers_url;
use crate::tests::tournament_participants::add_account;
use crate::tests::tournament_participants::names;
use crate::tests::tournament_participants::roster;
use crate::tests::tournament_rounds::Event;
use crate::tests::tournaments::Fixture;

/// Renames the account behind `client` to `username`
async fn rename(client: &mut TestClient, username: &str) -> TestResponse {
    client
        .json(
            Method::PUT,
            &api("accounts/me/username"),
            &json!({ "username": username }),
        )
        .await
}

/// A username nobody has, unique per test run
fn fresh_username() -> String {
    format!("r{}", &Uuid::new_v4().simple().to_string()[..12])
}

/// Starts a login as `username`, returning the response body
async fn start_login(username: &str) -> Value {
    TestClient::new()
        .json(
            Method::POST,
            &api("auth/login/start"),
            &json!({ "username": username }),
        )
        .await
        .ok_json()
}

#[test]
fn an_account_renames_itself() {
    run(async {
        let member = create_account(Role::Member).await;
        enroll(&member, "Laptop").await;
        let mut session = TestClient::logged_in(&member).await;
        let new = fresh_username();

        let body = rename(&mut session, &new).await.ok_json();
        assert_eq!(body["username"], new.as_str());
        assert!(
            body["rp_id"]
                .as_str()
                .is_some_and(|rp_id| !rp_id.is_empty())
        );
        assert!(
            body["user_id"]
                .as_str()
                .is_some_and(|user_id| !user_id.is_empty())
        );

        let me = session.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], new.as_str());

        let profile = TestClient::new()
            .get(&api(&format!("explore/profiles/{new}")))
            .await
            .ok_json();
        assert_eq!(profile["username"], new.as_str());
        let old_profile = TestClient::new()
            .get(&api(&format!("explore/profiles/{}", member.username)))
            .await;
        assert_eq!(old_profile.status, StatusCode::BAD_REQUEST);

        assert!(start_login(&new).await["options"].is_object());
        let old_login = start_login(&member.username).await;
        assert_eq!(old_login["result"], "Err");
        assert_eq!(old_login["error"]["unknown_username"], true);
    });
}

#[test]
fn the_old_username_is_free_at_once() {
    run(async {
        let first = create_account(Role::Member).await;
        let second = create_account(Role::Member).await;
        rename(&mut TestClient::logged_in(&first).await, &fresh_username())
            .await
            .ok_json();

        let body = rename(&mut TestClient::logged_in(&second).await, &first.username)
            .await
            .ok_json();
        assert_eq!(body["username"], first.username.as_str());
    });
}

#[test]
fn only_the_case_changes() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut session = TestClient::logged_in(&member).await;
        let upper = member.username.to_uppercase();

        let body = rename(&mut session, &upper).await.ok_json();
        assert_eq!(body["username"], upper.as_str());
        let me = session.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], upper.as_str());
    });
}

#[test]
fn a_username_of_another_account_is_taken_whatever_its_case() {
    run(async {
        let member = create_account(Role::Member).await;
        let other = create_account(Role::Member).await;
        let mut session = TestClient::logged_in(&member).await;

        let body = rename(&mut session, &other.username.to_uppercase())
            .await
            .ok_json();
        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["username_taken"], true);
        let me = session.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], member.username.as_str());
    });
}

#[test]
fn an_invalid_username_is_refused() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut session = TestClient::logged_in(&member).await;

        for invalid in ["ab", "-leading", "with space", "#deleted"] {
            let response = rename(&mut session, invalid).await;
            assert_ne!(response.status, StatusCode::OK, "{invalid}");
        }
        let me = session.get(&api("accounts/me")).await.ok_json();
        assert_eq!(me["username"], member.username.as_str());
    });
}

#[test]
fn a_locked_account_cannot_rename_itself() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut session = TestClient::logged_in(&member).await;
        TestClient::logged_in(&admin)
            .await
            .json(
                Method::POST,
                &api(&format!("admin/accounts/{}/lock", member.uuid.into_inner())),
                &json!({ "reason": "Spam" }),
            )
            .await
            .ok_json();

        let response = rename(&mut session, &fresh_username()).await;
        assert_eq!(response.status, StatusCode::UNAUTHORIZED);
    });
}

#[test]
fn renaming_needs_a_session() {
    run(async {
        let response = rename(&mut TestClient::new(), &fresh_username()).await;
        assert_eq!(response.status, StatusCode::UNAUTHORIZED);
    });
}

#[test]
fn a_tournament_shows_the_new_usernames_after_a_rename() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let player = create_account(Role::Member).await;
        let co_organizer = create_account(Role::Member).await;
        add_account(&mut fixture.owner, &fixture.tournament, &player.username).await;
        let url = organizers_url(&fixture);
        add(&mut fixture.owner, &url, &co_organizer.username).await;

        let [owner_name, player_name, co_organizer_name] = [(); 3].map(|()| fresh_username());
        rename(&mut fixture.owner, &owner_name).await.ok_json();
        let mut as_player = TestClient::logged_in(&player).await;
        rename(&mut as_player, &player_name).await.ok_json();
        let mut as_co_organizer = TestClient::logged_in(&co_organizer).await;
        rename(&mut as_co_organizer, &co_organizer_name)
            .await
            .ok_json();

        let body = TestClient::new().get(&fixture.url()).await.ok_json();
        assert_eq!(body["owner"], owner_name.as_str(), "{body}");
        let body = roster(&mut TestClient::new(), &fixture.tournament).await;
        assert_eq!(names(&body), [player_name.as_str()], "{body}");
        let organizers = fixture.owner.get(&url).await.ok_json();
        assert_eq!(organizers["owner"]["username"], owner_name.as_str());
        assert_eq!(
            co_organizer_names(&organizers),
            [co_organizer_name.as_str()],
            "{organizers}"
        );
    });
}

/// The standings line of `participant`
fn line<'a>(standings: &'a Value, participant: &str) -> &'a Value {
    standings["standings"]
        .as_array()
        .expect("standings")
        .iter()
        .find(|line| line["participant"] == participant)
        .expect("a line")
}

#[test]
fn the_standings_show_the_new_username_after_a_rename() {
    run(async {
        let player = create_account(Role::Member).await;
        let mut event = Event::new("One", 1).await;
        let participant = event.add_account(&player.username).await;
        event.play_round().await;
        let new = fresh_username();

        rename(&mut TestClient::logged_in(&player).await, &new)
            .await
            .ok_json();

        let standings = event.standings().await;
        assert_eq!(
            line(&standings, &participant)["name"],
            new.as_str(),
            "{standings}"
        );
        assert_eq!(
            line(&standings, &participant)["guest"],
            false,
            "{standings}"
        );
    });
}
