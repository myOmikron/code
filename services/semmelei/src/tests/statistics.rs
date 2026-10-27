//! Statistics: the order positions of a period, for Admins only

use galvyn::core::re_exports::axum::body::Body;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use time::Date;
use time::Duration;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use uuid::Uuid;

use crate::models::Role;
use crate::tests::harness::ShopDay;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::request;
use crate::tests::harness::run;
use crate::tests::harness::shop_day;
use crate::tests::harness::tick;
use crate::utils::schedule;

/// A browser logged in as a new Admin
async fn admin() -> TestClient {
    TestClient::logged_in(&create_account(Role::Admin).await).await
}

/// A name no other test uses
fn unique_name(prefix: &str) -> String {
    format!("{prefix} {}", Uuid::new_v4().simple())
}

/// The Item request for an active Item
fn item_request(name: &str, price_cents: i64, category: Option<&str>) -> Value {
    json!({
        "name": name,
        "price_cents": price_cents,
        "additional_info": null,
        "category": category,
        "active": true,
        "bakery_article_number": null,
    })
}

/// Creates an Item and returns its uuid
async fn create_item(name: &str, price_cents: i64, category: Option<&str>) -> String {
    admin()
        .await
        .json(
            Method::POST,
            &api("admin/items"),
            &item_request(name, price_cents, category),
        )
        .await
        .ok_json()
        .as_str()
        .expect("the uuid")
        .to_string()
}

/// Creates a category and returns its uuid
async fn create_category(name: &str) -> String {
    admin()
        .await
        .json(
            Method::POST,
            &api("admin/categories"),
            &json!({ "name": name }),
        )
        .await
        .ok_json()
        .as_str()
        .expect("the uuid")
        .to_string()
}

/// Places an order for the open pickup day and returns its pickup code
async fn order(items: &[(&str, i64)]) -> String {
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
        .ok_json()["pickup_code"]
        .as_str()
        .expect("a pickup code")
        .to_string()
}

/// Today in the shop's timezone
fn today() -> Date {
    schedule::now().date()
}

/// The statistics url for the period `from` to `to`
fn statistics_url(from: Date, to: Date) -> url::Url {
    api(&format!("admin/statistics/positions?from={from}&to={to}"))
}

/// The positions an Admin gets for the period `from` to `to`
async fn positions(from: Date, to: Date) -> Vec<Value> {
    admin().await.get(&statistics_url(from, to)).await.ok_json()["positions"]
        .as_array()
        .expect("a list")
        .clone()
}

/// The positions of the order with `pickup_code` in the period around today
async fn positions_of(day: &ShopDay, pickup_code: &str) -> Vec<Value> {
    let order = order_uuid(day, pickup_code).await;
    positions(today() - Duration::days(1), today() + Duration::days(400))
        .await
        .into_iter()
        .filter(|position| position["order"] == order.as_str())
        .collect()
}

/// The one position named `name`
fn named<'a>(positions: &'a [Value], name: &str) -> &'a Value {
    let mut matching = positions.iter().filter(|position| position["name"] == name);
    let position = matching
        .next()
        .unwrap_or_else(|| panic!("no position {name} in {positions:?}"));
    assert!(matching.next().is_none(), "{name} twice in {positions:?}");
    position
}

/// The uuid of the order with `pickup_code`, as staff see it
async fn order_uuid(day: &ShopDay, pickup_code: &str) -> String {
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
        .and_then(|order| order["uuid"].as_str())
        .expect("the order is listed")
        .to_string()
}

/// A point in time as the API spells it
fn rfc3339(time: OffsetDateTime) -> String {
    time.format(&Rfc3339).expect("formattable time")
}

/// Moves the day to `pickup_date` and calls it off or not, through the admin API
async fn change_day(day: &ShopDay, pickup_date: Date, closed: bool) {
    admin()
        .await
        .json(
            Method::PUT,
            &api(&format!("admin/pickup-days/{}", day.pickup_date)),
            &json!({
                "pickup_date": pickup_date.to_string(),
                "deadline": rfc3339(day.deadline),
                "closed": closed,
            }),
        )
        .await
        .ok_json();
}

