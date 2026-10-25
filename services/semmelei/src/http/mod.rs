//! HTTP module

use galvyn::core::GalvynRouter;
use galvyn::core::session;
use galvyn::openapi::OpenapiRouterExt;
use tower_http::trace::DefaultMakeSpan;
use tower_http::trace::TraceLayer;
use tracing::Level;

pub mod handler_frontend;
pub mod middleware;

/// Frontend API Page
pub struct FrontendApi;

/// Initializes all routes
pub fn initialize_routes() -> GalvynRouter {
    routes()
        .layer(session::layer())
        // Outside the session layer and at INFO, so the request span is the root of the
        // trace instead of the session layer's `call` span
        .layer(TraceLayer::new_for_http().make_span_with(DefaultMakeSpan::new().level(Level::INFO)))
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
