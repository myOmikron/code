//! Admin endpoints: categories, items and staff accounts

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// Initializes the admin routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::list_categories)
        .handler(handler::create_category)
        .handler(handler::update_category)
        .handler(handler::delete_category)
        .handler(handler::list_items)
        .handler(handler::create_item)
        .handler(handler::update_item)
        .handler(handler::set_item_image)
        .handler(handler::delete_item_image)
        .handler(handler::delete_item)
        .handler(handler::list_accounts)
        .handler(handler::create_account)
        .handler(handler::update_account)
        .handler(handler::create_invite)
        .handler(handler::delete_account)
        .handler(handler::get_schedule)
        .handler(handler::update_schedule)
        .handler(handler::list_pickup_days)
        .handler(handler::update_pickup_day)
        .handler(handler::lock_pickup_day)
        .handler(handler::get_legal_settings)
        .handler(handler::update_legal_settings)
}
