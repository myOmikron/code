//! Binding confirmations: the deadline job freezes a pickup day and mails its customers

use galvyn::core::re_exports::axum::http::Method;
use serde_json::json;
use time::Duration;
use uuid::Uuid;

use crate::models::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::mails;
use crate::tests::harness::run;
use crate::tests::harness::shop_day;
use crate::tests::harness::tick;

/// Creates an orderable Item and returns its uuid
pub(super) async fn item() -> String {
    let mut admin = TestClient::logged_in(&create_account(Role::Admin).await).await;
    admin
        .json(
            Method::POST,
            &api("admin/items"),
            &json!({
                "name": format!("Brötchen {}", Uuid::new_v4().simple()),
                "price_cents": 45,
                "additional_info": null,
                "category": null,
                "active": true,
            }),
        )
        .await
        .ok_json()
        .as_str()
        .expect("the uuid")
        .to_string()
}

/// A mail address no other test uses
pub(super) fn unique_email() -> String {
    format!("kunde-{}@example.com", Uuid::new_v4().simple())
}

/// Places an order for the open pickup day and returns its pickup code
pub(super) async fn order(email: &str) -> String {
    let item = item().await;
    TestClient::new()
        .json(
            Method::POST,
            &api("shop/orders"),
            &json!({
                "last_name": "Muster",
                "email": email,
                "items": [{ "item": item, "quantity": 2 }],
            }),
        )
        .await
        .ok_json()["pickup_code"]
        .as_str()
        .expect("a pickup code")
        .to_string()
}

/// The subjects of the binding confirmations `email` got
pub(super) fn confirmations(email: &str) -> Vec<String> {
    mails()
        .sent_to(email)
        .into_iter()
        .map(|mail| mail.subject)
        .filter(|subject| subject.ends_with("ist verbindlich"))
        .collect()
}

/// The subject of the binding confirmation for `pickup_code`
pub(super) fn confirmation_subject(pickup_code: &str) -> String {
    format!("Vorbestellung {pickup_code} ist verbindlich")
}

#[test]
fn no_confirmation_before_the_deadline() {
    run(async {
        let day = shop_day().await;
        let deadline = day.deadline;
        let email = unique_email();
        order(&email).await;

        tick(deadline - Duration::minutes(1)).await;

        assert_eq!(mails().sent_to(&email).len(), 1);
        assert_eq!(confirmations(&email), Vec::<String>::new());
    });
}

#[test]
fn customers_get_their_confirmation_at_the_deadline() {
    run(async {
        let day = shop_day().await;
        let deadline = day.deadline;
        let email = unique_email();
        let pickup_code = order(&email).await;

        tick(deadline).await;

        assert_eq!(
            confirmations(&email),
            vec![confirmation_subject(&pickup_code)]
        );
    });
}

#[test]
fn the_next_tick_sends_no_second_confirmation() {
    run(async {
        let day = shop_day().await;
        let deadline = day.deadline;
        let email = unique_email();
        let pickup_code = order(&email).await;

        tick(deadline).await;
        tick(deadline + Duration::minutes(1)).await;

        assert_eq!(
            confirmations(&email),
            vec![confirmation_subject(&pickup_code)]
        );
    });
}

#[test]
fn a_cancelled_order_gets_no_confirmation() {
    run(async {
        let day = shop_day().await;
        let deadline = day.deadline;
        let cancelled = unique_email();
        let kept = unique_email();
        let cancelled_code = order(&cancelled).await;
        let kept_code = order(&kept).await;
        TestClient::new()
            .json(
                Method::POST,
                &api(&format!("shop/orders/{cancelled_code}/cancel")),
                &json!({}),
            )
            .await
            .ok_json();

        tick(deadline).await;

        assert_eq!(confirmations(&cancelled), Vec::<String>::new());
        assert_eq!(confirmations(&kept), vec![confirmation_subject(&kept_code)]);
    });
}

#[test]
fn a_confirmation_that_failed_to_go_out_is_not_sent_again() {
    run(async {
        let day = shop_day().await;
        let deadline = day.deadline;
        let email = unique_email();
        order(&email).await;

        mails().set_failing(true);
        tick(deadline).await;
        mails().set_failing(false);
        tick(deadline + Duration::minutes(1)).await;

        assert_eq!(confirmations(&email), Vec::<String>::new());
    });
}
