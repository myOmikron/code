//! HTTP related code

use galvyn::core::GalvynRouter;
use galvyn::core::session;
use galvyn::openapi::OpenapiRouterExt;
use tower::ServiceBuilder;
use tower_http::trace::DefaultOnResponse;
use tracing::Level;

pub mod extractors;
pub mod handler_auth;
pub mod handler_frontend;
pub mod middlewares;

/// The frontend's openapi page, the frontend's api client is generated from it
///
/// It holds every route below `/api`, whatever role it needs: roles are
/// enforced by the routes' layers, not by the page.
pub struct FrontendApi;

/// Retrieve the routes for the http server
pub fn get_router() -> GalvynRouter {
    routes().layer(session::layer()).layer(
        ServiceBuilder::new().layer(
            service_bootstrap::http::trace_layer()
                .on_response(DefaultOnResponse::new().level(Level::INFO))
                .on_failure(()),
        ),
    )
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
            "/api/v1/frontend",
            handler_frontend::initialize().openapi_page(FrontendApi),
        )
        .nest(
            handler_auth::BASE_PATH,
            handler_auth::initialize().openapi_page(FrontendApi),
        )
}
