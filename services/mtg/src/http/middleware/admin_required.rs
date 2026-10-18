//! Middleware which requires the session's Account to be an Admin

use std::ops::ControlFlow;

use galvyn::core::middleware::SimpleGalvynMiddleware;
use galvyn::core::re_exports::axum::extract::FromRequestParts;
use galvyn::core::re_exports::axum::extract::Request;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Response;

use crate::models::account::Account;
use crate::models::account::Role;

/// Requires the session's Account to have the Role [`Role::Admin`]
///
/// No session answers `401`, a Member `403`: the frontend reads a `401` as a
/// logged-out session. The extractor caches the Account on the request, so
/// handlers extracting it again pay no extra query.
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
