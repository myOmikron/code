//! Open admission through the service's [`AdmissionHook`]
//!
//! Needs Postgres, see [`crate::testing`].

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::Mutex;

use galvyn::core::Module;
use galvyn::core::stuff::api_error::core::CoreApiError;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;

use super::alice;
use super::db::stored;
use super::fixture;
use super::log_in;
use super::session;
use crate::IdentityUuid;
use crate::LoginMethod;
use crate::oidc::Admission;
use crate::oidc::AdmissionHook;
use crate::oidc::ExternalClaims;
use crate::oidc::FakeOpenIdProvider;
use crate::oidc::FirstLoginDecision;
use crate::oidc::OidcLoginOutcome;
use crate::oidc::OpenAdmission;
use crate::oidc::error::FinishOidcLoginError;
use crate::session::logged_in;
use crate::testing::database;
use crate::testing::run;

/// A hook deciding `decision` and remembering whom it was asked about
struct Recording {
    /// What it decides
    decision: FirstLoginDecision,
    /// Each Identity it was asked about, with the claims
    asked: Mutex<Vec<(IdentityUuid, ExternalClaims)>>,
}

impl Recording {
    /// A hook always deciding `decision`
    fn new(decision: FirstLoginDecision) -> Arc<Self> {
        Arc::new(Self {
            decision,
            asked: Mutex::new(Vec::new()),
        })
    }

    /// Whom it was asked about so far
    fn asked(&self) -> Vec<(IdentityUuid, ExternalClaims)> {
        self.asked.lock().unwrap().clone()
    }
}

impl AdmissionHook for Recording {
    fn admit<'a>(
        &'a self,
        _tx: &'a mut Transaction,
        identity: IdentityUuid,
        claims: &'a ExternalClaims,
    ) -> Pin<Box<dyn Future<Output = Result<FirstLoginDecision, CoreApiError>> + Send + 'a>> {
        self.asked.lock().unwrap().push((identity, claims.clone()));
        Box::pin(async move { Ok(self.decision) })
    }
}

#[test]
fn an_admitted_first_login_keeps_identity_and_external_identity() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let hook = Recording::new(FirstLoginDecision::Admit);
        let fixture = fixture(&fake, Admission::Open, OpenAdmission::Hook(hook.clone())).await;
        let person = alice();
        let session = session();

        let outcome = log_in(&fixture, &fake, &session, person.clone()).await;

        let Ok(OidcLoginOutcome::Admitted(admitted)) = outcome else {
            panic!("not admitted: {outcome:?}");
        };
        let identity = admitted.identity();
        let asked = hook.asked();
        assert_eq!(asked.len(), 1);
        let (asked_identity, claims) = &asked[0];
        assert_eq!(*asked_identity, identity);
        assert_eq!(claims.provider, fixture.slug);
        assert_eq!(claims.value, person.subject);
        assert_eq!(claims.email.as_deref(), Some("alice@example.org"));
        assert!(claims.email_verified);

        fixture
            .module
            .log_in_bound(&session, admitted)
            .await
            .unwrap();
        assert_eq!(logged_in(&session).await.unwrap(), Some(identity));
        assert_eq!(
            fixture
                .module
                .login_method(Database::global(), identity)
                .await
                .unwrap(),
            Some(LoginMethod::External {
                provider: fixture.slug.clone(),
                issuer: fake.issuer().to_string(),
            })
        );
        let again = log_in(&fixture, &fake, &super::session(), person).await;
        assert!(
            matches!(again, Ok(OidcLoginOutcome::Known(known)) if known.identity() == identity)
        );
        assert_eq!(hook.asked().len(), 1);
    });
}

#[test]
fn a_declined_first_login_leaves_nothing_behind() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let hook = Recording::new(FirstLoginDecision::Decline);
        let fixture = fixture(&fake, Admission::Open, OpenAdmission::Hook(hook.clone())).await;
        let person = alice();
        let session = session();

        let outcome = log_in(&fixture, &fake, &session, person.clone()).await;

        assert!(matches!(outcome, Err(FinishOidcLoginError::Declined)));
        let (identity, _) = hook.asked()[0].clone();
        assert!(stored(identity).await.is_none());
        assert_eq!(logged_in(&session).await.unwrap(), None);
        let again = log_in(&fixture, &fake, &super::session(), person).await;
        assert!(matches!(again, Err(FinishOidcLoginError::Declined)));
        assert_eq!(hook.asked().len(), 2);
    });
}

#[test]
fn an_invite_only_provider_never_asks_the_hook() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let hook = Recording::new(FirstLoginDecision::Admit);
        let fixture = fixture(
            &fake,
            Admission::InviteOnly,
            OpenAdmission::Hook(hook.clone()),
        )
        .await;

        let outcome = log_in(&fixture, &fake, &session(), alice()).await;

        assert!(matches!(outcome, Err(FinishOidcLoginError::NotAdmitted)));
        assert!(hook.asked().is_empty());
    });
}
