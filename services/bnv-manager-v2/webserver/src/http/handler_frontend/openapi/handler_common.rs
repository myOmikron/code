//! Common handlers of the openapi

use galvyn::core::re_exports::axum::Json;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Response;
use galvyn::get;
use tracing::instrument;

use crate::http::handler_auth::AuthPage;
use crate::http::handler_frontend::AdminAPI;
use crate::http::handler_frontend::ClubAdminApi;
use crate::http::handler_frontend::ClubMemberApi;
use crate::http::handler_frontend::CommonApi;

/// Generate the openapi definition for the admin page
#[get("/admin.json")]
#[instrument(name = "Api::openapi_admin")]
pub async fn openapi_admin() -> Response {
    Json(galvyn::openapi::get_openapi_for_page(AdminAPI)).into_response()
}

/// Generate the openapi definition for the club admin page
#[get("/club-admin.json")]
#[instrument(name = "Api::openapi_club_admin")]
pub async fn openapi_club_admin() -> Response {
    Json(galvyn::openapi::get_openapi_for_page(ClubAdminApi)).into_response()
}

/// Generate the openapi definition for the club member page
#[get("/club-member.json")]
#[instrument(name = "Api::openapi_club_member")]
pub async fn openapi_club_member() -> Response {
    Json(galvyn::openapi::get_openapi_for_page(ClubMemberApi)).into_response()
}

/// Generate the openapi definition for the common
#[get("/common.json")]
#[instrument(name = "Api::openapi_common")]
pub async fn openapi_common() -> Response {
    Json(galvyn::openapi::get_openapi_for_page(CommonApi)).into_response()
}

/// Generate the openapi definition for the common
#[get("/auth.json")]
#[instrument(name = "Api::openapi_auth")]
pub async fn openapi_auth() -> Response {
    Json(galvyn::openapi::get_openapi_for_page(AuthPage)).into_response()
}
