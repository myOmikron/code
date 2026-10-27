//! Durable Match Life history through the authenticated HTTP boundary.

use galvyn::core::re_exports::axum::http::Method;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::tests::harness::TestClient;
use crate::tests::harness::create_account;
use crate::tests::harness::run;
use crate::tests::tournament_rounds::Event;

#[test]
fn a_recording_device_saves_history_and_an_observer_cannot_replace_it() {
    run(async {
        let mut event = Event::new("Three", 3).await;
        let account = create_account(Role::Member).await;
        let me = event.add_account(&account.username).await;
        let mut player = TestClient::logged_in(&account).await;
        event.pair().await;
        event.start(1).await;
        let rounds = event.rounds().await;
        let matches = rounds["rounds"][0]["matches"].as_array().unwrap();
        let played = matches
            .iter()
            .find(|m| {
                m["seats"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|s| s["participant"] == me)
            })
            .unwrap();
        let match_id = played["uuid"].as_str().unwrap();
        let url = event.url(&format!("matches/{match_id}/life-history"));
        let claim_url = event.url(&format!("matches/{match_id}/life-history/claim"));
        let empty = player.get(&url).await.ok_json();
        assert_eq!(empty["history"], Value::Null, "{empty}");
        let device = Uuid::new_v4();
        let token = Uuid::new_v4();
        let claim = json!({"device":device,"writer_token":token,"request_id":Uuid::new_v4(),"generation":0,"expected_revision":0});
        let claimed = player
            .json(Method::POST, &claim_url, &claim)
            .await
            .ok_json();
        assert_eq!(claimed["generation"], 1, "{claimed}");
        let other_claim = json!({"device":Uuid::new_v4(),"writer_token":Uuid::new_v4(),"request_id":Uuid::new_v4(),"generation":1,"expected_revision":0});
        let refused = event
            .owner
            .json(Method::POST, &claim_url, &other_claim)
            .await
            .ok_json();
        assert_eq!(refused["error"]["writer_conflict"], true, "{refused}");
        let players: Vec<_> = played["seats"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| json!({"id":s["participant"],"name":s["name"]}))
            .collect();
        let first = players[0]["id"].clone();
        let history = json!({"version":1,"games":[{"players":players,"startingLife":[20,20],"life":[18,20],"damage":[[0,0],[0,0]],"events":[{"id":Uuid::new_v4(),"kind":"start","at":"2026-10-27T12:00:00Z"},{"id":Uuid::new_v4(),"kind":"life","at":"2026-10-27T12:00:01Z","player":first,"amount":-2}]}]});
        let upload = json!({"device":device,"writer_token":token,"request_id":Uuid::new_v4(),"generation":1,"expected_revision":0,"history":history});
        let saved = player.json(Method::PUT, &url, &upload).await.ok_json();
        assert_eq!(saved["revision"], 1, "{saved}");
        let again = player.json(Method::PUT, &url, &upload).await.ok_json();
        assert_eq!(again["revision"], 1, "{again}");
        let read = event.owner.get(&url).await.ok_json();
        assert_eq!(read["history"], history, "{read}");
        assert!(read.get("writer_token").is_none(), "{read}");
        let mut observer_upload = upload.clone();
        observer_upload["request_id"] = json!(Uuid::new_v4());
        observer_upload["expected_revision"] = json!(1);
        let refused = event
            .owner
            .json(Method::PUT, &url, &observer_upload)
            .await
            .ok_json();
        assert_eq!(refused["error"]["writer_conflict"], true, "{refused}");
        let mut guessed = observer_upload.clone();
        guessed["writer_token"] = json!(Uuid::new_v4());
        let refused = player.json(Method::PUT, &url, &guessed).await.ok_json();
        assert_eq!(refused["error"]["writer_conflict"], true, "{refused}");
        let other = matches
            .iter()
            .find(|m| m["uuid"] != played["uuid"])
            .unwrap();
        let other_url = event.url(&format!(
            "matches/{}/life-history",
            other["uuid"].as_str().unwrap()
        ));
        assert!(!player.get(&other_url).await.status.is_success());
        assert!(!event.stranger.get(&url).await.status.is_success());
        assert!(!TestClient::new().get(&url).await.status.is_success());
        let fresh = TestClient::logged_in(&account)
            .await
            .get(&url)
            .await
            .ok_json();
        assert_eq!(fresh["history"], history, "{fresh}");
        let rounds = event.rounds().await;
        assert!(
            rounds["rounds"][0]["matches"]
                .as_array()
                .unwrap()
                .iter()
                .all(|m| m["result"].is_null()),
            "{rounds}"
        );
        for played in matches {
            event
                .result(played["uuid"].as_str().unwrap(), [2, 0], 0)
                .await;
        }
        event
            .owner
            .json(
                Method::PUT,
                &event.url("swiss-rounds"),
                &json!({"swiss_rounds": 1}),
            )
            .await
            .ok_json();
        assert_eq!(event.end(1).await["state"], "Finished");
        let retained = player.get(&url).await.ok_json();
        assert_eq!(retained["history"], history, "{retained}");
    });
}

