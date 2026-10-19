//! Middleware which requires the user to be an authenticated admin.

use std::ops::ControlFlow;

use galvyn::core::middleware::SimpleGalvynMiddleware;
use galvyn::core::re_exports::axum::extract::FromRequestParts;
use galvyn::core::re_exports::axum::extract::Request;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Response;

use crate::models::Account;
use crate::models::Role;

/// Middleware which requires the user to be authenticated with role [`Role::Admin`].
///
/// Anonymous requests get `401`, other roles `403`.
///
/// The extractor caches the account in the request extensions, so handlers
/// extracting `Account` again pay no extra query.
#[derive(Copy, Clone, Debug)]
pub struct AdminRequiredLayer;
impl SimpleGalvynMiddleware for AdminRequiredLayer {
    async fn pre_handler(&mut self, req: Request) -> ControlFlow<Response, Request> {
        let (mut parts, body) = req.into_parts();
        match Account::from_request_parts(&mut parts, &()).await {
            Ok(account) if account.role == Role::Admin => {
                ControlFlow::Continue(Request::from_parts(parts, body))
            }
            Ok(_) => ControlFlow::Break(StatusCode::FORBIDDEN.into_response()),
            Err(rejection) => ControlFlow::Break(rejection.into_response()),
        }
    }
}
