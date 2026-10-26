//! Results reported and disputed by the Participants of a Match
//!
//! Grouped by who may call a route, like [`super`]; [`super::initialize_routes`]
//! merges each group into its own. Organizers set Results through
//! [`super::rounds`]. Every change to a Result goes through
//! [`handler::announce`] once it is committed.

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// What any logged-in Account may do
pub fn account_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::report_tournament_match_result)
        .handler(handler::dispute_tournament_match_result)
}
