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

/// Initializes all routes
pub fn initialize_routes() -> GalvynRouter {
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
        // Binary response without a json schema — kept off the FrontendApi
        // page so the client generator doesn't choke on it. The frontend
        // loads it via plain `<img src>`.
        .nest(
            "/api/frontend/v1/shop",
            GalvynRouter::new().handler(handler_frontend::shop::handler::get_item_image),
        )
        .layer(session::layer())
}
