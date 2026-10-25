//! Bug reports: sending one, the Admins' notice mail, the admin dashboard and the purge

use galvyn::core::Module;
use galvyn::core::re_exports::axum::body::Body;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::http::header;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Database;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value as SqlValue;
use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::models::account::Role;
use crate::models::bug_report::BugReport;
use crate::tests::deletion::delete;
use crate::tests::harness::TestAccount;
use crate::tests::harness::TestClient;
use crate::tests::harness::TestResponse;
use crate::tests::harness::api;
use crate::tests::harness::create_account;
use crate::tests::harness::request;
use crate::tests::harness::run;
use crate::utils::mail::outbox;

/// The boundary of every multipart body the tests send
const BOUNDARY: &str = "bug-report-test-boundary";

/// The start of a PNG, enough for the server to take it as one
fn png() -> Vec<u8> {
    let mut data = b"\x89PNG\r\n\x1a\n".to_vec();
    data.extend_from_slice(&[0; 64]);
    data
}

/// The start of a JPEG, enough for the server to take it as one
fn jpeg() -> Vec<u8> {
    let mut data = vec![0xFF, 0xD8, 0xFF, 0xE0];
    data.extend_from_slice(&[0; 64]);
    data
}

/// A diagnostics document like the browser builds one
fn diagnostics() -> Value {
    json!({
        "requests": [{
            "method": "GET",
            "path": "/api/frontend/v1/decks?search",
            "status": 500,
            "duration_ms": 31,
            "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
        }],
        "console": [{ "kind": "console-error", "message": "diagnostics-marker", "stack": null }],
        "error": null,
        "scanner": null,
    })
}

/// The `report` part of a Bug report saying `text`
fn report(text: &str) -> Value {
    json!({
        "text": text,
        "route": "/decks/abc",
        "release": "0.42.0",
        "user_agent": "Mozilla/5.0 (Test)",
        "viewport": "390x844",
        "language": "de-DE",
        "diagnostics": diagnostics(),
    })
}

/// Sends a multipart body of a `report` part and `images` parts as given
async fn send_parts(
    client: &mut TestClient,
    report: Option<&Value>,
    images: &[(&str, Vec<u8>)],
) -> TestResponse {
    let mut body = Vec::new();
    if let Some(report) = report {
        body.extend_from_slice(
            format!(
                "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"report\"\r\n\
                 Content-Type: application/json\r\n\r\n"
            )
            .as_bytes(),
        );
        body.extend_from_slice(&serde_json::to_vec(report).expect("serializable report"));
        body.extend_from_slice(b"\r\n");
    }
    for (index, (content_type, data)) in images.iter().enumerate() {
        body.extend_from_slice(
            format!(
                "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"images\"; \
                 filename=\"image{index}\"\r\nContent-Type: {content_type}\r\n\r\n"
            )
            .as_bytes(),
        );
        body.extend_from_slice(data);
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(format!("--{BOUNDARY}--\r\n").as_bytes());

    client
        .send(
            request(Method::POST, &api("bug-reports"))
                .header(
                    header::CONTENT_TYPE,
                    format!("multipart/form-data; boundary={BOUNDARY}"),
                )
                .body(Body::from(body))
                .expect("valid request"),
        )
        .await
}

/// Sends a Bug report saying `text` with `images`, returning the response body
async fn send(client: &mut TestClient, text: &str, images: &[(&str, Vec<u8>)]) -> Value {
    send_parts(client, Some(&report(text)), images)
        .await
        .ok_json()
}

/// Sends a Bug report saying `text` and returns its number
async fn sent(client: &mut TestClient, text: &str) -> i64 {
    let body = send(client, text, &[("image/png", png())]).await;
    body["number"]
        .as_i64()
        .unwrap_or_else(|| panic!("no number: {body}"))
}

/// A text nobody else sends, for finding a Bug report's mails
fn unique_text() -> String {
    format!("The deck page shows nothing {}", Uuid::new_v4().simple())
}

/// The address [`create_account`] gives `account`
fn email(account: &TestAccount) -> String {
    format!("{}@mtg.test", account.username)
}

/// The Bug report `number` as the Admin behind `admin` sees it in the list for `filter`
///
/// Asks for the one Bug report before `number + 1`, so reports of other tests
/// do not push it off the page.
async fn listed(admin: &mut TestClient, number: i64, filter: &str) -> Option<Value> {
    let body = admin
        .get(&api(&format!(
            "admin/bug-reports?filter={filter}&after={}&limit=1",
            number + 1
        )))
        .await
        .ok_json();
    body["reports"]
        .as_array()
        .expect("a list")
        .iter()
        .find(|report| report["number"] == number)
        .cloned()
}

/// The detail of the Bug report `number`
async fn detail(admin: &mut TestClient, number: i64) -> Value {
    admin
        .get(&api(&format!("admin/bug-reports/{number}")))
        .await
        .ok_json()
}

/// Runs `statement` with `values` outside the API, for state no request can make
async fn execute(statement: &str, values: Vec<SqlValue<'_>>) {
    let mut tx = Database::global()
        .start_transaction()
        .await
        .expect("start a transaction");
    (&mut tx)
        .execute::<All>(statement.to_string(), values)
        .await
        .expect("run the statement");
    tx.commit().await.expect("commit");
}

#[test]
fn a_player_sends_a_bug_report_and_gets_increasing_numbers() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&member).await;

        let first = sent(&mut client, &unique_text()).await;
        let second = sent(&mut client, &unique_text()).await;

        assert!(first > 0);
        assert!(second > first, "{second} after {first}");
    });
}

