//! Guest sign-up: where the Owner allows it, a visitor without an Account
//! signs itself up as a Guest, its session holds the Guest seat, and a
//! Recovery code restores the seat into a fresh session (ADR 0007)

use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use serde_json::Value;
use serde_json::json;
use url::Url;

use crate::http::handler_frontend::tournaments::guests::handler::GUEST_SIGN_UPS_PER_WINDOW;
use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::tournament_participants::roster;
use crate::tests::tournament_rounds::Event;
use crate::tests::tournament_rounds::matches;
use crate::tests::tournament_rounds::round;
use crate::tests::tournament_rounds::seated;
use crate::tests::tournament_top_cut::set_swiss_rounds;
use crate::tests::tournaments::tournament_url;

/// A Guest that signed itself up, with the session that holds its seat
pub(super) struct Guest {
    /// The session holding the Guest seat
    pub(super) client: TestClient,
    /// Its Participant uuid
    pub(super) participant: String,
    /// The Recovery code its device keeps
    pub(super) code: String,
}

/// Replace the Event's settings by `change` applied to them, as the Owner, returning the response
pub(super) async fn configure(event: &mut Event, change: impl FnOnce(&mut Value)) -> TestResponse {
    change(&mut event.settings);
    let url = tournament_url(&event.tournament);
    let settings = event.settings.clone();
    event.owner.json(Method::PUT, &url, &settings).await
}

/// A public one-on-one Event without Participants that takes Guest sign-ups and check-in
pub(super) async fn open_event() -> Event {
    let mut event = Event::new("One", 0).await;
    let body = configure(&mut event, |settings| {
        settings["self_sign_up"] = json!(true);
        settings["check_in"] = json!("Required");
        settings["guest_sign_up"] = json!(true);
    })
    .await
    .ok_json();
    assert_eq!(body["guest_sign_up"], true, "{body}");
    event
}

/// The url of the Guest sign-up of the Event's Tournament
pub(super) fn sign_up_url(event: &Event) -> Url {
    event.url("guest-sign-up")
}

/// Sign `client` up as a Guest named `name`, returning the response
pub(super) async fn sign_up(client: &mut TestClient, url: &Url, name: &str) -> TestResponse {
    client
        .json(Method::POST, url, &json!({ "name": name }))
        .await
}

/// Sign a fresh visitor up as a Guest named `name`
pub(super) async fn guest(event: &Event, name: &str) -> Guest {
    let mut client = TestClient::new();
    let body = sign_up(&mut client, &sign_up_url(event), name)
        .await
        .ok_json();
    Guest {
        client,
        participant: body["participant"]["uuid"]
            .as_str()
            .expect("uuid")
            .to_string(),
        code: body["recovery_code"]
            .as_str()
            .expect("a recovery code")
            .to_string(),
    }
}

/// Restore a Guest seat into `client` through `url`, returning the response
pub(super) async fn recover(
    client: &mut TestClient,
    url: &Url,
    participant: &str,
    code: &str,
) -> TestResponse {
    client
        .json(
            Method::POST,
            url,
            &json!({ "participant": participant, "code": code }),
        )
        .await
}

/// Who `client` plays as in the Event's Tournament, by the participant list
pub(super) async fn me(event: &Event, client: &mut TestClient) -> Value {
    client.get(&event.url("participants")).await.ok_json()["me"].clone()
}

/// Check `participant` in as the Owner
pub(super) async fn check_in(event: &mut Event, participant: &str) {
    let url = event.url(&format!("participants/{participant}/checked-in"));
    event
        .owner
        .json(Method::PUT, &url, &json!({ "checked_in": true }))
        .await
        .ok_json();
}

/// The error flags of a refused response
pub(super) fn refusal(response: &TestResponse) -> Value {
    response.ok_json()["error"].clone()
}

#[test]
fn guest_sign_up_is_refused_unless_the_owner_allowed_it() {
    run(async {
        let mut event = open_event().await;
        configure(&mut event, |settings| {
            settings["guest_sign_up"] = json!(false);
        })
        .await
        .ok_json();

        let mut visitor = TestClient::new();
        let refused = sign_up(&mut visitor, &sign_up_url(&event), "Chandra").await;
        assert_eq!(refusal(&refused)["closed"], true, "{refused:?}");
        let tournament = event.tournament.clone();
        let listed = roster(&mut event.owner, &tournament).await;
        assert_eq!(listed["participants"], json!([]), "{listed}");
    });
}

