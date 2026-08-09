//! All handlers for the frontend are defined in this module

use galvyn::core::GalvynRouter;

pub mod accounts;
pub mod auth;

/// Initializes all routes for the frontend
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .nest("/accounts", accounts::initialize_routes())
        .nest("/auth", auth::initialize_routes())
}
