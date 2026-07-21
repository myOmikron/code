//! Staff endpoints for processing pre-orders (role Verkauf or Admin)

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// Initializes the staff order routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::list_orders)
        .handler(handler::get_order_detail)
        .handler(handler::update_order_status)
        .handler(handler::update_order_item_packed)
}