#[test]
fn guest_sign_up_needs_self_sign_up_check_in_and_a_visible_tournament() {
    run(async {
        let mut event = open_event().await;

        let refused = configure(&mut event, |settings| {
            settings["check_in"] = json!("Off");
        })
        .await;
        assert_eq!(
            refusal(&refused)["guest_sign_up_needs_check_in"],
            true,
            "{refused:?}"
        );

        let refused = configure(&mut event, |settings| {
            settings["check_in"] = json!("Required");
            settings["self_sign_up"] = json!(false);
        })
        .await;
        assert_eq!(
            refusal(&refused)["guest_sign_up_needs_self_sign_up"],
            true,
            "{refused:?}"
        );

        let refused = configure(&mut event, |settings| {
            settings["self_sign_up"] = json!(true);
            settings["visibility"] = json!("Private");
        })
        .await;
        assert_eq!(
            refusal(&refused)["self_sign_up_needs_visibility"],
            true,
            "{refused:?}"
        );
    });
}

#[test]
fn a_guest_signs_up_with_a_tidy_name_and_waits_for_the_desk() {
    run(async {
        let mut event = open_event().await;
        let mut client = TestClient::new();
        let body = sign_up(
            &mut client,
            &sign_up_url(&event),
            "  Liliana \t of the  Veil ",
        )
        .await
        .ok_json();

        assert_eq!(body["participant"]["name"], "Liliana of the Veil", "{body}");
        assert_eq!(body["participant"]["guest"], true, "{body}");
        assert_eq!(body["participant"]["checked_in"], false, "{body}");
        assert!(
            body["recovery_code"]
                .as_str()
                .is_some_and(|code| code.len() >= 22),
            "{body}"
        );
        assert_eq!(me(&event, &mut client).await, body["participant"]["uuid"]);
        let tournament = event.tournament.clone();
        let listed = roster(&mut event.owner, &tournament).await;
        assert_eq!(listed["participants"][0]["checked_in"], false, "{listed}");
    });
}

#[test]
fn a_name_of_blanks_only_is_refused() {
    run(async {
        let event = open_event().await;
        let mut client = TestClient::new();
        let refused = sign_up(&mut client, &sign_up_url(&event), " \t ").await;
        assert_eq!(refusal(&refused)["empty_name"], true, "{refused:?}");
    });
}

#[test]
fn a_full_tournament_takes_no_more_guests() {
    run(async {
        let mut event = open_event().await;
        configure(&mut event, |settings| {
            settings["participant_limit"] = json!(2);
        })
        .await
        .ok_json();
        guest(&event, "Ajani").await;
        event.add_guest("Added by the desk").await;

        let mut late = TestClient::new();
        let refused = sign_up(&mut late, &sign_up_url(&event), "Teferi").await;
        assert_eq!(refusal(&refused)["full"], true, "{refused:?}");
    });
}

#[test]
fn guest_sign_up_closes_when_the_first_round_starts() {
    run(async {
        let mut event = open_event().await;
        for name in ["Ajani", "Teferi"] {
            let guest = guest(&event, name).await;
            check_in(&mut event, &guest.participant).await;
        }
        event.pair().await;
        event.start(1).await;

        let mut late = TestClient::new();
        let refused = sign_up(&mut late, &sign_up_url(&event), "Nissa").await;
        assert_eq!(refusal(&refused)["closed"], true, "{refused:?}");
    });
}

#[test]
fn signing_up_again_in_the_same_session_answers_the_same_guest_with_a_new_code() {
    run(async {
        let mut event = open_event().await;
        let mut first = guest(&event, "Ajani").await;

        let again = sign_up(&mut first.client, &sign_up_url(&event), "Ajani")
            .await
            .ok_json();
        assert_eq!(again["participant"]["uuid"], first.participant.as_str());
        let tournament = event.tournament.clone();
        let listed = roster(&mut event.owner, &tournament).await;
        assert_eq!(
            listed["participants"].as_array().map(Vec::len),
            Some(1),
            "{listed}"
        );

        let fresh_code = again["recovery_code"].as_str().expect("a code").to_string();
        assert_ne!(fresh_code, first.code);
        let url = event.url("guest-seat/recover");
        let refused = recover(
            &mut TestClient::new(),
            &url,
            &first.participant,
            &first.code,
        )
        .await;
        assert_eq!(refusal(&refused)["unknown_code"], true, "{refused:?}");
        recover(
            &mut TestClient::new(),
            &url,
            &first.participant,
            &fresh_code,
        )
        .await
        .ok_json();
    });
}

