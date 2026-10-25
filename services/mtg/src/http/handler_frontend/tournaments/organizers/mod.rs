//! Co-organizers and handover: who runs a Tournament and how it changes hands
//!
//! Merged into the groups of [`super`]: Organizers read and name
//! Co-organizers and take one off (the Owner any, a Co-organizer itself);
//! the Owner offers the Tournament to an Account and withdraws the offer;
//! that Account accepts or declines it.

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// What any logged-in Account may do: answer the offers made to it
pub fn account_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::get_tournament_handovers)
        .handler(handler::accept_tournament_handover)
        .handler(handler::decline_tournament_handover)
}

/// What the Organizers of a Tournament may do
pub fn organizer_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::list_tournament_organizers)
        .handler(handler::add_tournament_co_organizer)
        .handler(handler::remove_tournament_co_organizer)
}

/// What only the Owner of a Tournament may do
pub fn owner_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::offer_tournament_handover)
        .handler(handler::withdraw_tournament_handover)
}
