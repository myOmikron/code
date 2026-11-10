//! What artwork MPCFill has for a card, what a card back can be, and the art an account starred

use galvyn::core::GalvynRouter;

use crate::http::middleware::account_required::AccountRequiredLayer;

pub mod handler;
pub mod schema;

/// Initializes the MPCFill routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new().merge(
        GalvynRouter::new()
            .handler(handler::search_mpcfill_art)
            .handler(handler::get_mpcfill_cardbacks)
            .handler(handler::get_mpcfill_favorites)
            .handler(handler::star_mpcfill_image)
            .handler(handler::unstar_mpcfill_image)
            .handler(handler::replace_mpcfill_favorite)
            .handler(handler::set_mpcfill_favorite_drives)
            .wrap(AccountRequiredLayer),
    )
}