#[test]
fn two_sign_ups_of_one_session_at_once_make_one_guest() {
    run(async {
        let mut event = open_event().await;
        let elsewhere = open_event().await;
        let mut first = guest(&elsewhere, "Ajani").await.client;
        let mut second = first.same_session();
        let url = sign_up_url(&event);

        let (one, other) = tokio::join!(
            sign_up(&mut first, &url, "Ajani"),
            sign_up(&mut second, &url, "Ajani"),
        );

        let (one, other) = (one.ok_json(), other.ok_json());
        assert_eq!(
            one["participant"]["uuid"], other["participant"]["uuid"],
            "{one} {other}"
        );
        let tournament = event.tournament.clone();
        let listed = roster(&mut event.owner, &tournament).await;
        assert_eq!(
            listed["participants"].as_array().map(Vec::len),
            Some(1),
            "{listed}"
        );
    });
}

#[test]
fn signing_up_with_the_code_a_device_kept_restores_its_guest() {
    run(async {
        let mut event = open_event().await;
        let first = guest(&event, "Ajani").await;

        let mut fresh = TestClient::new();
        let body = fresh
            .json(
                Method::POST,
                &sign_up_url(&event),
                &json!({
                    "name": "Ajani",
                    "recovery": { "participant": first.participant, "code": first.code },
                }),
            )
            .await
            .ok_json();
        assert_eq!(body["participant"]["uuid"], first.participant.as_str());
        assert_eq!(me(&event, &mut fresh).await, first.participant.as_str());
        let tournament = event.tournament.clone();
        let listed = roster(&mut event.owner, &tournament).await;
        assert_eq!(
            listed["participants"].as_array().map(Vec::len),
            Some(1),
            "{listed}"
        );
    });
}

#[test]
fn an_account_that_plays_signs_up_as_no_guest() {
    run(async {
        let mut event = open_event().await;
        let account = create_account(Role::Member).await;
        event.add_account(&account.username).await;
        let mut client = TestClient::logged_in(&account).await;

        let refused = sign_up(&mut client, &sign_up_url(&event), "Ajani").await;
        assert_eq!(
            refusal(&refused)["already_participant"],
            true,
            "{refused:?}"
        );
    });
}

#[test]
fn a_guest_is_paired_only_once_the_desk_checked_it_in() {
    run(async {
        let mut event = open_event().await;
        let ajani = guest(&event, "Ajani").await;
        let teferi = guest(&event, "Teferi").await;
        let nissa = guest(&event, "Nissa").await;
        check_in(&mut event, &ajani.participant).await;
        check_in(&mut event, &teferi.participant).await;

        event.pair().await;
        let rounds = event.rounds().await;
        let mut seats: Vec<String> = matches(round(&rounds, 1))
            .into_iter()
            .flat_map(seated)
            .collect();
        seats.sort();
        let mut expected = vec![ajani.participant, teferi.participant];
        expected.sort();
        assert_eq!(seats, expected, "{rounds}");
        assert!(!seats.contains(&nissa.participant));
    });
}

/// An open Event with four Guests that signed themselves up, checked in, in a running Round 1
pub(super) async fn running_event() -> (Event, Vec<Guest>) {
    let mut event = open_event().await;
    let mut guests = Vec::new();
    for name in ["Ajani", "Teferi", "Nissa", "Gideon"] {
        let guest = guest(&event, name).await;
        check_in(&mut event, &guest.participant).await;
        guests.push(guest);
    }
    event.pair().await;
    event.start(1).await;
    (event, guests)
}

