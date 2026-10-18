//! The OpenID provider's endpoints

use galvyn::core::GalvynRouter;
use galvyn::openapi::OpenapiRouterExt;
use url::Url;

use crate::config::ORIGIN;
use crate::http::middlewares::AuthRateLimit;

pub mod auth;
pub mod discovery;
pub mod jwks;
pub mod params;
pub mod pkce;
pub mod token;
pub mod userinfo;

/// Path the OpenID provider's endpoints are served under, the issuer's path
pub const BASE_PATH: &str = "/api/v1/auth";
/// Path of the authorization endpoint
pub const AUTHORIZATION_PATH: &str = "/auth";
/// Path of the endpoint the login page signs in with
pub const SIGN_IN_PATH: &str = "/sign-in";
/// Path of the endpoint to sign out
pub const SIGN_OUT_PATH: &str = "/sign-out";
/// Path of the endpoint issuing the authorization code after the login
pub const FINISH_AUTH_PATH: &str = "/finish-auth";
/// Path of the discovery document
pub const DISCOVERY_PATH: &str = "/.well-known/openid-configuration";
/// Path of the JSON Web Key Set
pub const JWKS_PATH: &str = "/jwks.json";
/// Path of the token endpoint
pub const TOKEN_PATH: &str = "/token";
/// Path of the userinfo endpoint
pub const USERINFO_PATH: &str = "/userinfo";

/// Absolute url of the endpoint at `path` below [`BASE_PATH`]
pub fn endpoint_url(path: &str) -> Url {
    #[allow(clippy::expect_used)]
    ORIGIN
        .join(&format!("{BASE_PATH}{path}"))
        .expect("Static url")
}

/// Identifier of the OpenID provider: the discovery `issuer` and the `iss` of every token
///
/// Discovery 1.0 §3: "This also MUST be identical to the iss Claim value in ID Tokens
/// issued from this Issuer." It has no terminating `/`, so the discovery document is
/// served at `<issuer>/.well-known/openid-configuration` (Discovery 1.0 §4).
pub fn issuer() -> Url {
    endpoint_url("")
}

/// The OpenAPI page of the OpenID provider's endpoints
pub struct AuthPage;

/// Routes of the OpenID provider
pub fn initialize() -> GalvynRouter {
    GalvynRouter::new()
        .openapi_page(AuthPage)
        .handler(auth::handler::auth)
        .handler(auth::handler::sign_out)
        .handler(auth::handler::finish_auth)
        .handler(discovery::handler::discovery)
        .handler(jwks::handler::jwks)
        .handler(token::handler::get_token)
        .handler(userinfo::handler::get_userinfo)
        .handler(userinfo::handler::post_userinfo)
        .merge(
            GalvynRouter::new()
                .handler(auth::handler::sign_in)
                .wrap(AuthRateLimit::new(25)),
        )
}
