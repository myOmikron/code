//! Middleware which requires the session to be logged in

use std::ops::ControlFlow;

use galvyn::core::middleware::SimpleGalvynMiddleware;
use galvyn::core::re_exports::axum::extract::FromRequestParts;
use galvyn::core::re_exports::axum::extract::Request;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Response;

use super::models::Identity;

/// Middleware which requires the session to be logged in as an existing [`Identity`]
///
/// Wrap route groups with this instead of extracting the Identity per handler, so a new
/// handler cannot accidentally end up unauthenticated.
#[derive(Copy, Clone, Debug)]
pub struct AuthRequiredLayer;

impl SimpleGalvynMiddleware for AuthRequiredLayer {
    async fn pre_handler(&mut self, req: Request) -> ControlFlow<Response, Request> {
        let (mut parts, body) = req.into_parts();
        match Identity::from_request_parts(&mut parts, &()).await {
            Ok(_identity) => ControlFlow::Continue(Request::from_parts(parts, body)),
            Err(rejection) => ControlFlow::Break(rejection.into_response()),
        }
    }
}