/// The Match of Round 1 `participant` sits in, by its uuid
pub(super) async fn match_of(event: &mut Event, participant: &str) -> String {
    let rounds = event.rounds().await;
    matches(round(&rounds, 1))
        .into_iter()
        .find(|played| seated(played).iter().any(|seat| seat == participant))
        .and_then(|played| played["uuid"].as_str())
        .expect("its match")
        .to_string()
}

#[test]
fn a_guest_reads_its_match_and_reports_its_result() {
    run(async {
        let (mut event, mut guests) = running_event().await;
        let ajani = &mut guests[0];
        let played = match_of(&mut event, &ajani.participant).await;

        let mine = ajani.client.get(&event.url("my-match")).await.ok_json();
        assert_eq!(mine["participant"], ajani.participant.as_str(), "{mine}");
        assert_eq!(mine["round"]["my_match"]["uuid"], played.as_str(), "{mine}");

        let url = event.url(&format!("matches/{played}/report"));
        ajani
            .client
            .json(
                Method::POST,
                &url,
                &json!({ "games_won": [1, 0], "games_drawn": 0 }),
            )
            .await
            .ok_json();
        let rounds = event.rounds().await;
        let reported = matches(round(&rounds, 1))
            .into_iter()
            .find(|candidate| candidate["uuid"] == played.as_str())
            .expect("the match")
            .clone();
        assert_eq!(
            reported["result"]["reported_by"],
            ajani.participant.as_str(),
            "{reported}"
        );
    });
}

#[test]
fn neither_a_stranger_nor_a_guest_of_another_match_reports_a_guests_match() {
    run(async {
        let (mut event, mut guests) = running_event().await;
        let played = match_of(&mut event, &guests[0].participant).await;
        let url = event.url(&format!("matches/{played}/report"));
        let result = json!({ "games_won": [1, 0], "games_drawn": 0 });

        let mut stranger = TestClient::new();
        let refused = stranger.json(Method::POST, &url, &result).await;
        assert_eq!(refused.status, StatusCode::BAD_REQUEST, "{refused:?}");

        let rounds = event.rounds().await;
        let seats = matches(round(&rounds, 1))
            .into_iter()
            .find(|candidate| candidate["uuid"] == played.as_str())
            .map(seated)
            .expect("the match");
        let outsider = guests
            .iter_mut()
            .find(|guest| !seats.contains(&guest.participant))
            .expect("a guest of the other match");
        let refused = outsider.client.json(Method::POST, &url, &result).await;
        assert_eq!(refused.status, StatusCode::BAD_REQUEST, "{refused:?}");
        let rounds = event.rounds().await;
        let untouched = matches(round(&rounds, 1))
            .into_iter()
            .find(|candidate| candidate["uuid"] == played.as_str())
            .expect("the match")
            .clone();
        assert_eq!(untouched["result"], Value::Null, "{untouched}");
    });
}

#[test]
fn a_guest_seat_reaches_no_route_that_needs_an_account() {
    run(async {
        let (mut event, mut guests) = running_event().await;
        let played = match_of(&mut event, &guests[0].participant).await;
        let ajani = &mut guests[0];

        let deck = ajani.client.get(&event.url("deck")).await;
        assert_eq!(deck.status, StatusCode::UNAUTHORIZED, "{deck:?}");
        let history = ajani
            .client
            .get(&event.url(&format!("matches/{played}/life-history")))
            .await;
        assert_eq!(history.status, StatusCode::UNAUTHORIZED, "{history:?}");
        let account_sign_up = ajani
            .client
            .json(Method::POST, &event.url("sign-up"), &json!({}))
            .await;
        assert_eq!(
            account_sign_up.status,
            StatusCode::UNAUTHORIZED,
            "{account_sign_up:?}"
        );
    });
}

#[test]
fn an_account_holding_a_guest_seat_still_has_no_account_route_through_it() {
    run(async {
        let event = open_event().await;
        let account = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&account).await;
        let body = sign_up(&mut client, &sign_up_url(&event), "Ajani")
            .await
            .ok_json();
        let participant = body["participant"]["uuid"].clone();
        assert_eq!(me(&event, &mut client).await, participant);

        let deck = client.get(&event.url("deck")).await;
        assert_eq!(deck.status, StatusCode::BAD_REQUEST, "{deck:?}");
    });
}

