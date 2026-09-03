//! Tournaments: the roster surface
//!
//! Two merge blocks, wired below. The **actor block** — reads and
//! self-service check-in/drop, all reachable through the
//! [`TournamentActor`](crate::models::tournament::TournamentActor) extractor
//! — deliberately carries no [`AuthRequiredLayer`]. That is the one
//! exception in this service to "wrap every route group in an auth layer",
//! and it is deliberate: a guest is never an [`Account`](crate::models::account::Account),
//! so wrapping this block would 401 every guest outright and defeat the
//! point of the roster being guest-reachable at all. Nothing here is
//! actually unauthenticated in effect — every handler in the block still
//! runs its request through a model-layer guard
//! ([`Tournament::get_for_viewer`](crate::models::tournament::Tournament::get_for_viewer),
//! the `may_self_serve` check behind check-in/drop) before it touches a row,
//! the same discipline [`Tournament`](crate::models::tournament::Tournament)'s
//! module docs describe for the rest of this model tree. The **management
//! block** — settings, status, visibility, the join code, staff, and every
//! write to somebody else's roster row — is wrapped, because none of that
//! makes sense for a guest to reach at all.

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
                .handler(handler::check_in_tournament_participant)
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
                .handler(handler::add_tournament_participant)
                .handler(handler::update_tournament_participant)
                .handler(handler::delete_tournament_participant)
                .handler(handler::claim_tournament_participant)
                .handler(handler::list_tournament_audit)
                .wrap(AuthRequiredLayer),
        )
}
