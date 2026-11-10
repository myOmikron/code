//! MPCFill favorites: images and drives an account starred

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;

use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;

/// An image as MPCFill describes it
fn image(drive_id: &str, file_name: &str, source: &str) -> Value {
    json!({ "drive_id": drive_id, "file_name": file_name, "source": source })
}

/// Stars `image` for `face`, returning the favorite's uuid
async fn star(client: &mut TestClient, face: Option<&str>, image: Value) -> String {
    let body = client
        .json(
            Method::PUT,
            &api("mpcfill/favorites/images"),
            &json!({ "face": face, "image": image }),
        )
        .await
        .ok_json();
    body["uuid"].as_str().expect("a uuid").to_owned()
}

/// Every starred image as `face/drive_id`, newest first
async fn starred(client: &mut TestClient) -> Vec<String> {
    let body = client.get(&api("mpcfill/favorites")).await.ok_json();
    body["images"]
        .as_array()
        .expect("a list")
        .iter()
        .map(|favorite| {
            format!(
                "{}/{}",
                favorite["face"].as_str().unwrap_or("back"),
                favorite["image"]["drive_id"].as_str().expect("an id")
            )
        })
        .collect()
}

#[test]
fn starring_lists_newest_first_and_unstarring_removes() {
    run(async {
        let mut client = TestClient::logged_in(&create_account(Role::Member).await).await;

        star(&mut client, Some("Sol Ring"), image("a", "a.png", "A")).await;
        let b = star(&mut client, Some("Sol Ring"), image("b", "b.png", "B")).await;
        star(&mut client, None, image("back", "back.png", "A")).await;
        assert_eq!(
            starred(&mut client).await,
            ["back/back", "Sol Ring/b", "Sol Ring/a"]
        );

        star(&mut client, Some("Sol Ring"), image("a", "a.png", "A")).await;
        assert_eq!(
            starred(&mut client).await,
            ["Sol Ring/a", "back/back", "Sol Ring/b"]
        );

        client
            .json(
                Method::DELETE,
                &api(&format!("mpcfill/favorites/images/{b}")),
                &json!({}),
            )
            .await
            .ok_json();
        assert_eq!(starred(&mut client).await, ["Sol Ring/a", "back/back"]);
    });
}

#[test]
fn one_image_can_be_starred_for_two_faces() {
    run(async {
        let mut client = TestClient::logged_in(&create_account(Role::Member).await).await;

        star(&mut client, Some("Fire // Ice"), image("x", "x.png", "A")).await;
        star(&mut client, None, image("x", "x.png", "A")).await;
        assert_eq!(starred(&mut client).await, ["back/x", "Fire // Ice/x"]);
    });
}

#[test]
fn a_replacement_takes_over_the_star_and_keeps_its_date() {
    run(async {
        let mut client = TestClient::logged_in(&create_account(Role::Member).await).await;

        let old = star(&mut client, Some("Sol Ring"), image("old", "a.png", "A")).await;
        star(&mut client, Some("Sol Ring"), image("new", "a.png", "A")).await;
        star(&mut client, Some("Sol Ring"), image("other", "b.png", "B")).await;

        client
            .json(
                Method::PUT,
                &api(&format!("mpcfill/favorites/images/{old}/replacement")),
                &json!({ "image": image("new", "a.png", "A") }),
            )
            .await
            .ok_json();

        assert_eq!(
            starred(&mut client).await,
            ["Sol Ring/other", "Sol Ring/new"]
        );
        let body = client.get(&api("mpcfill/favorites")).await.ok_json();
        assert_eq!(body["images"][1]["uuid"], old.as_str(), "{body}");
    });
}

#[test]
fn drives_keep_their_order_once_each() {
    run(async {
        let mut client = TestClient::logged_in(&create_account(Role::Member).await).await;

        client
            .json(
                Method::PUT,
                &api("mpcfill/favorites/drives"),
                &json!({ "sources": ["Drive B", "Drive A", "Drive B"] }),
            )
            .await
            .ok_json();
        let body = client.get(&api("mpcfill/favorites")).await.ok_json();
        assert_eq!(body["drives"], json!(["Drive B", "Drive A"]), "{body}");

        let many: Vec<String> = (0..65).map(|n| format!("Drive {n}")).collect();
        let refused = client
            .json(
                Method::PUT,
                &api("mpcfill/favorites/drives"),
                &json!({ "sources": many }),
            )
            .await;
        assert_eq!(refused.status, StatusCode::BAD_REQUEST);
    });
}

#[test]
fn favorites_are_the_accounts_own() {
    run(async {
        let mut mine = TestClient::logged_in(&create_account(Role::Member).await).await;
        let mut theirs = TestClient::logged_in(&create_account(Role::Member).await).await;

        let a = star(&mut mine, Some("Sol Ring"), image("a", "a.png", "A")).await;
        mine.json(
            Method::PUT,
            &api("mpcfill/favorites/drives"),
            &json!({ "sources": ["A"] }),
        )
        .await
        .ok_json();

        let body = theirs.get(&api("mpcfill/favorites")).await.ok_json();
        assert_eq!(body, json!({ "images": [], "drives": [] }));

        theirs
            .json(
                Method::DELETE,
                &api(&format!("mpcfill/favorites/images/{a}")),
                &json!({}),
            )
            .await
            .ok_json();
        theirs
            .json(
                Method::PUT,
                &api(&format!("mpcfill/favorites/images/{a}/replacement")),
                &json!({ "image": image("b", "b.png", "B") }),
            )
            .await
            .ok_json();
        assert_eq!(starred(&mut mine).await, ["Sol Ring/a"]);
    });
}

#[test]
fn favorites_need_a_login() {
    run(async {
        let mut guest = TestClient::new();
        let response = guest.get(&api("mpcfill/favorites")).await;
        assert_eq!(response.status, StatusCode::UNAUTHORIZED);
    });
}
