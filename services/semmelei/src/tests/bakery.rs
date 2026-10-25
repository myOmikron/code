//! The Bakery mail: at the Dispatch the Procurement goes to the Bakery as a CSV

use galvyn::core::re_exports::axum::body::Body;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use time::Duration;

use crate::models::Role;
use crate::proto::mail_v1::SendEmail;
use crate::tests::confirmations::confirmation_subject;
use crate::tests::confirmations::confirmations;
use crate::tests::confirmations::unique_email;
use crate::tests::harness::ShopDay;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::mails;
use crate::tests::harness::request;
use crate::tests::harness::run;
use crate::tests::harness::shop_day;
use crate::tests::harness::tick;

/// A browser logged in as a new Admin
async fn admin() -> TestClient {
    TestClient::logged_in(&create_account(Role::Admin).await).await
}

/// Sends the Bakery and copy address
async fn put_addresses(bakery: Option<&str>, copy: Option<&str>) -> TestResponse {
    admin()
        .await
        .json(
            Method::PUT,
            &api("admin/bakery"),
            &json!({ "bakery_email": bakery, "copy_email": copy }),
        )
        .await
}

/// Creates an active Item and returns its uuid
async fn create_item(name: &str, price_cents: i64, number: Option<&str>) -> String {
    admin()
        .await
        .json(
            Method::POST,
            &api("admin/items"),
            &json!({
                "name": name,
                "price_cents": price_cents,
                "additional_info": null,
                "category": null,
                "active": true,
                "bakery_article_number": number,
            }),
        )
        .await
        .ok_json()
        .as_str()
        .expect("the uuid")
        .to_string()
}

/// Places an order for the open pickup day and returns its pickup code
async fn order(email: &str, items: &[(&str, i64)]) -> String {
    let items: Vec<Value> = items
        .iter()
        .map(|(item, quantity)| json!({ "item": item, "quantity": quantity }))
        .collect();
    TestClient::new()
        .json(
            Method::POST,
            &api("shop/orders"),
            &json!({ "last_name": "Muster", "email": email, "items": items }),
        )
        .await
        .ok_json()["pickup_code"]
        .as_str()
        .expect("a pickup code")
        .to_string()
}

/// The day's Procurement as Verkauf sees it
async fn procurement(day: &ShopDay) -> Value {
    TestClient::logged_in(&create_account(Role::Verkauf).await)
        .await
        .get(&api(&format!(
            "verkauf/pickup-days/{}/summary",
            day.pickup_date
        )))
        .await
        .ok_json()
}

/// The Bakery mails the day's Bakery got
fn bakery_mails(day: &ShopDay) -> Vec<SendEmail> {
    mails()
        .sent()
        .into_iter()
        .filter(|mail| mail.to == day.bakery)
        .collect()
}

/// The CSV attached to a Bakery mail, as text
fn csv(mail: &SendEmail) -> String {
    assert_eq!(mail.attachments.len(), 1, "{mail:?}");
    String::from_utf8(mail.attachments[0].content.clone()).expect("utf-8")
}

#[test]
fn admins_set_the_bakery_and_copy_address() {
    run(async {
        let _day = shop_day().await;

        let saved = put_addresses(Some("bestellung@baeckerei.de"), Some("einkauf@nbh.de"))
            .await
            .ok_json();

        assert_eq!(saved["bakery_email"], "bestellung@baeckerei.de");
        assert_eq!(saved["copy_email"], "einkauf@nbh.de");
        let read = admin().await.get(&api("admin/bakery")).await.ok_json();
        assert_eq!(read, saved);
    });
}

#[test]
fn empty_addresses_unset_them() {
    run(async {
        let _day = shop_day().await;

        let saved = put_addresses(Some(""), Some("  ")).await.ok_json();

        assert_eq!(saved["bakery_email"], Value::Null);
        assert_eq!(saved["copy_email"], Value::Null);
    });
}

#[test]
fn invalid_addresses_are_rejected() {
    run(async {
        let day = shop_day().await;

        let bakery = put_addresses(Some("keine adresse"), None).await;
        let copy = put_addresses(Some("bestellung@baeckerei.de"), Some("a@b, c@d.de")).await;

        assert_eq!(bakery.status, StatusCode::BAD_REQUEST, "{bakery:?}");
        assert_eq!(copy.status, StatusCode::BAD_REQUEST, "{copy:?}");
        let read = admin().await.get(&api("admin/bakery")).await.ok_json();
        assert_eq!(read["bakery_email"], day.bakery.as_str());
    });
}

#[test]
fn the_bakery_gets_the_order_with_the_copy_in_cc() {
    run(async {
        let day = shop_day().await;
        let item = create_item("Semmel", 45, Some("00412")).await;
        order(&unique_email(), &[(&item, 2)]).await;

        tick(day.deadline).await;

        let sent = bakery_mails(&day);
        assert_eq!(sent.len(), 1, "{sent:?}");
        let mail = &sent[0];
        assert_eq!(mail.cc, vec![day.copy.clone()]);
        let date = day.pickup_date;
        assert!(
            mail.subject
                .starts_with("Bestellung Nachbarschaftshilfe für "),
            "{}",
            mail.subject
        );
        assert!(
            mail.subject.ends_with(&format!(
                ", {:02}.{:02}.{}",
                date.day(),
                u8::from(date.month()),
                date.year()
            )),
            "{}",
            mail.subject
        );
        assert!(!mail.text_body.is_empty());
        let attachment = &mail.attachments[0];
        assert_eq!(attachment.filename, format!("bestellung-{date}.csv"));
        assert_eq!(attachment.content_type, "text/csv; charset=utf-8");
    });
}

