//! Default HTTP routes for microservices

use galvyn::core::GalvynRouter;

mod handler;

/// Returns the default routes every microservice exposes
pub fn default_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::metrics)
        .handler(handler::livez)
}
