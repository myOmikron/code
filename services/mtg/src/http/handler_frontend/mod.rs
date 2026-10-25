//! All handlers for the frontend are defined in this module

use galvyn::core::GalvynRouter;

use crate::http::middleware::admin_required::AdminRequiredLayer;
use crate::http::middleware::trace_id::TraceIdLayer;

pub mod accounts;
pub mod admin;
pub mod auth;
pub mod bug_reports;
pub mod collections;
pub mod decks;
pub mod explore;
pub mod folders;
pub mod mpcfill;
pub mod oidc;
pub mod printings;
pub mod scanner_sessions;
pub mod shared;
pub mod tags;
pub mod tournaments;
pub mod watch_lists;

/// Initializes all routes for the frontend
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .nest("/accounts", accounts::initialize_routes())
        .nest(
            "/admin",
            admin::initialize_routes().wrap(AdminRequiredLayer),
        )
        .nest("/auth", auth::initialize_routes())
        .nest("/auth/oidc", oidc::initialize_routes())
        .nest("/bug-reports", bug_reports::initialize_routes())
        .nest("/collections", collections::initialize_routes())
        .nest("/decks", decks::initialize_routes())
        .nest("/explore", explore::initialize_routes())
        .nest("/folders", folders::initialize_routes())
        .nest("/mpcfill", mpcfill::initialize_routes())
        .nest("/printings", printings::initialize_routes())
        .nest("/scanner-sessions", scanner_sessions::initialize_routes())
        .nest("/shared", shared::initialize_routes())
        .nest("/tags", tags::initialize_routes())
        .nest("/tournaments", tournaments::initialize_routes())
        .nest("/watch-lists", watch_lists::initialize_routes())
        .wrap(TraceIdLayer)
}
