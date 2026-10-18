//! Utility struct to create links that can be used externally.

use url::Url;

use crate::config::ORIGIN;
use crate::http::handler_auth::FINISH_AUTH_PATH;
use crate::http::handler_auth::auth::schema::PendingAuthorizationId;
use crate::http::handler_auth::endpoint_url;
use crate::models::credential_reset::CredentialResetUuid;
use crate::models::invite::InviteUuid;

/// Error the oidc error page shows
///
/// The page maps each code to a translated message, so it never renders text from its url.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OidcErrorCode {
    /// The session has no pending authorization request with the given id
    UnknownRequest,
    /// The authorization request names no registered client
    UnknownClient,
    /// The authorization request's `redirect_uri` is not the one registered for the client
    InvalidRedirectUri,
}

impl OidcErrorCode {
    /// The code as the error page receives it
    pub fn as_str(self) -> &'static str {
        match self {
            OidcErrorCode::UnknownRequest => "unknown-request",
            OidcErrorCode::UnknownClient => "unknown-client",
            OidcErrorCode::InvalidRedirectUri => "invalid-redirect-uri",
        }
    }
}

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

    /// Create a link to the login page, which resumes the pending authorization request `id`
    pub fn oidc_auth(PendingAuthorizationId(id): PendingAuthorizationId) -> Url {
        #[allow(clippy::expect_used)]
        let mut url = ORIGIN.join("/links/oidc/auth").expect("Static url");
        url.query_pairs_mut()
            .append_pair("request_id", &id.to_string());
        url
    }

    /// Create a link to the oidc finishing step of the pending authorization request `id`
    pub fn oidc_finish(PendingAuthorizationId(id): PendingAuthorizationId) -> Url {
        let mut url = endpoint_url(FINISH_AUTH_PATH);
        url.query_pairs_mut()
            .append_pair("request_id", &id.to_string());
        url
    }

    /// Create a link to the oidc error page
    pub fn oidc_failed(error: OidcErrorCode) -> Url {
        #[allow(clippy::expect_used)]
        let mut url = ORIGIN.join("/links/oidc/error").expect("Static url");
        url.query_pairs_mut().append_pair("error", error.as_str());
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
