//! Schema of the userinfo endpoint

use galvyn::core::handler::context::EndpointContext;
use galvyn::core::handler::response_body::ResponseBody;
use galvyn::core::handler::response_body::ShouldBeResponseBody;
use galvyn::core::re_exports::axum::http::HeaderName;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::http::header;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Response;
use galvyn::core::re_exports::mime::Mime;
use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::schemars::schema::Schema;
use galvyn::core::stuff::api_error::ApiError;
use serde::Deserialize;
use serde::Serialize;

use crate::http::handler_auth::issuer;
use crate::http::handler_auth::token::schema::ScopeClaims;

/// Claims about the end-user
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct UserinfoResponse {
    /// Identifier of the end-user
    pub sub: String,
    /// Claims of the granted scopes
    #[serde(flatten)]
    pub scope_claims: ScopeClaims,
}

/// Error response of the userinfo endpoint (OIDC Core §5.3.3, RFC 6750 §3)
#[derive(Debug)]
pub enum UserinfoError {
    /// The request is malformed, see [`BearerToken`](super::request::BearerToken)
    ///
    /// RFC 6750 §3.1: "The resource server SHOULD respond with the HTTP 400 (Bad Request)
    /// status code."
    InvalidRequest,
    /// The request carries no bearer token
    ///
    /// RFC 6750 §3.1: "If the request lacks any authentication information [...],
    /// the resource server SHOULD NOT include an error code or other error information."
    MissingToken,
    /// RFC 6750 §3.1: "The access token provided is expired, revoked, malformed, or invalid
    /// for other reasons."
    ///
    /// Also used when the account behind the token is no club member anymore.
    InvalidToken,
    /// An error unrelated to RFC 6750
    Internal(ApiError),
}

impl From<anyhow::Error> for UserinfoError {
    #[track_caller]
    fn from(error: anyhow::Error) -> Self {
        Self::Internal(ApiError::from(error))
    }
}

impl IntoResponse for UserinfoError {
    fn into_response(self) -> Response {
        let realm = format!("Bearer realm=\"{}\"", issuer());
        let (status, challenge) = match self {
            UserinfoError::InvalidRequest => (
                StatusCode::BAD_REQUEST,
                format!("{realm}, error=\"invalid_request\""),
            ),
            UserinfoError::MissingToken => (StatusCode::UNAUTHORIZED, realm),
            UserinfoError::InvalidToken => (
                StatusCode::UNAUTHORIZED,
                format!("{realm}, error=\"invalid_token\""),
            ),
            UserinfoError::Internal(error) => return error.into_response(),
        };
        (status, [(header::WWW_AUTHENTICATE, challenge)]).into_response()
    }
}

impl ShouldBeResponseBody for UserinfoError {}
impl ResponseBody for UserinfoError {
    fn header() -> Vec<HeaderName> {
        vec![header::WWW_AUTHENTICATE]
    }

    fn body(ctx: &mut EndpointContext) -> Vec<(StatusCode, Option<(Mime, Option<Schema>)>)> {
        let mut bodies = vec![
            (StatusCode::BAD_REQUEST, None),
            (StatusCode::UNAUTHORIZED, None),
        ];
        bodies.extend(<ApiError as ResponseBody>::body(ctx));
        bodies
    }
}
