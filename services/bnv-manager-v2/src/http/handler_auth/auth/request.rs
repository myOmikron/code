//! Parsing and validation of authorization requests
//!
//! The parameters are read raw, so a malformed request can still be answered: an error
//! about the client or `redirect_uri` goes to the provider's error page, every later one
//! back to the client (RFC 6749 §4.1.2.1).

use std::convert::Infallible;

use galvyn::core::handler::context::EndpointContext;
use galvyn::core::handler::request_part::RequestPart;
use galvyn::core::handler::request_part::ShouldBeRequestPart;
use galvyn::core::re_exports::axum::extract::FromRequestParts;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::re_exports::axum::http::request::Parts;
use galvyn::core::re_exports::schemars::schema::Schema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use time::Duration;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::http::handler_auth::auth::handler::ALLOWED_SCOPES;
use crate::http::handler_auth::auth::redirect::AuthErrorCode;
use crate::http::handler_auth::auth::redirect::ErrorRedirect;
use crate::http::handler_auth::auth::schema::AuthQuery;
use crate::http::handler_auth::params::Params;
use crate::http::handler_auth::params::Repeated;
use crate::http::handler_auth::pkce;
use crate::models::oidc_client::OidcClientUuid;

/// A validated authorization request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthRequest {
    /// The client asking for the authorization
    pub client_id: OidcClientUuid,
    /// The client's registered `redirect_uri` the response goes to
    pub redirect_uri: MaxStr<1024>,
    /// The requested scopes, `openid` among them
    pub scopes: Vec<String>,
    /// Opaque value returned to the client unchanged
    pub state: Option<MaxStr<1024>>,
    /// Value the ID token echoes, binding it to this request
    pub nonce: Option<MaxStr<255>>,
    /// PKCE code challenge (RFC 7636) in its `S256` form, see [`pkce`]
    pub code_challenge: Option<MaxStr<128>>,
    /// `prompt=none`, the request fails instead of showing the login page
    pub prompt_none: bool,
    /// A login at or before this point in time is too old for the request
    ///
    /// Set by `prompt=login` and `max_age`.
    #[serde(with = "time::serde::rfc3339::option")]
    pub login_after: Option<OffsetDateTime>,
}

impl AuthRequest {
    /// Whether a login at `auth_time` is recent enough for this request
    ///
    /// A session without a recorded login time never is, every ID token carries `auth_time`.
    pub fn accepts_login(&self, auth_time: Option<OffsetDateTime>) -> bool {
        auth_time.is_some_and(|auth_time| {
            self.login_after
                .is_none_or(|login_after| auth_time > login_after)
        })
    }

    /// An error redirect for this request to the client
    pub fn error(&self, error: AuthErrorCode, description: &'static str) -> ErrorRedirect {
        ErrorRedirect {
            redirect_uri: self.redirect_uri.clone(),
            error,
            description,
            state: self.state.clone(),
        }
    }
}

/// The raw query parameters of an authorization request
///
/// Documented as [`AuthQuery`] in the OpenAPI spec.
#[derive(Debug, Clone)]
pub struct AuthRequestParams(Params);

impl<S: Sync> FromRequestParts<S> for AuthRequestParams {
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let query = parts.uri.query().unwrap_or_default();
        Ok(Self(Params::parse(query.as_bytes())))
    }
}

impl ShouldBeRequestPart for AuthRequestParams {}
impl RequestPart for AuthRequestParams {
    fn query_parameters(ctx: &mut EndpointContext) -> Vec<(String, Option<Schema>)> {
        <Query<AuthQuery> as RequestPart>::query_parameters(ctx)
    }
}

/// Why an authorization request was refused
#[derive(Debug)]
pub enum AuthRequestError {
    /// The `redirect_uri` is missing, repeated or not the registered one
    InvalidRedirectUri,
    /// The `response_mode` is not supported
    ///
    /// OpenID Connect Core §3.1.2.6: "If the Response Mode value is not supported, the
    /// Authorization Server returns an HTTP response code of 400 (Bad Request) without
    /// Error Response parameters, since understanding the Response Mode is necessary to
    /// know how to return those parameters."
    UnsupportedResponseMode,
    /// Any other error, sent back to the client's `redirect_uri`
    Redirect(Box<ErrorRedirect>),
}

impl AuthRequestParams {
    /// The value of the parameter `name`, see [`Params::single`]
    fn single(&self, name: &str) -> Result<Option<&str>, Repeated> {
        self.0.single(name)
    }

    /// The `client_id`, `None` when it is missing, repeated or not a client id at all
    pub fn client_id(&self) -> Option<OidcClientUuid> {
        let client_id = self.single("client_id").ok()??;
        Uuid::parse_str(client_id).ok().map(OidcClientUuid)
    }

