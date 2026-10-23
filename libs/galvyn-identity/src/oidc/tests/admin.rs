//! The admin handlers of the OpenID providers, driven through their router
//!
//! Needs Postgres, see [`crate::testing`].

use galvyn::core::Module;
use galvyn::core::re_exports::axum::body::Body;
use galvyn::core::re_exports::axum::body::to_bytes;
use galvyn::core::re_exports::axum::http::Method;
use galvyn::core::re_exports::axum::http::Request;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::http::header;
use galvyn::rorm::Database;
use serde_json::Value;
use serde_json::json;
use tower::ServiceExt;

use super::Fixture;
use super::alice;
use super::db::signed_up;
use super::fresh_slug;
use super::log_in;
use super::module;
use super::prepared;
use super::session;
use crate::oidc::Admission;
use crate::oidc::FakeOpenIdProvider;
use crate::oidc::OidcLoginOutcome;
use crate::oidc::OpenAdmission;
use crate::oidc::error::BeginOidcLoginError;
use crate::oidc::error::BindError;
use crate::oidc::error::FinishOidcLoginError;
use crate::oidc::openid_provider_admin_routes;
use crate::testing::database;
use crate::testing::run;

/// Send a request to the admin routes, answering status and JSON body
async fn send(method: Method, path: &str, body: Option<Value>) -> (StatusCode, Value) {
    let (router, _) = openid_provider_admin_routes().finish();
    let request = Request::builder().method(method).uri(path);
    let request = match body {
        Some(body) => request
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body.to_string())),
        None => request.body(Body::empty()),
    }
    .expect("a valid request");
    let response = router.oneshot(request).await.expect("an infallible router");
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("read the body");
    let text = String::from_utf8(bytes.to_vec()).expect("a utf-8 body");
    assert!(
        !text.contains("fake-client-secret") && !text.contains("wrong"),
        "{text}"
    );
    let body = match text.is_empty() {
        true => Value::Null,
        false => serde_json::from_str(&text).unwrap_or(Value::String(text)),
    };
    (status, body)
}

/// The fields of a provider pointing at `fake`, as a create or edit request sends them
fn provider_json(fake: &FakeOpenIdProvider, slug: &str) -> Value {
    json!({
        "slug": slug,
        "display_name": "Authentik",
        "discovery_url": format!("{}/.well-known/openid-configuration", fake.issuer()),
        "client_id": fake.client_id(),
        "client_secret": fake.client_secret(),
        "identifying_claim": "sub",
        "admission": "open",
    })
}

/// The edit request keeping the fields of [`provider_json`], with `changes` applied
fn edit_json(fake: &FakeOpenIdProvider, changes: Value) -> Value {
    let mut edit = provider_json(fake, "");
    let edit_fields = edit.as_object_mut().expect("an object");
    edit_fields.remove("slug");
    edit_fields.remove("client_secret");
    for (key, value) in changes.as_object().expect("an object") {
        edit_fields.insert(key.clone(), value.clone());
    }
    edit
}

/// The listed provider named `slug`
async fn listed(slug: &str) -> Option<Value> {
    let (status, body) = send(Method::GET, "/", None).await;
    assert_eq!(status, StatusCode::OK);
    body["providers"]
        .as_array()
        .expect("a provider list")
        .iter()
        .find(|provider| provider["slug"] == slug)
        .cloned()
}

/// The form error a handler answered, if it answered one
fn form_error(body: &Value) -> Option<&Value> {
    (body["result"] == "Err").then(|| &body["error"])
}

#[test]
fn every_handler_has_its_own_operation_id() {
    let (_, routes) = openid_provider_admin_routes().finish();
    let mut ids: Vec<_> = routes.iter().map(|route| route.handler.ident).collect();
    let count = ids.len();
    ids.sort_unstable();
    ids.dedup();
    assert_eq!(ids.len(), count);
    assert_eq!(count, 6);
}

#[test]
fn a_created_provider_is_listed_without_its_client_secret() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let slug = fresh_slug();

        let (status, body) = send(Method::POST, "/", Some(provider_json(&fake, &slug))).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(form_error(&body), None);

        let provider = listed(&slug).await.expect("the provider is listed");
        assert_eq!(provider["display_name"], "Authentik");
        assert_eq!(provider["client_id"], fake.client_id());
        assert_eq!(provider["identifying_claim"], "sub");
        assert_eq!(provider["admission"], "open");
        assert_eq!(provider["active"], true);
        assert_eq!(provider["issuer"], Value::Null);
        assert_eq!(provider.get("client_secret"), None);

        let fixture = Fixture {
            module: prepared(OpenAdmission::PendingInSession).await,
            slug,
        };
        let outcome = log_in(&fixture, &fake, &session(), alice()).await;
        assert!(matches!(outcome, Ok(OidcLoginOutcome::Pending(_))));
    });
}

