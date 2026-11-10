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
    json!({ "drive_id": drive_id, "file_name": file_name, "source": source, "dpi": 800, "size": 4_000_000 })
}

/// Stars `image` for `face`
async fn star(client: &mut TestClient, face: Option<&str>, image: Value) {
    client
        .json(
            Method::PUT,
            &api("mpcfill/favorites/images"),
            &json!({ "face": face, "image": image }),
        )
        .await
        .ok_json();
}

/// The drive ids of the starred images, newest first
async fn starred(client: &mut TestClient) -> Vec<String> {
    let body = client.get(&api("mpcfill/favorites")).await.ok_json();
    body["images"]
        .as_array()
        .expect("a list")
        .iter()
        .map(|favorite| {
            favorite["image"]["drive_id"]
                .as_str()
                .expect("an id")
                .to_owned()
        })
        .collect()
}

#[test]
fn starring_lists_newest_first_and_unstarring_removes() {
    run(async {
        let mut client = TestClient::logged_in(&create_account(Role::Member).await).await;

        star(
            &mut client,
            Some("Sol Ring"),
            image("a", "Sol Ring.png", "Drive A"),
        )
        .await;
        star(
            &mut client,
            Some("Sol Ring"),
            image("b", "Sol Ring (2).png", "Drive B"),
        )
        .await;
        star(&mut client, None, image("back", "Back.png", "Drive A")).await;
        assert_eq!(starred(&mut client).await, ["back", "b", "a"]);

        star(
            &mut client,
            Some("Sol Ring"),
            image("a", "Sol Ring.png", "Drive A"),
        )
        .await;
        assert_eq!(starred(&mut client).await, ["a", "back", "b"]);

        let body = client.get(&api("mpcfill/favorites")).await.ok_json();
        assert_eq!(body["images"][1]["face"], Value::Null, "{body}");
        assert_eq!(body["images"][0]["face"], "Sol Ring", "{body}");

        client
            .json(
                Method::DELETE,
                &api("mpcfill/favorites/images/b"),
                &json!({}),
            )
            .await
            .ok_json();
        assert_eq!(starred(&mut client).await, ["a", "back"]);
    });
}

#[test]
fn a_replacement_takes_over_the_star() {
    run(async {
        let mut client = TestClient::logged_in(&create_account(Role::Member).await).await;

        star(
            &mut client,
            Some("Sol Ring"),
            image("old", "Sol Ring.png", "Drive A"),
        )
        .await;
        star(
            &mut client,
            Some("Sol Ring"),
            image("other", "Sol Ring (2).png", "Drive B"),
        )
        .await;

        client
            .json(
                Method::PUT,
                &api("mpcfill/favorites/images/old/replacement"),
                &json!({ "image": image("new", "Sol Ring.png", "Drive A") }),
            )
            .await
            .ok_json();
        assert_eq!(starred(&mut client).await, ["other", "new"]);

        client
            .json(
                Method::PUT,
                &api("mpcfill/favorites/images/new/replacement"),
                &json!({ "image": image("other", "Sol Ring (2).png", "Drive B") }),
            )
            .await
            .ok_json();
        assert_eq!(starred(&mut client).await, ["other"]);
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

        star(
            &mut mine,
            Some("Sol Ring"),
            image("a", "Sol Ring.png", "Drive A"),
        )
        .await;
        mine.json(
            Method::PUT,
            &api("mpcfill/favorites/drives"),
            &json!({ "sources": ["Drive A"] }),
        )
        .await
        .ok_json();

        let body = theirs.get(&api("mpcfill/favorites")).await.ok_json();
        assert_eq!(body, json!({ "images": [], "drives": [] }));

        theirs
            .json(
                Method::DELETE,
                &api("mpcfill/favorites/images/a"),
                &json!({}),
            )
            .await
            .ok_json();
        assert_eq!(starred(&mut mine).await, ["a"]);
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
