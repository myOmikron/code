//! "Round paired" pushes: when a Round starts, every Account Participant in
//! it gets a push naming its table and Seat on each subscribed device, unless
//! it turned tournament pushes off. Guests and the preview push nobody.

use serde_json::Value;

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
use crate::tests::tournament_rounds::Event;
use crate::tests::tournament_rounds::round;

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