#[test]
fn a_taken_slug_and_an_invalid_field_are_refused() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;

        let (_, body) = send(Method::POST, "/", Some(provider_json(&fake, &fixture.slug))).await;
        assert_eq!(form_error(&body).unwrap()["slug_taken"], true);

        let (_, body) = send(Method::POST, "/", Some(provider_json(&fake, "Not A Slug"))).await;
        assert_eq!(form_error(&body).unwrap()["invalid_field"], "slug");
        assert_eq!(listed("Not A Slug").await, None);
    });
}

#[test]
fn editing_overwrites_the_client_secret_and_keeps_it_when_left_out() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let slug = fresh_slug();
        let mut wrong_secret = provider_json(&fake, &slug);
        wrong_secret["client_secret"] = json!("wrong");
        send(Method::POST, "/", Some(wrong_secret)).await;
        let fixture = Fixture {
            module: prepared(OpenAdmission::PendingInSession).await,
            slug: slug.clone(),
        };
        let refused = log_in(&fixture, &fake, &session(), alice()).await;
        assert!(matches!(
            refused,
            Err(FinishOidcLoginError::TokenExchangeFailed)
        ));

        let (status, body) = send(
            Method::PUT,
            &format!("/{slug}"),
            Some(edit_json(
                &fake,
                json!({ "client_secret": fake.client_secret() }),
            )),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(form_error(&body), None);
        let outcome = log_in(&fixture, &fake, &session(), alice()).await;
        assert!(matches!(outcome, Ok(OidcLoginOutcome::Pending(_))));

        let (_, body) = send(
            Method::PUT,
            &format!("/{slug}"),
            Some(edit_json(&fake, json!({ "display_name": "Renamed" }))),
        )
        .await;
        assert_eq!(form_error(&body), None);
        assert_eq!(listed(&slug).await.unwrap()["display_name"], "Renamed");
        let outcome = log_in(&fixture, &fake, &session(), alice()).await;
        assert!(matches!(outcome, Ok(OidcLoginOutcome::Pending(_))));
    });
}

#[test]
fn editing_an_unknown_provider_is_refused() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let (status, _) = send(
            Method::PUT,
            &format!("/{}", fresh_slug()),
            Some(edit_json(&fake, json!({}))),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    });
}

#[test]
fn the_identifying_claim_of_a_referenced_provider_is_frozen() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let path = format!("/{}", fixture.slug);
        let by_email = edit_json(&fake, json!({ "identifying_claim": "email" }));

        let (_, body) = send(Method::PUT, &path, Some(by_email.clone())).await;
        assert_eq!(form_error(&body), None);
        let (_, body) = send(Method::PUT, &path, Some(edit_json(&fake, json!({})))).await;
        assert_eq!(form_error(&body), None);

        signed_up(&fixture, &fake, &alice()).await;

        let (_, body) = send(Method::PUT, &path, Some(by_email)).await;
        assert_eq!(form_error(&body).unwrap()["identifying_claim_frozen"], true);
        assert_eq!(
            listed(&fixture.slug).await.unwrap()["identifying_claim"],
            "sub"
        );
    });
}

#[test]
fn the_issuer_of_a_referenced_provider_is_frozen() {
    run(async {
        database().await;
        let (fake, other) = (
            FakeOpenIdProvider::start().await,
            FakeOpenIdProvider::start().await,
        );
        let fixture = module(&fake, Admission::Open).await;
        let path = format!("/{}", fixture.slug);
        signed_up(&fixture, &fake, &alice()).await;

        let (_, body) = send(
            Method::PUT,
            &path,
            Some(edit_json(&fake, json!({ "discovery_url": other.issuer() }))),
        )
        .await;
        assert_eq!(form_error(&body).unwrap()["issuer_frozen"], true);

        let (_, body) = send(
            Method::PUT,
            &path,
            Some(edit_json(&fake, json!({ "discovery_url": fake.issuer() }))),
        )
        .await;
        assert_eq!(form_error(&body), None);
        let outcome = log_in(&fixture, &fake, &session(), alice()).await;
        assert!(matches!(outcome, Ok(OidcLoginOutcome::Pending(_))));
    });
}

