//! Statistics snapshots as the admin dashboard shows them

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// Initializes the admin statistics routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new().handler(handler::admin_get_statistics)
}
