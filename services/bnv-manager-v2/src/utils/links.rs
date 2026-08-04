//! Utility struct to create links that can be used externally.

use url::Url;

use crate::config::ORIGIN;
use crate::models::credential_reset::CredentialResetUuid;
use crate::models::invite::InviteUuid;

/// Create links using this struct
pub struct Link;

impl Link {
    /// Create a link for an invitation
    pub fn invite(InviteUuid(invite_uuid): InviteUuid) -> Url {
        #[allow(clippy::expect_used)]
        ORIGIN
            .join(&format!("/links/invite/{invite_uuid}"))
            .expect("UUID in urls are fine")
    }

    /// Create a link for logging in
    pub fn oidc_auth() -> Url {
        #[allow(clippy::expect_used)]
        let mut url = ORIGIN.join("/links/oidc/auth").expect("Static url");

        url.set_query(Some(&format!(
            "redirect_url={}",
            Link::oidc_finish().as_str()
        )));

        url
    }

    /// Create a link to the oidc finishing step
    pub fn oidc_finish() -> Url {
        #[allow(clippy::expect_used)]
        ORIGIN.join("/api/v1/auth/finish-auth").expect("Static url")
    }

    /// Create a link to the oidc finishing step
    pub fn oidc_failed(error_cause: &str) -> Url {
        #[allow(clippy::expect_used)]
        let mut url = ORIGIN.join("/links/oidc/error").expect("Static url");

        url.set_query(Some(&format!("error={error_cause}")));

        url
    }

    /// Create a link to the credential reset form
    pub fn reset_credentials(CredentialResetUuid(uuid): CredentialResetUuid) -> Url {
        #[allow(clippy::expect_used)]
        ORIGIN
            .join(&format!("/links/reset/{uuid}"))
            .expect("UUIDs are fine in urls")
    }
}
