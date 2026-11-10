//! Web Push for the logged-in account: its devices and its opt-out

use galvyn::core::GalvynRouter;

use crate::http::middleware::impersonation_refused::ImpersonationRefusedLayer;

pub mod handler;
pub mod schema;

/// Initializes the push routes; the caller wraps them in the account layer
///
/// Subscribing a device is refused while impersonating.
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::get_push_settings)
        .handler(handler::set_push_settings)
        .handler(handler::unsubscribe_push_device)
        .handler(handler::check_push_device)
        .merge(
            GalvynRouter::new()
                .handler(handler::subscribe_push_device)
                .wrap(ImpersonationRefusedLayer),
        )
}
