//! Authentication: passkey login, invite-based registration, passkey management

use galvyn::core::GalvynRouter;

use crate::http::middleware::auth_required::AuthRequiredLayer;

pub mod handler;
pub mod schema;

/// Initializes the auth routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        // Public: login + invite-based registration
        .handler(handler::start_login)
        .handler(handler::finish_login)
        .handler(handler::start_registration)
        .handler(handler::finish_registration)
        .handler(handler::logout)
        // Authenticated: probes + passkey management
        .merge(
            GalvynRouter::new()
                .handler(handler::test)
                .handler(handler::me)
                .handler(handler::list_passkeys)
                .handler(handler::start_add_passkey)
                .handler(handler::finish_add_passkey)
                .handler(handler::delete_passkey)
                .wrap(AuthRequiredLayer),
        )
}