    /// Validates the request of the client `client_id` with the registered `registered_uri`
    ///
    /// The `redirect_uri` has to equal the registered one exactly, including its query.
    /// RFC 9700 §4.1.3: "This means the authorization server MUST ensure that the two URIs
    /// are equal; see Section 6.2.1 of \[RFC3986\], Simple String Comparison, for details."
    ///
    /// A `state` too long to be stored is not echoed in the error redirect.
    ///
    /// OpenID Connect Core §3.1.2.1 on `prompt`: "If this parameter contains none with any
    /// other value, an error is returned." and "If an OP receives a prompt value outside
    /// the set defined above that it does not understand, it MAY return an error or it MAY
    /// ignore it". `consent` and `select_account` are ignored as well, there is no consent
    /// screen and a session has one account.
    ///
    /// On `max_age`: "If the elapsed time is greater than this value, the OP MUST attempt
    /// to actively re-authenticate the End-User." A `max_age` reaching back before any
    /// representable time demands nothing.
    pub fn validate(
        &self,
        client_id: OidcClientUuid,
        registered_uri: &MaxStr<1024>,
    ) -> Result<AuthRequest, AuthRequestError> {
        if self.single("redirect_uri").ok().flatten() != Some(&**registered_uri) {
            return Err(AuthRequestError::InvalidRedirectUri);
        }

        match self.single("response_mode") {
            Ok(None | Some("query")) => {}
            Ok(Some(_)) | Err(Repeated) => return Err(AuthRequestError::UnsupportedResponseMode),
        }

        let state = self
            .single("state")
            .ok()
            .flatten()
            .and_then(|state| MaxStr::new(state.to_string()).ok());
        let mut request = AuthRequest {
            client_id,
            redirect_uri: registered_uri.clone(),
            scopes: Vec::new(),
            state,
            nonce: None,
            code_challenge: None,
            prompt_none: false,
            login_after: None,
        };
        let invalid_request = |description| {
            AuthRequestError::Redirect(Box::new(
                request.error(AuthErrorCode::InvalidRequest, description),
            ))
        };

        let Ok(state) = self.single("state") else {
            return Err(invalid_request("state is repeated"));
        };
        if state.is_some() && request.state.is_none() {
            return Err(invalid_request("state is too long"));
        }

        let single = |name| {
            self.single(name)
                .map_err(|Repeated| invalid_request("A parameter is repeated"))
        };
        let fail = |error, description| {
            AuthRequestError::Redirect(Box::new(request.error(error, description)))
        };

        match single("response_type")? {
            None => return Err(invalid_request("response_type is missing")),
            Some("code") => {}
            Some(_) => {
                return Err(fail(
                    AuthErrorCode::UnsupportedResponseType,
                    "Only the response_type code is supported",
                ));
            }
        }

        let scope: MaxStr<1024> = MaxStr::new(single("scope")?.unwrap_or_default().to_string())
            .map_err(|_| fail(AuthErrorCode::InvalidScope, "scope is too long"))?;
        let scopes: Vec<String> = scope.split(' ').map(str::to_string).collect();
        if !scopes.iter().any(|scope| scope == "openid") {
            return Err(fail(
                AuthErrorCode::InvalidScope,
                "The scope openid is required",
            ));
        }
        if !scopes
            .iter()
            .all(|scope| ALLOWED_SCOPES.contains(&scope.as_str()))
        {
            return Err(fail(AuthErrorCode::InvalidScope, "Unknown scope requested"));
        }

        let nonce = single("nonce")?
            .map(|nonce| MaxStr::new(nonce.to_string()))
            .transpose()
            .map_err(|_| invalid_request("nonce is too long"))?;

        let code_challenge = match (single("code_challenge")?, single("code_challenge_method")?) {
            (None, None) => None,
            (None, Some(_)) => {
                return Err(invalid_request(
                    "code_challenge is required when code_challenge_method is set",
                ));
            }
            (Some(challenge), method) => Some(
                pkce::s256_challenge(challenge, method)
                    .and_then(|challenge| {
                        MaxStr::new(challenge).map_err(|_| "code_challenge is too long")
                    })
                    .map_err(invalid_request)?,
            ),
        };

        let prompt: Vec<&str> = single("prompt")?
            .map(|prompt| prompt.split(' ').collect())
            .unwrap_or_default();
        let prompt_none = prompt.contains(&"none");
        if prompt_none && prompt.len() > 1 {
            return Err(invalid_request("prompt none must not be combined"));
        }

        let now = OffsetDateTime::now_utc();
        let mut login_after = prompt.contains(&"login").then_some(now);
        if let Some(max_age) = single("max_age")? {
            let max_age: u64 = max_age
                .parse()
                .map_err(|_| invalid_request("max_age is not a number of seconds"))?;
            let oldest = i64::try_from(max_age)
                .ok()
                .and_then(|max_age| now.checked_sub(Duration::seconds(max_age)));
            login_after = login_after.max(oldest);
        }

        request.scopes = scopes;
        request.nonce = nonce;
        request.code_challenge = code_challenge;
        request.prompt_none = prompt_none;
        request.login_after = login_after;
        Ok(request)
    }
}
