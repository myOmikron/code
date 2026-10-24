//! The printing a card named by its name alone resolves to: its Default printing

use galvyn::core::Module;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::rorm::Database;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::models::printing::Printing;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::utils::catalog_sync::printing_from_json;

/// One printing of a test card, as far as choosing a Default printing reads it
struct Print<'a> {
    /// Release date, `YYYY-MM-DD`
    released: &'a str,
    /// Collector number as printed
    number: &'a str,
    /// Whether it is legal in some format
    legal: bool,
    /// Scryfall's finishes
    finishes: &'a [&'a str],
    /// The non-foil EUR price, as Scryfall writes it
    eur: Option<&'a str>,
    /// Scryfall's language code
    lang: &'a str,
}

impl Default for Print<'_> {
    fn default() -> Self {
        Self {
            released: "2020-01-01",
            number: "1",
            legal: true,
            finishes: &["nonfoil", "foil"],
            eur: None,
            lang: "en",
        }
    }
}

/// A card name no other test files a printing under
fn unique(name: &str) -> String {
    format!("{name} {}", Uuid::new_v4().simple())
}

/// Files one printing of `name` into the catalog and answers its id
async fn file(name: &str, print: Print<'_>) -> Uuid {
    let id = Uuid::new_v4();
    let legalities = if print.legal {
        json!({ "commander": "legal" })
    } else {
        json!({ "commander": "not_legal" })
    };
    let printing = printing_from_json(
        &json!({
            "id": id,
            "oracle_id": Uuid::new_v4(),
            "name": name,
            "set": "tdp",
            "set_name": "Test Default Printing",
            "collector_number": print.number,
            "lang": print.lang,
            "released_at": print.released,
            "legalities": legalities,
            "finishes": print.finishes,
            "prices": { "eur": print.eur, "eur_foil": null },
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

/// Resolves one lookup and answers the printing it was placed on
async fn resolve(client: &mut TestClient, lookup: Value) -> Option<Uuid> {
    let body = client
        .json(
            Method::POST,
            &api("printings/resolve"),
            &json!({ "lookups": [lookup] }),
        )
        .await
        .ok_json();

    body["printings"]
        .as_array()
        .expect("a list")
        .first()
        .map(|printing| {
            printing["id"]
                .as_str()
                .and_then(|id| id.parse().ok())
                .expect("an id")
        })
}

/// Resolves `name` by its name alone
async fn by_name(client: &mut TestClient, name: &str) -> Option<Uuid> {
    resolve(client, json!({ "name": name })).await
}

/// A client of a fresh member
async fn member() -> TestClient {
    let member = create_account(Role::Member).await;
    TestClient::logged_in(&member).await
}

#[test]
fn the_newest_printing_wins() {
    run(async {
        let mut client = member().await;
        let name = unique("Newest Wins");
        file(
            &name,
            Print {
                released: "1994-01-01",
                number: "1",
                ..Print::default()
            },
        )
        .await;
        let newest = file(
            &name,
            Print {
                released: "2021-06-01",
                number: "2",
                ..Print::default()
            },
        )
        .await;
        file(
            &name,
            Print {
                released: "2010-01-01",
                number: "3",
                ..Print::default()
            },
        )
        .await;

        assert_eq!(by_name(&mut client, &name).await, Some(newest));
    });
}

#[test]
fn of_equally_new_printings_the_cheapest_wins() {
    run(async {
        let mut client = member().await;
        let name = unique("Cheapest Wins");
        file(
            &name,
            Print {
                number: "1",
                eur: Some("3.50"),
                ..Print::default()
            },
        )
        .await;
        let cheapest = file(
            &name,
            Print {
                number: "2",
                eur: Some("0.20"),
                ..Print::default()
            },
        )
        .await;
        file(
            &name,
            Print {
                number: "3",
                eur: None,
                ..Print::default()
            },
        )
        .await;

        assert_eq!(by_name(&mut client, &name).await, Some(cheapest));
    });
}

#[test]
fn an_unpriced_printing_loses_to_a_priced_one() {
    run(async {
        let mut client = member().await;
        let name = unique("Unpriced Last");
        file(
            &name,
            Print {
                number: "1",
                eur: None,
                ..Print::default()
            },
        )
        .await;
        let priced = file(
            &name,
            Print {
                number: "9",
                eur: Some("12.00"),
                ..Print::default()
            },
        )
        .await;

        assert_eq!(by_name(&mut client, &name).await, Some(priced));
    });
}

#[test]
fn at_equal_age_and_price_the_lowest_collector_number_wins() {
    run(async {
        let mut client = member().await;
        let name = unique("Lowest Number");
        file(
            &name,
            Print {
                number: "12",
                ..Print::default()
            },
        )
        .await;
        let lowest = file(
            &name,
            Print {
                number: "3",
                ..Print::default()
            },
        )
        .await;
        file(
            &name,
            Print {
                number: "250",
                ..Print::default()
            },
        )
        .await;

        assert_eq!(by_name(&mut client, &name).await, Some(lowest));
    });
}

#[test]
fn a_printing_released_in_the_future_is_never_picked() {
    run(async {
        let mut client = member().await;
        let name = unique("Not Yet Out");
        let released = file(
            &name,
            Print {
                released: "2020-01-01",
                number: "1",
                ..Print::default()
            },
        )
        .await;
        file(
            &name,
            Print {
                released: "2999-01-01",
                number: "2",
                ..Print::default()
            },
        )
        .await;

        assert_eq!(by_name(&mut client, &name).await, Some(released));
    });
}

#[test]
fn a_card_only_printed_in_the_future_is_not_placed() {
    run(async {
        let mut client = member().await;
        let name = unique("Only Previewed");
        file(
            &name,
            Print {
                released: "2999-01-01",
                ..Print::default()
            },
        )
        .await;

        assert_eq!(by_name(&mut client, &name).await, None);
    });
}

#[test]
fn a_named_set_still_finds_a_printing_released_in_the_future() {
    run(async {
        let mut client = member().await;
        let name = unique("Previewed In Set");
        let future = file(
            &name,
            Print {
                released: "2999-01-01",
                ..Print::default()
            },
        )
        .await;

        let found = resolve(&mut client, json!({ "name": name, "set_code": "tdp" })).await;
        assert_eq!(found, Some(future));
    });
}

#[test]
fn a_non_foil_printing_legal_nowhere_beats_a_legal_foil_only_one() {
    run(async {
        let mut client = member().await;
        let name = unique("Foil Never Picked");
        let nonfoil = file(
            &name,
            Print {
                released: "2015-01-01",
                number: "1",
                legal: false,
                ..Print::default()
            },
        )
        .await;
        file(
            &name,
            Print {
                released: "2024-01-01",
                number: "2",
                finishes: &["foil"],
                ..Print::default()
            },
        )
        .await;

        assert_eq!(by_name(&mut client, &name).await, Some(nonfoil));
    });
}

#[test]
fn a_foil_only_printing_loses_to_an_older_non_foil_one() {
    run(async {
        let mut client = member().await;
        let name = unique("Foil Skipped");
        let nonfoil = file(
            &name,
            Print {
                released: "2018-01-01",
                number: "1",
                ..Print::default()
            },
        )
        .await;
        file(
            &name,
            Print {
                released: "2024-01-01",
                number: "2",
                finishes: &["foil"],
                ..Print::default()
            },
        )
        .await;
        file(
            &name,
            Print {
                released: "2023-01-01",
                number: "3",
                finishes: &["etched"],
                ..Print::default()
            },
        )
        .await;

        assert_eq!(by_name(&mut client, &name).await, Some(nonfoil));
    });
}

#[test]
fn a_foil_only_card_gets_its_newest_printing() {
    run(async {
        let mut client = member().await;
        let name = unique("Only Foil");
        file(
            &name,
            Print {
                released: "2012-01-01",
                number: "1",
                finishes: &["foil"],
                ..Print::default()
            },
        )
        .await;
        let newest = file(
            &name,
            Print {
                released: "2022-01-01",
                number: "2",
                finishes: &["foil"],
                ..Print::default()
            },
        )
        .await;

        assert_eq!(by_name(&mut client, &name).await, Some(newest));
    });
}

#[test]
fn a_newer_printing_legal_nowhere_loses_to_a_legal_one() {
    run(async {
        let mut client = member().await;
        let name = unique("Legal Wins");
        let legal = file(
            &name,
            Print {
                released: "2015-01-01",
                number: "1",
                ..Print::default()
            },
        )
        .await;
        file(
            &name,
            Print {
                released: "2024-01-01",
                number: "2",
                legal: false,
                ..Print::default()
            },
        )
        .await;

        assert_eq!(by_name(&mut client, &name).await, Some(legal));
    });
}

#[test]
fn the_language_asked_for_beats_a_newer_english_printing() {
    run(async {
        let mut client = member().await;
        let name = unique("German First");
        let german = file(
            &name,
            Print {
                released: "2015-01-01",
                number: "1",
                lang: "de",
                ..Print::default()
            },
        )
        .await;
        file(
            &name,
            Print {
                released: "2024-01-01",
                number: "2",
                ..Print::default()
            },
        )
        .await;

        let found = resolve(&mut client, json!({ "name": name, "lang": "de" })).await;
        assert_eq!(found, Some(german));
    });
}

#[test]
fn a_named_set_and_collector_number_still_win() {
    run(async {
        let mut client = member().await;
        let name = unique("Coordinate Wins");
        let number = Uuid::new_v4().simple().to_string()[..8].to_string();
        let oldest = file(
            &name,
            Print {
                released: "1994-01-01",
                number: &number,
                ..Print::default()
            },
        )
        .await;
        file(
            &name,
            Print {
                released: "2021-06-01",
                number: "8",
                ..Print::default()
            },
        )
        .await;

        let found = resolve(
            &mut client,
            json!({ "name": name, "set_code": "tdp", "collector_number": number }),
        )
        .await;
        assert_eq!(found, Some(oldest));
    });
}

#[test]
fn a_printing_id_still_wins() {
    run(async {
        let mut client = member().await;
        let name = unique("Id Wins");
        let future = file(
            &name,
            Print {
                released: "2999-01-01",
                number: "1",
                finishes: &["foil"],
                legal: false,
                ..Print::default()
            },
        )
        .await;
        file(
            &name,
            Print {
                released: "2021-06-01",
                number: "2",
                ..Print::default()
            },
        )
        .await;

        let found = resolve(&mut client, json!({ "id": future, "name": name })).await;
        assert_eq!(found, Some(future));
    });
}
