//! Passkey sign-in as one galvyn module
//!
//! [`Passkeys`] owns the [`Identity`] anchor, the Passkeys and Registration
//! links hanging off it, every WebAuthn ceremony and every session key
//! involved. Services reach it through its operations, the
//! [`AuthRequiredLayer`] and the [`Identity`] extractor; they keep their own
//! Account referencing an Identity, and their handlers, usernames and mails.
//!
//! See `docs/adr/0001-passkeys-as-galvyn-module.md` and `docs/passkeys/GLOSSARY.md`.

use galvyn::core::InitError;
use galvyn::core::Module;
use galvyn::core::PreInitError;
use galvyn::rorm::Database;
use webauthn_rs::Webauthn;
use webauthn_rs::WebauthnBuilder;

pub use self::db::IdentityModel;
pub use self::enrollment::OpenLink;
pub use self::error::BeginLoginError;
pub use self::error::FinishEnrollmentError;
pub use self::error::FinishLoginError;
pub use self::error::LinkError;
pub use self::error::OpenLinkError;
pub use self::error::RemovalRefused;
pub use self::error::RemovePasskeyError;
pub use self::middleware::AuthRequiredLayer;
pub use self::models::Identity;
pub use self::models::IdentityUuid;
pub use self::models::Passkey;
pub use self::models::PasskeyUuid;
pub use self::setup::PasskeysSetup;
use self::setup::Settings;

mod aaguid;
mod ceremony;
mod db;
mod enrollment;
mod error;
mod extractor;
mod login;
mod management;
mod middleware;
mod models;
mod session;
mod setup;

/// Passkey sign-in: Login, Enrollment and everything they need
pub struct Passkeys {
    /// The configured ceremony engine
    webauthn: Webauthn,
    /// The validated setup
    settings: Settings,
}

impl Module for Passkeys {
    type Setup = PasskeysSetup;
    type PreInit = (Webauthn, Settings);

    async fn pre_init(setup: Self::Setup) -> Result<Self::PreInit, PreInitError> {
        let origin = setup
            .public_origin
            .ok_or("public_origin must be set in PasskeysSetup")?;
        if setup.rp_name.is_empty() {
            return Err("rp_name must be set in PasskeysSetup".into());
        }
        if setup.registration_link_path.is_empty() {
            return Err("registration_link_path must be set in PasskeysSetup".into());
        }

        let rp_origin = webauthn_rs::prelude::Url::parse(origin.as_str())
            .map_err(|e| format!("Invalid public origin: {e}"))?;
        let rp_id = rp_origin
            .host_str()
            .ok_or("The public origin must contain a host")?
            .to_string();

        let webauthn = WebauthnBuilder::new(&rp_id, &rp_origin)
            .map_err(|e| format!("Invalid webauthn configuration: {e}"))?
            .rp_name(&setup.rp_name)
            .build()
            .map_err(|e| format!("Failed to build webauthn: {e}"))?;

        Ok((
            webauthn,
            Settings {
                public_origin: origin,
                registration_link_path: setup.registration_link_path,
                registration_link_validity: setup.registration_link_validity,
                remember_me: setup.remember_me,
            },
        ))
    }

    type Dependencies = (Database,);

    async fn init(
        pre_init: Self::PreInit,
        _dependencies: &mut Self::Dependencies,
    ) -> Result<Self, InitError> {
        let (webauthn, settings) = pre_init;
        Ok(Self { webauthn, settings })
    }
}