#[test]
fn guest_history_retains_games_and_corrections_and_survives_finish_without_rescoring() {
    run(async {
        let mut event = Event::new("Three", 2).await;
        event.pair().await;
        event.start(1).await;
        let rounds = event.rounds().await;
        let played = &rounds["rounds"][0]["matches"][0];
        let match_id = played["uuid"].as_str().unwrap().to_string();
        let players: Vec<_> = played["seats"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| json!({"id":s["participant"],"name":s["name"]}))
            .collect();
        let p = players[0]["id"].clone();
        let c = players[1]["id"].clone();
        let url = event.url(&format!("matches/{match_id}/life-history"));
        let claim_url = event.url(&format!("matches/{match_id}/life-history/claim"));
        let device = Uuid::new_v4();
        let token = Uuid::new_v4();
        let claim = json!({"device":device,"writer_token":token,"request_id":Uuid::new_v4(),"generation":0,"expected_revision":0});
        event
            .owner
            .json(Method::POST, &claim_url, &claim)
            .await
            .ok_json();
        let life_id = Uuid::new_v4();
        let commander_id = Uuid::new_v4();
        let at = "2026-10-27T13:00:00Z";
        let history = json!({"version":1,"games":[{"players":players,"startingLife":[20,20],"life":[20,20],"damage":[[0,0],[0,0]],"events":[
            {"id":Uuid::new_v4(),"kind":"start","at":at},
            {"id":life_id,"kind":"life","at":at,"player":p,"amount":-2},
            {"id":Uuid::new_v4(),"kind":"reclassify","at":at,"player":p,"commander":c,"amount":0,"damageAmount":2,"reclassifies":[life_id]},
            {"id":Uuid::new_v4(),"kind":"correction","at":at,"player":p,"commander":c,"amount":2,"damageAmount":-2,"corrects":life_id},
            {"id":commander_id,"kind":"commander","at":at,"player":p,"commander":c,"amount":-3,"damageAmount":3},
            {"id":Uuid::new_v4(),"kind":"correction","at":at,"player":p,"commander":c,"amount":3,"damageAmount":-3,"corrects":commander_id},
            {"id":Uuid::new_v4(),"kind":"end","at":at}],"outcome":{"kind":"winner","winner":p}}]});
        let mut upload = json!({"device":device,"writer_token":token,"request_id":Uuid::new_v4(),"generation":1,"expected_revision":0,"history":history});
        let first = event.owner.json(Method::PUT, &url, &upload).await.ok_json();
        assert_eq!(first["revision"], 1, "{first}");
        let original = upload.clone();
        upload["request_id"] = json!(Uuid::new_v4());
        upload["expected_revision"] = json!(1);
        upload["history"]["games"].as_array_mut().unwrap().push(json!({"players":players,"startingLife":[30,30],"life":[30,30],"damage":[[0,0],[0,0]],"events":[{"id":Uuid::new_v4(),"kind":"start","at":at}]}));
        let saved = event.owner.json(Method::PUT, &url, &upload).await.ok_json();
        assert_eq!(saved["revision"], 2, "{saved}");
        let late = event
            .owner
            .json(Method::PUT, &url, &original)
            .await
            .ok_json();
        assert_eq!(late["revision"], 2, "{late}");
        assert_eq!(late["accepted_revision"], 1, "{late}");
        assert_eq!(late["history"], upload["history"], "{late}");
        let mut altered = original.clone();
        altered["history"]["games"][0]["startingLife"] = json!([40, 40]);
        let refused = event
            .owner
            .json(Method::PUT, &url, &altered)
            .await
            .ok_json();
        assert_eq!(refused["error"]["request_conflict"], true, "{refused}");
        let mut stale = upload.clone();
        stale["request_id"] = json!(Uuid::new_v4());
        let refused = event.owner.json(Method::PUT, &url, &stale).await.ok_json();
        assert_eq!(refused["error"]["revision_conflict"], true, "{refused}");
        let mut shortened = original.clone();
        shortened["request_id"] = json!(Uuid::new_v4());
        shortened["expected_revision"] = json!(2);
        let refused = event
            .owner
            .json(Method::PUT, &url, &shortened)
            .await
            .ok_json();
        assert_eq!(refused["error"]["invalid_history"], true, "{refused}");
        let mut inconsistent = upload.clone();
        inconsistent["request_id"] = json!(Uuid::new_v4());
        inconsistent["expected_revision"] = json!(2);
        inconsistent["history"]["games"][1]["life"] = json!([10, 30]);
        let refused = event
            .owner
            .json(Method::PUT, &url, &inconsistent)
            .await
            .ok_json();
        assert_eq!(refused["error"]["invalid_history"], true, "{refused}");
        let before = event.rounds().await;
        assert!(
            before["rounds"][0]["matches"][0]["result"].is_null(),
            "{before}"
        );
        event.result(&match_id, [2, 0], 0).await;
        assert_eq!(event.end(1).await["state"], "Finished");
        let read = event.owner.get(&url).await.ok_json();
        assert_eq!(read["history"], upload["history"], "{read}");
        assert!(
            !read.to_string().contains(&token.to_string()),
            "private token leaked"
        );
        let after = event.rounds().await;
        assert_eq!(
            after["rounds"][0]["matches"][0]["result"]["games_won"],
            json!([2, 0]),
            "{after}"
        );
    });
}

