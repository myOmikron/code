//! Locking and unlocking Accounts, and the Admin log it writes

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::tournament_organizers::add;
use crate::tests::tournament_organizers::organizers_url;
use crate::tests::tournament_participants::add_account;
use crate::tests::tournament_participants::names;
use crate::tests::tournament_participants::roster;
use crate::tests::tournaments::Fixture;
use crate::tests::tournaments::settings;

/// Locks `account` as the Admin behind `client`, returning the response body
pub(super) async fn lock(client: &mut TestClient, account: &TestAccount, reason: &str) -> Value {
    client
        .json(
            Method::POST,
            &api(&format!(
                "admin/accounts/{}/lock",
                account.uuid.into_inner()
            )),
            &json!({ "reason": reason }),
        )
        .await
        .ok_json()
}

#[test]
fn a_locked_account_cannot_start_a_login() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let body = lock(&mut TestClient::logged_in(&admin).await, &member, "Spam").await;
        assert_eq!(body, Value::Null);

        let body = TestClient::new()
            .json(
                Method::POST,
                &api("auth/login/start"),
                &json!({ "username": member.username }),
            )
            .await
            .ok_json();
        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["locked"], true);
    });
}

#[test]
fn a_locked_accounts_session_stops_working() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut session = TestClient::logged_in(&member).await;
        assert_eq!(
            session.get(&api("accounts/me")).await.status,
            StatusCode::OK
        );

        lock(&mut TestClient::logged_in(&admin).await, &member, "Spam").await;

        assert_eq!(
            session.get(&api("accounts/passkeys")).await.status,
            StatusCode::UNAUTHORIZED
        );
        let printing = Uuid::new_v4();
        assert_eq!(
            session
                .get(&api(&format!("printings/{printing}/languages")))
                .await
                .status,
            StatusCode::UNAUTHORIZED
        );
    });
}

#[test]
fn a_locked_session_is_told_once_that_its_account_is_locked() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut session = TestClient::logged_in(&member).await;
        lock(&mut TestClient::logged_in(&admin).await, &member, "Spam").await;

        let body = session.get(&api("accounts/me")).await.ok_json();
        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"], json!({ "locked": true }));

        assert_eq!(
            session.get(&api("accounts/me")).await.status,
            StatusCode::UNAUTHORIZED
        );
    });
}

#[test]
fn a_locked_accounts_public_deck_and_share_link_stay_reachable() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut owner = TestClient::logged_in(&member).await;
        let mut decks = Vec::new();
        for visibility in ["Public", "Unlisted"] {
            let body = owner
                .json(
                    Method::POST,
                    &api("decks"),
                    &json!({
                        "name": visibility,
                        "description": null,
                        "format": "commander",
                        "visibility": visibility,
                    }),
                )
                .await
                .ok_json();
            decks.push(body["uuid"].as_str().expect("deck uuid").to_string());
        }
        let [public, unlisted] = decks.as_slice() else {
            unreachable!("two decks were created");
        };
        let body = owner
            .json(
                Method::POST,
                &api(&format!("decks/{unlisted}/share-token")),
                &json!({}),
            )
            .await
            .ok_json();
        let token = body["share_token"]
            .as_str()
            .expect("share token")
            .to_string();

        lock(&mut TestClient::logged_in(&admin).await, &member, "Spam").await;

        let mut visitor = TestClient::new();
        let deck = visitor
            .get(&api(&format!("explore/decks/{public}")))
            .await
            .ok_json();
        assert_eq!(deck["name"], "Public");
        let deck = visitor
            .get(&api(&format!("shared/decks/{token}")))
            .await
            .ok_json();
        assert_eq!(deck["name"], "Unlisted");
    });
}

#[test]
fn a_locked_accounts_profile_stays_public() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        lock(&mut TestClient::logged_in(&admin).await, &member, "Spam").await;

        let profile = TestClient::new()
            .get(&api(&format!("explore/profiles/{}", member.username)))
            .await
            .ok_json();
        assert_eq!(profile["username"], member.username.as_str());
    });
}

#[test]
fn an_unlocked_account_logs_in_again() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&admin).await;
        lock(&mut client, &member, "Spam").await;

        let body = client
            .json(
                Method::POST,
                &api(&format!(
                    "admin/accounts/{}/unlock",
                    member.uuid.into_inner()
                )),
                &json!({}),
            )
            .await
            .ok_json();
        assert_eq!(body, Value::Null);

        let mut session = TestClient::logged_in(&member).await;
        assert_eq!(
            session.get(&api("accounts/me")).await.status,
            StatusCode::OK
        );
    });
}

#[test]
fn an_admin_cannot_lock_itself() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;

        let body = lock(&mut client, &admin, "Oops").await;
        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["own_account"], true);

        assert_eq!(
            client.get(&api("admin/accounts")).await.status,
            StatusCode::OK
        );
    });
}

