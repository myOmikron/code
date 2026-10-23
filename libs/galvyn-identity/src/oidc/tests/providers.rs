//! The OpenID providers in the module's tables
//!
//! Needs Postgres, see [`crate::testing`].

use clap::Parser;
use galvyn::core::Module;
use galvyn::rorm::Database;

use super::Fixture;
use super::alice;
use super::fresh_slug;
use super::log_in;
use super::module;
use super::prepared;
use super::session;
use crate::IdentityModule;
use crate::oidc::AddOpenIdProviderCommand;
use crate::oidc::Admission;
use crate::oidc::FakeOpenIdProvider;
use crate::oidc::InvalidOpenIdProvider;
use crate::oidc::NewOpenIdProvider;
use crate::oidc::OidcLoginOutcome;
use crate::oidc::OpenAdmission;
use crate::oidc::OpenIdProvider;
use crate::oidc::error::AddOpenIdProviderError;
use crate::oidc::error::BeginOidcLoginError;
use crate::testing::database;
use crate::testing::run;

/// The provider named `slug`, as `fixture`'s module finds it
async fn provider(fixture: &Fixture, slug: &str) -> Option<OpenIdProvider> {
    fixture
        .module
        .openid_provider(Database::global(), slug)
        .await
        .unwrap()
}

/// A module finding the provider `slug`, added by the test itself
async fn finding(slug: String) -> Fixture {
    Fixture {
        module: prepared(OpenAdmission::PendingInSession).await,
        slug,
    }
}

/// A service cli with the subcommand mounted
#[derive(Parser)]
enum Cli {
    AddOpenidProvider(AddOpenIdProviderCommand),
}

#[test]
fn the_cli_subcommand_adds_a_provider_people_log_in_through() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let slug = fresh_slug();
        let discovery_url = format!("{}/.well-known/openid-configuration", fake.issuer());
        let Cli::AddOpenidProvider(command) = Cli::try_parse_from([
            "service",
            "add-openid-provider",
            "--slug",
            &slug,
            "--display-name",
            "Authentik",
            "--discovery-url",
            &discovery_url,
            "--client-id",
            fake.client_id(),
            "--client-secret",
            fake.client_secret(),
        ])
        .unwrap();

        command.run(Database::global()).await.unwrap();

        let fixture = finding(slug).await;
        let added = provider(&fixture, &fixture.slug).await.unwrap();
        assert_eq!(added.display_name(), "Authentik");
        assert_eq!(added.identifying_claim(), "sub");
        assert_eq!(added.admission(), Admission::Open);
        let outcome = log_in(&fixture, &fake, &session(), alice()).await;
        assert!(matches!(outcome, Ok(OidcLoginOutcome::Pending(_))));
    });
}

#[test]
fn a_taken_slug_is_refused() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;

        let added = IdentityModule::add_openid_provider(
            Database::global(),
            &fake.provider(&fixture.slug, Admission::InviteOnly),
        )
        .await;
        assert!(matches!(added, Err(AddOpenIdProviderError::SlugTaken)));
    });
}

#[test]
fn an_invalid_provider_is_refused_and_not_added() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = finding(fresh_slug()).await;

        let added = IdentityModule::add_openid_provider(
            Database::global(),
            &NewOpenIdProvider {
                client_secret: String::new(),
                ..fake.provider(&fixture.slug, Admission::Open)
            },
        )
        .await;
        assert!(matches!(
            added,
            Err(AddOpenIdProviderError::Invalid(
                InvalidOpenIdProvider::ClientSecret
            ))
        ));
        assert!(provider(&fixture, &fixture.slug).await.is_none());
    });
}

#[test]
fn the_issuer_of_the_first_discovery_is_stored() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        assert_eq!(
            provider(&fixture, &fixture.slug).await.unwrap().issuer(),
            None
        );

        fixture
            .module
            .begin_oidc_login(&session(), &fixture.slug, false)
            .await
            .unwrap();

        assert_eq!(
            provider(&fixture, &fixture.slug).await.unwrap().issuer(),
            Some(fake.issuer())
        );
    });
}

#[test]
fn an_issuer_given_as_discovery_url_is_discovered_below() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = finding(fresh_slug()).await;
        IdentityModule::add_openid_provider(
            Database::global(),
            &NewOpenIdProvider {
                discovery_url: fake.issuer().to_string(),
                ..fake.provider(&fixture.slug, Admission::Open)
            },
        )
        .await
        .unwrap();

        let outcome = log_in(&fixture, &fake, &session(), alice()).await;
        assert!(matches!(outcome, Ok(OidcLoginOutcome::Pending(_))));
    });
}