#[test]
fn the_csv_has_one_line_per_article_number() {
    run(async {
        let day = shop_day().await;
        let semmel = create_item("Semmel", 250, Some("00412")).await;
        let kaiser = create_item("Kaisersemmel", 250, Some("00412")).await;
        let brezel = create_item("Brezel", 90, Some("00100")).await;
        let coffee = create_item("Kaffee", 300, None).await;
        let deleted = create_item("Gelöscht", 100, Some("00999")).await;
        let cancelled = create_item("Storniert", 100, Some("00888")).await;
        order(&unique_email(), &[(&semmel, 2), (&brezel, 1), (&coffee, 1)]).await;
        order(
            &unique_email(),
            &[(&kaiser, 3), (&semmel, 1), (&deleted, 4)],
        )
        .await;
        let cancelled_code = order(&unique_email(), &[(&cancelled, 5)]).await;
        let response = admin()
            .await
            .send(
                request(Method::DELETE, &api(&format!("admin/items/{deleted}")))
                    .body(Body::empty())
                    .expect("valid request"),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");
        cancel(&day, &cancelled_code).await;

        tick(day.deadline).await;

        let sent = bakery_mails(&day);
        assert_eq!(sent.len(), 1, "{sent:?}");
        assert_eq!(
            csv(&sent[0]),
            "\u{feff}Artikel;Artikelnummer;Menge;Einzelpreis\r\n\
             Brezel;00100;1;0,90\r\n\
             Semmel / Kaisersemmel;00412;6;2,50\r\n"
        );
    });
}

/// Cancels the order with `pickup_code` as staff
async fn cancel(day: &ShopDay, pickup_code: &str) {
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

#[test]
fn a_day_without_bakery_positions_is_dispatched_without_a_bakery_mail() {
    run(async {
        let day = shop_day().await;
        let email = unique_email();
        let coffee = create_item("Kaffee", 300, None).await;
        let pickup_code = order(&email, &[(&coffee, 1)]).await;

        tick(day.deadline).await;

        assert_eq!(bakery_mails(&day), Vec::new());
        assert_eq!(
            confirmations(&email),
            vec![confirmation_subject(&pickup_code)]
        );
        assert_ne!(procurement(&day).await["dispatched_at"], Value::Null);
    });
}

#[test]
fn without_a_bakery_address_the_day_waits_for_one() {
    run(async {
        let day = shop_day().await;
        let email = unique_email();
        let item = create_item("Semmel", 45, Some("00412")).await;
        let pickup_code = order(&email, &[(&item, 2)]).await;
        put_addresses(None, Some(&day.copy)).await.ok_json();

        tick(day.deadline).await;
        let waiting = procurement(&day).await;
        let mails_while_waiting = mails().sent_to(&day.copy);
        let confirmations_while_waiting = confirmations(&email);

        let bakery = unique_email();
        put_addresses(Some(&bakery), Some(&day.copy))
            .await
            .ok_json();
        tick(day.deadline + Duration::minutes(5)).await;
        let dispatched = procurement(&day).await;

        assert_eq!(waiting["dispatched_at"], Value::Null);
        assert_eq!(waiting["not_dispatched_reason"], "NoBakeryAddress");
        assert_eq!(mails_while_waiting, Vec::new());
        assert_eq!(confirmations_while_waiting, Vec::<String>::new());

        assert_eq!(mails().sent_to(&bakery).len(), 1);
        assert_eq!(dispatched["not_dispatched_reason"], "None");
        assert_ne!(dispatched["dispatched_at"], Value::Null);
        assert_eq!(
            confirmations(&email),
            vec![confirmation_subject(&pickup_code)]
        );
    });
}

#[test]
fn the_procurement_reports_no_reason_while_the_address_is_set() {
    run(async {
        let day = shop_day().await;
        let item = create_item("Semmel", 45, Some("00412")).await;
        order(&unique_email(), &[(&item, 1)]).await;

        let open = procurement(&day).await;

        assert_eq!(open["not_dispatched_reason"], "None");
    });
}

#[test]
fn a_failed_hand_over_is_retried_on_the_next_tick() {
    run(async {
        let day = shop_day().await;
        let email = unique_email();
        let item = create_item("Semmel", 45, Some("00412")).await;
        let pickup_code = order(&email, &[(&item, 2)]).await;

        mails().set_failing(true);
        tick(day.deadline).await;
        mails().set_failing(false);
        let after_failure = procurement(&day).await;
        let confirmations_after_failure = confirmations(&email);

        tick(day.deadline + Duration::minutes(1)).await;
        tick(day.deadline + Duration::minutes(2)).await;

        assert_eq!(after_failure["dispatched_at"], Value::Null);
        assert_eq!(confirmations_after_failure, Vec::<String>::new());
        assert_eq!(bakery_mails(&day).len(), 1);
        assert_ne!(procurement(&day).await["dispatched_at"], Value::Null);
        assert_eq!(
            confirmations(&email),
            vec![confirmation_subject(&pickup_code)]
        );
    });
}