#[test]
fn a_bug_report_needs_a_text_of_at_most_5000_characters() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&member).await;

        let empty = send(&mut client, "   ", &[]).await;
        assert_eq!(empty["result"], "Err");
        assert_eq!(empty["error"]["text_missing"], true);

        let long = send(&mut client, &"ä".repeat(5001), &[]).await;
        assert_eq!(long["error"]["text_too_long"], true);

        let longest = send(&mut client, &"ä".repeat(5000), &[]).await;
        assert!(longest["number"].is_i64(), "{longest}");

        let mut without_text = report("ignored");
        without_text
            .as_object_mut()
            .expect("an object")
            .remove("text");
        let missing = send_parts(&mut client, Some(&without_text), &[])
            .await
            .ok_json();
        assert_eq!(missing["error"]["report_invalid"], true);

        let no_report = send_parts(&mut client, None, &[("image/png", png())])
            .await
            .ok_json();
        assert_eq!(no_report["error"]["report_invalid"], true);
    });
}

#[test]
fn a_bug_report_takes_at_most_three_images_of_5_mb() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&member).await;
        let text = unique_text();

        let four = send(
            &mut client,
            &text,
            &[
                ("image/png", png()),
                ("image/png", png()),
                ("image/png", png()),
                ("image/png", png()),
            ],
        )
        .await;
        assert_eq!(four["error"]["too_many_images"], true);

        let mut large = jpeg();
        large.resize(5 * 1024 * 1024 + 1, 0);
        let too_large = send(&mut client, &text, &[("image/jpeg", large)]).await;
        assert_eq!(too_large["error"]["image_too_large"], true);

        let not_an_image = send(
            &mut client,
            &text,
            &[("text/plain", b"just some words".to_vec())],
        )
        .await;
        assert_eq!(not_an_image["error"]["image_invalid"], true);

        let three = send(
            &mut client,
            &text,
            &[
                ("image/png", png()),
                ("image/jpeg", jpeg()),
                ("image/png", png()),
            ],
        )
        .await;
        assert!(three["number"].is_i64(), "{three}");
    });
}

#[test]
fn a_visitor_cannot_send_a_bug_report() {
    run(async {
        let response = send_parts(&mut TestClient::new(), Some(&report(&unique_text())), &[]).await;
        assert_eq!(response.status, StatusCode::UNAUTHORIZED);
    });
}

