//! The shelves an account files its decks on
//!
//! The folders themselves are reachable without naming a deck, because they
//! exist before anything is filed into one. Which folder a deck lies in is set
//! on the deck, over in [`super::decks`].

use galvyn::core::GalvynRouter;

use crate::http::middleware::auth_required::AuthRequiredLayer;

pub mod handler;
pub mod schema;

/// Initialize the routes for deck folders
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new().merge(
        GalvynRouter::new()
            .handler(handler::get_all_deck_folders)
            .handler(handler::create_deck_folder)
            .handler(handler::update_deck_folder)
            .handler(handler::delete_deck_folder)
            .wrap(AuthRequiredLayer),
    )
}
