//! The card catalog, as far as a client has to ask about it

use galvyn::core::GalvynRouter;

use crate::http::middleware::auth_required::AuthRequiredLayer;

pub mod handler;
pub mod schema;

/// Initializes the catalog routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new().merge(
        GalvynRouter::new()
            .handler(handler::resolve_printings)
            .handler(handler::get_price_history)
            .wrap(AuthRequiredLayer),
    )
}
