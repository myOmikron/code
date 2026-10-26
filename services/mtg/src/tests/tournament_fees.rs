//! Entry fees: the Owner sets one, every Participant then starts unpaid,
//! Organizers mark them paid, and only the paid are paired; nobody but the
//! Organizers learns who paid

use galvyn::core::re_exports::axum::http::Method;
use serde_json::Value;
use serde_json::json;
use url::Url;

use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::tournament_organizers::add;
use crate::tests::tournament_organizers::organizers_url;
use crate::tests::tournament_participants::add_guest;
use crate::tests::tournament_participants::roster;
use crate::tests::tournament_rounds::Event;
use crate::tests::tournament_rounds::round;
use crate::tests::tournament_rounds::seated;
use crate::tests::tournaments::Fixture;
use crate::tests::tournaments::create;
use crate::tests::tournaments::settings;
use crate::tests::tournaments::tournament_url;

/// Five euros
fn five_euros() -> Value {
    json!({ "amount": 500, "currency": "EUR" })
}

/// Replace the Tournament's settings with `request` as `client`, returning the body
async fn update(client: &mut TestClient, tournament: &str, request: &Value) -> Value {
    client
        .json(Method::PUT, &tournament_url(tournament), request)
        .await
        .ok_json()
}

/// Give the Fixture's Tournament the settings of `visibility` plus `entry_fee`
async fn charge(fixture: &mut Fixture, visibility: &str, entry_fee: Value) -> Value {
    let mut request = settings(visibility);
    request["entry_fee"] = entry_fee;
    update(&mut fixture.owner, &fixture.tournament, &request).await
}

/// Give the Event's Tournament an entry fee of five euros
async fn charge_event(event: &mut Event) {
    event.settings["entry_fee"] = five_euros();
    let request = event.settings.clone();
    let body = update(&mut event.owner, &event.tournament, &request).await;
    assert_eq!(body["entry_fee"], five_euros(), "{body}");
}

/// The url marking `participant` of `tournament` paid
fn paid_url(tournament: &str, participant: &str) -> Url {
    api(&format!(
        "tournaments/{tournament}/participants/{participant}/paid"
    ))
}

/// Mark `participant` paid or unpaid as `client`
async fn mark(client: &mut TestClient, tournament: &str, participant: &str, paid: bool) -> Value {
    client
        .json(
            Method::PUT,
            &paid_url(tournament, participant),
            &json!({ "paid": paid }),
        )
        .await
        .ok_json()
}

/// The paid flags on a participant list, by name
fn unpaid_flags(body: &Value) -> Vec<(String, Value)> {
    body["participants"]
        .as_array()
        .expect("a list of participants")
        .iter()
        .map(|participant| {
            (
                participant["name"].as_str().expect("name").to_string(),
                participant["unpaid"].clone(),
            )
        })
        .collect()
}

/// Whether every Participant on a list hides its paid flag
fn hides_payments(body: &Value) -> bool {
    unpaid_flags(body)
        .iter()
        .all(|(_, unpaid)| unpaid.is_null())
}

#[test]
fn the_owner_sets_an_entry_fee_everybody_reads_and_takes_it_away_again() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let body = fixture.as_owner().await;
        assert_eq!(body["entry_fee"], Value::Null, "{body}");

        let body = charge(&mut fixture, "Public", five_euros()).await;
        assert_eq!(body["entry_fee"], five_euros(), "{body}");
        let url = fixture.url();
        let seen = fixture.stranger.get(&url).await.ok_json();
        assert_eq!(seen["entry_fee"], five_euros(), "{seen}");
        let anonymous = TestClient::new().get(&url).await.ok_json();
        assert_eq!(anonymous["entry_fee"], five_euros(), "{anonymous}");

        let body = charge(&mut fixture, "Public", Value::Null).await;
        assert_eq!(body["entry_fee"], Value::Null, "{body}");
    });
}

#[test]
fn a_tournament_is_created_with_an_entry_fee() {
    run(async {
        let mut owner = TestClient::logged_in(&create_account(Role::Member).await).await;
        let mut request = settings("Private");
        request["entry_fee"] = json!({ "amount": 1250, "currency": "CHF" });
        let created = create(&mut owner, &request).await;
        assert_eq!(
            created["entry_fee"],
            json!({ "amount": 1250, "currency": "CHF" }),
            "{created}"
        );
    });
}