#[test]
fn the_sixteenth_bug_report_within_an_hour_is_refused() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&member).await;
        for _ in 0..15 {
            sent(&mut client, &unique_text()).await;
        }

        let sixteenth = send(&mut client, &unique_text(), &[]).await;
        assert_eq!(sixteenth["result"], "Err");
        assert_eq!(sixteenth["error"]["rate_limited"], true);

        execute(
            "UPDATE bug_report SET created_at = now() - interval '61 minutes' WHERE reporter = $1",
            vec![SqlValue::Uuid(member.uuid.into_inner())],
        )
        .await;
        let later = send(&mut client, &unique_text(), &[]).await;
        assert!(later["number"].is_i64(), "{later}");
    });
}

#[test]
fn every_admin_is_mailed_a_notice_without_diagnostics() {
    run(async {
        let first_admin = create_account(Role::Admin).await;
        let second_admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let text = unique_text();

        let number = sent(&mut TestClient::logged_in(&member).await, &text).await;

        for admin in [&first_admin, &second_admin] {
            let mails = outbox::sent_to(&email(admin))
                .into_iter()
                .filter(|mail| mail.subject.contains(&format!("#{number} ")))
                .collect::<Vec<_>>();
            assert_eq!(mails.len(), 1, "{mails:?}");
            let body = &mails[0].text_body;
            assert!(body.contains(&text), "{body}");
            assert!(body.contains(&member.username), "{body}");
            assert!(body.contains("/decks/abc"), "{body}");
            assert!(body.contains("0.42.0"), "{body}");
            assert!(
                body.contains(&format!("http://mtg.test/admin/bug-reports/{number}")),
                "{body}"
            );
            assert!(!body.contains("diagnostics-marker"), "{body}");
            assert!(!body.contains("4bf92f3577b34da6a3ce929d0e0e4736"), "{body}");
            assert!(mails[0].attachments.is_empty());
        }
        assert!(
            outbox::sent_to(&email(&member)).is_empty(),
            "the reporter is no Admin"
        );
    });
}

#[test]
fn the_list_shows_open_bug_reports_by_default() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let number = sent(&mut TestClient::logged_in(&member).await, &unique_text()).await;
        let mut client = TestClient::logged_in(&admin).await;

        let body = client
            .get(&api(&format!(
                "admin/bug-reports?after={}&limit=1",
                number + 1
            )))
            .await
            .ok_json();
        let report = &body["reports"][0];
        assert_eq!(report["number"], number);
        assert_eq!(report["state"], "Open");
        assert_eq!(report["reporter"]["username"], member.username.as_str());
        assert_eq!(report["route"], "/decks/abc");
        assert_eq!(report["release"], "0.42.0");
        assert!(report["created_at"].is_string());

        assert!(listed(&mut client, number, "Done").await.is_none());
        assert!(listed(&mut client, number, "All").await.is_some());
    });
}

#[test]
fn an_admin_reads_a_bug_report_with_diagnostics_and_images() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let text = unique_text();
        let body = send(
            &mut TestClient::logged_in(&member).await,
            &text,
            &[("image/png", png()), ("image/jpeg", jpeg())],
        )
        .await;
        let number = body["number"].as_i64().expect("a number");
        let mut client = TestClient::logged_in(&admin).await;

        let detail = detail(&mut client, number).await;
        assert_eq!(detail["text"], text.as_str());
        assert_eq!(detail["user_agent"], "Mozilla/5.0 (Test)");
        assert_eq!(detail["viewport"], "390x844");
        assert_eq!(detail["language"], "de-DE");
        assert_eq!(detail["diagnostics"], diagnostics());
        assert_eq!(detail["purged_at"], Value::Null);

        let images = detail["images"].as_array().expect("a list");
        assert_eq!(images.len(), 2);
        assert_eq!(images[0]["content_type"], "image/png");
        assert_eq!(images[1]["content_type"], "image/jpeg");

        let image = client
            .get(&api(&format!(
                "admin/bug-reports/{number}/images/{}",
                images[1]["uuid"].as_str().expect("a uuid")
            )))
            .await;
        assert_eq!(image.status, StatusCode::OK);
        assert_eq!(image.headers[header::CONTENT_TYPE], "image/jpeg");
        assert_eq!(image.body.as_ref(), jpeg().as_slice());
    });
}

