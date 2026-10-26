//! "Round paired" pushes: when a Round starts, every Account Participant in
//! it gets a push naming its table and Seat on each subscribed device, unless
//! it turned tournament pushes off. Guests and the preview push nobody.
//!
//! A disputed Result pushes the Match's other Participants and the
//! Organizers; starting the Top cut pushes every Participant in it once.
//! A Tournament entered afterwards pushes nobody.

use galvyn::core::re_exports::axum::http::Method;
use serde_json::Value;
use serde_json::json;

use crate::models::account::Role;
use crate::models::push::PushLanguage;
use crate::modules::web_push::PushMessage;
use crate::tests::harness::TestClient;
use crate::tests::harness::create_account;
use crate::tests::harness::pushes;
use crate::tests::harness::run;
use crate::tests::push::new_endpoint;
use crate::tests::push::set_tournament_pushes;
use crate::tests::push::subscribe;
use crate::tests::tournament_afterwards::entered;
use crate::tests::tournament_organizers::add;
use crate::tests::tournament_rounds::Event;
use crate::tests::tournament_rounds::matches;
use crate::tests::tournament_rounds::round;
use crate::tests::tournament_top_cut::set_swiss_rounds;
use crate::tests::tournament_top_cut::set_top_cut;
use crate::tests::tournament_top_cut::standing_order;

/// An Account Participant with one subscribed device
struct Player {
    /// Logged in as the Account
    client: TestClient,
    /// Its Participant uuid
    participant: String,
    /// Its device's endpoint
    endpoint: String,
}

/// Add a fresh Account to `event` and subscribe a device for it in `language`
async fn player(event: &mut Event, language: PushLanguage) -> Player {
    let account = create_account(Role::Member).await;
    let mut client = TestClient::logged_in(&account).await;
    let participant = event.add_account(&account.username).await;
    let endpoint = new_endpoint();
    let language = match language {
        PushLanguage::De => "De",
        PushLanguage::En => "En",
    };
    subscribe(&mut client, &endpoint, language).await;
    Player {
        client,
        participant,
        endpoint,
    }
}

/// Where `participant` plays in Round `number`: its table (`None` for a Bye) and Seat
fn place(rounds: &Value, number: i64, participant: &str) -> (Option<i64>, i64) {
    for played in round(rounds, number)["matches"]
        .as_array()
        .expect("a list of matches")
    {
        for seat in played["seats"].as_array().expect("a list of seats") {
            if seat["participant"] == participant {
                return (
                    played["table_number"].as_i64(),
                    seat["seat"].as_i64().expect("a seat"),
                );
            }
        }
    }
    panic!("{participant} plays nowhere in Round {number}: {rounds}");
}

#[test]
fn starting_a_round_pushes_each_account_participant_its_table_and_seat() {
    run(async {
        let mut event = Event::new("Three", 0).await;
        let first = player(&mut event, PushLanguage::De).await;
        let second = player(&mut event, PushLanguage::En).await;
        event.add_guest("Guest").await;
        event.add_guest("Guest 2").await;

        event.pair().await;
        assert!(
            pushes().to(&first.endpoint).is_empty(),
            "the preview pushes"
        );

        event.start(1).await;
        let rounds = event.rounds().await;

        let (table, seat) = place(&rounds, 1, &first.participant);
        let table = table.expect("four Participants, no Bye");
        assert_eq!(
            pushes()
                .to(&first.endpoint)
                .iter()
                .map(|push| push.body.clone())
                .collect::<Vec<_>>(),
            vec![format!("Runde 1 ist gepaart: Tisch {table}, Sitz {seat}.")]
        );

        let (table, seat) = place(&rounds, 1, &second.participant);
        let table = table.expect("four Participants, no Bye");
        let received = pushes().to(&second.endpoint);
        assert_eq!(received.len(), 1, "{received:?}");
        assert_eq!(
            received[0].body,
            format!("Round 1 is paired: table {table}, seat {seat}.")
        );
        assert_eq!(
            received[0].url,
            format!("/tournaments/{}/rounds", event.tournament)
        );
    });
}

#[test]
fn a_participant_with_a_bye_is_told_so() {
    run(async {
        let mut event = Event::new("One", 0).await;
        let players = [
            player(&mut event, PushLanguage::En).await,
            player(&mut event, PushLanguage::En).await,
            player(&mut event, PushLanguage::En).await,
        ];

        event.pair().await;
        event.start(1).await;
        let rounds = event.rounds().await;

        let bodies = players
            .iter()
            .map(|player| {
                let received: Vec<PushMessage> = pushes().to(&player.endpoint);
                assert_eq!(received.len(), 1, "{received:?}");
                (
                    place(&rounds, 1, &player.participant).0,
                    received[0].body.clone(),
                )
            })
            .collect::<Vec<_>>();
        let byes = bodies
            .iter()
            .filter(|(table, _)| table.is_none())
            .collect::<Vec<_>>();
        assert_eq!(byes.len(), 1, "{bodies:?}");
        assert_eq!(byes[0].1, "Round 1 is paired: you have a Bye.");
    });
}