/// Two authorized Participants at the same table and a complete counted snapshot.
async fn handover_event() -> (Event, TestClient, TestClient, Value, Value) {
    let mut event = Event::new("Three", 0).await;
    let first = create_account(Role::Member).await;
    let second = create_account(Role::Member).await;
    event.add_account(&first.username).await;
    event.add_account(&second.username).await;
    let first = TestClient::logged_in(&first).await;
    let second = TestClient::logged_in(&second).await;
    event.pair().await;
    event.start(1).await;
    let rounds = event.rounds().await;
    let played = rounds["rounds"][0]["matches"][0].clone();
    let players: Vec<_> = played["seats"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| json!({"id":s["participant"],"name":s["name"]}))
        .collect();
    let history = json!({"version":1,"games":[{"players":players,"startingLife":[20,20],"life":[18,20],"damage":[[0,0],[0,0]],"events":[{"id":Uuid::new_v4(),"kind":"start","at":"2026-10-27T12:00:00Z"},{"id":Uuid::new_v4(),"kind":"life","at":"2026-10-27T12:00:01Z","player":players[0]["id"],"amount":-2}]}]});
    (event, first, second, played, history)
}

#[test]
fn released_recording_resumes_saved_history_and_late_receipts_never_restore_ownership() {
    run(async {
        let (mut event, mut first, mut second, played, history) = handover_event().await;
        let path = format!("matches/{}/life-history", played["uuid"].as_str().unwrap());
        let url = event.url(&path);
        let claim = json!({"device":Uuid::new_v4(),"writer_token":Uuid::new_v4(),"request_id":Uuid::new_v4(),"generation":0,"expected_revision":0});
        first
            .json(Method::POST, &event.url(&format!("{path}/claim")), &claim)
            .await
            .ok_json();
        let upload = json!({"device":claim["device"],"writer_token":claim["writer_token"],"request_id":Uuid::new_v4(),"generation":1,"expected_revision":0,"history":history});
        first.json(Method::PUT, &url, &upload).await.ok_json();
        let release = json!({"device":claim["device"],"writer_token":claim["writer_token"],"request_id":Uuid::new_v4(),"generation":1,"expected_revision":1});
        let released = first
            .json(
                Method::POST,
                &event.url(&format!("{path}/release")),
                &release,
            )
            .await
            .ok_json();
        assert_eq!(released["writer"], Value::Null, "{released}");
        assert_eq!(released["generation"], 2, "{released}");
        let next = json!({"device":Uuid::new_v4(),"writer_token":Uuid::new_v4(),"request_id":Uuid::new_v4(),"generation":2,"expected_revision":1});
        let resumed = second
            .json(Method::POST, &event.url(&format!("{path}/claim")), &next)
            .await
            .ok_json();
        assert_eq!(resumed["history"], history, "{resumed}");
        assert_eq!(resumed["generation"], 3, "{resumed}");
        assert_eq!(resumed["revision"], 1, "{resumed}");
        for (method, target, request) in [
            (Method::PUT, url.clone(), upload.clone()),
            (
                Method::POST,
                event.url(&format!("{path}/claim")),
                claim.clone(),
            ),
            (Method::POST, event.url(&format!("{path}/release")), release),
        ] {
            let receipt = first.json(method, &target, &request).await.ok_json();
            assert_eq!(receipt["writer"], next["device"], "{receipt}");
            assert_eq!(receipt["generation"], 3, "{receipt}");
        }
        let mut stale = upload.clone();
        stale["request_id"] = json!(Uuid::new_v4());
        stale["expected_revision"] = json!(1);
        let rejected = first.json(Method::PUT, &url, &stale).await.ok_json();
        assert_eq!(rejected["error"]["writer_conflict"], true, "{rejected}");
        assert_eq!(second.get(&url).await.ok_json()["history"], history);
        assert!(event.rounds().await["rounds"][0]["matches"][0]["result"].is_null());
    });
}