#[test]
fn only_admins_get_the_statistics() {
    run(async {
        let url = statistics_url(today(), today());
        let mut verkauf = TestClient::logged_in(&create_account(Role::Verkauf).await).await;

        assert_eq!(
            TestClient::new().get(&url).await.status,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(verkauf.get(&url).await.status, StatusCode::FORBIDDEN);
        assert_eq!(admin().await.get(&url).await.status, StatusCode::OK);
    });
}

#[test]
fn a_position_carries_its_order_pickup_day_and_snapshots() {
    run(async {
        let day = shop_day().await;
        let category_name = unique_name("Brot");
        let category = create_category(&category_name).await;
        let name = unique_name("Semmel");
        let item = create_item(&name, 45, Some(&category)).await;
        let before = OffsetDateTime::now_utc();
        let pickup_code = order(&[(&item, 3)]).await;
        let after = OffsetDateTime::now_utc();

        let positions = positions_of(&day, &pickup_code).await;
        let position = named(&positions, &name);

        let ordered_at =
            OffsetDateTime::parse(position["ordered_at"].as_str().expect("a time"), &Rfc3339)
                .expect("an rfc3339 time");
        assert!(before <= ordered_at && ordered_at <= after, "{position:?}");
        let deadline =
            OffsetDateTime::parse(position["deadline"].as_str().expect("a time"), &Rfc3339)
                .expect("an rfc3339 time");
        assert_eq!(deadline, day.deadline);
        assert_eq!(position["status"], "Open");
        assert_eq!(position["pickup_date"], day.pickup_date.to_string());
        assert_eq!(position["dispatched"], false);
        assert_eq!(position["called_off"], false);
        assert_eq!(position["item"], item.as_str());
        assert_eq!(position["item_name"], name.as_str());
        assert_eq!(
            position["category"],
            json!({ "uuid": category, "name": category_name })
        );
        assert_eq!(position["quantity"], 3);
        assert_eq!(position["price_cents"], 45);
    });
}

#[test]
fn every_position_of_an_order_is_returned() {
    run(async {
        let day = shop_day().await;
        let roll = unique_name("Semmel");
        let pretzel = unique_name("Breze");
        let roll_item = create_item(&roll, 45, None).await;
        let pretzel_item = create_item(&pretzel, 80, None).await;
        let pickup_code = order(&[(&roll_item, 2), (&pretzel_item, 1)]).await;

        let positions = positions_of(&day, &pickup_code).await;

        assert_eq!(positions.len(), 2, "{positions:?}");
        assert_eq!(named(&positions, &roll)["quantity"], 2);
        assert_eq!(named(&positions, &pretzel)["quantity"], 1);
    });
}

#[test]
fn the_period_takes_orders_placed_or_picked_up_in_it() {
    run(async {
        let day = shop_day().await;
        let name = unique_name("Semmel");
        let item = create_item(&name, 45, None).await;
        order(&[(&item, 1)]).await;
        let pickup_date = today() + Duration::days(61);
        change_day(&day, pickup_date, false).await;

        let placed = positions(today(), today()).await;
        let picked_up = positions(pickup_date, pickup_date).await;
        let both = positions(today(), pickup_date).await;
        let neither = positions(today() + Duration::days(10), today() + Duration::days(20)).await;

        assert_eq!(
            named(&placed, &name)["pickup_date"],
            pickup_date.to_string()
        );
        assert_eq!(
            named(&picked_up, &name)["pickup_date"],
            pickup_date.to_string()
        );
        assert_eq!(named(&both, &name)["quantity"], 1);
        assert!(
            neither
                .iter()
                .all(|position| position["name"] != name.as_str()),
            "{neither:?}"
        );
    });
}

#[test]
fn a_moved_pickup_day_reports_its_effective_date() {
    run(async {
        let day = shop_day().await;
        let name = unique_name("Semmel");
        let item = create_item(&name, 45, None).await;
        order(&[(&item, 1)]).await;
        let moved = day.pickup_date + Duration::days(1);
        change_day(&day, moved, false).await;

        let positions = positions(today(), moved).await;

        assert_eq!(named(&positions, &name)["pickup_date"], moved.to_string());
    });
}

#[test]
fn a_cancelled_order_keeps_its_status_and_is_not_called_off() {
    run(async {
        let day = shop_day().await;
        let name = unique_name("Semmel");
        let item = create_item(&name, 45, None).await;
        let pickup_code = order(&[(&item, 1)]).await;
        let uuid = order_uuid(&day, &pickup_code).await;
        admin()
            .await
            .json(
                Method::PATCH,
                &api(&format!("verkauf/orders/{uuid}")),
                &json!({ "status": "Cancelled" }),
            )
            .await
            .ok_json();

        let positions = positions_of(&day, &pickup_code).await;

        let position = named(&positions, &name);
        assert_eq!(position["status"], "Cancelled");
        assert_eq!(position["called_off"], false);
    });
}

#[test]
fn orders_of_a_called_off_day_carry_called_off() {
    run(async {
        let day = shop_day().await;
        let name = unique_name("Semmel");
        let item = create_item(&name, 45, None).await;
        let pickup_code = order(&[(&item, 1)]).await;
        let order = order_uuid(&day, &pickup_code).await;
        change_day(&day, day.pickup_date, true).await;

        let positions = positions(today(), day.pickup_date).await;

        let position = named(&positions, &name);
        assert_eq!(position["order"], order.as_str());
        assert_eq!(position["status"], "Cancelled");
        assert_eq!(position["called_off"], true);
    });
}

#[test]
fn a_deleted_item_leaves_only_the_snapshot_name() {
    run(async {
        let day = shop_day().await;
        let category = create_category(&unique_name("Brot")).await;
        let name = unique_name("Semmel");
        let item = create_item(&name, 45, Some(&category)).await;
        let pickup_code = order(&[(&item, 1)]).await;
        let response = admin()
            .await
            .send(
                request(Method::DELETE, &api(&format!("admin/items/{item}")))
                    .body(Body::empty())
                    .expect("valid request"),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");

        let positions = positions_of(&day, &pickup_code).await;

        let position = named(&positions, &name);
        assert_eq!(position["item"], Value::Null);
        assert_eq!(position["item_name"], Value::Null);
        assert_eq!(position["category"], Value::Null);
    });
}

#[test]
fn a_renamed_item_reports_its_current_name_next_to_the_snapshot() {
    run(async {
        let day = shop_day().await;
        let name = unique_name("Semmel");
        let renamed = unique_name("Kaisersemmel");
        let item = create_item(&name, 45, None).await;
        let pickup_code = order(&[(&item, 1)]).await;
        let response = admin()
            .await
            .json(
                Method::PUT,
                &api(&format!("admin/items/{item}")),
                &item_request(&renamed, 60, None),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");

        let positions = positions_of(&day, &pickup_code).await;

        let position = named(&positions, &name);
        assert_eq!(position["item"], item.as_str());
        assert_eq!(position["item_name"], renamed.as_str());
        assert_eq!(position["price_cents"], 45);
    });
}

#[test]
fn dispatched_reflects_the_dispatch() {
    run(async {
        let day = shop_day().await;
        let name = unique_name("Semmel");
        let item = create_item(&name, 45, None).await;
        let pickup_code = order(&[(&item, 1)]).await;

        let before = positions_of(&day, &pickup_code).await;
        tick(day.deadline).await;
        let after = positions_of(&day, &pickup_code).await;

        assert_eq!(named(&before, &name)["dispatched"], false);
        assert_eq!(named(&after, &name)["dispatched"], true);
    });
}
