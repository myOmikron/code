//! Reading what accounts put on show: public decks, profiles and collections
//!
//! The other half of [`super::shared`]. There a secret in the path is the
//! authorization; here nothing is, because nothing needs to be — everything
//! answered below sits at [`Visibility::Public`], which is its owner saying it
//! may be listed. No auth layer anywhere, and no viewer is ever passed to the
//! models: an owner reads their own things through the endpoints that know
//! them.
//!
//! [`Visibility::Public`]: crate::models::visibility::Visibility::Public

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// Initialize the routes that read what is on show
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::search_public_decks)
        .handler(handler::get_public_deck)
        .handler(handler::list_public_deck_cards)
        .handler(handler::get_public_profile)
        .handler(handler::get_public_collection)
        .handler(handler::list_public_collection_cards)
        .handler(handler::get_public_collection_statistics)
}
