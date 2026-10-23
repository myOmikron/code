//! Binding and logging in External identities
//!
//! Needs Postgres, see [`crate::testing`].

use galvyn::core::Module;
use galvyn::core::session::Session;
use galvyn::rorm::Database;

use super::Fixture;
use super::alice;
use super::log_in;
use super::module;
use super::session;
use crate::IdentityModule;
use crate::LoginMethod;
use crate::models::Identity;
use crate::models::IdentityUuid;
use crate::oidc::Admission;
use crate::oidc::ExternalLogin;
use crate::oidc::FakeOpenIdProvider;
use crate::oidc::FakePerson;
use crate::oidc::NewOpenIdProvider;
use crate::oidc::OidcLoginOutcome;
use crate::oidc::PendingExternalIdentity;
use crate::oidc::error::BindError;
use crate::oidc::error::FinishOidcLoginError;
use crate::session::logged_in;
use crate::testing::database;
use crate::testing::run;

/// Bind the session's pending External identity in a committed transaction and log in
pub(super) async fn sign_up(fixture: &Fixture, session: &Session) -> IdentityUuid {
    let mut tx = Database::global().start_transaction().await.unwrap();
    let bound = fixture
        .module
        .bind_pending_external_identity(session, &mut tx)
        .await
        .unwrap_or_else(|error| panic!("bind: {error:?}"));
    let identity = bound.identity();
    tx.commit().await.unwrap();
    fixture.module.log_in_bound(session, bound).await.unwrap();
    identity
}

/// Log `person` in for the first time and sign them up
pub(super) async fn signed_up(
    fixture: &Fixture,
    fake: &FakeOpenIdProvider,
    person: &FakePerson,
) -> IdentityUuid {
    let session = session();
    log_in(fixture, fake, &session, person.clone())
        .await
        .unwrap();
    sign_up(fixture, &session).await
}

/// The stored Identity
pub(super) async fn stored(identity: IdentityUuid) -> Option<Identity> {
    let mut tx = Database::global().start_transaction().await.unwrap();
    let stored = Identity::get_by_uuid(&mut tx, identity).await.unwrap();
    tx.commit().await.unwrap();
    stored
}

#[test]
fn an_unknown_external_identity_ends_as_pending_with_its_email() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let session = session();

        let outcome = log_in(&fixture, &fake, &session, alice()).await.unwrap();

        let expected = PendingExternalIdentity {
            provider: fixture.slug.clone(),
            issuer: fake.issuer().to_string(),
            email: Some("alice@example.org".to_string()),
            email_verified: true,
        };
        assert!(matches!(&outcome, OidcLoginOutcome::Pending(pending) if *pending == expected));
        assert_eq!(
            fixture
                .module
                .pending_external_identity(&session)
                .await
                .unwrap(),
            Some(expected)
        );
        assert_eq!(logged_in(&session).await.unwrap(), None);
    });
}

#[test]
fn an_unverified_email_is_reported_as_such() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;

        let outcome = log_in(&fixture, &fake, &session(), alice().unverified())
            .await
            .unwrap();
        assert!(matches!(outcome, OidcLoginOutcome::Pending(pending) if !pending.email_verified));
    });
}

#[test]
fn binding_creates_identity_and_external_identity_in_the_callers_transaction() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let session = session();
        let person = alice();
        log_in(&fixture, &fake, &session, person.clone())
            .await
            .unwrap();

        let mut tx = Database::global().start_transaction().await.unwrap();
        let bound = fixture
            .module
            .bind_pending_external_identity(&session, &mut tx)
            .await
            .unwrap();
        let identity = bound.identity();
        tx.rollback().await.unwrap();

        assert!(stored(identity).await.is_none());
        assert!(
            fixture
                .module
                .pending_external_identity(&session)
                .await
                .unwrap()
                .is_some()
        );
        let again = log_in(&fixture, &fake, &super::session(), person).await;
        assert!(matches!(again, Ok(OidcLoginOutcome::Pending(_))));

        let identity = sign_up(&fixture, &session).await;
        assert!(stored(identity).await.is_some());
        assert_eq!(logged_in(&session).await.unwrap(), Some(identity));
        assert_eq!(
            fixture
                .module
                .pending_external_identity(&session)
                .await
                .unwrap(),
            None
        );
        assert_eq!(
            fixture
                .module
                .login_method(Database::global(), identity)
                .await
                .unwrap(),
            Some(LoginMethod::External {
                provider: fixture.slug.clone(),
                issuer: fake.issuer().to_string()
            })
        );
    });
}

