//! Web Push for the logged-in account: its devices and its opt-out

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// Initializes the push routes; the caller wraps them in the account layer
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::get_push_settings)
        .handler(handler::set_push_settings)
        .handler(handler::subscribe_push_device)
        .handler(handler::unsubscribe_push_device)
        .handler(handler::check_push_device)
}