#[test]
fn an_admin_marks_a_bug_report_done_and_reopens_it() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let number = sent(&mut TestClient::logged_in(&member).await, &unique_text()).await;
        let mut client = TestClient::logged_in(&admin).await;

        let done = client
            .json(
                Method::POST,
                &api(&format!("admin/bug-reports/{number}/done")),
                &json!({}),
            )
            .await
            .ok_json();
        assert_eq!(done, Value::Null);

        assert!(listed(&mut client, number, "Open").await.is_none());
        assert_eq!(
            listed(&mut client, number, "Done").await.expect("listed")["state"],
            "Done"
        );
        let detail_done = detail(&mut client, number).await;
        assert_eq!(detail_done["done_by"]["username"], admin.username.as_str());
        assert!(detail_done["done_at"].is_string());

        client
            .json(
                Method::POST,
                &api(&format!("admin/bug-reports/{number}/reopen")),
                &json!({}),
            )
            .await
            .ok_json();
        assert!(listed(&mut client, number, "Open").await.is_some());
        let reopened = detail(&mut client, number).await;
        assert_eq!(reopened["done_by"], Value::Null);
        assert_eq!(reopened["done_at"], Value::Null);
    });
}

#[test]
fn an_admin_notes_a_bug_report() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let number = sent(&mut TestClient::logged_in(&member).await, &unique_text()).await;
        let mut client = TestClient::logged_in(&admin).await;
        let note = &api(&format!("admin/bug-reports/{number}/note"));

        client
            .json(Method::PUT, note, &json!({ "note": " GitHub #301 " }))
            .await
            .ok_json();
        assert_eq!(detail(&mut client, number).await["note"], "GitHub #301");

        client
            .json(Method::PUT, note, &json!({ "note": "  " }))
            .await
            .ok_json();
        assert_eq!(detail(&mut client, number).await["note"], Value::Null);
    });
}

#[test]
fn a_member_is_refused_every_admin_bug_report_route() {
    run(async {
        let member = create_account(Role::Member).await;
        let mut client = TestClient::logged_in(&member).await;
        let number = sent(&mut client, &unique_text()).await;
        let image = Uuid::new_v4();

        let responses = [
            client.get(&api("admin/bug-reports")).await,
            client
                .get(&api(&format!("admin/bug-reports/{number}")))
                .await,
            client
                .get(&api(&format!("admin/bug-reports/{number}/images/{image}")))
                .await,
            client
                .json(
                    Method::POST,
                    &api(&format!("admin/bug-reports/{number}/done")),
                    &json!({}),
                )
                .await,
            client
                .json(
                    Method::POST,
                    &api(&format!("admin/bug-reports/{number}/reopen")),
                    &json!({}),
                )
                .await,
            client
                .json(
                    Method::PUT,
                    &api(&format!("admin/bug-reports/{number}/note")),
                    &json!({ "note": "mine" }),
                )
                .await,
        ];
        for response in responses {
            assert_eq!(response.status, StatusCode::FORBIDDEN, "{response:?}");
        }
    });
}