#[test]
fn a_guest_seat_counts_only_in_its_own_tournament() {
    run(async {
        let (mut event, mut guests) = running_event().await;
        let (other, mut other_guests) = running_event().await;
        let played = match_of(&mut event, &guests[0].participant).await;
        let ajani = &mut guests[0];

        assert_eq!(me(&other, &mut ajani.client).await, Value::Null);
        let mine = ajani.client.get(&other.url("my-match")).await.ok_json();
        assert_eq!(mine["participant"], Value::Null, "{mine}");
        let drop = ajani
            .client
            .json(Method::POST, &other.url("drop"), &json!({}))
            .await;
        assert_eq!(drop.status, StatusCode::BAD_REQUEST, "{drop:?}");

        let url = other.url(&format!("matches/{played}/report"));
        let refused = other_guests[0]
            .client
            .json(
                Method::POST,
                &url,
                &json!({ "games_won": [1, 0], "games_drawn": 0 }),
            )
            .await;
        assert_eq!(refused.status, StatusCode::BAD_REQUEST, "{refused:?}");
    });
}

#[test]
fn a_guest_drops_itself_once_the_first_round_started() {
    run(async {
        let (mut event, mut guests) = running_event().await;
        let ajani = &mut guests[0];
        ajani
            .client
            .json(Method::POST, &event.url("drop"), &json!({}))
            .await
            .ok_json();
        let tournament = event.tournament.clone();
        let listed = roster(&mut event.owner, &tournament).await;
        let dropped = listed["participants"]
            .as_array()
            .expect("participants")
            .iter()
            .find(|participant| participant["uuid"] == ajani.participant.as_str())
            .expect("still on the roster")
            .clone();
        assert_eq!(dropped["dropped_after_round"], 1, "{dropped}");
    });
}

#[test]
fn a_guest_withdraws_and_its_seat_goes_with_it() {
    run(async {
        let mut event = open_event().await;
        let mut ajani = guest(&event, "Ajani").await;

        ajani
            .client
            .json(Method::DELETE, &event.url("sign-up"), &json!({}))
            .await
            .ok_json();
        assert_eq!(me(&event, &mut ajani.client).await, Value::Null);
        let tournament = event.tournament.clone();
        let listed = roster(&mut event.owner, &tournament).await;
        assert_eq!(listed["participants"], json!([]), "{listed}");

        let again = sign_up(&mut ajani.client, &sign_up_url(&event), "Ajani")
            .await
            .ok_json();
        assert_ne!(again["participant"]["uuid"], ajani.participant.as_str());
    });
}

#[test]
fn a_recovery_code_restores_the_seat_into_a_fresh_session() {
    run(async {
        let event = open_event().await;
        let ajani = guest(&event, "Ajani").await;
        let url = event.url("guest-seat/recover");

        let mut fresh = TestClient::new();
        assert_eq!(me(&event, &mut fresh).await, Value::Null);
        recover(&mut fresh, &url, &ajani.participant, &ajani.code)
            .await
            .ok_json();
        assert_eq!(me(&event, &mut fresh).await, ajani.participant.as_str());
    });
}

#[test]
fn a_wrong_recovery_code_restores_nothing() {
    run(async {
        let event = open_event().await;
        let ajani = guest(&event, "Ajani").await;
        let teferi = guest(&event, "Teferi").await;
        let url = event.url("guest-seat/recover");

        let mut fresh = TestClient::new();
        let refused = recover(&mut fresh, &url, &ajani.participant, "not the code").await;
        assert_eq!(refusal(&refused)["unknown_code"], true, "{refused:?}");
        let refused = recover(&mut fresh, &url, &ajani.participant, &teferi.code).await;
        assert_eq!(refusal(&refused)["unknown_code"], true, "{refused:?}");
        assert_eq!(me(&event, &mut fresh).await, Value::Null);
    });
}

