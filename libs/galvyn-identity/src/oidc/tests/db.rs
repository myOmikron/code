//! OIDC login against the fake OpenID provider, with a database
//!
//! Needs Postgres, see [`crate::testing`].

use galvyn::core::Module;
use galvyn::rorm::Database;

use super::PROVIDER;
use super::alice;
use super::log_in;
use super::module;
use super::session;
use crate::IdentityModule;
use crate::LoginMethod;
use crate::models::Identity;
use crate::models::IdentityUuid;
use crate::oidc::FakeOpenIdProvider;
use crate::oidc::FakePerson;
use crate::oidc::OidcLoginOutcome;
use crate::oidc::PendingExternalIdentity;
use crate::oidc::error::BindError;
use crate::oidc::error::FinishOidcLoginError;
use crate::session::logged_in;
use crate::testing::database;
use crate::testing::run;

/// Bind the session's pending External identity in a committed transaction and log in
async fn sign_up(
    module: &IdentityModule,
    session: &galvyn::core::session::Session,
) -> IdentityUuid {
    let mut tx = Database::global().start_transaction().await.unwrap();
    let bound = module
        .bind_pending_external_identity(session, &mut tx)
        .await
        .unwrap_or_else(|error| panic!("bind: {error:?}"));
    let identity = bound.identity();
    tx.commit().await.unwrap();
    module.log_in_bound(session, bound).await.unwrap();
    identity
}

/// The stored Identity
async fn stored(identity: IdentityUuid) -> Option<Identity> {
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
        let module = module(&fake, true).await;
        let session = session();

        let outcome = log_in(&module, &fake, &session, alice()).await.unwrap();

        let expected = PendingExternalIdentity {
            provider: PROVIDER.to_string(),
            issuer: fake.issuer().to_string(),
            email: Some("alice@example.org".to_string()),
            email_verified: true,
        };
        assert!(matches!(&outcome, OidcLoginOutcome::Pending(pending) if *pending == expected));
        assert_eq!(
            module.pending_external_identity(&session).await.unwrap(),
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
        let module = module(&fake, true).await;

        let outcome = log_in(&module, &fake, &session(), alice().unverified())
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
        let module = module(&fake, true).await;
        let session = session();
        let person = alice();
        log_in(&module, &fake, &session, person.clone())
            .await
            .unwrap();

        let mut tx = Database::global().start_transaction().await.unwrap();
        let bound = module
            .bind_pending_external_identity(&session, &mut tx)
            .await
            .unwrap();
        let identity = bound.identity();
        tx.rollback().await.unwrap();

        assert!(stored(identity).await.is_none());
        assert!(
            module
                .pending_external_identity(&session)
                .await
                .unwrap()
                .is_some()
        );
        let again = log_in(&module, &fake, &super::session(), person).await;
        assert!(matches!(again, Ok(OidcLoginOutcome::Pending(_))));

        let identity = sign_up(&module, &session).await;
        assert!(stored(identity).await.is_some());
        assert_eq!(logged_in(&session).await.unwrap(), Some(identity));
        assert_eq!(
            module.pending_external_identity(&session).await.unwrap(),
            None
        );
        assert_eq!(
            module
                .login_method(Database::global(), identity)
                .await
                .unwrap(),
            Some(LoginMethod::External {
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
        let module = module(&fake, true).await;

        let mut tx = Database::global().start_transaction().await.unwrap();
        let bound = module
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
        let module = module(&fake, true).await;
        let session = session();
        log_in(&module, &fake, &session, alice()).await.unwrap();

        module
            .discard_pending_external_identity(&session)
            .await
            .unwrap();

        let mut tx = Database::global().start_transaction().await.unwrap();
        let bound = module
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
        let module = module(&fake, true).await;
        let person = alice();
        let (first, second) = (session(), session());
        log_in(&module, &fake, &first, person.clone())
            .await
            .unwrap();
        log_in(&module, &fake, &second, person).await.unwrap();
        sign_up(&module, &first).await;

        let mut tx = Database::global().start_transaction().await.unwrap();
        let bound = module
            .bind_pending_external_identity(&second, &mut tx)
            .await;
        tx.rollback().await.unwrap();
        assert!(matches!(bound, Err(BindError::AlreadyBound)));
    });
}

#[test]
fn a_known_external_identity_logs_in() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let module = module(&fake, true).await;
        let person = alice();
        let identity = sign_up(
            &module,
            &session_with_pending(&module, &fake, &person).await,
        )
        .await;
        let before = stored(identity).await.unwrap().last_login_at;

        let session = session();
        let outcome = log_in(&module, &fake, &session, person).await.unwrap();

        assert!(matches!(outcome, OidcLoginOutcome::LoggedIn(logged) if logged == identity));
        assert_eq!(logged_in(&session).await.unwrap(), Some(identity));
        assert!(stored(identity).await.unwrap().last_login_at > before);
    });
}

