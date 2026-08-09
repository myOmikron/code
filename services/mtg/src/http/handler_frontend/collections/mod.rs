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
                .handler(handler::set_visibility_collection)
                .handler(handler::update_collection)
                .handler(handler::delete_collection)
                .handler(handler::rotate_share_token)
                .wrap(AuthRequiredLayer),
        )
        .merge(GalvynRouter::new())
}
