//! The etiquettes an account keeps for every deck and every collection
//!
//! The tags themselves live with the decks, where they were invented, but the
//! card-wide ones belong to the account rather than to any one deck: they are
//! what a collection can put on a stack, so they are reachable without naming a
//! deck first.

use galvyn::core::GalvynRouter;

use crate::http::middleware::auth_required::AuthRequiredLayer;

pub mod handler;
pub mod schema;

/// Initialize the routes for card-wide tags
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new().merge(
        GalvynRouter::new()
            .handler(handler::get_all_global_tags)
            .handler(handler::create_global_tag)
            .handler(handler::update_global_tag)
            .handler(handler::delete_global_tag)
            .wrap(AuthRequiredLayer),
    )
}
