//! The logged-in account and the passkeys that can reach it

use galvyn::core::GalvynRouter;

use crate::http::middleware::account_required::AccountRequiredLayer;

pub mod handler;
pub mod schema;

/// Initializes the account routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new().merge(
        GalvynRouter::new()
            .handler(handler::me)
            .handler(handler::list_passkeys)
            .handler(handler::start_add_passkey)
            .handler(handler::finish_add_passkey)
            .handler(handler::delete_passkey)
            .handler(handler::delete_account)
            .wrap(AccountRequiredLayer),
    )
}
