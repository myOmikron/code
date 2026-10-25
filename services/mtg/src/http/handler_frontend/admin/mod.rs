//! The admin dashboard, for Accounts with the Admin Role
//!
//! Every route is wrapped in
//! [`AdminRequiredLayer`](crate::http::middleware::admin_required::AdminRequiredLayer)
//! where this router is nested.

use galvyn::core::GalvynRouter;

pub mod accounts;
pub mod bug_reports;
pub mod log;
pub mod statistics;
pub mod syncs;

/// The largest page of a paged admin list a client may ask for
const MAX_LIMIT: u32 = 100;

/// The page size of a paged admin list for a client that does not ask for one
pub fn default_limit() -> u32 {
    50
}

/// The page size a paged admin list serves for the `requested` one
pub fn page_limit(requested: u32) -> u32 {
    requested.clamp(1, MAX_LIMIT)
}

/// Initializes the admin routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .nest("/accounts", accounts::initialize_routes())
        .nest("/bug-reports", bug_reports::initialize_routes())
        .nest("/log", log::initialize_routes())
        .nest("/statistics", statistics::initialize_routes())
        .nest("/syncs", syncs::initialize_routes())
}
