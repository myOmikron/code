//! News Posts: lifecycle, what customers see, validation and access

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use uuid::Uuid;

use crate::models::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::request;
use crate::tests::harness::run;

/// A browser logged in as a new Admin
async fn admin() -> TestClient {
    TestClient::logged_in(&create_account(Role::Admin).await).await
}

/// A title no other test uses
fn unique_title() -> String {
    format!("Beitrag {}", Uuid::new_v4().simple())
}

/// Creates a Draft and returns its uuid
async fn create(client: &mut TestClient, title: &str) -> String {
    client
        .json(
            Method::POST,
            &api("admin/news-posts"),
            &json!({ "title": title, "body": "Am **1. November** keine Abholung." }),
        )
        .await
        .ok_json()
        .as_str()
        .expect("the uuid")
        .to_string()
}

/// The News Post as Admins see it
async fn get(client: &mut TestClient, uuid: &str) -> Value {
    client
        .get(&api(&format!("admin/news-posts/{uuid}")))
        .await
        .ok_json()
}

/// Publishes a News Post, returning it
async fn publish(client: &mut TestClient, uuid: &str) -> Value {
    post_action(client, &format!("admin/news-posts/{uuid}/publish")).await
}

/// Withdraws a News Post, returning it
async fn withdraw(client: &mut TestClient, uuid: &str) -> Value {
    post_action(client, &format!("admin/news-posts/{uuid}/withdraw")).await
}

/// `POST`s an empty body to an action route, returning the News Post it answers with
async fn post_action(client: &mut TestClient, path: &str) -> Value {
    client
        .json(Method::POST, &api(path), &json!({}))
        .await
        .ok_json()
}

/// The publication time of a News Post as Admins see it
fn published_at(post: &Value) -> Option<OffsetDateTime> {
    post["published_at"]
        .as_str()
        .map(|time| OffsetDateTime::parse(time, &Rfc3339).expect("an rfc3339 time"))
}

/// The titles customers see, in order
async fn public_titles() -> Vec<String> {
    TestClient::new()
        .get(&api("shop/news-posts"))
        .await
        .ok_json()["news_posts"]
        .as_array()
        .expect("a list")
        .iter()
        .map(|post| post["title"].as_str().expect("a title").to_string())
        .collect()
}

#[test]
fn a_new_news_post_is_a_draft() {
    run(async {
        let mut admin = admin().await;
        let title = unique_title();
        let uuid = create(&mut admin, &title).await;

        let post = get(&mut admin, &uuid).await;
        assert_eq!(post["title"], title);
        assert_eq!(post["body"], "Am **1. November** keine Abholung.");
        assert_eq!(published_at(&post), None);
    });
}

#[test]
fn publishing_and_withdrawing_move_the_publication_time() {
    run(async {
        let mut admin = admin().await;
        let uuid = create(&mut admin, &unique_title()).await;

        let first =
            published_at(&publish(&mut admin, &uuid).await).expect("published after publish");
        assert_eq!(published_at(&get(&mut admin, &uuid).await), Some(first));

        assert_eq!(published_at(&withdraw(&mut admin, &uuid).await), None);

        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        let second = published_at(&publish(&mut admin, &uuid).await)
            .expect("published after publishing again");
        assert!(second > first, "{second} is not after {first}");
    });
}

#[test]
fn editing_a_published_news_post_keeps_its_publication_time() {
    run(async {
        let mut admin = admin().await;
        let uuid = create(&mut admin, &unique_title()).await;
        let published = published_at(&publish(&mut admin, &uuid).await);

        let edited = admin
            .json(
                Method::PUT,
                &api(&format!("admin/news-posts/{uuid}")),
                &json!({ "title": "Tippfehler behoben", "body": "Neuer Text" }),
            )
            .await
            .ok_json();
        assert_eq!(edited["title"], "Tippfehler behoben");
        assert_eq!(edited["body"], "Neuer Text");
        assert_eq!(published_at(&edited), published);
    });
}

