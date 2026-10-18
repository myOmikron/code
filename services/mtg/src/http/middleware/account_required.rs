//! Middleware which requires the session to belong to an Account that is not locked

use std::ops::ControlFlow;

use galvyn::core::middleware::SimpleGalvynMiddleware;
use galvyn::core::re_exports::axum::extract::FromRequestParts;
use galvyn::core::re_exports::axum::extract::Request;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Response;

use crate::models::account::Account;

/// Requires the session to be logged in as an Account that is not locked
///
/// mtg's replacement for `galvyn_identity::AuthRequiredLayer`, which only
/// checks the Identity: wrapping with this refuses a locked Account's session
/// also on routes whose handlers never extract the [`Account`]. The extractor
/// caches the Account on the request, so handlers extracting it again pay no
/// extra query.
#[derive(Copy, Clone, Debug)]
pub struct AccountRequiredLayer;

impl SimpleGalvynMiddleware for AccountRequiredLayer {
    async fn pre_handler(&mut self, req: Request) -> ControlFlow<Response, Request> {
        let (mut parts, body) = req.into_parts();
        match Account::from_request_parts(&mut parts, &()).await {
            Ok(_account) => ControlFlow::Continue(Request::from_parts(parts, body)),
            Err(rejection) => ControlFlow::Break(rejection.into_response()),
        }
    }
}
