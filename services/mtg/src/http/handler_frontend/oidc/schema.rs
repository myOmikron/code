//! Request/response schemas of the OIDC login handlers

use galvyn::core::handler::context::EndpointContext;
use galvyn::core::handler::response_body::ResponseBody;
use galvyn::core::handler::response_body::ShouldBeResponseBody;
use galvyn::core::re_exports::axum::http::HeaderName;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Redirect;
use galvyn::core::re_exports::axum::response::Response;
use galvyn::core::re_exports::mime::Mime;
use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::schemars::schema::Schema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::http::handler_frontend::oidc::LOGIN_PAGE;
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
/// Sent as the `oidc_error` query parameter of the login page, see
/// [`OidcCallbackRedirect`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum OidcLoginFailure {
    /// The person cancelled at the provider
    Cancelled,
    /// The login was not started in this session, or ran out
    Expired,
    /// The provider cannot be reached right now
    ProviderUnavailable,
    /// The provider did not state a verified email
    EmailUnverified,
    /// The verified email belongs to an Account already
    EmailInUse,
    /// An Admin locked the Account
    Locked,
    /// The provider's answer did not check out
    Failed,
}

/// The query of the login page a refused OIDC login returns to
#[derive(Serialize)]
struct LoginPageQuery {
    /// Why the login was refused
    oidc_error: OidcLoginFailure,
}

/// Where the callback sends the browser: the app, the username step, or the login page
///
/// A `303 See Other` without a body. Its schema in the spec is
/// [`OidcLoginFailure`]: no body carries it, but the frontend reads it from
/// the login page's `oidc_error` and needs the generated type for that.
#[derive(Debug)]
pub struct OidcCallbackRedirect(Redirect);

impl OidcCallbackRedirect {
    /// Send the browser to the frontend page `path`
    pub fn to(path: &str) -> Self {
        Self(Redirect::to(path))
    }

    /// Send the browser back to the login page, naming why
    pub fn refused(failure: OidcLoginFailure) -> Self {
        let query = serde_urlencoded::to_string(LoginPageQuery {
            oidc_error: failure,
        })
        .unwrap_or_else(|_| unreachable!("a struct of one unit variant serializes"));
        Self::to(&format!("{LOGIN_PAGE}?{query}"))
    }
}

impl IntoResponse for OidcCallbackRedirect {
    fn into_response(self) -> Response {
        self.0.into_response()
    }
}

impl ShouldBeResponseBody for OidcCallbackRedirect {}
impl ResponseBody for OidcCallbackRedirect {
    fn header() -> Vec<HeaderName> {
        <Redirect as ResponseBody>::header()
    }

    fn body(ctx: &mut EndpointContext) -> Vec<(StatusCode, Option<(Mime, Option<Schema>)>)> {
        ctx.generator.generate::<OidcLoginFailure>();
        <Redirect as ResponseBody>::body(ctx)
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
    /// The verified email came to belong to an Account since the login
    /// started; the pending login is gone
    pub email_in_use: bool,
}