/// A session holding `person` as pending External identity
async fn session_with_pending(
    module: &IdentityModule,
    fake: &FakeOpenIdProvider,
    person: &FakePerson,
) -> galvyn::core::session::Session {
    let session = session();
    log_in(module, fake, &session, person.clone())
        .await
        .unwrap();
    session
}

#[test]
fn a_provider_that_does_not_admit_refuses_an_unknown_external_identity() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let module = module(&fake, false).await;
        let session = session();

        let outcome = log_in(&module, &fake, &session, alice()).await;

        assert!(matches!(outcome, Err(FinishOidcLoginError::NotAdmitted)));
        assert_eq!(
            module.pending_external_identity(&session).await.unwrap(),
            None
        );
    });
}

#[test]
fn a_provider_that_does_not_admit_still_logs_in_a_known_external_identity() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let admitting = module(&fake, true).await;
        let person = alice();
        let identity = sign_up(
            &admitting,
            &session_with_pending(&admitting, &fake, &person).await,
        )
        .await;

        let module = module(&fake, false).await;
        let outcome = log_in(&module, &fake, &session(), person).await;
        assert!(matches!(outcome, Ok(OidcLoginOutcome::LoggedIn(logged)) if logged == identity));
    });
}

#[test]
fn a_rotated_signing_key_is_fetched_again() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let module = module(&fake, true).await;
        log_in(&module, &fake, &session(), alice()).await.unwrap();

        fake.rotate_keys();

        let outcome = log_in(&module, &fake, &session(), alice()).await;
        assert!(matches!(outcome, Ok(OidcLoginOutcome::Pending(_))));
    });
}

#[test]
fn a_deleted_identity_takes_its_external_identity_along() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let module = module(&fake, true).await;
        let person = alice();
        let identity = sign_up(
            &module,
            &session_with_pending(&module, &fake, &person).await,
        )
        .await;

        module
            .delete_identity(Database::global(), identity)
            .await
            .unwrap();

        let outcome = log_in(&module, &fake, &session(), person).await;
        assert!(matches!(outcome, Ok(OidcLoginOutcome::Pending(_))));
    });
}

#[test]
fn an_external_identity_enrolled_without_ceremony_logs_in() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let module = module(&fake, false).await;
        let person = alice();
        let mut tx = Database::global().start_transaction().await.unwrap();
        let identity = module.create_identity(&mut tx).await.unwrap();
        module
            .enroll_external_identity_without_ceremony(
                &mut tx,
                identity,
                fake.issuer(),
                &person.subject,
            )
            .await
            .unwrap();
        tx.commit().await.unwrap();

        let outcome = log_in(&module, &fake, &session(), person).await;
        assert!(matches!(
            outcome,
            Ok(OidcLoginOutcome::LoggedIn(logged)) if logged == identity
        ));
    });
}

#[test]
fn external_issuers_name_only_the_external_identities() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let module = module(&fake, false).await;
        let mut tx = Database::global().start_transaction().await.unwrap();
        let external = module.create_identity(&mut tx).await.unwrap();
        module
            .enroll_external_identity_without_ceremony(
                &mut tx,
                external,
                fake.issuer(),
                &alice().subject,
            )
            .await
            .unwrap();
        let without = module.create_identity(&mut tx).await.unwrap();
        tx.commit().await.unwrap();

        let issuers = module
            .external_issuers(Database::global(), &[external, without])
            .await
            .unwrap();

        assert_eq!(issuers.len(), 1, "{issuers:?}");
        assert_eq!(
            issuers.get(&external).map(String::as_str),
            Some(fake.issuer())
        );
        assert!(
            module
                .external_issuers(Database::global(), &[])
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
    use super::session_with_pending;
    use super::sign_up;
    use crate::FinishDeviceEnrollmentError;
    use crate::oidc::FakeOpenIdProvider;
    use crate::oidc::error::EnrollExternalIdentityError;
    use crate::testing::database;
    use crate::testing::run;

    #[test]
    fn passkey_enrollment_for_an_external_identity_is_refused() {
        run(async {
            database().await;
            let fake = FakeOpenIdProvider::start().await;
            let module = module(&fake, true).await;
            let session = session_with_pending(&module, &fake, &alice()).await;
            let identity = sign_up(&module, &session).await;

            module
                .begin_device_enrollment(&session, identity, "alice")
                .await
                .unwrap();
            let finished = module
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
            let module = module(&fake, true).await;
            let mut tx = Database::global().start_transaction().await.unwrap();
            let identity = module.create_identity(&mut tx).await.unwrap();
            module
                .enroll_passkey_without_ceremony(
                    &mut tx,
                    identity,
                    MaxStr::new("Phone".to_string()).unwrap(),
                )
                .await
                .unwrap();

            let enrolled = module
                .enroll_external_identity_without_ceremony(
                    &mut tx,
                    identity,
                    fake.issuer(),
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
