//! Command Zone Dating without the advisor: passes, rewinds and validation

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;

#[test]
fn an_account_without_decks_or_answers_is_asked_first() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut session = TestClient::logged_in(&member).await;

        let stack = session
            .json(
                Method::POST,
                &api("dating/stack"),
                &json!({ "pending": [] }),
            )
            .await
            .ok_json();

        assert_eq!(stack["profile_needed"], true);
        assert_eq!(stack["commanders"], json!([]));
        assert_eq!(stack["super_likes_left"], 1);
    });
}

#[test]
fn a_pass_is_undone_by_a_rewind() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut session = TestClient::logged_in(&member).await;
        let commander = Uuid::new_v4();

        let swipe = session
            .json(
                Method::POST,
                &api("dating/swipes"),
                &json!({ "commander": commander, "kind": "Pass" }),
            )
            .await
            .ok_json();
        assert_eq!(swipe["status"], "Passed");

        let rewound = session
            .json(Method::DELETE, &api("dating/swipes/last"), &json!(null))
            .await
            .ok_json();
        assert_eq!(rewound["commander"], json!(commander));

        let again = session
            .json(Method::DELETE, &api("dating/swipes/last"), &json!(null))
            .await
            .ok_json();
        assert_eq!(again["commander"], json!(null));
    });
}

#[test]
fn passes_stay_out_of_the_dates_and_can_be_reset() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut session = TestClient::logged_in(&member).await;
        for _ in 0..2 {
            session
                .json(
                    Method::POST,
                    &api("dating/swipes"),
                    &json!({ "commander": Uuid::new_v4(), "kind": "Pass" }),
                )
                .await
                .ok_json();
        }

        let dates = session.get(&api("dating/dates")).await.ok_json();
        assert_eq!(dates, json!({ "matches": [], "shots": [] }));

        session
            .json(Method::DELETE, &api("dating/passes"), &json!(null))
            .await
            .ok_json();
        let rewound = session
            .json(Method::DELETE, &api("dating/swipes/last"), &json!(null))
            .await
            .ok_json();
        assert_eq!(rewound["commander"], json!(null));
    });
}

#[test]
fn coming_back_needs_a_date() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut session = TestClient::logged_in(&member).await;

        let response = session
            .json(
                Method::POST,
                &api(&format!("dating/dates/{}/come-back", Uuid::new_v4())),
                &json!(null),
            )
            .await;

        assert_eq!(response.status, StatusCode::BAD_REQUEST);
    });
}

#[test]
fn answers_must_be_wubrg_a_real_bracket_and_in_range() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut session = TestClient::logged_in(&member).await;

        for body in [
            json!({ "colors": "WX", "bracket": 3, "budget_eur": 100 }),
            json!({ "colors": "W", "bracket": 6, "budget_eur": 100 }),
            json!({ "colors": "W", "bracket": 2, "budget_eur": -1 }),
            json!({ "colors": "W", "bracket": 2, "budget_eur": 100, "salt": 4.5 }),
            json!({ "colors": "W", "bracket": 2, "budget_eur": 100, "avoided": vec!["tokens"; 65] }),
        ] {
            let response = session
                .json(Method::PUT, &api("dating/profile"), &body)
                .await;
            assert_eq!(response.status, StatusCode::BAD_REQUEST, "{body}");
        }
    });
}

#[test]
fn dating_needs_a_login() {
    run(async {
        let response = TestClient::new().get(&api("dating/dates")).await;

        assert_eq!(response.status, StatusCode::UNAUTHORIZED);
    });
}

#[test]
fn a_deck_without_a_date_has_none() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut session = TestClient::logged_in(&member).await;

        let date = session
            .get(&api(&format!("dating/date/{}", Uuid::new_v4())))
            .await
            .ok_json();
        assert_eq!(date, json!(null));

        let response = session
            .json(
                Method::POST,
                &api(&format!("dating/date/{}/answer", Uuid::new_v4())),
                &json!({ "level": "core" }),
            )
            .await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST);
    });
}

#[test]
fn a_pair_swipe_stands_beside_the_lead_swipe() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut session = TestClient::logged_in(&member).await;
        let lead = Uuid::new_v4();
        let partner = Uuid::new_v4();

        for body in [
            json!({ "commander": lead, "partner": partner, "kind": "Pass" }),
            json!({ "commander": lead, "kind": "Pass" }),
        ] {
            session
                .json(Method::POST, &api("dating/swipes"), &body)
                .await
                .ok_json();
        }

        let lone = session
            .json(Method::DELETE, &api("dating/swipes/last"), &json!(null))
            .await
            .ok_json();
        assert_eq!(lone["commander"], json!(lead));
        assert_eq!(lone["partner"], json!(null));

        let pair = session
            .json(Method::DELETE, &api("dating/swipes/last"), &json!(null))
            .await
            .ok_json();
        assert_eq!(pair["commander"], json!(lead));
        assert_eq!(pair["partner"], json!(partner));
    });
}

#[test]
fn a_second_commander_takes_no_super_like() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut session = TestClient::logged_in(&member).await;

        let response = session
            .json(
                Method::POST,
                &api("dating/swipes"),
                &json!({
                    "commander": Uuid::new_v4(),
                    "partner": Uuid::new_v4(),
                    "kind": "SuperLike",
                }),
            )
            .await;

        assert_eq!(response.status, StatusCode::BAD_REQUEST);
    });
}
