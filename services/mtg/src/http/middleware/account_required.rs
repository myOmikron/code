//! Middleware which requires the session to belong to an Account that is not locked,
//! or for routes that serve Guests too, to belong to nobody or to such an Account

use std::ops::ControlFlow;

use galvyn::core::middleware::SimpleGalvynMiddleware;
use galvyn::core::re_exports::axum::extract::FromRequestParts;
use galvyn::core::re_exports::axum::extract::Request;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Response;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::core::ApiErrorStatusCode;
use galvyn_identity::Identity;

use crate::models::account::Account;

/// Requires the session to be logged in as an Account that is not locked
///
/// mtg's replacement for `galvyn_identity::AuthRequiredLayer`, which only
/// checks the Identity: wrapping with this refuses a locked Account's session
/// also on routes whose handlers never extract the [`Account`]. Only
/// `accounts/me` keeps the plain layer, to tell a locked session why it ends. The extractor
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

/// Refuses a session logged in as an Account that is locked or gone, and lets
/// a session nobody is logged in through
///
/// For the routes a Guest uses through its Guest seat as well as an Account
/// (ADR 0007): a locked Account's session is refused there like behind
/// [`AccountRequiredLayer`], instead of reading as nobody.
#[derive(Copy, Clone, Debug)]
pub struct NoLockedAccountLayer;

impl SimpleGalvynMiddleware for NoLockedAccountLayer {
    async fn pre_handler(&mut self, req: Request) -> ControlFlow<Response, Request> {
        let (mut parts, body) = req.into_parts();
        match Identity::from_request_parts(&mut parts, &()).await {
            Ok(_identity) => match Account::from_request_parts(&mut parts, &()).await {
                Ok(_account) => ControlFlow::Continue(Request::from_parts(parts, body)),
                Err(rejection) => ControlFlow::Break(rejection.into_response()),
            },
            Err(ApiError::CoreApiError(error))
                if matches!(error.status_code, ApiErrorStatusCode::Unauthorized) =>
            {
                ControlFlow::Continue(Request::from_parts(parts, body))
            }
            Err(rejection) => ControlFlow::Break(rejection.into_response()),
        }
    }
}