#[test]
fn putting_a_provider_overwrites_it_and_keeps_its_issuer() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        log_in(&fixture, &fake, &session(), alice()).await.unwrap();

        IdentityModule::put_openid_provider(
            Database::global(),
            &NewOpenIdProvider {
                display_name: "Renamed".to_string(),
                ..fake.provider(&fixture.slug, Admission::InviteOnly)
            },
        )
        .await
        .unwrap();

        let put = provider(&fixture, &fixture.slug).await.unwrap();
        assert_eq!(put.display_name(), "Renamed");
        assert_eq!(put.admission(), Admission::InviteOnly);
        assert_eq!(put.issuer(), Some(fake.issuer()));
    });
}

#[test]
fn putting_an_unknown_provider_adds_it() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = finding(fresh_slug()).await;

        IdentityModule::put_openid_provider(
            Database::global(),
            &fake.provider(&fixture.slug, Admission::Open),
        )
        .await
        .unwrap();

        assert!(provider(&fixture, &fixture.slug).await.is_some());
    });
}

#[test]
fn a_provider_whose_discovery_states_another_issuer_is_unavailable() {
    run(async {
        database().await;
        let (fake, impostor) = (
            FakeOpenIdProvider::start().await,
            FakeOpenIdProvider::start().await,
        );
        let fixture = module(&fake, Admission::Open).await;
        log_in(&fixture, &fake, &session(), alice()).await.unwrap();

        IdentityModule::put_openid_provider(
            Database::global(),
            &impostor.provider(&fixture.slug, Admission::Open),
        )
        .await
        .unwrap();

        let begun = fixture
            .module
            .begin_oidc_login(&session(), &fixture.slug, false)
            .await;
        assert!(matches!(
            begun,
            Err(BeginOidcLoginError::ProviderUnavailable)
        ));
    });
}

#[test]
fn the_providers_are_listed_with_their_display_name() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        let listed = fixture
            .module
            .openid_providers(Database::global())
            .await
            .unwrap();
        let listed = listed
            .iter()
            .find(|provider| provider.slug() == fixture.slug)
            .map(|provider| provider.display_name().to_string());
        assert_eq!(listed, Some(format!("Fake {}", fixture.slug)));
    });
}

/// The slugs `fixture`'s module offers on the login page
async fn offered(fixture: &Fixture) -> Vec<String> {
    fixture
        .module
        .openid_providers(Database::global())
        .await
        .unwrap()
        .iter()
        .map(|provider| provider.slug().to_string())
        .collect()
}

#[test]
fn a_deactivated_provider_is_not_offered() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        IdentityModule::deactivate_openid_provider(Database::global(), &fixture.slug)
            .await
            .unwrap();

        assert!(!offered(&fixture).await.contains(&fixture.slug));
    });
}

#[test]
fn a_provider_not_discovered_yet_is_offered() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        drop(fake);

        assert!(offered(&fixture).await.contains(&fixture.slug));
    });
}

#[test]
fn a_provider_whose_discovery_failed_is_not_offered() {
    run(async {
        database().await;
        let (fake, broken) = (
            FakeOpenIdProvider::start().await,
            FakeOpenIdProvider::start().await,
        );
        let working = module(&fake, Admission::Open).await;
        let broken_slug = fresh_slug();
        IdentityModule::add_openid_provider(
            Database::global(),
            &broken.provider(&broken_slug, Admission::Open),
        )
        .await
        .unwrap();
        drop(broken);

        let begun = working
            .module
            .begin_oidc_login(&session(), &broken_slug, false)
            .await;
        assert!(matches!(
            begun,
            Err(BeginOidcLoginError::ProviderUnavailable)
        ));
        let offered = offered(&working).await;
        assert!(!offered.contains(&broken_slug));
        assert!(offered.contains(&working.slug));
    });
}

#[test]
fn a_provider_whose_discovery_succeeded_is_offered() {
    run(async {
        database().await;
        let fake = FakeOpenIdProvider::start().await;
        let fixture = module(&fake, Admission::Open).await;
        fixture
            .module
            .begin_oidc_login(&session(), &fixture.slug, false)
            .await
            .unwrap_or_else(|error| panic!("begin the login: {error:?}"));

        assert!(offered(&fixture).await.contains(&fixture.slug));
    });
}
