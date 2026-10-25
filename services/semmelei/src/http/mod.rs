//! HTTP module

use galvyn::core::GalvynRouter;
use galvyn::core::session;
use galvyn::openapi::OpenapiRouterExt;

pub mod handler_frontend;
pub mod middleware;

/// Frontend API Page
pub struct FrontendApi;

/// Initializes all routes
pub fn initialize_routes() -> GalvynRouter {
    routes()
        .layer(session::layer())
        .layer(service_bootstrap::http::trace_layer())
}

/// Every route, without the layers around them
///
/// Split off so the `openapi` subcommand can register the routes without the
/// session layer, which wants a database the subcommand does not have.
pub fn routes() -> GalvynRouter {
    GalvynRouter::new()
        .nest(
            "/docs",
            service_bootstrap::openapi_docs_routes!(FrontendApi),
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
}
