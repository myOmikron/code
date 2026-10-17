//! What artwork MPCFill has for a card, and what a card back can be

use galvyn::core::GalvynRouter;

use crate::modules::passkeys::AuthRequiredLayer;

pub mod handler;
pub mod schema;

/// Initializes the MPCFill routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new().merge(
        GalvynRouter::new()
            .handler(handler::search_mpcfill_art)
            .handler(handler::get_mpcfill_cardbacks)
            .wrap(AuthRequiredLayer),
    )
}