#[test]
fn every_round_started_pushes_again() {
    run(async {
        let mut event = Event::new("One", 0).await;
        let one = player(&mut event, PushLanguage::En).await;
        player(&mut event, PushLanguage::En).await;
        set_swiss_rounds(&mut event, 2).await;

        event.play_round().await;
        event.end(1).await;
        event.pair().await;
        event.start(2).await;

        let received = pushes().to(&one.endpoint);
        assert_eq!(received.len(), 2, "{received:?}");
        assert!(
            received[1].body.starts_with("Round 2 is paired"),
            "{received:?}"
        );
    });
}

#[test]
fn an_account_that_turned_tournament_pushes_off_gets_none() {
    run(async {
        let mut event = Event::new("One", 0).await;
        let mut quiet = player(&mut event, PushLanguage::De).await;
        let loud = player(&mut event, PushLanguage::De).await;
        let second_device = new_endpoint();
        subscribe(&mut quiet.client, &second_device, "En").await;
        set_tournament_pushes(&mut quiet.client, false).await;

        event.pair().await;
        event.start(1).await;

        assert!(pushes().to(&quiet.endpoint).is_empty());
        assert!(pushes().to(&second_device).is_empty());
        assert_eq!(pushes().to(&loud.endpoint).len(), 1);
    });
}

#[test]
fn every_subscribed_device_gets_the_push_in_its_own_language() {
    run(async {
        let mut event = Event::new("One", 0).await;
        let mut both = player(&mut event, PushLanguage::De).await;
        player(&mut event, PushLanguage::De).await;
        let english = new_endpoint();
        subscribe(&mut both.client, &english, "En").await;

        event.pair().await;
        event.start(1).await;

        assert!(pushes().to(&both.endpoint)[0].body.starts_with("Runde 1"));
        assert!(pushes().to(&english)[0].body.starts_with("Round 1"));
    });
}

/// The bodies of every push the device at `endpoint` got
fn bodies(endpoint: &str) -> Vec<String> {
    pushes()
        .to(endpoint)
        .into_iter()
        .map(|push| push.body)
        .collect()
}

/// A subscribed device for `client`'s Account, in English
async fn device(client: &mut TestClient) -> String {
    let endpoint = new_endpoint();
    subscribe(client, &endpoint, "En").await;
    endpoint
}

/// Round 1's one Match of a two-player event: its uuid and table number
async fn only_match(event: &mut Event) -> (String, i64) {
    let rounds = event.rounds().await;
    let played = matches(round(&rounds, 1))[0].clone();
    (
        played["uuid"].as_str().expect("uuid").to_string(),
        played["table_number"].as_i64().expect("a table"),
    )
}

/// `player` reports Seat 1 winning 2-0 for `played`
async fn report(event: &Event, player: &mut Player, played: &str) {
    let url = event.url(&format!("matches/{played}/report"));
    let body = player
        .client
        .json(
            Method::POST,
            &url,
            &json!({ "games_won": [2, 0], "games_drawn": 0 }),
        )
        .await
        .ok_json();
    assert_ne!(body["result"], "Err", "{body}");
}

/// `player` disputes the Result of `played`
async fn dispute(event: &Event, player: &mut Player, played: &str) {
    let url = event.url(&format!("matches/{played}/dispute"));
    let body = player
        .client
        .json(Method::POST, &url, &json!({}))
        .await
        .ok_json();
    assert_ne!(body["result"], "Err", "{body}");
}

#[test]
fn a_dispute_pushes_the_other_participants_of_the_match_and_the_organizers() {
    run(async {
        let mut event = Event::new("Three", 0).await;
        let mut reporter = player(&mut event, PushLanguage::De).await;
        let mut disputer = player(&mut event, PushLanguage::En).await;
        let owner = device(&mut event.owner).await;
        let co_account = create_account(Role::Member).await;
        let mut co_client = TestClient::logged_in(&co_account).await;
        let co_organizer = device(&mut co_client).await;
        let organizers = event.url("organizers");
        add(&mut event.owner, &organizers, &co_account.username).await;
        let stranger = device(&mut event.stranger).await;

        event.pair().await;
        event.start(1).await;
        let (played, table) = only_match(&mut event).await;
        report(&event, &mut reporter, &played).await;
        assert!(bodies(&owner).is_empty(), "a report pushes nobody");

        dispute(&event, &mut disputer, &played).await;

        assert_eq!(
            bodies(&reporter.endpoint)[1..],
            [format!(
                "Euer Ergebnis an Tisch {table} in Runde 1 wurde angefochten. Ein Organisator legt es fest."
            )]
        );
        assert_eq!(
            bodies(&disputer.endpoint).len(),
            1,
            "the disputer gets only Round paired"
        );
        let settle = format!("The result at table {table} in Round 1 was disputed. Settle it.");
        assert_eq!(bodies(&owner), std::slice::from_ref(&settle));
        assert_eq!(bodies(&co_organizer), [settle]);
        assert_eq!(
            pushes().to(&owner)[0].url,
            format!("/tournaments/{}/rounds", event.tournament)
        );
        assert!(bodies(&stranger).is_empty());
    });
}

