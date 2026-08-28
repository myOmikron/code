//! Building decks: their cards, zones and tags

use galvyn::core::GalvynRouter;

use crate::http::middleware::auth_required::AuthRequiredLayer;

pub mod handler;
pub mod schema;

/// Initialize the routes for decks
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new().merge(
        GalvynRouter::new()
            .handler(handler::get_all_decks)
            .handler(handler::create_deck)
            .handler(handler::get_deck_formats)
            .handler(handler::get_deck)
            .handler(handler::update_deck)
            .handler(handler::set_visibility_deck)
            .handler(handler::set_deck_colors)
            .handler(handler::set_deck_bracket)
            .handler(handler::set_deck_rule_zero)
            .handler(handler::rotate_deck_share_token)
            .handler(handler::delete_deck)
            .handler(handler::set_deck_folder)
            .handler(handler::attach_deck_collection)
            .handler(handler::detach_deck_collection)
            .handler(handler::get_deck_sourcing)
            .handler(handler::get_deck_collection_drift)
            .handler(handler::take_deck_cards)
            .handler(handler::fill_deck_collection)
            .handler(handler::return_deck_cards)
            .handler(handler::return_all_deck_cards)
            .handler(handler::list_deck_cards)
            .handler(handler::add_deck_card)
            .handler(handler::import_deck_cards)
            .handler(handler::read_deck_url)
            .handler(handler::update_deck_card)
            .handler(handler::delete_deck_card)
            .handler(handler::create_deck_tag)
            .handler(handler::update_deck_tag)
            .handler(handler::delete_deck_tag)
            .handler(handler::assign_deck_card_tag)
            .handler(handler::unassign_deck_card_tag)
            .wrap(AuthRequiredLayer),
    )
}
