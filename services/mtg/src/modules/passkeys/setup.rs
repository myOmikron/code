//! Everything a service configures about [`Passkeys`](super::Passkeys)

use galvyn::core::re_exports::time::Duration;
use url::Url;

/// Setup of the [`Passkeys`](super::Passkeys) module
///
/// Only `public_origin`, `rp_name` and `registration_link_path` have to be
/// filled; the durations default to what most services want.
#[derive(Debug, Clone)]
pub struct PasskeysSetup {
    /// The public origin the service is served from
    ///
    /// Becomes the WebAuthn `rp_origin`; its host becomes the `rp_id`.
    /// Changing the host invalidates every enrolled Passkey.
    pub public_origin: Option<Url>,

    /// The relying party name authenticators show during an Enrollment
    pub rp_name: String,

    /// The path of the frontend page a Registration link opens
    pub registration_link_path: String,

    /// How long a freshly issued Registration link stays usable
    pub registration_link_validity: Duration,

    /// How long a remembered session survives without being used
    pub remember_me: Duration,
}

impl Default for PasskeysSetup {
    fn default() -> Self {
        Self {
            public_origin: None,
            rp_name: String::new(),
            registration_link_path: String::new(),
            registration_link_validity: Duration::days(7),
            remember_me: Duration::days(30),
        }
    }
}

/// The setup after validation, as the module keeps it
#[derive(Debug, Clone)]
pub struct Settings {
    /// See [`PasskeysSetup::public_origin`]
    pub(super) public_origin: Url,
    /// See [`PasskeysSetup::registration_link_path`]
    pub(super) registration_link_path: String,
    /// See [`PasskeysSetup::registration_link_validity`]
    pub(super) registration_link_validity: Duration,
    /// See [`PasskeysSetup::remember_me`]
    pub(super) remember_me: Duration,
}

impl Settings {
    /// The full Registration link carrying `token`
    pub(super) fn registration_link(&self, token: &str) -> Url {
        let mut link = self.public_origin.clone();
        link.set_path(&self.registration_link_path);
        link.set_query(Some(&format!("token={token}")));
        link
    }
}
