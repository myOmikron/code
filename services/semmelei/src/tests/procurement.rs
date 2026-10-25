//! Procurement: the Bakery Article Numbers on each line, read live from the Items

use galvyn::core::re_exports::axum::body::Body;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::request;
use crate::tests::harness::run;
use crate::tests::harness::shop_day;

/// A browser logged in as a new Admin
async fn admin() -> TestClient {
    TestClient::logged_in(&create_account(Role::Admin).await).await
}

/// An active Item request named `name` with the given Bakery Article Number
fn item_request(name: &str, bakery_article_number: Option<&str>) -> Value {
    json!({
        "name": name,
        "price_cents": 120,
        "additional_info": null,
        "category": null,
        "active": true,
        "bakery_article_number": bakery_article_number,
    })
}

/// A name no other test uses
fn unique_name() -> String {
    format!("Semmel {}", Uuid::new_v4().simple())
}

/// Creates an Item and returns its uuid
async fn create_item(admin: &mut TestClient, name: &str, number: Option<&str>) -> String {
    admin
        .json(
            Method::POST,
            &api("admin/items"),
            &item_request(name, number),
        )
        .await
        .ok_json()
        .as_str()
        .expect("the uuid")
        .to_string()
}

/// Places one order for the open pickup day with `quantity` units of each Item
async fn order(items: &[(&str, i64)]) {
    let items: Vec<Value> = items
        .iter()
        .map(|(item, quantity)| json!({ "item": item, "quantity": quantity }))
        .collect();
    TestClient::new()
        .json(
            Method::POST,
            &api("shop/orders"),
            &json!({
                "last_name": "Muster",
                "email": format!("kunde-{}@example.com", Uuid::new_v4().simple()),
                "items": items,
            }),
        )
        .await
        .ok_json();
}

/// The Procurement lines of the open pickup day, as Verkauf sees them
async fn procurement() -> Vec<Value> {
    let window = TestClient::new().get(&api("shop/pickup")).await.ok_json();
    let date = window["pickup_date"]
        .as_str()
        .expect("a pickup day is open");
    let mut verkauf = TestClient::logged_in(&create_account(Role::Verkauf).await).await;
    verkauf
        .get(&api(&format!("verkauf/pickup-days/{date}/summary")))
        .await
        .ok_json()["positions"]
        .as_array()
        .expect("a list")
        .clone()
}

/// The Procurement line named `name`
fn line<'a>(lines: &'a [Value], name: &str) -> &'a Value {
    lines
        .iter()
        .find(|line| line["name"] == name)
        .unwrap_or_else(|| panic!("no line {name}"))
}

#[test]
fn the_procurement_shows_the_current_number_of_the_item() {
    run(async {
        let _day = shop_day().await;
        let mut admin = admin().await;
        let name = unique_name();
        let item = create_item(&mut admin, &name, Some("00412")).await;
        order(&[(&item, 2)]).await;

        let response = admin
            .json(
                Method::PUT,
                &api(&format!("admin/items/{item}")),
                &item_request(&name, Some("B-17")),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");

        let lines = procurement().await;
        assert_eq!(
            line(&lines, &name)["bakery_article_numbers"],
            json!(["B-17"])
        );
    });
}

#[test]
fn a_line_whose_item_has_no_number_lists_none() {
    run(async {
        let _day = shop_day().await;
        let mut admin = admin().await;
        let name = unique_name();
        let item = create_item(&mut admin, &name, None).await;
        order(&[(&item, 1)]).await;

        let lines = procurement().await;
        assert_eq!(line(&lines, &name)["bakery_article_numbers"], json!([]));
    });
}

#[test]
fn a_line_whose_item_was_deleted_lists_none() {
    run(async {
        let _day = shop_day().await;
        let mut admin = admin().await;
        let name = unique_name();
        let item = create_item(&mut admin, &name, Some("00412")).await;
        order(&[(&item, 1)]).await;

        let response = admin
            .send(
                request(Method::DELETE, &api(&format!("admin/items/{item}")))
                    .body(Body::empty())
                    .expect("valid request"),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");

        let lines = procurement().await;
        assert_eq!(line(&lines, &name)["bakery_article_numbers"], json!([]));
    });
}

#[test]
fn items_sharing_a_name_give_one_line_with_all_their_numbers() {
    run(async {
        let _day = shop_day().await;
        let mut admin = admin().await;
        let name = unique_name();
        let second = create_item(&mut admin, &name, Some("B-17")).await;
        let first = create_item(&mut admin, &name, Some("00412")).await;
        let same_number = create_item(&mut admin, &name, Some("B-17")).await;
        let without = create_item(&mut admin, &name, None).await;
        order(&[(&second, 1), (&first, 1)]).await;
        order(&[(&same_number, 1), (&without, 1)]).await;

        let lines = procurement().await;
        assert_eq!(lines.len(), 1, "{lines:?}");
        assert_eq!(lines[0]["total_quantity"], 4);
        assert_eq!(lines[0]["order_count"], 4);
        assert_eq!(lines[0]["bakery_article_numbers"], json!(["00412", "B-17"]));
    });
}

#[test]
fn lines_stay_grouped_by_name_with_most_units_first() {
    run(async {
        let _day = shop_day().await;
        let mut admin = admin().await;
        let few = format!("A {}", unique_name());
        let tie_b = format!("C {}", unique_name());
        let tie_a = format!("B {}", unique_name());
        let few_item = create_item(&mut admin, &few, Some("1")).await;
        let tie_b_item = create_item(&mut admin, &tie_b, Some("2")).await;
        let tie_a_item = create_item(&mut admin, &tie_a, None).await;
        order(&[(&few_item, 1), (&tie_b_item, 2)]).await;
        order(&[(&tie_a_item, 3), (&tie_b_item, 1)]).await;

        let lines = procurement().await;
        let summary: Vec<(String, i64)> = lines
            .iter()
            .map(|line| {
                (
                    line["name"].as_str().expect("a name").to_string(),
                    line["total_quantity"].as_i64().expect("a quantity"),
                )
            })
            .collect();
        assert_eq!(summary, vec![(tie_a, 3), (tie_b, 3), (few, 1)]);
    });
}