#[test]
fn a_deletion_takes_the_accounts_bug_reports() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let mut client = TestClient::logged_in(&admin).await;

        for mode in ["Tombstone", "Full"] {
            let member = create_account(Role::Member).await;
            let number = sent(&mut TestClient::logged_in(&member).await, &unique_text()).await;

            delete(&mut client, &member, &member.username, mode).await;

            let response = client
                .get(&api(&format!("admin/bug-reports/{number}")))
                .await;
            assert_eq!(response.status, StatusCode::BAD_REQUEST, "{mode}");
        }

        let member = create_account(Role::Member).await;
        let mut own = TestClient::logged_in(&member).await;
        let number = sent(&mut own, &unique_text()).await;
        own.json(
            Method::DELETE,
            &api("accounts/me"),
            &json!({ "username": member.username }),
        )
        .await
        .ok_json();
        let response = client
            .get(&api(&format!("admin/bug-reports/{number}")))
            .await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST);
    });
}

#[test]
fn a_deleted_admin_leaves_its_done_bug_reports_done() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let other_admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let number = sent(&mut TestClient::logged_in(&member).await, &unique_text()).await;
        TestClient::logged_in(&other_admin)
            .await
            .json(
                Method::POST,
                &api(&format!("admin/bug-reports/{number}/done")),
                &json!({}),
            )
            .await
            .ok_json();
        let mut client = TestClient::logged_in(&admin).await;

        delete(&mut client, &other_admin, &other_admin.username, "Full").await;

        let detail = detail(&mut client, number).await;
        assert_eq!(detail["report"]["state"], "Done");
        assert_eq!(detail["done_by"], Value::Null);
        assert!(detail["done_at"].is_string());
    });
}

#[test]
fn the_purge_takes_images_and_diagnostics_of_long_done_bug_reports() {
    run(async {
        let admin = create_account(Role::Admin).await;
        let member = create_account(Role::Member).await;
        let mut reporter = TestClient::logged_in(&member).await;
        let mut client = TestClient::logged_in(&admin).await;
        let long_done_text = unique_text();
        let long_done = sent(&mut reporter, &long_done_text).await;
        let recently_done = sent(&mut reporter, &unique_text()).await;
        let open = sent(&mut reporter, &unique_text()).await;
        for number in [long_done, recently_done] {
            client
                .json(
                    Method::POST,
                    &api(&format!("admin/bug-reports/{number}/done")),
                    &json!({}),
                )
                .await
                .ok_json();
        }
        client
            .json(
                Method::PUT,
                &api(&format!("admin/bug-reports/{long_done}/note")),
                &json!({ "note": "GitHub #12" }),
            )
            .await
            .ok_json();
        execute(
            "UPDATE bug_report SET done_at = now() - interval '91 days' WHERE id = $1",
            vec![SqlValue::I64(long_done)],
        )
        .await;

        let mut tx = Database::global()
            .start_transaction()
            .await
            .expect("start a transaction");
        let purged = BugReport::purge(&mut tx, OffsetDateTime::now_utc())
            .await
            .expect("purge");
        tx.commit().await.expect("commit");
        assert!(purged >= 1);

        let gone = detail(&mut client, long_done).await;
        assert_eq!(gone["diagnostics"], Value::Null);
        assert_eq!(gone["images"], json!([]));
        assert!(gone["purged_at"].is_string());
        assert_eq!(gone["report"]["purged"], true);
        assert_eq!(gone["text"], long_done_text.as_str());
        assert_eq!(gone["note"], "GitHub #12");
        assert_eq!(gone["report"]["route"], "/decks/abc");

        for kept in [recently_done, open] {
            let kept = detail(&mut client, kept).await;
            assert_eq!(kept["diagnostics"], diagnostics());
            assert_eq!(kept["images"].as_array().map(Vec::len), Some(1));
            assert_eq!(kept["purged_at"], Value::Null);
        }

        client
            .json(
                Method::POST,
                &api(&format!("admin/bug-reports/{long_done}/reopen")),
                &json!({}),
            )
            .await
            .ok_json();
        let reopened = detail(&mut client, long_done).await;
        assert_eq!(reopened["report"]["state"], "Open");
        assert_eq!(reopened["diagnostics"], Value::Null);
        assert_eq!(reopened["images"], json!([]));
    });
}