#[test]
fn an_entry_fee_needs_a_positive_amount_and_a_currency_code() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let refused = charge(
            &mut fixture,
            "Public",
            json!({ "amount": 0, "currency": "eu" }),
        )
        .await;
        assert_eq!(refused["result"], "Err", "{refused}");
        assert_eq!(
            refused["error"]["entry_fee_not_positive"], true,
            "{refused}"
        );
        assert_eq!(refused["error"]["unknown_currency"], true, "{refused}");
        let body = fixture.as_owner().await;
        assert_eq!(body["entry_fee"], Value::Null, "{body}");
    });
}

#[test]
fn without_an_entry_fee_nobody_is_unpaid_and_nobody_is_marked_paid() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let added = add_guest(&mut fixture.owner, &fixture.tournament, "Gerda").await;
        assert_eq!(added["unpaid"], false, "{added}");
        let uuid = added["uuid"].as_str().expect("uuid").to_string();

        let listed = roster(&mut fixture.owner, &fixture.tournament).await;
        assert_eq!(
            unpaid_flags(&listed),
            vec![("Gerda".to_string(), json!(false))],
            "{listed}"
        );
        let refused = mark(&mut fixture.owner, &fixture.tournament, &uuid, true).await;
        assert_eq!(refused["error"]["no_entry_fee"], true, "{refused}");
    });
}

#[test]
fn with_an_entry_fee_participants_start_unpaid_until_an_organizer_marks_them_paid() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let before = add_guest(&mut fixture.owner, &fixture.tournament, "Early").await;
        charge(&mut fixture, "Public", five_euros()).await;
        let after = add_guest(&mut fixture.owner, &fixture.tournament, "Late").await;
        assert_eq!(after["unpaid"], true, "{after}");
        let early = before["uuid"].as_str().expect("uuid").to_string();
        let late = after["uuid"].as_str().expect("uuid").to_string();

        let listed = roster(&mut fixture.owner, &fixture.tournament).await;
        assert_eq!(
            unpaid_flags(&listed),
            vec![
                ("Early".to_string(), json!(true)),
                ("Late".to_string(), json!(true)),
            ],
            "{listed}"
        );

        mark(&mut fixture.owner, &fixture.tournament, &late, true).await;
        let listed = roster(&mut fixture.owner, &fixture.tournament).await;
        assert_eq!(
            unpaid_flags(&listed),
            vec![
                ("Early".to_string(), json!(true)),
                ("Late".to_string(), json!(false)),
            ],
            "{listed}"
        );

        mark(&mut fixture.owner, &fixture.tournament, &late, false).await;
        mark(&mut fixture.owner, &fixture.tournament, &early, true).await;
        let listed = roster(&mut fixture.owner, &fixture.tournament).await;
        assert_eq!(
            unpaid_flags(&listed),
            vec![
                ("Early".to_string(), json!(false)),
                ("Late".to_string(), json!(true)),
            ],
            "{listed}"
        );
    });
}

#[test]
fn only_organizers_see_who_paid() {
    run(async {
        let mut fixture = Fixture::new("Unlisted").await;
        let mut request = settings("Unlisted");
        request["entry_fee"] = five_euros();
        request["self_sign_up"] = json!(true);
        let body = update(&mut fixture.owner, &fixture.tournament, &request).await;
        let token = body["share_token"].as_str().expect("token").to_string();
        add_guest(&mut fixture.owner, &fixture.tournament, "Gerda").await;
        let player = create_account(Role::Member).await;
        let mut player_client = TestClient::logged_in(&player).await;
        player_client
            .json(
                Method::POST,
                &api(&format!("shared/tournaments/{token}/sign-up")),
                &json!({}),
            )
            .await
            .ok_json();
        let co_organizer = create_account(Role::Member).await;
        let organizers = organizers_url(&fixture);
        add(&mut fixture.owner, &organizers, &co_organizer.username).await;
        let mut co_organizer_client = TestClient::logged_in(&co_organizer).await;

        let as_owner = roster(&mut fixture.owner, &fixture.tournament).await;
        assert_eq!(unpaid_flags(&as_owner).len(), 2, "{as_owner}");
        assert!(
            unpaid_flags(&as_owner)
                .iter()
                .all(|(_, unpaid)| unpaid == &json!(true)),
            "{as_owner}"
        );
        let as_co_organizer = roster(&mut co_organizer_client, &fixture.tournament).await;
        assert_eq!(
            unpaid_flags(&as_co_organizer),
            unpaid_flags(&as_owner),
            "{as_co_organizer}"
        );

        let as_player = roster(&mut player_client, &fixture.tournament).await;
        assert!(hides_payments(&as_player), "{as_player}");
        let by_link = TestClient::new()
            .get(&api(&format!("shared/tournaments/{token}/participants")))
            .await
            .ok_json();
        assert!(hides_payments(&by_link), "{by_link}");
    });
}

