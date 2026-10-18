//! The state of the catalog and price guide syncs

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// Initializes the admin sync routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new().handler(handler::admin_get_syncs)
}
