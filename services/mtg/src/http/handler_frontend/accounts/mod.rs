//! The logged-in account and the passkeys that can reach it

use galvyn::core::GalvynRouter;
use galvyn_identity::AuthRequiredLayer;

use crate::http::middleware::account_required::AccountRequiredLayer;

pub mod handler;
pub mod push;
pub mod schema;

/// Initializes the account routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .merge(
            GalvynRouter::new()
                .handler(handler::me)
                .wrap(AuthRequiredLayer),
        )
        .merge(
            GalvynRouter::new()
                .handler(handler::rename_account)
                .handler(handler::list_passkeys)
                .handler(handler::start_add_passkey)
                .handler(handler::finish_add_passkey)
                .handler(handler::rename_passkey)
                .handler(handler::delete_passkey)
                .handler(handler::delete_account)
                .merge(push::initialize_routes())
                .wrap(AccountRequiredLayer),
        )
}
