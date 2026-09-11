//! Tournaments: the roster surface
//!
//! Two merge blocks, wired below. The **actor block** — reads and
//! self-service drop, all reachable through the
//! [`TournamentActor`](crate::models::tournament::TournamentActor) extractor
//! — deliberately carries no [`AuthRequiredLayer`]. That is the one
//! exception in this service to "wrap every route group in an auth layer",
//! and it is deliberate: a guest is never an [`Account`](crate::models::account::Account),
//! so wrapping this block would 401 every guest outright and defeat the
//! point of the roster being guest-reachable at all. Nothing here is
//! actually unauthenticated in effect — every handler in the block still
//! runs its request through a model-layer guard
//! ([`Tournament::get_for_viewer`](crate::models::tournament::Tournament::get_for_viewer),
//! the `may_self_serve` check behind drop) before it touches a row,
//! the same discipline [`Tournament`](crate::models::tournament::Tournament)'s
//! module docs describe for the rest of this model tree. The **management
//! block** — settings, status, visibility, the join code, staff, check-in,
//! every write that shapes a round, and every write to somebody else's
//! roster row — is wrapped, because none of that makes sense for a guest to
//! reach at all. Check-in sits there rather than beside drop because being
//! present is the desk's observation, not a claim a player makes from their
//! phone.
//!
//! The state poll and the round list sit in the actor block by the same rule
//! as the roster: a guest's phone is the device that most needs the clock and
//! its own table, and locking it out would leave half the room unable to see
//! the round they are playing in.

use galvyn::core::GalvynRouter;

use crate::http::middleware::auth_required::AuthRequiredLayer;

pub mod handler;
pub mod schema;

/// Initialize the tournament routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .merge(
            GalvynRouter::new()
                .handler(handler::list_tournaments)
                .handler(handler::get_tournament)
                .handler(handler::list_tournament_participants)
                .handler(handler::get_tournament_state)
                .handler(handler::list_tournament_rounds)
                .handler(handler::drop_tournament_participant)
                .handler(handler::get_participant_decklist)
                .handler(handler::set_participant_decklist),
        )
        .merge(
            GalvynRouter::new()
                .handler(handler::create_tournament)
                .handler(handler::update_tournament)
                .handler(handler::delete_tournament)
                .handler(handler::set_tournament_status)
                .handler(handler::set_tournament_visibility)
                .handler(handler::rotate_tournament_join_code)
                .handler(handler::revoke_tournament_join_code)
                .handler(handler::lock_tournament_decklists)
                .handler(handler::unlock_tournament_decklists)
                .handler(handler::list_tournament_organizers)
                .handler(handler::add_tournament_organizer)
                .handler(handler::remove_tournament_organizer)
                .handler(handler::check_in_tournament_participant)
                .handler(handler::create_tournament_round)
                .handler(handler::start_tournament_round)
                .handler(handler::complete_tournament_round)
                .handler(handler::delete_tournament_round)
                .handler(handler::set_tournament_round_timer)
                .handler(handler::search_tournament_players)
                .handler(handler::add_tournament_participant)
                .handler(handler::update_tournament_participant)
                .handler(handler::delete_tournament_participant)
                .handler(handler::get_participant_claim_token)
                .handler(handler::claim_tournament_participant)
                .handler(handler::list_tournament_audit)
                .handler(handler::list_tournament_venues)
                .handler(handler::delete_tournament_venue)
                .wrap(AuthRequiredLayer),
        )
}
