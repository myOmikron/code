//! Identity, Login and Enrollment as one galvyn module
//!
//! [`IdentityModule`] owns the [`Identity`] anchor, the Registration links
//! and login methods hanging off it, every ceremony and every session key
//! involved. Services reach it through its operations, the
//! [`AuthRequiredLayer`] and the [`Identity`] extractor; they keep their own
//! Account referencing an Identity, and their handlers, usernames and mails.
//!
//! Each login method is a cargo feature: `passkey` adds Passkey login, `oidc`
//! adds OIDC login through the OpenID providers the service configures. An
//! Identity is local or external, never both: Passkey Enrollment is refused
//! for an Identity holding an External identity, and an External identity is
//! only ever bound to a fresh Identity.
//!
//! The `test-support` feature adds operations that skip a ceremony, for a
//! service's tests, and with `oidc` a fake OpenID provider to log in through.
//!
//! See `docs/adr/0001-passkeys-as-galvyn-module.md`,
//! `docs/adr/0002-one-identity-module-for-all-login-methods.md` and this
//! crate's `GLOSSARY.md`.
#![warn(missing_docs)]
#![cfg_attr(
    not(feature = "passkey"),
    allow(
        dead_code,
        unused_imports,
        reason = "Login, logged-in state and Registration link use are shared by the login methods"
    )
)]

use galvyn::core::InitError;
use galvyn::core::Module;
use galvyn::core::PreInitError;
use galvyn::rorm::Database;

pub use self::db::IdentityModel;
pub use self::error::LinkError;
pub use self::error::OpenLinkError;
pub use self::management::OpenLink;
pub use self::middleware::AuthRequiredLayer;
pub use self::models::Identity;
pub use self::models::IdentityUuid;
pub use self::models::LoginMethod;
#[cfg(feature = "oidc")]
pub use self::oidc::BeginOidcLoginError;
#[cfg(feature = "oidc")]
pub use self::oidc::BindError;
#[cfg(feature = "oidc")]
pub use self::oidc::BoundExternalIdentity;
#[cfg(feature = "oidc")]
pub use self::oidc::ClientSecret;
#[cfg(all(feature = "oidc", feature = "test-support"))]
pub use self::oidc::EnrollExternalIdentityError;
#[cfg(all(feature = "oidc", feature = "test-support"))]
pub use self::oidc::FakeOpenIdProvider;
#[cfg(all(feature = "oidc", feature = "test-support"))]
pub use self::oidc::FakePerson;
#[cfg(feature = "oidc")]
pub use self::oidc::FinishOidcLoginError;
#[cfg(feature = "oidc")]
pub use self::oidc::OidcCallback;
#[cfg(feature = "oidc")]
pub use self::oidc::OidcLoginOutcome;
#[cfg(feature = "oidc")]
pub use self::oidc::OidcSetup;
#[cfg(feature = "oidc")]
pub use self::oidc::OpenIdProvider;
#[cfg(feature = "oidc")]
pub use self::oidc::OpenIdProviderSetup;
#[cfg(feature = "oidc")]
pub use self::oidc::PendingExternalIdentity;
#[cfg(all(feature = "oidc", feature = "test-support"))]
pub use self::oidc::Tamper;
#[cfg(feature = "passkey")]
pub use self::passkey::BeginLoginError;
#[cfg(feature = "passkey")]
pub use self::passkey::FinishDeviceEnrollmentError;
#[cfg(feature = "passkey")]
pub use self::passkey::FinishEnrollmentError;
#[cfg(feature = "passkey")]
pub use self::passkey::FinishLoginError;
#[cfg(feature = "passkey")]
pub use self::passkey::Passkey;
#[cfg(feature = "passkey")]
pub use self::passkey::PasskeySetup;
#[cfg(feature = "passkey")]
pub use self::passkey::PasskeyUser;
#[cfg(feature = "passkey")]
pub use self::passkey::PasskeyUuid;
#[cfg(feature = "passkey")]
pub use self::passkey::RemovalRefused;
#[cfg(feature = "passkey")]
pub use self::passkey::RemovePasskeyError;
pub use self::setup::IdentitySetup;
use self::setup::Settings;

mod db;
mod error;
mod extractor;
mod management;
mod middleware;
mod models;
#[cfg(feature = "oidc")]
mod oidc;
#[cfg(feature = "passkey")]
mod passkey;
mod session;
mod setup;
#[cfg(all(test, feature = "oidc", feature = "test-support"))]
mod testing;

/// Identity, Login and Enrollment, with the login methods the service enabled
pub struct IdentityModule {
    /// The validated setup
    settings: Settings,
    /// The configured Passkey ceremony engine
    #[cfg(feature = "passkey")]
    webauthn: webauthn_rs::Webauthn,
    /// The configured OpenID providers
    #[cfg(feature = "oidc")]
    oidc: oidc::OpenIdProviders,
}

/// What [`IdentityModule`] prepares before the database is up
pub struct Prepared {
    /// The validated setup
    settings: Settings,
    /// The configured Passkey ceremony engine
    #[cfg(feature = "passkey")]
    webauthn: webauthn_rs::Webauthn,
    /// The configured OpenID providers
    #[cfg(feature = "oidc")]
    oidc: oidc::OpenIdProviders,
}

impl Module for IdentityModule {
    type Setup = IdentitySetup;
    type PreInit = Prepared;

    async fn pre_init(setup: Self::Setup) -> Result<Self::PreInit, PreInitError> {
        #[cfg(feature = "passkey")]
        let passkey = setup.passkey.clone();
        #[cfg(feature = "oidc")]
        let oidc = setup.oidc.clone();
        let settings = Settings::new(setup)?;
        Ok(Prepared {
            #[cfg(feature = "passkey")]
            webauthn: passkey::build_webauthn(&settings.public_origin, &passkey)?,
            #[cfg(feature = "oidc")]
            oidc: oidc::build_providers(&settings.public_origin, oidc)?,
            settings,
        })
    }

    type Dependencies = (Database,);

    async fn init(
        pre_init: Self::PreInit,
        _dependencies: &mut Self::Dependencies,
    ) -> Result<Self, InitError> {
        Ok(Self::from_prepared(pre_init))
    }
}

impl IdentityModule {
    /// The module as [`Module::pre_init`] prepared it
    fn from_prepared(prepared: Prepared) -> Self {
        Self {
            settings: prepared.settings,
            #[cfg(feature = "passkey")]
            webauthn: prepared.webauthn,
            #[cfg(feature = "oidc")]
            oidc: prepared.oidc,
        }
    }
}
