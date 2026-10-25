//! Running a Tournament: pairing, starting and ending Rounds, Results, standings
//!
//! Grouped by who may call a route, like [`super`]; [`super::initialize_routes`]
//! merges each group into its own.

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// What anybody may read, whatever the Tournament shows them
pub fn public_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::list_tournament_rounds)
        .handler(handler::get_tournament_standings)
}

/// What the Organizers of a Tournament may do
pub fn organizer_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::pair_tournament_round)
        .handler(handler::discard_tournament_round)
        .handler(handler::start_tournament_round)
        .handler(handler::end_tournament_round)
        .handler(handler::set_tournament_match_result)
        .handler(handler::set_tournament_swiss_rounds)
        .handler(handler::cancel_tournament)
}