#[test]
fn a_signed_up_account_does_not_learn_its_paid_flag() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let mut request = settings("Public");
        request["entry_fee"] = five_euros();
        request["self_sign_up"] = json!(true);
        update(&mut fixture.owner, &fixture.tournament, &request).await;
        let signed_up = fixture
            .stranger
            .json(
                Method::POST,
                &api(&format!("tournaments/{}/sign-up", fixture.tournament)),
                &json!({}),
            )
            .await
            .ok_json();
        assert_eq!(signed_up["unpaid"], Value::Null, "{signed_up}");
    });
}

#[test]
fn only_organizers_mark_participants_paid() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        charge(&mut fixture, "Public", five_euros()).await;
        let added = add_guest(&mut fixture.owner, &fixture.tournament, "Gerda").await;
        let uuid = added["uuid"].as_str().expect("uuid");

        let refused = fixture
            .stranger
            .json(
                Method::PUT,
                &paid_url(&fixture.tournament, uuid),
                &json!({ "paid": true }),
            )
            .await;
        assert!(!refused.status.is_success(), "{refused:?}");
        let listed = roster(&mut fixture.owner, &fixture.tournament).await;
        assert_eq!(
            unpaid_flags(&listed),
            vec![("Gerda".to_string(), json!(true))]
        );
    });
}

#[test]
fn a_participant_of_another_tournament_is_not_marked_paid() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        charge(&mut fixture, "Public", five_euros()).await;
        let mut other = Fixture::new("Public").await;
        charge(&mut other, "Public", five_euros()).await;
        let added = add_guest(&mut other.owner, &other.tournament, "Gerda").await;
        let uuid = added["uuid"].as_str().expect("uuid");

        let refused = fixture
            .owner
            .json(
                Method::PUT,
                &paid_url(&fixture.tournament, uuid),
                &json!({ "paid": true }),
            )
            .await;
        assert!(!refused.status.is_success(), "{refused:?}");
    });
}

#[test]
fn unpaid_participants_count_towards_the_participant_limit() {
    run(async {
        let mut fixture = Fixture::new("Public").await;
        let mut request = settings("Public");
        request["entry_fee"] = five_euros();
        request["self_sign_up"] = json!(true);
        request["participant_limit"] = json!(2);
        update(&mut fixture.owner, &fixture.tournament, &request).await;
        let sign_up_url = api(&format!("tournaments/{}/sign-up", fixture.tournament));
        for _ in 0..2 {
            let mut client = TestClient::logged_in(&create_account(Role::Member).await).await;
            client
                .json(Method::POST, &sign_up_url, &json!({}))
                .await
                .ok_json();
        }

        let listed = roster(&mut fixture.owner, &fixture.tournament).await;
        assert!(
            unpaid_flags(&listed)
                .iter()
                .all(|(_, unpaid)| unpaid == &json!(true)),
            "{listed}"
        );
        let refused = fixture
            .stranger
            .json(Method::POST, &sign_up_url, &json!({}))
            .await
            .ok_json();
        assert_eq!(refused["error"]["full"], true, "{refused}");
    });
}

#[test]
fn pairing_leaves_the_unpaid_out_and_the_suggestion_counts_only_the_paid() {
    run(async {
        let mut event = Event::new("Three", 0).await;
        charge_event(&mut event).await;
        for index in 0..5 {
            event.add_guest(&format!("Guest {index}")).await;
        }
        let rounds = event.rounds().await;
        assert_eq!(
            rounds["suggested_swiss_rounds"], 1,
            "nobody paid yet: {rounds}"
        );

        let unpaid = event.players[4].clone();
        let paid: Vec<String> = event.players[..4].to_vec();
        let tournament = event.tournament.clone();
        for participant in &paid {
            mark(&mut event.owner, &tournament, participant, true).await;
        }
        let rounds = event.rounds().await;
        assert_eq!(rounds["suggested_swiss_rounds"], 2, "{rounds}");

        event.pair().await;
        let rounds = event.rounds().await;
        let mut seated_now: Vec<String> = round(&rounds, 1)["matches"]
            .as_array()
            .expect("a list of matches")
            .iter()
            .flat_map(seated)
            .collect();
        seated_now.sort();
        let mut expected = paid.clone();
        expected.sort();
        assert_eq!(seated_now, expected, "{rounds}");
        assert!(!seated_now.contains(&unpaid), "{rounds}");
    });
}

