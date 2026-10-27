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
