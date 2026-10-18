//! Responses of the token endpoint: RFC 6749 §5.2 error objects and `no-store` headers

use galvyn::core::handler::context::EndpointContext;
use galvyn::core::handler::response_body::ResponseBody;
use galvyn::core::handler::response_body::ShouldBeResponseBody;
use galvyn::core::re_exports::axum::http::HeaderName;
use galvyn::core::re_exports::axum::http::HeaderValue;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::http::header;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Response;
use galvyn::core::re_exports::mime;
use galvyn::core::re_exports::mime::Mime;
use galvyn::core::re_exports::schemars::schema::Schema;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::rorm::db::transaction::TransactionError;

use crate::http::handler_auth::token::schema::TokenErrorCode;
use crate::http::handler_auth::token::schema::TokenErrorResponse;

/// The `WWW-Authenticate` challenge of an `invalid_client` response
const BASIC_CHALLENGE: &str = "Basic realm=\"bnv-manager\"";

/// A response that must not be cached
///
/// RFC 6749 §5.1: "The authorization server MUST include the HTTP "Cache-Control" response
/// header field \[RFC2616\] with a value of "no-store" in any response containing tokens,
/// credentials, or other sensitive information, as well as the "Pragma" response header
/// field \[RFC2616\] with a value of "no-cache"."
pub struct NoStore<T>(pub T);

impl<T: IntoResponse> IntoResponse for NoStore<T> {
    fn into_response(self) -> Response {
        let mut response = self.0.into_response();
        let headers = response.headers_mut();
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        headers.insert(header::PRAGMA, HeaderValue::from_static("no-cache"));
        response
    }
}

impl<T> ShouldBeResponseBody for NoStore<T> {}
impl<T: ResponseBody> ResponseBody for NoStore<T> {
    fn header() -> Vec<HeaderName> {
        let mut headers = T::header();
        headers.extend([header::CACHE_CONTROL, header::PRAGMA]);
        headers
    }

    fn body(ctx: &mut EndpointContext) -> Vec<(StatusCode, Option<(Mime, Option<Schema>)>)> {
        T::body(ctx)
    }
}

/// A failed token request
///
/// RFC 6749 §5.2: "The authorization server responds with an HTTP 400 (Bad Request)
/// status code (unless specified otherwise)". For `invalid_client` it "MAY return an
/// HTTP 401 (Unauthorized) status code to indicate which HTTP authentication schemes
/// are supported" and MUST when the client used the "Authorization" header, so
/// `invalid_client` is always a 401 with a `Basic` challenge.
#[derive(Debug)]
pub enum TokenError {
    /// The request was rejected, answered with an RFC 6749 §5.2 error object
    Rejected {
        /// Error code
        code: TokenErrorCode,
        /// Explanation for the client developer
        description: &'static str,
    },
    /// The server failed to process the request
    Server(ApiError),
}

impl TokenError {
    /// `invalid_request`
    pub fn invalid_request(description: &'static str) -> Self {
        Self::Rejected {
            code: TokenErrorCode::InvalidRequest,
            description,
        }
    }

    /// `invalid_client`
    pub fn invalid_client(description: &'static str) -> Self {
        Self::Rejected {
            code: TokenErrorCode::InvalidClient,
            description,
        }
    }

    /// `invalid_grant`
    pub fn invalid_grant(description: &'static str) -> Self {
        Self::Rejected {
            code: TokenErrorCode::InvalidGrant,
            description,
        }
    }

    /// `unsupported_grant_type`
    pub fn unsupported_grant_type(description: &'static str) -> Self {
        Self::Rejected {
            code: TokenErrorCode::UnsupportedGrantType,
            description,
        }
    }
}

impl From<ApiError> for TokenError {
    fn from(error: ApiError) -> Self {
        Self::Server(error)
    }
}

impl From<anyhow::Error> for TokenError {
    #[track_caller]
    fn from(error: anyhow::Error) -> Self {
        Self::Server(error.into())
    }
}

impl From<TransactionError> for TokenError {
    #[track_caller]
    fn from(error: TransactionError) -> Self {
        Self::Server(error.into())
    }
}

impl From<galvyn::rorm::Error> for TokenError {
    #[track_caller]
    fn from(error: galvyn::rorm::Error) -> Self {
        Self::Server(error.into())
    }
}

impl IntoResponse for TokenError {
    fn into_response(self) -> Response {
        let (code, description) = match self {
            TokenError::Rejected { code, description } => (code, description),
            TokenError::Server(error) => return NoStore(error).into_response(),
        };

        let body = NoStore(ApiJson(TokenErrorResponse {
            error: code,
            error_description: description.to_string(),
        }));

        if code == TokenErrorCode::InvalidClient {
            (
                StatusCode::UNAUTHORIZED,
                [(
                    header::WWW_AUTHENTICATE,
                    HeaderValue::from_static(BASIC_CHALLENGE),
                )],
                body,
            )
                .into_response()
        } else {
            (StatusCode::BAD_REQUEST, body).into_response()
        }
    }
}

impl ShouldBeResponseBody for TokenError {}
impl ResponseBody for TokenError {
    fn header() -> Vec<HeaderName> {
        vec![
            header::CACHE_CONTROL,
            header::PRAGMA,
            header::WWW_AUTHENTICATE,
        ]
    }

    fn body(ctx: &mut EndpointContext) -> Vec<(StatusCode, Option<(Mime, Option<Schema>)>)> {
        let schema = ctx.generator.generate::<TokenErrorResponse>();
        let mut bodies = vec![
            (
                StatusCode::BAD_REQUEST,
                Some((mime::APPLICATION_JSON, Some(schema.clone()))),
            ),
            (
                StatusCode::UNAUTHORIZED,
                Some((mime::APPLICATION_JSON, Some(schema))),
            ),
        ];
        bodies.extend(
            <ApiError as ResponseBody>::body(ctx)
                .into_iter()
                .filter(|(status, _)| status.is_server_error()),
        );
        bodies
    }
}