#[test]
fn concurrent_takeover_preserves_the_saved_timeline_and_recovers_the_full_old_device_branch() {
    run(async {
        let (mut event, mut first, mut second, played, history) = handover_event().await;
        let path = format!("matches/{}/life-history", played["uuid"].as_str().unwrap());
        let url = event.url(&path);
        let claim = json!({"device":Uuid::new_v4(),"writer_token":Uuid::new_v4(),"request_id":Uuid::new_v4(),"generation":0,"expected_revision":0});
        first
            .json(Method::POST, &event.url(&format!("{path}/claim")), &claim)
            .await
            .ok_json();
        let upload = json!({"device":claim["device"],"writer_token":claim["writer_token"],"request_id":Uuid::new_v4(),"generation":1,"expected_revision":0,"history":history});
        first.json(Method::PUT, &url, &upload).await.ok_json();
        let takeover_url = event.url(&format!("{path}/takeover"));
        let mut intervening = upload.clone();
        intervening["request_id"] = json!(Uuid::new_v4());
        intervening["expected_revision"] = json!(1);
        first.json(Method::PUT, &url, &intervening).await.ok_json();
        let stale_confirmation = json!({"device":Uuid::new_v4(),"writer_token":Uuid::new_v4(),"request_id":Uuid::new_v4(),"generation":1,"expected_revision":1});
        assert_eq!(
            second
                .json(Method::POST, &takeover_url, &stale_confirmation)
                .await
                .ok_json()["error"]["revision_conflict"],
            true
        );
        let take_a = json!({"device":Uuid::new_v4(),"writer_token":Uuid::new_v4(),"request_id":Uuid::new_v4(),"generation":1,"expected_revision":2});
        let take_b = json!({"device":Uuid::new_v4(),"writer_token":Uuid::new_v4(),"request_id":Uuid::new_v4(),"generation":1,"expected_revision":2});
        let (a, b) = tokio::join!(
            first.json(Method::POST, &takeover_url, &take_a),
            second.json(Method::POST, &takeover_url, &take_b)
        );
        let a = a.ok_json();
        let b = b.ok_json();
        assert_ne!(
            a.get("error").is_some(),
            b.get("error").is_some(),
            "{a} {b}"
        );
        let active = second.get(&url).await.ok_json();
        assert_eq!(active["generation"], 2, "{active}");
        assert_eq!(active["history"], history, "{active}");
        let later_takeover = json!({"device":Uuid::new_v4(),"writer_token":Uuid::new_v4(),"request_id":Uuid::new_v4(),"generation":2,"expected_revision":2});
        let later = event
            .owner
            .json(Method::POST, &takeover_url, &later_takeover)
            .await
            .ok_json();
        let late = if a.get("error").is_none() {
            first
                .json(Method::POST, &takeover_url, &take_a)
                .await
                .ok_json()
        } else {
            second
                .json(Method::POST, &takeover_url, &take_b)
                .await
                .ok_json()
        };
        assert_eq!(late["writer"], later["writer"], "{late}");
        assert_eq!(late["generation"], 3, "{late}");
        let winner = later["writer"].clone();
        let mut stale = upload.clone();
        stale["request_id"] = json!(Uuid::new_v4());
        stale["expected_revision"] = json!(1);
        assert_eq!(
            first.json(Method::PUT, &url, &stale).await.ok_json()["error"]["writer_conflict"],
            true
        );
        let mut latest = history.clone();
        latest["games"][0]["life"][0] = json!(14);
        latest["games"][0]["events"].as_array_mut().unwrap().push(json!({"id":Uuid::new_v4(),"kind":"life","at":"2026-10-27T12:00:03Z","player":history["games"][0]["players"][0]["id"],"amount":-4}));
        let capture_url = event.url(&format!("{path}/conflicts"));
        let capture = json!({"request_id":Uuid::new_v4(),"ownership":{"kind":"claim","request":claim},"base_revision":1,"history":latest});
        let saved = first
            .json(Method::POST, &capture_url, &capture)
            .await
            .ok_json();
        assert_eq!(saved["accepted_request"], capture["request_id"], "{saved}");
        assert_eq!(
            first
                .json(Method::POST, &capture_url, &capture)
                .await
                .ok_json(),
            saved
        );
        let listed = second.get(&capture_url).await.ok_json();
        assert_eq!(listed["conflicts"].as_array().unwrap().len(), 1, "{listed}");
        let conflict_url = event.url(&format!(
            "{path}/conflicts/{}",
            listed["conflicts"][0]["id"].as_str().unwrap()
        ));
        assert_eq!(second.get(&conflict_url).await.ok_json()["history"], latest);
        assert!(!event.stranger.get(&capture_url).await.status.is_success());
        assert!(
            !TestClient::new()
                .get(&conflict_url)
                .await
                .status
                .is_success()
        );
        let mut forged = capture.clone();
        forged["request_id"] = json!(Uuid::new_v4());
        forged["ownership"]["request"]["writer_token"] = json!(Uuid::new_v4());
        assert!(
            first
                .json(Method::POST, &capture_url, &forged)
                .await
                .ok_json()
                .get("error")
                .is_some()
        );
        assert!(
            second
                .json(Method::POST, &capture_url, &capture)
                .await
                .ok_json()
                .get("error")
                .is_some()
        );
        let unchanged = second.get(&url).await.ok_json();
        assert_eq!(unchanged["writer"], winner);
        assert_eq!(unchanged["history"], history);
        assert_eq!(unchanged["revision"], 2);
        assert!(event.rounds().await["rounds"][0]["matches"][0]["result"].is_null());
        event
            .result(played["uuid"].as_str().unwrap(), [2, 0], 0)
            .await;
        assert_eq!(event.end(1).await["state"], "Finished");
        assert_eq!(second.get(&conflict_url).await.ok_json()["history"], latest);
        assert_eq!(
            event.rounds().await["rounds"][0]["matches"][0]["result"]["games_won"],
            json!([2, 0])
        );
    });
}

