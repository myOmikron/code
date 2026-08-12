//! Public shop endpoints: catalog, order creation and order status

use galvyn::core::GalvynRouter;

use crate::http::handler_frontend::shop_rate_limit;

pub mod handler;
pub mod schema;

/// Initializes the public shop routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::get_categories)
        .handler(handler::get_items)
        .handler(handler::get_pickup_window)
        .handler(handler::get_legal_links)
        // Order endpoints get a rate limit: they are the only public
        // endpoints that write or expose per-customer data.
        .merge(
            GalvynRouter::new()
                .handler(handler::create_order)
                .handler(handler::get_order)
                .handler(handler::cancel_order)
                .wrap(shop_rate_limit()),
        )
}
