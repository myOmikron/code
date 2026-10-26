//! Registered decks: Participants register their own, Organizers fix them
//!
//! Grouped by who may call a route, like [`super`]; [`super::initialize_routes`]
//! merges each group into its own.

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// What any logged-in Account may do
pub fn account_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::get_my_tournament_deck)
        .handler(handler::register_my_tournament_deck)
        .handler(handler::remove_my_tournament_deck)
}

/// What the Organizers of a Tournament may do
pub fn organizer_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::list_tournament_registered_decks)
        .handler(handler::list_tournament_participant_decks)
        .handler(handler::register_tournament_participant_deck)
        .handler(handler::remove_tournament_participant_deck)
}