#[test]
fn an_account_that_turned_tournament_pushes_off_hears_of_no_dispute() {
    run(async {
        let mut event = Event::new("Three", 0).await;
        let mut reporter = player(&mut event, PushLanguage::En).await;
        let mut disputer = player(&mut event, PushLanguage::En).await;
        let owner = device(&mut event.owner).await;
        set_tournament_pushes(&mut event.owner, false).await;
        set_tournament_pushes(&mut reporter.client, false).await;

        event.pair().await;
        event.start(1).await;
        let (played, _) = only_match(&mut event).await;
        report(&event, &mut reporter, &played).await;
        dispute(&event, &mut disputer, &played).await;

        assert!(bodies(&owner).is_empty());
        assert!(bodies(&reporter.endpoint).is_empty());
    });
}

#[test]
fn reaching_the_top_cut_pushes_the_participants_in_it_once() {
    run(async {
        let mut event = Event::new("Three", 0).await;
        let mut players = Vec::new();
        for _ in 0..5 {
            players.push(player(&mut event, PushLanguage::En).await);
        }
        set_top_cut(&mut event, json!("Top4"), json!("One")).await;
        set_swiss_rounds(&mut event, 1).await;
        event.play_round().await;
        let ended = event.end(1).await;
        assert_eq!(ended["state"], "TopCut", "{ended}");
        let seeds = standing_order(&mut event).await;

        event.pair().await;
        let before = players
            .iter()
            .map(|player| bodies(&player.endpoint).len())
            .collect::<Vec<_>>();
        assert!(
            before.iter().all(|count| *count == 1),
            "the cut's preview pushes: {before:?}"
        );
        event.start(2).await;

        let reached = "You reached the top cut. Stay around!".to_string();
        for player in &players {
            let seed = seeds
                .iter()
                .position(|seed| *seed == player.participant)
                .expect("a seed");
            let received = bodies(&player.endpoint);
            if seed < 4 {
                assert!(received[1..].contains(&reached), "{received:?}");
                assert!(
                    received[1..]
                        .iter()
                        .any(|body| body.starts_with("Round 2 is paired")),
                    "{received:?}"
                );
            } else {
                assert_eq!(received.len(), 1, "seed {seed} is out: {received:?}");
            }
        }
        let top = players
            .iter()
            .find(|player| player.participant == seeds[0])
            .expect("the top seed");
        assert_eq!(
            pushes()
                .to(&top.endpoint)
                .iter()
                .find(|push| push.body == reached)
                .expect("the top cut push")
                .url,
            format!("/tournaments/{}/top-cut", event.tournament)
        );

        let rounds = event.rounds().await;
        for played in matches(round(&rounds, 2)) {
            let uuid = played["uuid"].as_str().expect("uuid").to_string();
            event.result(&uuid, [1, 0], 0).await;
        }
        event.end(2).await;
        let url = event.url("rounds/2/take-back");
        event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();
        event.end(2).await;
        event.pair().await;
        event.start(3).await;
        let received = bodies(&top.endpoint);
        assert_eq!(
            received.iter().filter(|body| **body == reached).count(),
            1,
            "neither taking back the first cut Round nor the final pushes a second top cut push: {received:?}"
        );
    });
}

#[test]
fn a_tournament_entered_afterwards_pushes_nobody() {
    run(async {
        let mut event = entered(2, "Mtr", 0).await;
        let owner = device(&mut event.owner).await;
        let mut players = Vec::new();
        for _ in 0..5 {
            players.push(player(&mut event, PushLanguage::En).await);
        }
        set_top_cut(&mut event, json!("Top4"), json!("One")).await;
        set_swiss_rounds(&mut event, 1).await;

        event.play_round().await;
        let ended = event.end(1).await;
        assert_eq!(ended["state"], "TopCut", "{ended}");
        event.pair().await;
        let started = event.start(2).await;
        assert_ne!(started["result"], "Err", "{started}");

        assert!(bodies(&owner).is_empty());
        for player in &players {
            assert!(
                bodies(&player.endpoint).is_empty(),
                "neither Round paired nor the Top cut"
            );
        }
    });
}
