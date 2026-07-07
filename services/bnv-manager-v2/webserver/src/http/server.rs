//! Server initialization

use std::net::SocketAddr;

use galvyn::RouterBuilder;
use galvyn::core::GalvynRouter;
use galvyn::error::GalvynError;
use tower::ServiceBuilder;
use tower_http::trace::DefaultMakeSpan;
use tower_http::trace::DefaultOnResponse;
use tower_http::trace::TraceLayer;
use tracing::Level;

use crate::config::LISTEN_ADDRESS;
use crate::config::LISTEN_PORT;
use crate::http::handler_auth;
use crate::http::handler_frontend;

/// Start the http server
pub async fn run(mut router: RouterBuilder) -> Result<(), GalvynError> {
    let addr = SocketAddr::new(*LISTEN_ADDRESS.get(), *LISTEN_PORT.get());

    let routes = GalvynRouter::new()
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
        );

    router.add_listener(addr, routes).start().await
}
