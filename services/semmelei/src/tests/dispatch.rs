//! The Dispatch: a pickup day goes out at its Deadline plus the Review Window

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use time::Duration;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use crate::models::Role;
use crate::tests::confirmations::confirmation_subject;
use crate::tests::confirmations::confirmations;
use crate::tests::confirmations::order;
use crate::tests::confirmations::unique_email;
use crate::tests::harness::ShopDay;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::mails;
use crate::tests::harness::run;
use crate::tests::harness::shop_day;
use crate::tests::harness::tick;

/// A browser logged in as a new Admin
async fn admin() -> TestClient {
    TestClient::logged_in(&create_account(Role::Admin).await).await
}

/// Sends the current schedule with the Review Window set to `minutes`
async fn put_review_window(admin: &mut TestClient, minutes: i64) -> TestResponse {
    let mut schedule = admin.get(&api("admin/schedule")).await.ok_json();
    schedule["review_window_minutes"] = Value::from(minutes);
    admin
        .json(Method::PUT, &api("admin/schedule"), &schedule)
        .await
}

/// Sets the Review Window to `minutes`, expecting success
async fn set_review_window(minutes: i64) {
    let response = put_review_window(&mut admin().await, minutes).await;
    assert_eq!(response.status, StatusCode::OK, "{response:?}");
}

#[test]
fn admins_set_the_review_window_in_the_schedule() {
    run(async {
        let _day = shop_day().await;
        let mut admin = admin().await;

        let saved = put_review_window(&mut admin, 60).await.ok_json();

        assert_eq!(saved["review_window_minutes"], 60);
        assert_eq!(
            admin.get(&api("admin/schedule")).await.ok_json()["review_window_minutes"],
            60
        );
    });
}

#[test]
fn a_negative_review_window_is_rejected() {
    run(async {
        let _day = shop_day().await;
        let mut admin = admin().await;
        set_review_window(30).await;

        let response = put_review_window(&mut admin, -1).await;

        assert_eq!(response.status, StatusCode::BAD_REQUEST, "{response:?}");
        assert_eq!(
            admin.get(&api("admin/schedule")).await.ok_json()["review_window_minutes"],
            30
        );
    });
}

/// The day's Procurement as staff see it
async fn procurement(day: &ShopDay) -> Value {
    admin()
        .await
        .get(&api(&format!(
            "verkauf/pickup-days/{}/summary",
            day.pickup_date
        )))
        .await
        .ok_json()
}

/// A point in time as the API spells it
fn rfc3339(time: OffsetDateTime) -> String {
    time.format(&Rfc3339).expect("formattable time")
}

/// Changes the day's Deadline, or calls it off, through the admin API
async fn override_day(day: &ShopDay, deadline: OffsetDateTime, closed: bool) {
    admin()
        .await
        .json(
            Method::PUT,
            &api(&format!("admin/pickup-days/{}", day.pickup_date)),
            &json!({
                "pickup_date": day.pickup_date.to_string(),
                "deadline": rfc3339(deadline),
                "closed": closed,
            }),
        )
        .await
        .ok_json();
}

/// Cancels the order with `pickup_code` as staff
async fn cancel_as_staff(day: &ShopDay, pickup_code: &str) {
    let mut admin = admin().await;
    let orders = admin
        .get(&api(&format!(
            "verkauf/orders?pickup_date={}",
            day.pickup_date
        )))
        .await
        .ok_json();
    let uuid = orders["orders"]
        .as_array()
        .expect("a list")
        .iter()
        .find(|order| order["pickup_code"] == pickup_code)
        .and_then(|order| order["uuid"].as_str())
        .expect("the order is listed")
        .to_string();
    admin
        .json(
            Method::PATCH,
            &api(&format!("verkauf/orders/{uuid}")),
            &json!({ "status": "Cancelled" }),
        )
        .await
        .ok_json();
}

/// The subjects of the cancellation mails `email` got for a staff cancellation
fn cancellations(email: &str, pickup_code: &str) -> Vec<String> {
    mails()
        .sent_to(email)
        .into_iter()
        .map(|mail| mail.subject)
        .filter(|subject| *subject == format!("Vorbestellung {pickup_code} storniert"))
        .collect()
}

#[test]
fn nothing_is_sent_at_the_deadline_while_a_review_window_runs() {
    run(async {
        let day = shop_day().await;
        let email = unique_email();
        order(&email).await;
        set_review_window(60).await;

        tick(day.deadline).await;
        tick(day.deadline + Duration::minutes(59)).await;

        assert_eq!(mails().sent_to(&email).len(), 1);
        assert_eq!(confirmations(&email), Vec::<String>::new());
    });
}

#[test]
fn confirmations_go_out_at_the_end_of_the_review_window() {
    run(async {
        let day = shop_day().await;
        let email = unique_email();
        let pickup_code = order(&email).await;
        set_review_window(60).await;

        tick(day.deadline).await;
        tick(day.deadline + Duration::minutes(60)).await;
        tick(day.deadline + Duration::minutes(61)).await;

        assert_eq!(
            confirmations(&email),
            vec![confirmation_subject(&pickup_code)]
        );
    });
}

#[test]
fn a_dispatch_missed_during_downtime_happens_on_the_next_tick() {
    run(async {
        let day = shop_day().await;
        let email = unique_email();
        let pickup_code = order(&email).await;
        set_review_window(60).await;

        tick(day.deadline + Duration::hours(3)).await;

        assert_eq!(
            confirmations(&email),
            vec![confirmation_subject(&pickup_code)]
        );
    });
}