#[test]
fn a_removed_co_organizer_cannot_read_or_claim_guest_match_history_in_a_fresh_request() {
    run(async {
        let mut event = Event::new("Three", 2).await;
        event.pair().await;
        event.start(1).await;
        let rounds = event.rounds().await;
        let played = rounds["rounds"][0]["matches"][0]["uuid"].as_str().unwrap();
        let history = event.url(&format!("matches/{played}/life-history"));
        let account = create_account(Role::Member).await;
        event
            .owner
            .json(
                Method::POST,
                &event.url("organizers"),
                &json!({ "username": account.username }),
            )
            .await
            .ok_json();
        let mut co_organizer = TestClient::logged_in(&account).await;
        assert!(co_organizer.get(&history).await.status.is_success());
        event
            .owner
            .json(
                Method::DELETE,
                &event.url(&format!("organizers/{}", account.uuid.into_inner())),
                &json!({}),
            )
            .await
            .ok_json();
        assert!(!co_organizer.get(&history).await.status.is_success());
        let claim = json!({ "device": Uuid::new_v4(), "writer_token": Uuid::new_v4(), "request_id": Uuid::new_v4(), "generation": 0, "expected_revision": 0 });
        assert!(
            !co_organizer
                .json(
                    Method::POST,
                    &event.url(&format!("matches/{played}/life-history/claim")),
                    &claim
                )
                .await
                .status
                .is_success()
        );
        assert!(event.owner.get(&history).await.ok_json()["writer"].is_null());
    });
}
