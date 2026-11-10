//! Middleware which refuses a route group during an Impersonation

use std::ops::ControlFlow;

use galvyn::core::middleware::SimpleGalvynMiddleware;
use galvyn::core::re_exports::axum::extract::FromRequestParts;
use galvyn::core::re_exports::axum::extract::Request;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Response;
use galvyn::core::stuff::api_json::ApiJson;
use serde::Serialize;

use crate::models::account::extractor::Caller;

/// Refuses its routes while the session impersonates an Account
///
/// For what the Account must do itself: managing its Passkeys, its Deletion
/// and Rename, Bug reports in its name and devices receiving its pushes. An
/// impersonating session gets `403` with [`ImpersonationRefusal`]; any other
/// passes, provided it has an Account to act as. The extractor caches the
/// [`Caller`] on the request, so a layer or handler extracting it again pays
/// no extra query.
#[derive(Copy, Clone, Debug)]
pub struct ImpersonationRefusedLayer;

/// The body of a request refused during an Impersonation
#[derive(Serialize, Debug)]
pub struct ImpersonationRefusal {
    /// Always `true`: tells this refusal from other `403`s
    pub impersonation_active: bool,
}

impl SimpleGalvynMiddleware for ImpersonationRefusedLayer {
    async fn pre_handler(&mut self, req: Request) -> ControlFlow<Response, Request> {
        let (mut parts, body) = req.into_parts();
        match Caller::from_request_parts(&mut parts, &()).await {
            Ok(caller) if caller.is_impersonating() => ControlFlow::Break(
                (
                    StatusCode::FORBIDDEN,
                    ApiJson(ImpersonationRefusal {
                        impersonation_active: true,
                    }),
                )
                    .into_response(),
            ),
            Ok(_) => ControlFlow::Continue(Request::from_parts(parts, body)),
            Err(rejection) => ControlFlow::Break(rejection.into_response()),
        }
    }
}