#[test]
fn a_deadline_override_moves_the_dispatch() {
    run(async {
        let day = shop_day().await;
        let email = unique_email();
        let pickup_code = order(&email).await;
        set_review_window(60).await;
        let deadline = day.deadline + Duration::minutes(30);
        override_day(&day, deadline, false).await;

        tick(deadline + Duration::minutes(59)).await;
        let before = confirmations(&email);
        tick(deadline + Duration::minutes(60)).await;

        assert_eq!(before, Vec::<String>::new());
        assert_eq!(
            confirmations(&email),
            vec![confirmation_subject(&pickup_code)]
        );
    });
}

#[test]
fn shortening_the_review_window_dispatches_on_the_next_tick() {
    run(async {
        let day = shop_day().await;
        let email = unique_email();
        let pickup_code = order(&email).await;
        set_review_window(120).await;

        tick(day.deadline + Duration::minutes(30)).await;
        let before = confirmations(&email);
        set_review_window(30).await;
        tick(day.deadline + Duration::minutes(31)).await;

        assert_eq!(before, Vec::<String>::new());
        assert_eq!(
            confirmations(&email),
            vec![confirmation_subject(&pickup_code)]
        );
    });
}

#[test]
fn a_called_off_day_is_never_dispatched() {
    run(async {
        let day = shop_day().await;
        let email = unique_email();
        order(&email).await;
        override_day(&day, day.deadline, true).await;

        tick(day.deadline).await;
        tick(day.deadline + Duration::minutes(1)).await;

        assert_eq!(confirmations(&email), Vec::<String>::new());
        let summary = procurement(&day).await;
        assert_eq!(summary["dispatched_at"], Value::Null);
    });
}

#[test]
fn freezing_early_does_not_dispatch_early() {
    run(async {
        let day = shop_day().await;
        let email = unique_email();
        let pickup_code = order(&email).await;

        let frozen = admin()
            .await
            .json(
                Method::POST,
                &api(&format!("admin/pickup-days/{}/lock", day.pickup_date)),
                &json!({}),
            )
            .await
            .ok_json();
        tick(day.deadline - Duration::minutes(1)).await;
        let before = confirmations(&email);
        tick(day.deadline).await;

        assert_eq!(frozen["day"]["locked"], true);
        assert_eq!(before, Vec::<String>::new());
        assert_eq!(
            confirmations(&email),
            vec![confirmation_subject(&pickup_code)]
        );
    });
}

#[test]
fn an_order_cancelled_in_the_review_window_gets_a_cancellation_and_no_confirmation() {
    run(async {
        let day = shop_day().await;
        let cancelled = unique_email();
        let kept = unique_email();
        let cancelled_code = order(&cancelled).await;
        let kept_code = order(&kept).await;
        set_review_window(60).await;

        tick(day.deadline).await;
        cancel_as_staff(&day, &cancelled_code).await;
        tick(day.deadline + Duration::minutes(60)).await;

        assert_eq!(
            cancellations(&cancelled, &cancelled_code),
            vec![format!("Vorbestellung {cancelled_code} storniert")]
        );
        assert_eq!(confirmations(&cancelled), Vec::<String>::new());
        assert_eq!(confirmations(&kept), vec![confirmation_subject(&kept_code)]);
    });
}

/// A point in time the API sent, parsed
fn parsed(value: &Value) -> OffsetDateTime {
    OffsetDateTime::parse(value.as_str().expect("a time"), &Rfc3339).expect("an rfc3339 time")
}

/// The order with `pickup_code` as the staff order list shows it
async fn listed_order(day: &ShopDay, pickup_code: &str) -> Value {
    admin()
        .await
        .get(&api(&format!(
            "verkauf/orders?pickup_date={}",
            day.pickup_date
        )))
        .await
        .ok_json()["orders"]
        .as_array()
        .expect("a list")
        .iter()
        .find(|order| order["pickup_code"] == pickup_code)
        .cloned()
        .expect("the order is listed")
}

#[test]
fn the_procurement_reports_the_state_of_the_dispatch() {
    run(async {
        let day = shop_day().await;
        order(&unique_email()).await;
        set_review_window(60).await;
        let dispatch = day.deadline + Duration::minutes(60);

        let open = procurement(&day).await;
        tick(day.deadline).await;
        let reviewing = procurement(&day).await;
        tick(dispatch + Duration::minutes(1)).await;
        let dispatched = procurement(&day).await;

        assert_eq!(open["locked"], false);
        assert_eq!(parsed(&open["deadline"]), day.deadline);
        assert_eq!(parsed(&open["dispatch_due"]), dispatch);
        assert_eq!(open["dispatched_at"], Value::Null);

        assert_eq!(reviewing["locked"], true);
        assert_eq!(parsed(&reviewing["dispatch_due"]), dispatch);
        assert_eq!(reviewing["dispatched_at"], Value::Null);

        assert_eq!(
            parsed(&dispatched["dispatched_at"]),
            dispatch + Duration::minutes(1)
        );
    });
}

#[test]
fn orders_of_a_dispatched_day_say_so() {
    run(async {
        let day = shop_day().await;
        let pickup_code = order(&unique_email()).await;

        let before = listed_order(&day, &pickup_code).await;
        tick(day.deadline).await;
        let after = listed_order(&day, &pickup_code).await;

        assert_eq!(before["dispatched"], false);
        assert_eq!(after["dispatched"], true);
    });
}

#[test]
fn staff_can_still_cancel_an_order_after_the_dispatch() {
    run(async {
        let day = shop_day().await;
        let email = unique_email();
        let pickup_code = order(&email).await;

        tick(day.deadline).await;
        cancel_as_staff(&day, &pickup_code).await;

        assert_eq!(
            cancellations(&email, &pickup_code),
            vec![format!("Vorbestellung {pickup_code} storniert")]
        );
        assert_eq!(
            listed_order(&day, &pickup_code).await["status"],
            "Cancelled"
        );
    });
}