#[test]
fn an_unreferenced_provider_can_move_to_another_issuer() {
    run(async {
        database().await;
        let (fake, other) = (
            FakeOpenIdProvider::start().await,
            FakeOpenIdProvider::start().await,
        );
        let fixture = module(&fake, Admission::Open).await;
        log_in(&fixture, &fake, &session(), alice()).await.unwrap();
        assert_eq!(
            listed(&fixture.slug).await.unwrap()["issuer"],
            fake.issuer()
        );

        let (_, body) = send(
            Method::PUT,
            &format!("/{}", fixture.slug),
            Some(edit_json(
                &other,
                json!({ "discovery_url": other.issuer() }),
            )),
        )
        .await;
        assert_eq!(form_error(&body), None);

        let outcome = log_in(&fixture, &other, &session(), alice()).await;
        assert!(matches!(outcome, Ok(OidcLoginOutcome::Pending(_))));
        assert_eq!(
            listed(&fixture.slug).await.unwrap()["issuer"],
            other.issuer()
        );
    });
}

#[test]
fn a_deactivated_providers_login_is_refused_until_it_is_reactivated() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let person = alice();
        let identity = signed_up(&fixture, &fake, &person).await;

        let (status, _) = send(Method::POST, &format!("/{}/deactivate", fixture.slug), None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(listed(&fixture.slug).await.unwrap()["active"], false);
        let begun = fixture
            .module
            .begin_oidc_login(&session(), &fixture.slug, false)
            .await;
        assert!(matches!(begun, Err(BeginOidcLoginError::UnknownProvider)));

        let (status, _) = send(Method::POST, &format!("/{}/reactivate", fixture.slug), None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(listed(&fixture.slug).await.unwrap()["active"], true);
        let outcome = log_in(&fixture, &fake, &session(), person).await;
        assert!(
            matches!(outcome, Ok(OidcLoginOutcome::Known(known)) if known.identity() == identity)
        );
    });
}

#[test]
fn a_login_begun_before_deactivation_is_refused() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let session = session();
        let authorization = fixture
            .module
            .begin_oidc_login(&session, &fixture.slug, false)
            .await
            .unwrap();
        let back = fake.authorize(&authorization, alice());

        send(Method::POST, &format!("/{}/deactivate", fixture.slug), None).await;

        let finished = fixture
            .module
            .finish_oidc_login(&session, &fixture.slug, super::callback(&back))
            .await;
        assert!(matches!(
            finished,
            Err(FinishOidcLoginError::UnknownProvider)
        ));
    });
}

#[test]
fn a_pending_external_identity_of_a_deactivated_provider_is_not_bound() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let session = session();
        log_in(&fixture, &fake, &session, alice()).await.unwrap();

        send(Method::POST, &format!("/{}/deactivate", fixture.slug), None).await;

        let mut tx = Database::global().start_transaction().await.unwrap();
        let bound = fixture
            .module
            .bind_pending_external_identity(&session, &mut tx)
            .await;
        tx.rollback().await.unwrap();
        assert!(matches!(bound, Err(BindError::NothingPending)));
    });
}

#[test]
fn a_referenced_provider_is_not_deleted() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let person = alice();
        signed_up(&fixture, &fake, &person).await;

        let (_, body) = send(Method::DELETE, &format!("/{}", fixture.slug), None).await;
        assert_eq!(form_error(&body).unwrap()["referenced"], true);

        assert!(listed(&fixture.slug).await.is_some());
        let outcome = log_in(&fixture, &fake, &session(), person).await;
        assert!(matches!(outcome, Ok(OidcLoginOutcome::Known(_))));
    });
}

#[test]
fn an_unreferenced_provider_is_deleted() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        log_in(&fixture, &fake, &session(), alice()).await.unwrap();

        let (status, body) = send(Method::DELETE, &format!("/{}", fixture.slug), None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(form_error(&body), None);

        assert_eq!(listed(&fixture.slug).await, None);
        let begun = fixture
            .module
            .begin_oidc_login(&session(), &fixture.slug, false)
            .await;
        assert!(matches!(begun, Err(BeginOidcLoginError::UnknownProvider)));
    });
}

#[test]
fn deactivating_or_deleting_an_unknown_provider_is_refused() {
    run(async {
        database().await;
        let slug = fresh_slug();
        for (method, path) in [
            (Method::POST, format!("/{slug}/deactivate")),
            (Method::POST, format!("/{slug}/reactivate")),
            (Method::DELETE, format!("/{slug}")),
        ] {
            let (status, _) = send(method, &path, None).await;
            assert_eq!(status, StatusCode::BAD_REQUEST, "{path}");
        }
    });
}
