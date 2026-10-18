//! The admin dashboard, for Accounts with the Admin Role
//!
//! Every route is wrapped in
//! [`AdminRequiredLayer`](crate::http::middleware::admin_required::AdminRequiredLayer)
//! where this router is nested.

use galvyn::core::GalvynRouter;

pub mod accounts;
pub mod log;
pub mod statistics;
pub mod syncs;

/// Initializes the admin routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .nest("/accounts", accounts::initialize_routes())
        .nest("/log", log::initialize_routes())
        .nest("/statistics", statistics::initialize_routes())
        .nest("/syncs", syncs::initialize_routes())
}
