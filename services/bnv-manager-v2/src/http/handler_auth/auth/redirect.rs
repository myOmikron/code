//! Responses of the authorization endpoint, sent to the client's `redirect_uri`
//!
//! Every redirect of the authorization flow is a [`Found`] (302).
//!
//! The parameters are added to the query with a form url encoder, keeping the query the
//! registered `redirect_uri` has. RFC 6749 §4.1.2.1: "the authorization server informs
//! the client by adding the following parameters to the query component of the
//! redirection URI using the "application/x-www-form-urlencoded" format, per Appendix B".

use galvyn::core::handler::context::EndpointContext;
use galvyn::core::handler::response_body::ResponseBody;
use galvyn::core::handler::response_body::ShouldBeResponseBody;
use galvyn::core::re_exports::axum::http::HeaderName;
use galvyn::core::re_exports::axum::http::HeaderValue;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::http::header;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Response;
use galvyn::core::re_exports::mime::Mime;
use galvyn::core::re_exports::schemars::schema::Schema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Serialize;

/// A `302 Found` redirect
///
/// The status the examples of RFC 6749 use, §1.7: "While the examples in this
/// specification show the use of the HTTP 302 status code, any other method available via
/// the user-agent to accomplish this redirection is allowed".
#[derive(Debug, Clone)]
pub struct Found(String);

impl Found {
    /// Redirect to `location`
    pub fn to(location: &str) -> Self {
        Self(location.to_string())
    }
}

impl IntoResponse for Found {
    fn into_response(self) -> Response {
        match HeaderValue::try_from(self.0) {
            Ok(location) => (StatusCode::FOUND, [(header::LOCATION, location)]).into_response(),
            Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        }
    }
}

impl ShouldBeResponseBody for Found {}
impl ResponseBody for Found {
    fn header() -> Vec<HeaderName> {
        vec![header::LOCATION]
    }

    fn body(_ctx: &mut EndpointContext) -> Vec<(StatusCode, Option<(Mime, Option<Schema>)>)> {
        vec![(StatusCode::FOUND, None)]
    }
}

/// Error codes of an authorization error response
///
/// RFC 6749 §4.1.2.1 and OpenID Connect Core §3.1.2.6
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthErrorCode {
    /// "The request is missing a required parameter, includes an invalid parameter value,
    /// includes a parameter more than once, or is otherwise malformed."
    InvalidRequest,
    /// "The resource owner or authorization server denied the request."
    AccessDenied,
    /// "The authorization server does not support obtaining an authorization code using
    /// this method."
    UnsupportedResponseType,
    /// "The requested scope is invalid, unknown, or malformed."
    InvalidScope,
    /// "The Authorization Server requires End-User authentication. This error MAY be
    /// returned when the prompt parameter value in the Authentication Request is none, but
    /// the Authentication Request cannot be completed without displaying a user interface
    /// for End-User authentication."
    LoginRequired,
}

/// An error response, sent to the client's `redirect_uri`
///
/// Serializes to the parameters the client receives.
#[derive(Debug, Clone, Serialize)]
pub struct ErrorRedirect {
    /// The client's registered `redirect_uri`
    #[serde(skip)]
    pub redirect_uri: MaxStr<1024>,
    /// The error
    pub error: AuthErrorCode,
    /// ASCII text for the client developer
    #[serde(rename = "error_description")]
    pub description: &'static str,
    /// The request's `state`, "The exact value received from the client."
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<MaxStr<1024>>,
}

impl From<ErrorRedirect> for Found {
    fn from(value: ErrorRedirect) -> Self {
        to_client(&value.redirect_uri, &value)
    }
}

/// Parameters of the successful response
#[derive(Serialize)]
struct Success<'a> {
    /// The authorization code
    code: &'a str,
    /// The request's `state`
    #[serde(skip_serializing_if = "Option::is_none")]
    state: Option<&'a str>,
}

/// The successful response, carrying the authorization `code` and the request's `state`
pub fn success(redirect_uri: &str, code: &str, state: Option<&str>) -> Found {
    to_client(redirect_uri, &Success { code, state })
}

/// Redirect to `redirect_uri` with `params` added to its query
///
/// The registered `redirect_uri` is extended as text, so the client receives it unchanged;
/// it has no fragment (see [`OidcClient::is_valid_redirect_uri`]), its query is at the end.
///
/// [`OidcClient::is_valid_redirect_uri`]: crate::models::oidc_client::OidcClient::is_valid_redirect_uri
fn to_client(redirect_uri: &str, params: &impl Serialize) -> Found {
    #[allow(clippy::expect_used)]
    let params = serde_urlencoded::to_string(params).expect("Flat struct of strings");
    let location = match redirect_uri.split_once('?') {
        None => format!("{redirect_uri}?{params}"),
        Some((_, "")) => format!("{redirect_uri}{params}"),
        Some(_) => format!("{redirect_uri}&{params}"),
    };
    Found::to(&location)
}