#[test]
fn a_deleted_news_post_is_gone() {
    run(async {
        let mut admin = admin().await;
        let title = unique_title();
        let uuid = create(&mut admin, &title).await;
        publish(&mut admin, &uuid).await;

        let response = admin
            .send(
                request(Method::DELETE, &api(&format!("admin/news-posts/{uuid}")))
                    .body(Default::default())
                    .expect("valid request"),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK, "{response:?}");

        let response = admin.get(&api(&format!("admin/news-posts/{uuid}"))).await;
        assert!(response.status.is_client_error(), "{response:?}");
        assert!(!public_titles().await.contains(&title));
    });
}

#[test]
fn customers_see_published_news_posts_only_newest_first() {
    run(async {
        let mut admin = admin().await;
        let draft = unique_title();
        let older = unique_title();
        let newer = unique_title();
        let withdrawn = unique_title();

        create(&mut admin, &draft).await;
        let uuid = create(&mut admin, &older).await;
        publish(&mut admin, &uuid).await;
        let uuid = create(&mut admin, &newer).await;
        publish(&mut admin, &uuid).await;
        let uuid = create(&mut admin, &withdrawn).await;
        publish(&mut admin, &uuid).await;
        withdraw(&mut admin, &uuid).await;

        let ours: Vec<String> = public_titles()
            .await
            .into_iter()
            .filter(|title| [&draft, &older, &newer, &withdrawn].contains(&title))
            .collect();
        assert_eq!(ours, vec![newer, older]);
    });
}

#[test]
fn customers_do_not_see_who_wrote_a_news_post_or_its_drafts_fields() {
    run(async {
        let mut admin = admin().await;
        let title = unique_title();
        let uuid = create(&mut admin, &title).await;
        publish(&mut admin, &uuid).await;

        let posts = TestClient::new()
            .get(&api("shop/news-posts"))
            .await
            .ok_json();
        let post = posts["news_posts"]
            .as_array()
            .expect("a list")
            .iter()
            .find(|post| post["title"] == title)
            .expect("the published post")
            .clone();
        let mut fields: Vec<&str> = post
            .as_object()
            .expect("an object")
            .keys()
            .map(String::as_str)
            .collect();
        fields.sort_unstable();
        assert_eq!(fields, ["body", "published_at", "title"]);
    });
}

#[test]
fn blank_or_too_long_title_or_body_is_rejected() {
    run(async {
        let mut admin = admin().await;
        let uuid = create(&mut admin, &unique_title()).await;
        let invalid = [
            json!({ "title": "  ", "body": "Text" }),
            json!({ "title": "Titel", "body": " \n " }),
            json!({ "title": "x".repeat(256), "body": "Text" }),
            json!({ "title": "Titel", "body": "x".repeat(20_001) }),
        ];

        for request in invalid {
            let created = admin
                .json(Method::POST, &api("admin/news-posts"), &request)
                .await;
            assert!(
                created.status.is_client_error(),
                "create {request}: {created:?}"
            );

            let updated = admin
                .json(
                    Method::PUT,
                    &api(&format!("admin/news-posts/{uuid}")),
                    &request,
                )
                .await;
            assert!(
                updated.status.is_client_error(),
                "update {request}: {updated:?}"
            );
        }
    });
}

#[test]
fn only_admins_manage_news_posts() {
    run(async {
        let mut verkauf = TestClient::logged_in(&create_account(Role::Verkauf).await).await;
        let mut anonymous = TestClient::new();

        assert_eq!(
            anonymous.get(&api("admin/news-posts")).await.status,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            verkauf.get(&api("admin/news-posts")).await.status,
            StatusCode::FORBIDDEN
        );
        let request = json!({ "title": "Titel", "body": "Text" });
        assert_eq!(
            verkauf
                .json(Method::POST, &api("admin/news-posts"), &request)
                .await
                .status,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            admin().await.get(&api("admin/news-posts")).await.status,
            StatusCode::OK
        );
        assert_eq!(
            anonymous.get(&api("shop/news-posts")).await.status,
            StatusCode::OK
        );
    });
}