#[test]
fn nothing_is_bound_without_a_pending_external_identity() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;

        let mut tx = Database::global().start_transaction().await.unwrap();
        let bound = fixture
            .module
            .bind_pending_external_identity(&session(), &mut tx)
            .await;
        tx.rollback().await.unwrap();
        assert!(matches!(bound, Err(BindError::NothingPending)));
    });
}

#[test]
fn a_discarded_external_identity_is_no_longer_pending() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let session = session();
        log_in(&fixture, &fake, &session, alice()).await.unwrap();

        fixture
            .module
            .discard_pending_external_identity(&session)
            .await
            .unwrap();

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
fn an_external_identity_is_bound_only_once() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let person = alice();
        let (first, second) = (session(), session());
        log_in(&fixture, &fake, &first, person.clone())
            .await
            .unwrap();
        log_in(&fixture, &fake, &second, person).await.unwrap();
        sign_up(&fixture, &first).await;

        let mut tx = Database::global().start_transaction().await.unwrap();
        let bound = fixture
            .module
            .bind_pending_external_identity(&second, &mut tx)
            .await;
        tx.rollback().await.unwrap();
        assert!(matches!(bound, Err(BindError::AlreadyBound)));
    });
}

#[test]
fn the_same_value_at_two_providers_names_two_external_identities() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let (one, other) = (
            module(&fake, Admission::Open).await,
            module(&fake, Admission::Open).await,
        );
        let person = alice();
        let first = signed_up(&one, &fake, &person).await;

        let outcome = log_in(&other, &fake, &session(), person.clone()).await;
        assert!(matches!(outcome, Ok(OidcLoginOutcome::Pending(_))));
        let second = signed_up(&other, &fake, &person).await;
        assert_ne!(first, second);
    });
}

#[test]
fn a_known_external_identity_logs_in() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let person = alice();
        let identity = signed_up(&fixture, &fake, &person).await;
        let before = stored(identity).await.unwrap().last_login_at;

        let session = session();
        let outcome = log_in(&fixture, &fake, &session, person).await.unwrap();

        let OidcLoginOutcome::Known(known) = outcome else {
            panic!("not known: {outcome:?}");
        };
        assert_eq!(known.identity(), identity);
        assert_eq!(logged_in(&session).await.unwrap(), None);
        assert_eq!(stored(identity).await.unwrap().last_login_at, before);

        fixture.module.log_in_bound(&session, known).await.unwrap();
        assert_eq!(logged_in(&session).await.unwrap(), Some(identity));
        assert!(stored(identity).await.unwrap().last_login_at > before);
    });
}

#[test]
fn an_invite_only_provider_refuses_an_unknown_external_identity() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::InviteOnly).await;
        let session = session();

        let outcome = log_in(&fixture, &fake, &session, alice()).await;

        assert!(matches!(outcome, Err(FinishOidcLoginError::NotAdmitted)));
        assert_eq!(
            fixture
                .module
                .pending_external_identity(&session)
                .await
                .unwrap(),
            None
        );
    });
}

#[test]
fn an_invite_only_provider_still_logs_in_a_known_external_identity() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let person = alice();
        let identity = signed_up(&fixture, &fake, &person).await;

        IdentityModule::put_openid_provider(
            Database::global(),
            &fake.provider(&fixture.slug, Admission::InviteOnly),
        )
        .await
        .unwrap();

        let outcome = log_in(&fixture, &fake, &session(), person).await;
        assert!(
            matches!(outcome, Ok(OidcLoginOutcome::Known(known)) if known.identity() == identity)
        );
    });
}

#[test]
fn a_configured_identifying_claim_is_honoured() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        IdentityModule::put_openid_provider(
            Database::global(),
            &NewOpenIdProvider {
                identifying_claim: "email".to_string(),
                ..fake.provider(&fixture.slug, Admission::Open)
            },
        )
        .await
        .unwrap();
        let email = format!("{}@example.org", uuid::Uuid::new_v4().simple());
        let identity = signed_up(&fixture, &fake, &FakePerson::new("first", &email)).await;

        let outcome = log_in(
            &fixture,
            &fake,
            &session(),
            FakePerson::new("rotated", &email),
        )
        .await;
        assert!(
            matches!(outcome, Ok(OidcLoginOutcome::Known(known)) if known.identity() == identity)
        );
    });
}

#[test]
fn an_id_token_without_the_identifying_claim_is_refused() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        IdentityModule::put_openid_provider(
            Database::global(),
            &NewOpenIdProvider {
                identifying_claim: "email".to_string(),
                ..fake.provider(&fixture.slug, Admission::Open)
            },
        )
        .await
        .unwrap();
        let person = FakePerson {
            email: None,
            ..alice()
        };

        let outcome = log_in(&fixture, &fake, &session(), person).await;
        assert!(matches!(
            outcome,
            Err(FinishOidcLoginError::MissingIdentifyingClaim)
        ));
    });
}

