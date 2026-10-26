//! Running a Tournament: pairing, starting and ending Rounds, Results, standings
//!
//! Grouped by who may call a route, like [`super`]; [`super::initialize_routes`]
//! merges each group into its own and wraps it in the group's checks.

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// What whoever sees the Tournament may read, logged in or not
pub fn viewer_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::list_tournament_rounds)
        .handler(handler::get_tournament_standings)
}

/// What a logged-in Account that sees the Tournament may do
pub fn signed_in_viewer_routes() -> GalvynRouter {
    GalvynRouter::new().handler(handler::get_my_tournament_match)
}

/// What the Organizers of the Tournament may do
pub fn organizer_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::pair_tournament_round)
        .handler(handler::discard_tournament_round)
        .handler(handler::start_tournament_round)
        .handler(handler::end_tournament_round)
        .handler(handler::arrange_tournament_round)
        .handler(handler::take_back_tournament_round)
        .handler(handler::set_tournament_match_result)
        .handler(handler::set_tournament_swiss_rounds)
        .handler(handler::cancel_tournament)
}
