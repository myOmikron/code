//! Tournaments: creating, reading, running and deleting them
//!
//! Grouped by who may call a route. The public group carries no auth layer:
//! its handlers take a [`Viewer`] and the models decide what it sees. The
//! Account, Organizer and Owner groups sit behind [`AccountRequiredLayer`];
//! being an Organizer or the Owner is a question about one Tournament, which
//! the handler answers with [`Tournament::get_as_organizer`] or
//! [`Tournament::get_as_owner`] before it acts. Reading by share link lives in
//! [`super::shared`], next to the other share links.
//!
//! [`Viewer`]: crate::models::account::extractor::Viewer
//! [`Tournament::get_as_organizer`]: crate::models::tournament::Tournament::get_as_organizer
//! [`Tournament::get_as_owner`]: crate::models::tournament::Tournament::get_as_owner

use galvyn::core::GalvynRouter;

use crate::http::middleware::account_required::AccountRequiredLayer;

pub mod decks;
pub mod handler;
pub mod organizers;
pub mod participants;
pub mod results;
pub mod rounds;
pub mod schema;

/// Initialize the routes for Tournaments
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new().merge(public_routes()).merge(
        GalvynRouter::new()
            .merge(account_routes())
            .merge(organizer_routes())
            .merge(owner_routes())
            .wrap(AccountRequiredLayer),
    )
}

/// What anybody may read, whatever the Tournament shows them
fn public_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::list_public_tournaments)
        .handler(handler::get_tournament)
        .merge(participants::public_routes())
        .merge(rounds::public_routes())
}

/// What any logged-in Account may do
fn account_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::get_my_tournaments)
        .handler(handler::create_tournament)
        .merge(decks::account_routes())
        .merge(organizers::account_routes())
        .merge(participants::account_routes())
        .merge(rounds::account_routes())
        .merge(results::account_routes())
}

/// What the Organizers of a Tournament may do
fn organizer_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::update_tournament)
        .merge(decks::organizer_routes())
        .merge(organizers::organizer_routes())
        .merge(participants::organizer_routes())
        .merge(rounds::organizer_routes())
}

/// What only the Owner of a Tournament may do
fn owner_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::delete_tournament)
        .merge(organizers::owner_routes())
}
