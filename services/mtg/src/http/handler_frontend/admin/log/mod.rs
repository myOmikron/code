//! The Admin log as the dashboard reads it

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// Initializes the Admin log routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new().handler(handler::admin_list_log)
}
