//! Bulk delete of an OpenID provider with everyone it vouches for
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

use super::CALLBACK_PATH;
use super::Fixture;
use super::alice;
use super::db::signed_up;
use super::db::stored;
use super::fresh_slug;
use super::setup;
use crate::DeleteHook;
use crate::IdentityModule;
use crate::IdentityUuid;
use crate::models::Identity;
use crate::oidc::Admission;
use crate::oidc::FakeOpenIdProvider;
use crate::oidc::OidcSetup;
use crate::oidc::OpenIdProvider;
use crate::oidc::error::BulkDeleteOpenIdProviderError;
use crate::testing::database;
use crate::testing::run;

/// A delete hook deleting the Identity, as a service deleting the Account does
struct Recording {
    /// The call failing instead of deleting, counted from 1
    fail_on: Option<usize>,
    /// Each Identity it was called for
    called: Mutex<Vec<IdentityUuid>>,
}

impl Recording {
    /// A hook failing on the `fail_on`th call, if set
    fn new(fail_on: Option<usize>) -> Arc<Self> {
        Arc::new(Self {
            fail_on,
            called: Mutex::new(Vec::new()),
        })
    }

    /// Whom it was called for so far
    fn called(&self) -> Vec<IdentityUuid> {
        self.called.lock().unwrap().clone()
    }
}

impl DeleteHook for Recording {
    fn delete<'a>(
        &'a self,
        tx: &'a mut Transaction,
        identity: IdentityUuid,
    ) -> Pin<Box<dyn Future<Output = Result<(), CoreApiError>> + Send + 'a>> {
        let call = {
            let mut called = self.called.lock().unwrap();
            called.push(identity);
            called.len()
        };
        Box::pin(async move {
            if self.fail_on == Some(call) {
                return Err(CoreApiError::server_error("the hook failed"));
            }
            Identity::delete(&mut *tx, identity).await?;
            Ok(())
        })
    }
}

/// A module deleting people through `hook`, with a provider pointing at `fake`
async fn fixture(fake: &FakeOpenIdProvider, hook: Arc<Recording>) -> Fixture {
    let slug = fresh_slug();
    IdentityModule::add_openid_provider(Database::global(), &fake.provider(&slug, Admission::Open))
        .await
        .unwrap_or_else(|error| panic!("add the provider: {error:?}"));
    let prepared = IdentityModule::pre_init(crate::IdentitySetup {
        delete_hook: Some(hook),
        ..setup(OidcSetup {
            callback_path: CALLBACK_PATH.to_string(),
            ..OidcSetup::default()
        })
    })
    .await
    .unwrap_or_else(|error| panic!("prepare the module: {error:?}"));
    Fixture {
        module: IdentityModule::from_prepared(prepared),
        slug,
    }
}

/// Two people signed up through the fixture's provider
async fn two_signed_up(fixture: &Fixture, fake: &FakeOpenIdProvider) -> [IdentityUuid; 2] {
    [
        signed_up(fixture, fake, &alice()).await,
        signed_up(fixture, fake, &alice()).await,
    ]
}

/// Bulk delete the provider named `slug`, confirmed with `name`, committing only on success
async fn bulk_delete(
    fixture: &Fixture,
    slug: &str,
    name: &str,
) -> Result<(), BulkDeleteOpenIdProviderError> {
    let mut tx = Database::global().start_transaction().await.unwrap();
    let deleted = fixture
        .module
        .bulk_delete_openid_provider(&mut tx, slug, name)
        .await;
    match deleted {
        Ok(()) => tx.commit().await.unwrap(),
        Err(_) => tx.rollback().await.unwrap(),
    }
    deleted
}

/// The provider named `slug`, if it is still there
async fn provider(slug: &str) -> Option<OpenIdProvider> {
    OpenIdProvider::get_by_slug(Database::global(), slug)
        .await
        .unwrap()
}

#[test]
fn a_bulk_delete_without_the_providers_name_changes_nothing() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let hook = Recording::new(None);
        let fixture = fixture(&fake, hook.clone()).await;
        let people = two_signed_up(&fixture, &fake).await;

        let deleted = bulk_delete(&fixture, &fixture.slug, "Another provider").await;

        assert!(matches!(
            deleted,
            Err(BulkDeleteOpenIdProviderError::NameMismatch)
        ));
        assert!(hook.called().is_empty());
        assert!(provider(&fixture.slug).await.is_some());
        for identity in people {
            assert!(stored(identity).await.is_some());
        }
    });
}

#[test]
fn a_bulk_delete_calls_the_delete_hook_once_per_identity_and_removes_everything() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let hook = Recording::new(None);
        let fixture = fixture(&fake, hook.clone()).await;
        let people = two_signed_up(&fixture, &fake).await;
        let name = provider(&fixture.slug).await.unwrap().display_name;

        bulk_delete(&fixture, &fixture.slug, &name).await.unwrap();

        let mut called = hook.called();
        called.sort_by_key(|identity| identity.into_inner());
        let mut expected = people.to_vec();
        expected.sort_by_key(|identity| identity.into_inner());
        assert_eq!(called, expected);
        assert!(provider(&fixture.slug).await.is_none());
        for identity in people {
            assert!(stored(identity).await.is_none());
            let login = fixture
                .module
                .login_method(Database::global(), identity)
                .await
                .unwrap();
            assert_eq!(login, None);
        }
    });
}

#[test]
fn a_bulk_delete_confirmed_with_another_case_and_spaces_goes_through() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = fixture(&fake, Recording::new(None)).await;
        let name = provider(&fixture.slug).await.unwrap().display_name;

        let typed = format!("  {}  ", name.to_uppercase());
        bulk_delete(&fixture, &fixture.slug, &typed).await.unwrap();

        assert!(provider(&fixture.slug).await.is_none());
    });
}

#[test]
fn a_failing_delete_hook_rolls_the_whole_bulk_delete_back() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let hook = Recording::new(Some(2));
        let fixture = fixture(&fake, hook.clone()).await;
        let people = two_signed_up(&fixture, &fake).await;
        let name = provider(&fixture.slug).await.unwrap().display_name;

        let deleted = bulk_delete(&fixture, &fixture.slug, &name).await;

        assert!(matches!(
            deleted,
            Err(BulkDeleteOpenIdProviderError::Internal(_))
        ));
        assert_eq!(hook.called().len(), 2);
        assert!(provider(&fixture.slug).await.is_some());
        for identity in people {
            assert!(stored(identity).await.is_some());
        }
    });
}

#[test]
fn a_bulk_delete_leaves_other_providers_people_alone() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let hook = Recording::new(None);
        let doomed = fixture(&fake, hook.clone()).await;
        let kept = fixture(&fake, hook.clone()).await;
        let survivor = signed_up(&kept, &fake, &alice()).await;
        let name = provider(&doomed.slug).await.unwrap().display_name;

        bulk_delete(&doomed, &doomed.slug, &name).await.unwrap();

        assert!(hook.called().is_empty());
        assert!(provider(&kept.slug).await.is_some());
        assert!(stored(survivor).await.is_some());
    });
}

#[test]
fn bulk_deleting_an_unknown_provider_is_refused() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = fixture(&fake, Recording::new(None)).await;
        let slug = fresh_slug();

        let deleted = bulk_delete(&fixture, &slug, &slug).await;

        assert!(matches!(
            deleted,
            Err(BulkDeleteOpenIdProviderError::UnknownProvider)
        ));
    });
}
