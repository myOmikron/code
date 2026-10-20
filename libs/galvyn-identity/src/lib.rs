//! Identity, Login and Enrollment as one galvyn module
//!
//! [`IdentityModule`] owns the [`Identity`] anchor, the Registration links
//! and login methods hanging off it, every ceremony and every session key
//! involved. Services reach it through its operations, the
//! [`AuthRequiredLayer`] and the [`Identity`] extractor; they keep their own
//! Account referencing an Identity, and their handlers, usernames and mails.
//!
//! Each login method is a cargo feature: `passkey` adds Passkey login.
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
#[cfg(feature = "passkey")]
mod passkey;
mod session;
mod setup;

/// Identity, Login and Enrollment, with the login methods the service enabled
pub struct IdentityModule {
    /// The validated setup
    settings: Settings,
    /// The configured Passkey ceremony engine
    #[cfg(feature = "passkey")]
    webauthn: webauthn_rs::Webauthn,
}

/// What [`IdentityModule`] prepares before the database is up
pub struct Prepared {
    /// The validated setup
    settings: Settings,
    /// The configured Passkey ceremony engine
    #[cfg(feature = "passkey")]
    webauthn: webauthn_rs::Webauthn,
}

impl Module for IdentityModule {
    type Setup = IdentitySetup;
    type PreInit = Prepared;

    async fn pre_init(setup: Self::Setup) -> Result<Self::PreInit, PreInitError> {
        #[cfg(feature = "passkey")]
        let passkey = setup.passkey.clone();
        let settings = Settings::new(setup)?;
        Ok(Prepared {
            #[cfg(feature = "passkey")]
            webauthn: passkey::build_webauthn(&settings.public_origin, &passkey)?,
            settings,
        })
    }

    type Dependencies = (Database,);

    async fn init(
        pre_init: Self::PreInit,
        _dependencies: &mut Self::Dependencies,
    ) -> Result<Self, InitError> {
        Ok(Self {
            settings: pre_init.settings,
            #[cfg(feature = "passkey")]
            webauthn: pre_init.webauthn,
        })
    }
}
