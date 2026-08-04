//! HTTP related code

use galvyn::core::GalvynRouter;
use tower::ServiceBuilder;
use tower_http::trace::DefaultMakeSpan;
use tower_http::trace::DefaultOnResponse;
use tower_http::trace::TraceLayer;
use tracing::Level;

pub mod extractors;
pub mod handler_auth;
pub mod handler_frontend;
pub mod middlewares;

/// Retrieve the routes for the http server
pub fn get_router() -> GalvynRouter {
    GalvynRouter::new()
        .nest(
            "/api/v1",
            GalvynRouter::new()
                .nest("/frontend", handler_frontend::initialize())
                .nest("/auth", handler_auth::initialize()),
        )
        .layer(
            ServiceBuilder::new().layer(
                TraceLayer::new_for_http()
                    .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                    .on_response(DefaultOnResponse::new().level(Level::INFO))
                    // Disable automatic failure logger because any handler_frontend returning a 500 should have already logged its reason™
                    .on_failure(()),
            ),
        )
}
