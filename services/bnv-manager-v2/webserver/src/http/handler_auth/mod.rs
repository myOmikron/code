//! This module holds all relevant endpoints and schema for oidc

use galvyn::core::GalvynRouter;
use galvyn::openapi::OpenapiRouterExt;

use crate::http::middlewares::AuthRateLimit;

pub mod auth;
pub mod discovery;
pub mod jwks;
pub mod token;
mod userinfo;

/// This page holds everything regarding authentication
pub struct AuthPage;

/// Initialize routes for oidc related settings
pub fn initialize() -> GalvynRouter {
    GalvynRouter::new()
        .openapi_page(AuthPage)
        .handler(auth::auth)
        .handler(auth::sign_out)
        .handler(auth::finish_auth)
        .handler(discovery::discovery)
        .handler(jwks::jwks)
        .handler(token::get_token)
        .handler(userinfo::get_userinfo)
        .merge(
            GalvynRouter::new()
                .handler(auth::sign_in)
                .wrap(AuthRateLimit::new(25)),
        )
}
