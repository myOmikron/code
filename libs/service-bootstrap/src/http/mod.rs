//! Default HTTP routes and shared middleware for microservices

use galvyn::core::GalvynRouter;

mod handler;
pub mod rate_limit;

/// Returns the default routes every microservice exposes
pub fn default_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::metrics)
        .handler(handler::livez)
}
