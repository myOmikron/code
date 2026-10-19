//! News Post endpoints: written by Admins, read by customers

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// Initializes the admin routes, nested under the admin prefix
pub fn initialize_admin_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::list_news_posts)
        .handler(handler::get_news_post)
        .handler(handler::create_news_post)
        .handler(handler::update_news_post)
        .handler(handler::publish_news_post)
        .handler(handler::withdraw_news_post)
        .handler(handler::delete_news_post)
}

/// Initializes the public routes, nested under the shop prefix
pub fn initialize_shop_routes() -> GalvynRouter {
    GalvynRouter::new().handler(handler::list_published_news_posts)
}
