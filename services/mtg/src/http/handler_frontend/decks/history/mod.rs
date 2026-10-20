//! A deck's Deck history, for its owner only

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// Initialize the Deck history routes, nested under a deck
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::get_deck_history)
        .handler(handler::undo_deck_change)
        .handler(handler::redo_deck_change)
        .handler(handler::get_deck_point)
        .handler(handler::reset_deck)
        .handler(handler::set_deck_checkpoint)
        .handler(handler::remove_deck_checkpoint)
}
