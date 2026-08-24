//! All handlers for the frontend are defined in this module

use galvyn::core::GalvynRouter;

pub mod accounts;
pub mod auth;
pub mod collections;
pub mod decks;
pub mod printings;
pub mod shared;
pub mod tags;

/// Initializes all routes for the frontend
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .nest("/accounts", accounts::initialize_routes())
        .nest("/auth", auth::initialize_routes())
        .nest("/collections", collections::initialize_routes())
        .nest("/decks", decks::initialize_routes())
        .nest("/printings", printings::initialize_routes())
        .nest("/shared", shared::initialize_routes())
        .nest("/tags", tags::initialize_routes())
}
