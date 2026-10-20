//! A deck's Deck history, for its owner only

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// Initialize the Deck history routes, nested under a deck
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new().handler(handler::get_deck_history)
}
