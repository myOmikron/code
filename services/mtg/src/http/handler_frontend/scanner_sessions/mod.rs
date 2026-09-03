//! Persisted scanner-session routes

use galvyn::core::GalvynRouter;

use crate::http::middleware::auth_required::AuthRequiredLayer;

pub mod handler;
pub mod schema;

/// Initialize scanner-session routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new().merge(
        GalvynRouter::new()
            .handler(handler::get_all_scanner_sessions)
            .handler(handler::create_scanner_session)
            .handler(handler::get_scanner_session)
            .handler(handler::update_scanner_session)
            .handler(handler::delete_scanner_session)
            .handler(handler::add_scanner_session_entry)
            .handler(handler::update_scanner_session_entry)
            .handler(handler::delete_scanner_session_entry)
            .handler(handler::file_scanner_session)
            .wrap(AuthRequiredLayer),
    )
}
