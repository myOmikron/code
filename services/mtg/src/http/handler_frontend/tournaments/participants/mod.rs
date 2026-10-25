//! The Participants of a Tournament: Organizers add and remove them, Accounts sign up
//!
//! Grouped by who may call a route, like [`super`]; [`super::initialize_routes`]
//! merges each group into its own.

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// What anybody may read, whatever the Tournament shows them
pub fn public_routes() -> GalvynRouter {
    GalvynRouter::new().handler(handler::list_tournament_participants)
}

/// What any logged-in Account may do
pub fn account_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::sign_up_for_tournament)
        .handler(handler::withdraw_tournament_sign_up)
}

/// What the Organizers of a Tournament may do
pub fn organizer_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::add_tournament_account)
        .handler(handler::add_tournament_guest)
        .handler(handler::remove_tournament_participant)
        .handler(handler::search_tournament_players)
}
