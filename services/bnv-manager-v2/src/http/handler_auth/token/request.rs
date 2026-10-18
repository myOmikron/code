//! Parsing of token requests: the form and the client's credentials

use base64ct::Base64;
use base64ct::Encoding;
use galvyn::core::handler::context::EndpointContext;
use galvyn::core::handler::request_body::RequestBody;
use galvyn::core::handler::request_body::ShouldBeRequestBody;
use galvyn::core::re_exports::axum::extract::FromRequest;
use galvyn::core::re_exports::axum::extract::RawForm;
use galvyn::core::re_exports::axum::extract::Request;
use galvyn::core::re_exports::axum::http::HeaderMap;
use galvyn::core::re_exports::axum::http::HeaderValue;
use galvyn::core::re_exports::axum::http::header;
use galvyn::core::re_exports::mime;
use galvyn::core::re_exports::mime::Mime;
use galvyn::core::re_exports::schemars::schema::Schema;
use percent_encoding::percent_decode_str;

use crate::http::handler_auth::params::Params;
use crate::http::handler_auth::token::response::TokenError;
use crate::http::handler_auth::token::schema::TokenRequest;

/// The form of a token request, rejected with `invalid_request` when it is malformed
///
/// Parsed as [`Params`]; a repeated parameter is malformed. RFC 6749 §3.2: "The
/// authorization server MUST ignore unrecognized request parameters."
pub struct TokenForm(pub TokenRequest);

impl<S: Send + Sync> FromRequest<S> for TokenForm {
    type Rejection = TokenError;

    async fn from_request(request: Request, state: &S) -> Result<Self, Self::Rejection> {
        let RawForm(body) = RawForm::from_request(request, state)
            .await
            .map_err(|_| TokenError::invalid_request("Expected an urlencoded form"))?;

        let parameters = Params::parse(&body)
            .into_unique()
            .map_err(|_| TokenError::invalid_request("Repeated parameter"))?;

        serde_json::from_value(serde_json::Value::Object(
            parameters
                .into_iter()
                .map(|(name, value)| (name, serde_json::Value::String(value)))
                .collect(),
        ))
        .map(Self)
        .map_err(|_| TokenError::invalid_request("Missing or invalid parameter"))
    }
}

impl ShouldBeRequestBody for TokenForm {}
impl RequestBody for TokenForm {
    fn body(ctx: &mut EndpointContext) -> (Mime, Option<Schema>) {
        (
            mime::APPLICATION_WWW_FORM_URLENCODED,
            Some(ctx.generator.generate::<TokenRequest>()),
        )
    }
}

/// Credentials a client authenticates with
pub struct ClientCredentials {
    /// The `client_id`
    pub client_id: String,
    /// The `client_secret`
    pub client_secret: String,
}

impl ClientCredentials {
    /// The credentials of `client_secret_basic` or `client_secret_post`
    ///
    /// RFC 6749 §2.3: "The client MUST NOT use more than one authentication method in each
    /// request."
    pub fn from_request(headers: &HeaderMap, form: &TokenRequest) -> Result<Self, TokenError> {
        let mut authorization = headers.get_all(header::AUTHORIZATION).iter();
        let basic = match (authorization.next(), authorization.next()) {
            (None, _) => None,
            (Some(_), Some(_)) => {
                return Err(TokenError::invalid_request("Repeated Authorization header"));
            }
            (Some(value), None) => Some(Self::from_basic(value)?),
        };

        match (basic, &form.client_secret) {
            (Some(_), Some(_)) => Err(TokenError::invalid_request(
                "Use either client_secret_basic or client_secret_post, not both",
            )),
            (Some(basic), None) => {
                if form
                    .client_id
                    .as_ref()
                    .is_some_and(|client_id| **client_id != basic.client_id)
                {
                    return Err(TokenError::invalid_request(
                        "client_id differs from the HTTP Basic credentials",
                    ));
                }
                Ok(basic)
            }
            (None, Some(client_secret)) => {
                let client_id = form
                    .client_id
                    .as_ref()
                    .ok_or(TokenError::invalid_client("Missing client_id"))?;
                Ok(Self {
                    client_id: client_id.to_string(),
                    client_secret: client_secret.to_string(),
                })
            }
            (None, None) => Err(TokenError::invalid_client("Missing client authentication")),
        }
    }

    /// The credentials of an `Authorization: Basic` header
    ///
    /// RFC 6749 §2.3.1: "The client identifier is encoded using the
    /// "application/x-www-form-urlencoded" encoding algorithm per Appendix B, and the
    /// encoded value is used as the username; the client password is encoded using the
    /// same algorithm and used as the password."
    fn from_basic(value: &HeaderValue) -> Result<Self, TokenError> {
        let (scheme, credentials) = value
            .to_str()
            .ok()
            .and_then(|value| value.trim().split_once(' '))
            .ok_or(TokenError::invalid_client("Malformed Authorization header"))?;
        if !scheme.eq_ignore_ascii_case("basic") {
            return Err(TokenError::invalid_client(
                "Unsupported authentication scheme",
            ));
        }

        let malformed = || TokenError::invalid_client("Malformed HTTP Basic credentials");
        let credentials = Base64::decode_vec(credentials.trim()).map_err(|_| malformed())?;
        let credentials = String::from_utf8(credentials).map_err(|_| malformed())?;
        let (client_id, client_secret) = credentials.split_once(':').ok_or_else(malformed)?;
        let form_decode = |value: &str| {
            percent_decode_str(&value.replace('+', " "))
                .decode_utf8()
                .map(|value| value.into_owned())
                .map_err(|_| malformed())
        };

        Ok(Self {
            client_id: form_decode(client_id)?,
            client_secret: form_decode(client_secret)?,
        })
    }
}
