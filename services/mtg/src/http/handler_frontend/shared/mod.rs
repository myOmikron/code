//! Reading something through the share link its owner handed out
//!
//! The kind is part of the path: a token is a secret on the row it belongs to,
//! so it takes the table it was minted in to resolve it. Decks and want lists
//! get a nesting of their own here once they carry a token.

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// Initialize the routes a share token unlocks
///
/// No auth layer anywhere below: the token in the path is the authorization.
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .nest(
            "/collections",
            GalvynRouter::new()
                .handler(handler::get_shared_collection)
                .handler(handler::list_shared_collection_cards)
                .handler(handler::get_shared_collection_statistics),
        )
        .nest(
            "/decks",
            GalvynRouter::new()
                .handler(handler::get_shared_deck)
                .handler(handler::list_shared_deck_cards),
        )
}
