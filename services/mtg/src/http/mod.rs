//! HTTP module

use galvyn::core::GalvynRouter;
use galvyn::core::session;
use galvyn::openapi::OpenapiRouterExt;
use tower_http::CompressionLevel;
use tower_http::compression::CompressionLayer;

pub mod handler_frontend;
pub mod handler_graph;
pub mod middleware;

/// Frontend API Page
pub struct FrontendApi;

/// Initialize the main http router
pub fn initialize_routes() -> GalvynRouter {
    routes()
        .layer(session::layer())
        // Outermost, so it also covers the openapi documents. A collection's
        // entries are a few hundred bytes of json per stack and a big one runs
        // to five figures of stacks — the same payload compresses to about a
        // tenth, and the cpu that costs is nothing against the transfer it
        // saves.
        //
        // The quality is set rather than left alone, and that is the whole
        // reason brotli is safe to offer here: `CompressionLevel::Default`
        // means "whatever the codec picks", and for brotli that is quality 11
        // — meant for compressing a file once and serving it a million times.
        // Measured on a real collection of thirteen thousand stacks, 3.1 MB of
        // json: brotli at 11 takes 4.3 *seconds*. At 4 it takes 22 ms and comes
        // out at 402 KB, which is both smaller and faster than gzip at any
        // level (gzip-4 is 459 KB in 23 ms, gzip-9 427 KB in 69 ms).
        //
        // The knob is shared, so gzip runs at 4 as well. That costs the clients
        // too old for brotli about 5% of their ratio, which is the right side
        // to spend it on.
        .layer(
            CompressionLayer::new()
                .gzip(true)
                .br(true)
                .quality(CompressionLevel::Precise(4)),
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
            "/api/frontend/v1",
            handler_frontend::initialize_routes().openapi_page(FrontendApi),
        )
        // Off the FrontendApi page on purpose: the ts client for these routes
        // is generated from FastAPI's own spec (`just gen-api mtg`), not ours.
        .nest("/api/graph", handler_graph::initialize_routes())
}
