//! Items: the Bakery Article Number Admins maintain, and who sees it

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;

/// A browser logged in as a new Admin
async fn admin() -> TestClient {
    TestClient::logged_in(&create_account(Role::Admin).await).await
}

/// An active Item request named `name` with the given Bakery Article Number
fn item(name: &str, bakery_article_number: Option<&str>) -> Value {
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
async fn create(client: &mut TestClient, request: &Value) -> String {
    client
        .json(Method::POST, &api("admin/items"), request)
        .await
        .ok_json()
        .as_str()
        .expect("the uuid")
        .to_string()
}

/// Updates an Item, expecting success
async fn update(client: &mut TestClient, uuid: &str, request: &Value) {
    let response = client
        .json(Method::PUT, &api(&format!("admin/items/{uuid}")), request)
        .await;
    assert_eq!(response.status, StatusCode::OK, "{response:?}");
}

/// The Item as the admin list shows it
async fn listed(client: &mut TestClient, uuid: &str) -> Value {
    client.get(&api("admin/items")).await.ok_json()["items"]
        .as_array()
        .expect("a list")
        .iter()
        .find(|item| item["uuid"] == uuid)
        .unwrap_or_else(|| panic!("{uuid} is not listed"))
        .clone()
}

#[test]
fn an_item_keeps_its_bakery_article_number() {
    run(async {
        let mut admin = admin().await;
        let name = unique_name();
        let uuid = create(&mut admin, &item(&name, Some("00412"))).await;
        assert_eq!(
            listed(&mut admin, &uuid).await["bakery_article_number"],
            "00412"
        );

        update(&mut admin, &uuid, &item(&name, Some("B-17"))).await;
        assert_eq!(
            listed(&mut admin, &uuid).await["bakery_article_number"],
            "B-17"
        );
    });
}

#[test]
fn two_items_may_share_a_bakery_article_number() {
    run(async {
        let mut admin = admin().await;
        let first = create(&mut admin, &item(&unique_name(), Some("00412"))).await;
        let second = create(&mut admin, &item(&unique_name(), Some("00412"))).await;

        assert_eq!(
            listed(&mut admin, &first).await["bakery_article_number"],
            "00412"
        );
        assert_eq!(
            listed(&mut admin, &second).await["bakery_article_number"],
            "00412"
        );
    });
}

#[test]
fn surrounding_whitespace_is_trimmed_and_blank_means_none() {
    run(async {
        let mut admin = admin().await;
        let trimmed = create(&mut admin, &item(&unique_name(), Some("  00412 \t"))).await;
        assert_eq!(
            listed(&mut admin, &trimmed).await["bakery_article_number"],
            "00412"
        );

        let blank = create(&mut admin, &item(&unique_name(), Some("   "))).await;
        assert_eq!(
            listed(&mut admin, &blank).await["bakery_article_number"],
            Value::Null
        );

        let missing = create(&mut admin, &item(&unique_name(), None)).await;
        assert_eq!(
            listed(&mut admin, &missing).await["bakery_article_number"],
            Value::Null
        );
    });
}

#[test]
fn a_bakery_article_number_longer_than_32_characters_is_rejected() {
    run(async {
        let mut admin = admin().await;
        let name = unique_name();
        let uuid = create(&mut admin, &item(&name, Some(&"1".repeat(32)))).await;
        let too_long = item(&name, Some(&"1".repeat(33)));

        let created = admin
            .json(Method::POST, &api("admin/items"), &too_long)
            .await;
        assert!(created.status.is_client_error(), "create: {created:?}");

        let updated = admin
            .json(Method::PUT, &api(&format!("admin/items/{uuid}")), &too_long)
            .await;
        assert!(updated.status.is_client_error(), "update: {updated:?}");
        assert_eq!(
            listed(&mut admin, &uuid).await["bakery_article_number"],
            "1".repeat(32)
        );
    });
}

#[test]
fn clearing_the_bakery_article_number_removes_it() {
    run(async {
        let mut admin = admin().await;
        let name = unique_name();
        let uuid = create(&mut admin, &item(&name, Some("00412"))).await;

        update(&mut admin, &uuid, &item(&name, Some(""))).await;
        assert_eq!(
            listed(&mut admin, &uuid).await["bakery_article_number"],
            Value::Null
        );

        update(&mut admin, &uuid, &item(&name, Some("00412"))).await;
        update(&mut admin, &uuid, &item(&name, None)).await;
        assert_eq!(
            listed(&mut admin, &uuid).await["bakery_article_number"],
            Value::Null
        );
    });
}

#[test]
fn customers_never_see_the_bakery_article_number() {
    run(async {
        let mut admin = admin().await;
        let name = unique_name();
        let number = format!("NR{}", &Uuid::new_v4().simple().to_string()[..12]);
        let uuid = create(&mut admin, &item(&name, Some(&number))).await;

        let response = TestClient::new().get(&api("shop/items")).await;
        let items = response.ok_json();
        let shown = items["items"]
            .as_array()
            .expect("a list")
            .iter()
            .find(|item| item["uuid"] == uuid.as_str())
            .expect("the active Item is in the shop");
        assert!(
            shown.get("bakery_article_number").is_none(),
            "shop item: {shown}"
        );
        assert!(
            !String::from_utf8_lossy(&response.body).contains(&number),
            "the shop leaks the number"
        );
    });
}

#[test]
fn only_admins_manage_items() {
    run(async {
        let mut verkauf = TestClient::logged_in(&create_account(Role::Verkauf).await).await;
        let mut anonymous = TestClient::new();
        let request = item(&unique_name(), Some("00412"));
        let uuid = create(&mut admin().await, &request).await;
        let item_url = api(&format!("admin/items/{uuid}"));

        assert_eq!(
            anonymous.get(&api("admin/items")).await.status,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            anonymous
                .json(Method::POST, &api("admin/items"), &request)
                .await
                .status,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            anonymous
                .json(Method::PUT, &item_url, &request)
                .await
                .status,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            verkauf.get(&api("admin/items")).await.status,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            verkauf
                .json(Method::POST, &api("admin/items"), &request)
                .await
                .status,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            verkauf.json(Method::PUT, &item_url, &request).await.status,
            StatusCode::FORBIDDEN
        );
    });
}
