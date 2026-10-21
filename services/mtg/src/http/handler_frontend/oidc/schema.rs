//! Request/response schemas of the OIDC login handlers

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::account::Username;

/// The OpenID providers people may log in through
#[derive(Serialize, JsonSchema)]
pub struct ListOpenIdProvidersResponse {
    /// The active providers, empty while OIDC login is off
    pub providers: Vec<SimpleOpenIdProvider>,
}

/// An OpenID provider people may log in through
#[derive(Serialize, JsonSchema)]
pub struct SimpleOpenIdProvider {
    /// The provider's id, to start a login with, e.g. `google`
    pub id: String,
    /// What the frontend calls the provider, e.g. `Google`
    pub display_name: String,
}

/// Request to start an OIDC login
#[derive(Deserialize, JsonSchema)]
pub struct StartOidcLoginRequest {
    /// The id of the provider to log in through
    pub provider: MaxStr<64>,
    /// Keep the session alive across browser restarts
    pub remember_me: bool,
}

/// Response to a started OIDC login
#[derive(Serialize, JsonSchema)]
pub struct StartOidcLoginResponse {
    /// The provider's authorization url to send the browser to
    pub url: String,
}

/// Why an OIDC login could not be started
#[derive(Default, Serialize, JsonSchema)]
pub struct StartOidcLoginErrors {
    /// The provider cannot be reached right now
    pub provider_unavailable: bool,
}

/// What the provider sends the browser back to the callback with
#[derive(Deserialize, JsonSchema)]
pub struct OidcCallbackQuery {
    /// The `state` the login began with
    pub state: MaxStr<255>,
    /// The authorization code, if the provider vouched for the person
    pub code: Option<MaxStr<2048>>,
    /// The provider's error code, if it did not
    pub error: Option<MaxStr<255>>,
}

/// Why an OIDC login was refused, as the callback names it to the login page
///
/// Sent as the `oidc_error` query parameter of the login page.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OidcLoginFailure {
    /// The person cancelled at the provider
    Cancelled,
    /// The login was not started in this session, or ran out
    Expired,
    /// The provider cannot be reached right now
    ProviderUnavailable,
    /// The provider did not state a verified email
    EmailUnverified,
    /// The provider's answer did not check out
    Failed,
}

impl OidcLoginFailure {
    /// The value of the `oidc_error` query parameter
    pub fn code(self) -> &'static str {
        match self {
            OidcLoginFailure::Cancelled => "cancelled",
            OidcLoginFailure::Expired => "expired",
            OidcLoginFailure::ProviderUnavailable => "provider_unavailable",
            OidcLoginFailure::EmailUnverified => "email_unverified",
            OidcLoginFailure::Failed => "failed",
        }
    }
}

/// The session's pending OIDC login
#[derive(Serialize, JsonSchema)]
pub struct GetPendingOidcLoginResponse {
    /// The pending login, `None` if there is none or it ran out
    pub pending: Option<PendingOidcLogin>,
}

/// An OIDC login waiting for its username step
#[derive(Serialize, JsonSchema)]
pub struct PendingOidcLogin {
    /// The display name of the provider that vouched for the person
    pub provider: String,
    /// The verified email the Account will get
    pub email: String,
}

/// Request to finish the username step of a pending OIDC login
#[derive(Deserialize, JsonSchema)]
pub struct ChooseUsernameRequest {
    /// The desired username
    pub username: Username,
}

/// Why the username step was refused
#[derive(Default, Serialize, JsonSchema)]
pub struct ChooseUsernameErrors {
    /// The username belongs to another Account
    pub username_taken: bool,
    /// No OIDC login is pending, or it ran out
    pub nothing_pending: bool,
}
