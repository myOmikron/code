//! The Participants of a Tournament: Organizers add, remove and Drop them,
//! Accounts sign up and Drop
//!
//! Grouped by who may call a route, like [`super`]; [`super::initialize_routes`]
//! merges each group into its own and wraps it in the group's checks.

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// What whoever sees the Tournament may read, logged in or not
pub fn viewer_routes() -> GalvynRouter {
    GalvynRouter::new().handler(handler::list_tournament_participants)
}

/// What a logged-in Account that sees the Tournament may do
pub fn signed_in_viewer_routes() -> GalvynRouter {
    GalvynRouter::new().handler(handler::sign_up_for_tournament)
}

/// What the Accounts playing in the Tournament may do
pub fn participant_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::withdraw_tournament_sign_up)
        .handler(handler::drop_out_of_tournament)
}

/// What the Organizers of the Tournament may do
pub fn organizer_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::add_tournament_account)
        .handler(handler::add_tournament_guest)
        .handler(handler::remove_tournament_participant)
        .handler(handler::drop_tournament_participant)
        .handler(handler::set_tournament_participant_paid)
}
