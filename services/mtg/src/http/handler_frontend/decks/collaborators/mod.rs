//! A deck's Collaborators, managed by its owner, and the decks shared with the caller

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// Initialize the Collaborator routes, nested under the decks
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::get_decks_shared_with_me)
        .handler(handler::leave_deck)
        .handler(handler::list_deck_collaborators)
        .handler(handler::put_deck_collaborator)
        .handler(handler::remove_deck_collaborator)
}