#[test]
fn an_admin_locks_another_admin() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let other = create_account(Role::Admin).await;
        let body = lock(&mut TestClient::logged_in(&admin).await, &other, "Left").await;
        assert_eq!(body, Value::Null);

        let response = TestClient::logged_in(&other)
            .await
            .get(&api("admin/accounts"))
            .await;
        assert_eq!(response.status, StatusCode::UNAUTHORIZED);
    });
}

#[test]
fn a_lock_needs_a_reason() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;

        let body = lock(&mut TestClient::logged_in(&admin).await, &member, "  ").await;
        assert_eq!(body["result"], "Err");
        assert_eq!(body["error"]["reason_missing"], true);
    });
}

#[test]
fn the_locked_filter_lists_locked_accounts_with_their_reason() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&admin).await;
        lock(&mut client, &member, "Spam").await;

        let body = client
            .get(&api(&format!(
                "admin/accounts?locked=true&search={}",
                member.username
            )))
            .await
            .ok_json();
        assert_eq!(body["accounts"][0]["username"], member.username.as_str());
        assert_eq!(body["accounts"][0]["lock"]["reason"], "Spam");

        let body = client
            .get(&api(&format!(
                "admin/accounts?locked=false&search={}",
                member.username
            )))
            .await
            .ok_json();
        assert_eq!(body["accounts"], json!([]));
    });
}

#[test]
fn lock_unlock_and_role_change_land_in_the_admin_log() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&admin).await;
        let account = member.uuid.into_inner();

        lock(&mut client, &member, "Spam").await;
        client
            .json(
                Method::POST,
                &api(&format!("admin/accounts/{account}/unlock")),
                &json!({ "reason": "Appeal" }),
            )
            .await
            .ok_json();
        client
            .json(
                Method::PUT,
                &api(&format!("admin/accounts/{account}/role")),
                &json!({ "role": "Admin" }),
            )
            .await
            .ok_json();

        let body = client
            .get(&api(&format!("admin/log?account={account}")))
            .await
            .ok_json();
        let entries = body["entries"].as_array().expect("entries");
        let actions: Vec<_> = entries
            .iter()
            .map(|entry| &entry["action"]["kind"])
            .collect();
        assert_eq!(actions, ["RoleChange", "Unlock", "Lock"]);
        assert_eq!(entries[0]["action"]["role"], "Admin");
        assert_eq!(entries[1]["action"]["reason"], "Appeal");
        assert_eq!(entries[2]["action"]["reason"], "Spam");
        for entry in entries {
            assert_eq!(entry["admin_username"], admin.username.as_str());
            assert_eq!(entry["account_username"], member.username.as_str());
        }
    });
}

#[test]
fn a_locked_owners_tournament_stays_public_and_its_co_organizer_runs_it() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut fixture = Fixture::new("Public").await;
        let co_organizer = create_account(Role::Member).await;
        let url = organizers_url(&fixture);
        add(&mut fixture.owner, &url, &co_organizer.username).await;

        let owner = &fixture.owner_account;
        lock(&mut TestClient::logged_in(&admin).await, owner, "Spam").await;

        let body = TestClient::new().get(&fixture.url()).await.ok_json();
        assert_eq!(
            body["owner"],
            fixture.owner_account.username.as_str(),
            "{body}"
        );
        let mut request = settings("Public");
        request["name"] = json!("Run by the Co-organizer");
        let url = fixture.url();
        let response = fixture.owner.json(Method::PUT, &url, &request).await;
        assert_eq!(response.status, StatusCode::UNAUTHORIZED);
        let body = TestClient::logged_in(&co_organizer)
            .await
            .json(Method::PUT, &url, &request)
            .await
            .ok_json();
        assert_eq!(body["name"], "Run by the Co-organizer", "{body}");
    });
}

#[test]
fn a_locked_participant_stays_on_the_roster_but_cannot_withdraw() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut fixture = Fixture::new("Public").await;
        let member = create_account(Role::Member).await;
        add_account(&mut fixture.owner, &fixture.tournament, &member.username).await;
        let mut session = TestClient::logged_in(&member).await;

        lock(&mut TestClient::logged_in(&admin).await, &member, "Spam").await;

        let body = roster(&mut fixture.owner, &fixture.tournament).await;
        assert_eq!(names(&body), [member.username.as_str()], "{body}");
        let response = session
            .json(
                Method::DELETE,
                &api(&format!("tournaments/{}/sign-up", fixture.tournament)),
                &json!({}),
            )
            .await;
        assert_eq!(response.status, StatusCode::UNAUTHORIZED);
        let body = roster(&mut fixture.owner, &fixture.tournament).await;
        assert_eq!(names(&body), [member.username.as_str()], "{body}");
    });
}
