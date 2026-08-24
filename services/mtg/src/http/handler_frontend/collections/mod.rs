use galvyn::core::GalvynRouter;

use crate::http::middleware::auth_required::AuthRequiredLayer;

pub mod handler;
pub mod schema;

pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .merge(
            GalvynRouter::new()
                .handler(handler::get_all_collections)
                .handler(handler::create_collection)
                .handler(handler::get_collection)
                .handler(handler::set_visibility_collection)
                .handler(handler::update_collection)
                .handler(handler::delete_collection)
                .handler(handler::rotate_share_token)
                .handler(handler::list_collection_cards)
                .handler(handler::get_collection_statistics)
                .handler(handler::list_collection_on_loan)
                .handler(handler::list_collection_entries)
                .handler(handler::add_collection_entries)
                .handler(handler::merge_collection_entries)
                .handler(handler::update_collection_entry)
                .handler(handler::split_collection_entry)
                .handler(handler::delete_collection_entry)
                .handler(handler::assign_collection_entry_tag)
                .handler(handler::unassign_collection_entry_tag)
                .wrap(AuthRequiredLayer),
        )
        .merge(GalvynRouter::new())
}
