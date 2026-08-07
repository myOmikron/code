//! HTTP module

use std::sync::OnceLock;

use galvyn::core::GalvynRouter;
use galvyn::core::SchemalessJson;
use galvyn::core::session;
use galvyn::get;
use galvyn::openapi::OpenAPI;
use galvyn::openapi::OpenapiRouterExt;
use galvyn::openapi::get_openapi_for_page;
use tracing::instrument;

pub mod handler_frontend;
pub mod middleware;

/// Frontend API Page
pub struct FrontendApi;

/// The general openapi page
#[get("/openapi.json")]
#[instrument]
pub async fn get_openapi() -> SchemalessJson<&'static OpenAPI> {
    SchemalessJson(galvyn::openapi::get_openapi())
}

/// Frontend openapi
#[get("/frontend.json")]
#[instrument]
pub async fn get_frontend_openapi() -> SchemalessJson<&'static OpenAPI> {
    static CACHE: OnceLock<OpenAPI> = OnceLock::new();
    SchemalessJson(CACHE.get_or_init(|| get_openapi_for_page(FrontendApi)))
}

/// Initialize the main http router
pub fn get_routes() -> GalvynRouter {
    GalvynRouter::new()
        .nest(
            "/docs",
            GalvynRouter::new()
                .openapi_tag("Openapi")
                .handler(get_openapi)
                .handler(get_frontend_openapi),
        )
        .nest(
            "/api/frontend/v1",
            handler_frontend::initialize_routes().openapi_page(FrontendApi),
        )
        .layer(session::layer())
}
