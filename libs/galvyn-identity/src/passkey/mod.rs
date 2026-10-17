//! Passkey login: Login and Enrollment with WebAuthn Passkeys

use url::Url;
use webauthn_rs::Webauthn;
use webauthn_rs::WebauthnBuilder;

pub use self::error::BeginLoginError;
pub use self::error::FinishDeviceEnrollmentError;
pub use self::error::FinishEnrollmentError;
pub use self::error::FinishLoginError;
pub use self::error::RemovalRefused;
pub use self::error::RemovePasskeyError;
pub use self::models::Passkey;
pub use self::models::PasskeyUuid;

mod aaguid;
mod ceremony;
mod db;
mod enrollment;
mod error;
mod login;
mod management;
mod models;
mod session;

/// Setup of Passkey login
#[derive(Debug, Clone, Default)]
pub struct PasskeySetup {
    /// The relying party name authenticators show during an Enrollment
    pub rp_name: String,
}

/// Build the ceremony engine for the service served from `origin`
///
/// The origin becomes the WebAuthn `rp_origin`, its host the `rp_id`.
pub(crate) fn build_webauthn(origin: &Url, setup: &PasskeySetup) -> Result<Webauthn, String> {
    if setup.rp_name.is_empty() {
        return Err("passkey.rp_name must be set in IdentitySetup".to_string());
    }

    let rp_origin = webauthn_rs::prelude::Url::parse(origin.as_str())
        .map_err(|e| format!("Invalid public origin: {e}"))?;
    let rp_id = rp_origin
        .host_str()
        .ok_or("The public origin must contain a host")?
        .to_string();

    WebauthnBuilder::new(&rp_id, &rp_origin)
        .map_err(|e| format!("Invalid webauthn configuration: {e}"))?
        .rp_name(&setup.rp_name)
        .build()
        .map_err(|e| format!("Failed to build webauthn: {e}"))
}
