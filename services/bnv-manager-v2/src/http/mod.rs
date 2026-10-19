//! HTTP related code

use std::sync::OnceLock;

use galvyn::core::GalvynRouter;
use galvyn::core::SchemalessJson;
use galvyn::core::session;
use galvyn::get;
use galvyn::openapi::OpenAPI;
use galvyn::openapi::OpenapiRouterExt;
use galvyn::openapi::get_openapi_for_page;
use tower::ServiceBuilder;
use tower_http::trace::DefaultMakeSpan;
use tower_http::trace::DefaultOnResponse;
use tower_http::trace::TraceLayer;
use tracing::Level;
use tracing::instrument;

pub mod extractors;
pub mod handler_auth;
pub mod handler_frontend;
pub mod middlewares;

/// The frontend's openapi page, the frontend's api client is generated from it
///
/// It holds every route below `/api`, whatever role it needs: roles are
/// enforced by the routes' layers, not by the page.
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

/// Retrieve the routes for the http server
pub fn get_router() -> GalvynRouter {
    routes().layer(session::layer()).layer(
        ServiceBuilder::new().layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO))
                // Disable automatic failure logger because any handler_frontend returning a 500 should have already logged its reason™
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
            GalvynRouter::new()
                .openapi_tag("Openapi")
                .handler(get_openapi)
                .handler(get_frontend_openapi),
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