#[test]
fn the_recovery_codes_are_forgotten_once_the_tournament_is_finished() {
    run(async {
        let (mut event, guests) = running_event().await;
        set_swiss_rounds(&mut event, 1).await;
        let rounds = event.rounds().await;
        for played in matches(round(&rounds, 1)) {
            let uuid = played["uuid"].as_str().expect("uuid").to_string();
            event.result(&uuid, [1, 0], 0).await;
        }
        let ended = event.end(1).await;
        assert_eq!(ended["state"], "Finished", "{ended}");

        let recover_url = event.url("guest-seat/recover");
        let refused = recover(
            &mut TestClient::new(),
            &recover_url,
            &guests[0].participant,
            &guests[0].code,
        )
        .await;
        assert_eq!(refusal(&refused)["tournament_over"], true, "{refused:?}");

        let url = event.url("rounds/1/take-back");
        event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();
        let refused = recover(
            &mut TestClient::new(),
            &recover_url,
            &guests[0].participant,
            &guests[0].code,
        )
        .await;
        assert_eq!(refusal(&refused)["unknown_code"], true, "{refused:?}");
    });
}

#[test]
fn the_recovery_codes_are_forgotten_once_the_tournament_is_cancelled() {
    run(async {
        let mut event = open_event().await;
        let ajani = guest(&event, "Ajani").await;
        let url = event.url("cancel");
        event
            .owner
            .json(Method::POST, &url, &json!({}))
            .await
            .ok_json();

        let url = event.url("guest-seat/recover");
        let refused = recover(
            &mut TestClient::new(),
            &url,
            &ajani.participant,
            &ajani.code,
        )
        .await;
        assert_eq!(refusal(&refused)["tournament_over"], true, "{refused:?}");
    });
}

#[test]
fn an_unlisted_tournament_takes_guests_through_its_share_link() {
    run(async {
        let mut event = open_event().await;
        let body = configure(&mut event, |settings| {
            settings["visibility"] = json!("Unlisted");
        })
        .await
        .ok_json();
        let token = body["share_token"].as_str().expect("a share token");
        let shared = |path: &str| api(&format!("shared/tournaments/{token}/{path}"));

        let mut by_id = TestClient::new();
        let refused = sign_up(&mut by_id, &sign_up_url(&event), "Ajani").await;
        assert_eq!(refused.status, StatusCode::BAD_REQUEST, "{refused:?}");

        let mut client = TestClient::new();
        let body = sign_up(&mut client, &shared("guest-sign-up"), "Ajani")
            .await
            .ok_json();
        let participant = body["participant"]["uuid"]
            .as_str()
            .expect("uuid")
            .to_string();
        let code = body["recovery_code"].as_str().expect("a code").to_string();
        let listed = client.get(&shared("participants")).await.ok_json();
        assert_eq!(listed["me"], participant.as_str(), "{listed}");
        let mine = client.get(&event.url("my-match")).await.ok_json();
        assert_eq!(mine["participant"], participant.as_str(), "{mine}");

        let mut fresh = TestClient::new();
        recover(
            &mut fresh,
            &shared("guest-seat/recover"),
            &participant,
            &code,
        )
        .await
        .ok_json();
        assert_eq!(me(&event, &mut fresh).await, participant.as_str());
    });
}

#[test]
fn followers_hear_a_guest_sign_up() {
    run(async {
        let event = open_event().await;
        let mut watching = TestClient::new();
        let mut stream = watching.follow(&event.url("events")).await;

        guest(&event, "Ajani").await;

        assert_eq!(
            stream.kinds().await,
            ["ParticipantsChanged", "StandingsChanged"]
        );
    });
}

#[test]
fn one_address_signs_up_no_more_than_its_rate_limit() {
    run(async {
        let event = open_event().await;
        let mut client = TestClient::new();
        for _ in 0..30 {
            sign_up(&mut client, &sign_up_url(&event), "Ajani")
                .await
                .ok_json();
        }
        let refused = sign_up(&mut client, &sign_up_url(&event), "Ajani").await;
        assert_eq!(refused.status, StatusCode::BAD_REQUEST, "{refused:?}");
    });
}

#[test]
fn a_tournament_takes_no_more_guests_than_its_cap_per_window() {
    run(async {
        let event = open_event().await;
        for index in 0..GUEST_SIGN_UPS_PER_WINDOW {
            guest(&event, &format!("Guest {index}")).await;
        }
        let mut late = TestClient::new();
        let refused = sign_up(&mut late, &sign_up_url(&event), "One too many").await;
        assert_eq!(refusal(&refused)["busy"], true, "{refused:?}");
    });
}