#[test]
fn a_rotated_signing_key_is_fetched_again() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        log_in(&fixture, &fake, &session(), alice()).await.unwrap();

        fake.rotate_keys();

        let outcome = log_in(&fixture, &fake, &session(), alice()).await;
        assert!(matches!(outcome, Ok(OidcLoginOutcome::Pending(_))));
    });
}

#[test]
fn a_deleted_identity_takes_its_external_identity_along() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let person = alice();
        let identity = signed_up(&fixture, &fake, &person).await;

        fixture
            .module
            .delete_identity(Database::global(), identity)
            .await
            .unwrap();

        let outcome = log_in(&fixture, &fake, &session(), person).await;
        assert!(matches!(outcome, Ok(OidcLoginOutcome::Pending(_))));
    });
}

#[test]
fn an_external_identity_enrolled_without_ceremony_logs_in() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::InviteOnly).await;
        let _ = log_in(&fixture, &fake, &session(), alice()).await;
        let person = alice();
        let mut tx = Database::global().start_transaction().await.unwrap();
        let identity = fixture.module.create_identity(&mut tx).await.unwrap();
        fixture
            .module
            .enroll_external_identity_without_ceremony(
                &mut tx,
                identity,
                &fixture.slug,
                &person.subject,
            )
            .await
            .unwrap();
        tx.commit().await.unwrap();

        let outcome = log_in(&fixture, &fake, &session(), person).await;
        assert!(matches!(
            outcome,
            Ok(OidcLoginOutcome::Known(known)) if known.identity() == identity
        ));
    });
}

#[test]
fn external_logins_name_only_the_external_identities() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let external = signed_up(&fixture, &fake, &alice()).await;
        let mut tx = Database::global().start_transaction().await.unwrap();
        let without = fixture.module.create_identity(&mut tx).await.unwrap();
        tx.commit().await.unwrap();

        let logins = fixture
            .module
            .external_logins(Database::global(), &[external, without])
            .await
            .unwrap();

        assert_eq!(logins.len(), 1, "{logins:?}");
        assert_eq!(
            logins.get(&external),
            Some(&ExternalLogin {
                provider: fixture.slug.clone(),
                display_name: format!("Fake {}", fixture.slug),
                issuer: fake.issuer().to_string(),
            })
        );
        assert!(
            fixture
                .module
                .external_logins(Database::global(), &[])
                .await
                .unwrap()
                .is_empty()
        );
    });
}

#[cfg(feature = "passkey")]
mod local_or_external {
    use galvyn::core::Module;
    use galvyn::rorm::Database;
    use galvyn::rorm::fields::types::MaxStr;

    use super::alice;
    use super::module;
    use super::signed_up;
    use crate::FinishDeviceEnrollmentError;
    use crate::oidc::Admission;
    use crate::oidc::FakeOpenIdProvider;
    use crate::oidc::error::EnrollExternalIdentityError;
    use crate::oidc::tests::session;
    use crate::testing::database;
    use crate::testing::run;

    #[test]
    fn passkey_enrollment_for_an_external_identity_is_refused() {
        run(async {
            database().await;
            let fake = FakeOpenIdProvider::start().await;
            let fixture = module(&fake, Admission::Open).await;
            let identity = signed_up(&fixture, &fake, &alice()).await;
            let session = session();

            fixture
                .module
                .begin_device_enrollment(&session, identity, "alice")
                .await
                .unwrap();
            let finished = fixture
                .module
                .finish_device_enrollment(&session, identity, serde_json::json!({}), None)
                .await;

            assert!(matches!(
                finished,
                Err(FinishDeviceEnrollmentError::ExternalIdentity)
            ));
        });
    }

    #[test]
    fn oidc_enrollment_for_a_local_identity_is_refused() {
        run(async {
            database().await;
            let fake = FakeOpenIdProvider::start().await;
            let fixture = module(&fake, Admission::Open).await;
            signed_up(&fixture, &fake, &alice()).await;
            let mut tx = Database::global().start_transaction().await.unwrap();
            let identity = fixture.module.create_identity(&mut tx).await.unwrap();
            fixture
                .module
                .enroll_passkey_without_ceremony(
                    &mut tx,
                    identity,
                    MaxStr::new("Phone".to_string()).unwrap(),
                )
                .await
                .unwrap();

            let enrolled = fixture
                .module
                .enroll_external_identity_without_ceremony(
                    &mut tx,
                    identity,
                    &fixture.slug,
                    "someone",
                )
                .await;
            tx.rollback().await.unwrap();

            assert!(matches!(
                enrolled,
                Err(EnrollExternalIdentityError::LocalIdentity)
            ));
        });
    }
}
