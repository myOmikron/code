//! The access token of a userinfo request
//!
//! Only the `Authorization` header is supported (RFC 6750 §2.1). RFC 6750 §3.1:
//! `invalid_request` is for a request that "includes an unsupported parameter or parameter
//! value, repeats the same parameter, uses more than one method for including an access
//! token, or is otherwise malformed", so an `access_token` in the query or a form body is
//! one, too.

use galvyn::core::re_exports::axum::body::Bytes;
use galvyn::core::re_exports::axum::extract::FromRequest;
use galvyn::core::re_exports::axum::extract::Request;
use galvyn::core::re_exports::axum::http::HeaderMap;
use galvyn::core::re_exports::axum::http::header;
use galvyn::core::re_exports::mime;
use galvyn::rorm::fields::types::MaxStr;

use crate::http::handler_auth::params::Params;
use crate::http::handler_auth::userinfo::schema::UserinfoError;

/// The bearer token of the request's `Authorization` header
///
/// The access tokens this provider issues are far shorter than the bound; a longer token
/// is none of them and therefore `invalid_token`.
pub struct BearerToken(pub MaxStr<4096>);

impl<S: Send + Sync> FromRequest<S> for BearerToken {
    type Rejection = UserinfoError;

    async fn from_request(request: Request, state: &S) -> Result<Self, Self::Rejection> {
        let in_query = request
            .uri()
            .query()
            .is_some_and(|query| has_access_token(query.as_bytes()));
        let headers = request.headers().clone();
        let in_body = is_form(&headers)
            && has_access_token(
                &Bytes::from_request(request, state)
                    .await
                    .map_err(|_| UserinfoError::InvalidRequest)?,
            );
        let in_header = bearer_token(&headers)?;

        match (in_header, in_query || in_body) {
            (Some(token), false) => MaxStr::new(token.to_string())
                .map(Self)
                .map_err(|_| UserinfoError::InvalidToken),
            (None, false) => Err(UserinfoError::MissingToken),
            (_, true) => Err(UserinfoError::InvalidRequest),
        }
    }
}

/// Whether the form encoded `input` has an `access_token`, repeated or not
fn has_access_token(input: &[u8]) -> bool {
    !matches!(Params::parse(input).single("access_token"), Ok(None))
}

/// Whether the body is `application/x-www-form-urlencoded`
fn is_form(headers: &HeaderMap) -> bool {
    headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<mime::Mime>().ok())
        .is_some_and(|mime| mime.essence_str() == mime::APPLICATION_WWW_FORM_URLENCODED)
}

/// The token of the `Authorization: Bearer` header, `None` without one
///
/// RFC 7235 §2.1: "It uses a case-insensitive token as a means to identify the
/// authentication scheme". Other schemes count as no token at all.
///
/// RFC 6750 §2.1: `credentials = "Bearer" 1*SP b64token`, with
/// `b64token = 1*( ALPHA / DIGIT / "-" / "." / "_" / "~" / "+" / "/" ) *"="`.
fn bearer_token(headers: &HeaderMap) -> Result<Option<&str>, UserinfoError> {
    let mut values = headers.get_all(header::AUTHORIZATION).iter();
    let Some(value) = values.next() else {
        return Ok(None);
    };
    if values.next().is_some() {
        return Err(UserinfoError::InvalidRequest);
    }
    let value = value.to_str().map_err(|_| UserinfoError::InvalidRequest)?;
    let (scheme, token) = value.split_once(' ').unwrap_or((value, ""));
    if !scheme.eq_ignore_ascii_case("Bearer") {
        return Ok(None);
    }
    let token = token.trim_start_matches(' ');
    if is_b64token(token) {
        Ok(Some(token))
    } else {
        Err(UserinfoError::InvalidRequest)
    }
}

/// Whether `token` is an RFC 6750 §2.1 `b64token`
fn is_b64token(token: &str) -> bool {
    let value = token.trim_end_matches('=');
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-._~+/".contains(&byte))
}
