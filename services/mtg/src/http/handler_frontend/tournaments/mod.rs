//! Tournaments: creating, reading, running and deleting them
//!
//! Grouped by who may call a route. A route on one Tournament sits in the
//! group of the part its caller has to play there, a [`TournamentAccess`]:
//! Owner, Organizer, Participant or Viewer. Each group is wrapped in a
//! [`TournamentAccessLayer`] that fetches the Tournament, refuses the caller
//! or hands the handler the [`TournamentGrant`]; handlers check no roles
//! themselves. Every group but the public Viewer one also sits behind
//! [`AccountRequiredLayer`], which runs first. Routes on no Tournament in
//! particular (the overview, creating, "mine", answering a handover offer)
//! need a logged-in Account only. Reading by share link lives in
//! [`super::shared`], next to the other share links.
//!
//! [`TournamentAccess`]: crate::models::tournament::access::TournamentAccess
//! [`TournamentGrant`]: crate::models::tournament::access::TournamentGrant

use galvyn::core::GalvynRouter;

use crate::http::middleware::account_required::AccountRequiredLayer;
use crate::http::middleware::tournament_access::TournamentAccessLayer;
use crate::models::tournament::access::TournamentAccess;

pub mod decks;
pub mod handler;
pub mod life_history;
pub mod live;
pub mod organizers;
pub mod participants;
pub mod results;
pub mod rounds;
pub mod schema;

/// Initialize the routes for Tournaments
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::list_public_tournaments)
        .merge(viewer_routes().wrap(TournamentAccessLayer(TournamentAccess::Viewer)))
        .merge(
            GalvynRouter::new()
                .merge(account_routes())
                .merge(
                    GalvynRouter::new()
                        .handler(rounds::handler::get_tournament_match_play)
                        .merge(life_history::routes())
                        .wrap(TournamentAccessLayer(TournamentAccess::MatchHistory)),
                )
                .merge(
                    signed_in_viewer_routes().wrap(TournamentAccessLayer(TournamentAccess::Viewer)),
                )
                .merge(
                    participant_routes().wrap(TournamentAccessLayer(TournamentAccess::Participant)),
                )
                .merge(organizer_routes().wrap(TournamentAccessLayer(TournamentAccess::Organizer)))
                .merge(owner_routes().wrap(TournamentAccessLayer(TournamentAccess::Owner)))
                .wrap(AccountRequiredLayer),
        )
}

/// What whoever sees the Tournament may read, logged in or not
fn viewer_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::get_tournament)
        .merge(decks::viewer_routes())
        .merge(participants::viewer_routes())
        .merge(rounds::viewer_routes())
        .merge(live::viewer_routes())
}

/// What any logged-in Account may do, on no Tournament in particular
fn account_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::get_my_tournaments)
        .handler(handler::create_tournament)
        .merge(organizers::account_routes())
}

/// What a logged-in Account that sees the Tournament may do
fn signed_in_viewer_routes() -> GalvynRouter {
    GalvynRouter::new()
        .merge(participants::signed_in_viewer_routes())
        .merge(rounds::signed_in_viewer_routes())
}

/// What the Accounts playing in the Tournament may do
fn participant_routes() -> GalvynRouter {
    GalvynRouter::new()
        .merge(decks::participant_routes())
        .merge(participants::participant_routes())
        .merge(results::participant_routes())
}

/// What the Organizers of the Tournament may do
fn organizer_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::update_tournament)
        .merge(decks::organizer_routes())
        .merge(organizers::organizer_routes())
        .merge(participants::organizer_routes())
        .merge(rounds::organizer_routes())
}

/// What only the Owner of the Tournament may do
fn owner_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::delete_tournament)
        .merge(organizers::owner_routes())
}
