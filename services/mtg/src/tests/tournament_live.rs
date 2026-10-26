//! Live updates: whoever may see a Tournament follows its changes as
//! Server-Sent Events, and Organizers also hear about the previewed Round

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::http::header;
use serde_json::json;

use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestStream;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::tournament_rounds::Event;
use crate::tests::tournament_rounds::matches;
use crate::tests::tournament_rounds::round;
use crate::tests::tournaments::Fixture;
use crate::tests::tournaments::create;
use crate::tests::tournaments::settings;

/// Follow the events of the Tournament of `event` as `client`
async fn follow(event: &Event, client: &mut TestClient) -> TestStream {
    let stream = client.follow(&event.url("events")).await;
    assert_eq!(stream.status, StatusCode::OK);
    stream
}

/// Follow the events of the Tournament of `event` as its Owner
async fn follow_as_owner(event: &mut Event) -> TestStream {
    let url = event.url("events");
    let stream = event.owner.follow(&url).await;
    assert_eq!(stream.status, StatusCode::OK);
    stream
}

#[test]
fn the_stream_is_server_sent_events() {
    run(async {
        let mut event = Event::new("Three", 2).await;
        let url = event.url("events");
        let stream = event.stranger.follow(&url).await;

        assert_eq!(stream.status, StatusCode::OK);
        assert_eq!(
            stream
                .headers
                .get(header::CONTENT_TYPE)
                .map(|value| value.as_bytes()),
            Some(b"text/event-stream".as_slice())
        );
    });
}

#[test]
fn followers_hear_the_roster_change() {
    run(async {
        let mut event = Event::new("Three", 2).await;
        let mut watching = TestClient::new();
        let mut stream = follow(&event, &mut watching).await;

        event.add_guest("Late Guest").await;

        assert_eq!(
            stream.kinds().await,
            ["ParticipantsChanged", "StandingsChanged"]
        );
    });
}

#[test]
fn followers_hear_a_round_run_and_only_organizers_hear_its_preview() {
    run(async {
        let mut event = Event::new("Three", 4).await;
        let mut organizer_stream = follow_as_owner(&mut event).await;
        let mut stranger = TestClient::logged_in(&create_account(Role::Member).await).await;
        let mut stream = follow(&event, &mut stranger).await;

        event.pair().await;
        assert_eq!(organizer_stream.kinds().await, ["RoundPaired"]);
        assert_eq!(stream.kinds().await, Vec::<String>::new());

        event.start(1).await;
        let expected = ["RoundStarted", "StandingsChanged"];
        assert_eq!(organizer_stream.kinds().await, expected);
        assert_eq!(stream.kinds().await, expected);

        let rounds = event.rounds().await;
        for played in matches(round(&rounds, 1)) {
            let uuid = played["uuid"].as_str().expect("uuid").to_string();
            event.result(&uuid, [2, 0], 0).await;
        }
        let set = stream.next_event().await.expect("an event");
        assert_eq!(set["kind"], "ResultSet");
        assert_eq!(set["round"], 1);
        assert_eq!(
            stream.next_event().await.expect("an event")["kind"],
            "StandingsChanged"
        );
        stream.kinds().await;

        event.end(1).await;
        assert_eq!(stream.kinds().await, ["RoundEnded"]);

        let url = event.url("rounds/1/take-back");
        event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();
        assert_eq!(stream.kinds().await, ["RoundTakenBack"]);
    });
}

#[test]
fn followers_hear_results_reported_and_disputed() {
    run(async {
        let mut event = Event::new("Three", 0).await;
        let mut players = Vec::new();
        for _ in 0..2 {
            let account = create_account(Role::Member).await;
            event.add_account(&account.username).await;
            players.push(TestClient::logged_in(&account).await);
        }
        event.pair().await;
        event.start(1).await;
        let rounds = event.rounds().await;
        let played = matches(round(&rounds, 1))[0]["uuid"]
            .as_str()
            .expect("uuid")
            .to_string();
        let mut watching = TestClient::new();
        let mut stream = follow(&event, &mut watching).await;

        let url = event.url(&format!("matches/{played}/report"));
        players[0]
            .json(
                Method::POST,
                &url,
                &json!({ "games_won": [2, 1], "games_drawn": 0 }),
            )
            .await
            .ok_json();
        let reported = stream.next_event().await.expect("an event");
        assert_eq!(reported["kind"], "ResultReported");
        assert_eq!(reported["match_uuid"], played.as_str());
        assert_eq!(stream.kinds().await, ["StandingsChanged"]);

        let url = event.url(&format!("matches/{played}/dispute"));
        players[1]
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();
        assert_eq!(stream.kinds().await, ["ResultDisputed", "StandingsChanged"]);
    });
}

#[test]
fn followers_hear_a_cancellation() {
    run(async {
        let mut event = Event::new("Three", 2).await;
        let mut watching = TestClient::new();
        let mut stream = follow(&event, &mut watching).await;

        let url = event.url("cancel");
        event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();

        assert_eq!(stream.kinds().await, ["TournamentChanged"]);
    });
}

#[test]
fn a_private_tournament_streams_to_its_organizers_only() {
    run(async {
        let mut fixture = Fixture::new("Private").await;
        let url = api(&format!("tournaments/{}/events", fixture.tournament));

        assert_eq!(
            fixture.stranger.follow(&url).await.status,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            TestClient::new().follow(&url).await.status,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(fixture.owner.follow(&url).await.status, StatusCode::OK);
    });
}

#[test]
fn a_share_link_streams_without_the_preview() {
    run(async {
        let mut owner = TestClient::logged_in(&create_account(Role::Member).await).await;
        let mut request = settings("Unlisted");
        request["table_size"] = json!(2);
        request["ruleset"] = json!("Mtr");
        request["best_of"] = json!("Three");
        let created = create(&mut owner, &request).await;
        let tournament = created["uuid"].as_str().expect("uuid").to_string();
        let token = created["share_token"]
            .as_str()
            .expect("a share token")
            .to_string();
        let mut reader = TestClient::new();
        let mut stream = reader
            .follow(&api(&format!("shared/tournaments/{token}/events")))
            .await;
        assert_eq!(stream.status, StatusCode::OK);

        for name in ["A", "B"] {
            let url = api(&format!("tournaments/{tournament}/participants/guests"));
            owner
                .json(Method::POST, &url, &json!({ "name": name }))
                .await
                .ok_json();
        }
        let url = api(&format!("tournaments/{tournament}/rounds"));
        let paired = owner.json(Method::POST, &url, &json!({})).await.ok_json();
        assert_eq!(paired["number"], 1, "{paired}");

        assert_eq!(
            stream.kinds().await,
            [
                "ParticipantsChanged",
                "StandingsChanged",
                "ParticipantsChanged",
                "StandingsChanged"
            ]
        );
        assert_eq!(
            reader
                .follow(&api("shared/tournaments/unknown/events"))
                .await
                .status,
            StatusCode::BAD_REQUEST
        );
    });
}