#[test]
fn marking_a_participant_paid_discards_the_previewed_round() {
    run(async {
        let mut event = Event::new("Three", 0).await;
        charge_event(&mut event).await;
        for index in 0..3 {
            event.add_guest(&format!("Guest {index}")).await;
        }
        let tournament = event.tournament.clone();
        let players = event.players.clone();
        for participant in &players[..2] {
            mark(&mut event.owner, &tournament, participant, true).await;
        }
        event.pair().await;
        assert_eq!(round(&event.rounds().await, 1)["state"], "Previewed");

        mark(&mut event.owner, &tournament, &players[2], true).await;
        let rounds = event.rounds().await;
        assert_eq!(rounds["rounds"], json!([]), "{rounds}");
        event.pair().await;
        let rounds = event.rounds().await;
        let seated_now: Vec<String> = round(&rounds, 1)["matches"]
            .as_array()
            .expect("a list of matches")
            .iter()
            .flat_map(seated)
            .collect();
        assert_eq!(seated_now.len(), 3, "a Bye seats the third: {rounds}");
    });
}

#[test]
fn too_few_paid_participants_are_not_paired() {
    run(async {
        let mut event = Event::new("Three", 0).await;
        charge_event(&mut event).await;
        for index in 0..4 {
            event.add_guest(&format!("Guest {index}")).await;
        }
        let tournament = event.tournament.clone();
        let first = event.players[0].clone();
        mark(&mut event.owner, &tournament, &first, true).await;

        let refused = event.pair().await;
        assert_eq!(refused["error"]["too_few_participants"], true, "{refused}");
    });
}

#[test]
fn an_entry_fee_is_neither_taken_up_nor_dropped_once_the_first_round_started() {
    run(async {
        let mut event = Event::new("Three", 2).await;
        event.pair().await;
        event.start(1).await;
        let tournament = event.tournament.clone();

        let mut changed = event.settings.clone();
        changed["entry_fee"] = five_euros();
        let refused = update(&mut event.owner, &tournament, &changed).await;
        assert_eq!(refused["error"]["rules_locked"], true, "{refused}");
    });
}

#[test]
fn the_amount_of_an_entry_fee_changes_after_the_first_round_started() {
    run(async {
        let mut event = Event::new("Three", 0).await;
        charge_event(&mut event).await;
        for index in 0..2 {
            event.add_guest(&format!("Guest {index}")).await;
        }
        let tournament = event.tournament.clone();
        let players = event.players.clone();
        for participant in &players {
            mark(&mut event.owner, &tournament, participant, true).await;
        }
        event.pair().await;
        event.start(1).await;

        let mut changed = event.settings.clone();
        changed["entry_fee"] = json!({ "amount": 700, "currency": "EUR" });
        let body = update(&mut event.owner, &tournament, &changed).await;
        assert_eq!(
            body["entry_fee"],
            json!({ "amount": 700, "currency": "EUR" }),
            "{body}"
        );
        changed["entry_fee"] = Value::Null;
        let refused = update(&mut event.owner, &tournament, &changed).await;
        assert_eq!(refused["error"]["rules_locked"], true, "{refused}");
    });
}

#[test]
fn a_late_participant_pays_before_it_is_paired() {
    run(async {
        let mut event = Event::new("Three", 0).await;
        charge_event(&mut event).await;
        for index in 0..2 {
            event.add_guest(&format!("Guest {index}")).await;
        }
        let tournament = event.tournament.clone();
        let players = event.players.clone();
        for participant in &players {
            mark(&mut event.owner, &tournament, participant, true).await;
        }
        event.play_round().await;
        event.end(1).await;
        let late = event.add_guest("Late").await;

        event.pair().await;
        let rounds = event.rounds().await;
        let seated_now: Vec<String> = round(&rounds, 2)["matches"]
            .as_array()
            .expect("a list of matches")
            .iter()
            .flat_map(seated)
            .collect();
        assert!(!seated_now.contains(&late), "{rounds}");

        mark(&mut event.owner, &tournament, &late, true).await;
        event.pair().await;
        let rounds = event.rounds().await;
        let seated_now: Vec<String> = round(&rounds, 2)["matches"]
            .as_array()
            .expect("a list of matches")
            .iter()
            .flat_map(seated)
            .collect();
        assert!(seated_now.contains(&late), "{rounds}");
    });
}

#[test]
fn payments_are_no_longer_taken_once_the_tournament_is_over() {
    run(async {
        let mut event = Event::new("Three", 0).await;
        charge_event(&mut event).await;
        let guest = event.add_guest("Gerda").await;
        let url = event.url("cancel");
        event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();

        let tournament = event.tournament.clone();
        let refused = mark(&mut event.owner, &tournament, &guest, true).await;
        assert_eq!(refused["error"]["tournament_over"], true, "{refused}");
    });
}
