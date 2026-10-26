//! Middleware which lets a request through to one Tournament only in the part its route group needs

use std::ops::ControlFlow;

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::FromRequestParts;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Request;
use galvyn::core::re_exports::axum::http::request::Parts;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Response;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::rorm::Database;
use serde::Deserialize;

use crate::http::handler_frontend::tournaments::handler::denied;
use crate::models::account::AccountUuid;
use crate::models::account::extractor::Viewer;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::access::TournamentAccess;
use crate::models::tournament::access::TournamentGrant;

/// Lets a request through to the Tournament of its `{tournament}` path segment
/// only if the caller plays the part `0` asks for
///
/// Fetches the Tournament with [`crate::models::tournament::Tournament::get_granted`]
/// and hands it to the handler as a [`TournamentGrant`] on the request, so the
/// handler does not fetch it again. A refusal is the same as for a Tournament
/// that does not exist, see [`denied`]. Wrapped inside
/// [`crate::http::middleware::account_required::AccountRequiredLayer`] for every
/// part but [`TournamentAccess::Viewer`], which also lets nobody logged in see
/// a public Tournament.
#[derive(Copy, Clone, Debug)]
pub struct TournamentAccessLayer(pub TournamentAccess);

/// The `{tournament}` segment of a route's path
#[derive(Deserialize)]
struct TournamentSegment {
    /// The Tournament the route acts on
    tournament: TournamentUuid,
}

impl galvyn::core::middleware::SimpleGalvynMiddleware for TournamentAccessLayer {
    async fn pre_handler(&mut self, req: Request) -> ControlFlow<Response, Request> {
        let (mut parts, body) = req.into_parts();
        match grant(&mut parts, self.0).await {
            Ok(grant) => {
                parts.extensions.insert(grant);
                ControlFlow::Continue(Request::from_parts(parts, body))
            }
            Err(response) => ControlFlow::Break(*response),
        }
    }
}

/// The grant for the request in `parts`, or the response refusing it
async fn grant(
    parts: &mut Parts,
    access: TournamentAccess,
) -> Result<TournamentGrant, Box<Response>> {
    let Path(TournamentSegment { tournament }) =
        Path::<TournamentSegment>::from_request_parts(parts, &())
            .await
            .map_err(refusal)?;
    let viewer = Viewer::from_request_parts(parts, &())
        .await
        .map_err(refusal)?;
    let fetched = fetch(tournament, viewer.account(), access)
        .await
        .map_err(refusal)?;
    fetched.ok_or_else(|| refusal(denied::<()>()))
}

/// `rejection` as the response refusing a request
fn refusal(rejection: impl IntoResponse) -> Box<Response> {
    Box::new(rejection.into_response())
}

/// Fetch `tournament` for `caller` through a route group that needs `access`, `None` if refused
async fn fetch(
    tournament: TournamentUuid,
    caller: Option<AccountUuid>,
    access: TournamentAccess,
) -> Result<Option<TournamentGrant>, ApiError> {
    let mut tx = Database::global().start_transaction().await?;

    let grant = Tournament::get_granted(&mut tx, tournament, caller, access).await?;

    tx.commit().await?;

    Ok(grant)
}

impl<S: Sync> FromRequestParts<S> for TournamentGrant {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        parts
            .extensions
            .get::<TournamentGrant>()
            .cloned()
            .ok_or_else(|| {
                ApiError::server_error("The route is not wrapped in a TournamentAccessLayer")
            })
    }
}
