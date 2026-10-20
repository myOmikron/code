//! Which bracket rules a printing counts towards, asked before it is added

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::rorm::Database;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::models::printing::Printing;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::utils::catalog_sync::printing_from_json;

/// Files one card into the catalog and answers its id
async fn file(name: &str, oracle_text: &str, game_changer: bool) -> Uuid {
    let id = Uuid::new_v4();
    let printing = printing_from_json(
        &json!({
            "id": id,
            "oracle_id": Uuid::new_v4(),
            "name": name,
            "set": "tst",
            "set_name": "Test",
            "collector_number": &id.simple().to_string()[..8],
            "oracle_text": oracle_text,
            "game_changer": game_changer,
        })
        .to_string(),
    );
    let mut tx = Database::global()
        .start_transaction()
        .await
        .expect("start a transaction");
    Printing::upsert_many(&mut tx, &[printing])
        .await
        .expect("file the card");
    tx.commit().await.expect("commit");
    id
}

#[test]
fn only_flagged_printings_come_back() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&member).await;
        let tutor = file("Demonic Tutor", "Search your library for a card.", true).await;
        let armageddon = file("Armageddon", "Destroy all lands.", false).await;
        let warp = file(
            "Time Warp",
            "Target player takes an extra turn after this one.",
            false,
        )
        .await;
        let forest = file("Forest", "", false).await;

        let body = client
            .json(
                Method::POST,
                &api("printings/bracket-flags"),
                &json!({ "printings": [tutor, armageddon, warp, forest, Uuid::new_v4()] }),
            )
            .await
            .ok_json();

        let mut printings = body["printings"].as_array().expect("a list").clone();
        printings.sort_by_key(|entry| entry["id"].as_str().map(str::to_string));
        let mut expected = vec![
            json!({ "id": tutor, "game_changer": true, "mass_land_denial": false, "extra_turns": false }),
            json!({ "id": armageddon, "game_changer": false, "mass_land_denial": true, "extra_turns": false }),
            json!({ "id": warp, "game_changer": false, "mass_land_denial": false, "extra_turns": true }),
        ];
        expected.sort_by_key(|entry| entry["id"].as_str().map(str::to_string));
        assert_eq!(printings, expected);
    });
}

#[test]
fn too_many_printings_are_refused() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&member).await;
        let printings: Vec<Uuid> = (0..501).map(|_| Uuid::new_v4()).collect();

        let response = client
            .json(
                Method::POST,
                &api("printings/bracket-flags"),
                &json!({ "printings": printings }),
            )
            .await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST);
    });
}

#[test]
fn an_anonymous_request_is_refused() {
    run(async {
        let response = TestClient::new()
            .json(
                Method::POST,
                &api("printings/bracket-flags"),
                &json!({ "printings": [] }),
            )
            .await;
        assert_eq!(response.status, StatusCode::UNAUTHORIZED);
    });
}
