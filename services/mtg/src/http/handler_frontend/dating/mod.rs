//! Command Zone Dating: swipe on Commanders, and they swipe back

use galvyn::core::GalvynRouter;

use crate::http::middleware::account_required::AccountRequiredLayer;

pub mod handler;
pub mod schema;

/// Routes of Command Zone Dating, all behind a login
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new().merge(
        GalvynRouter::new()
            .handler(handler::get_dating_stack)
            .handler(handler::swipe_commander)
            .handler(handler::rewind_swipe)
            .handler(handler::get_dates)
            .handler(handler::come_back_date)
            .handler(handler::unmatch_date)
            .handler(handler::reset_dating_passes)
            .handler(handler::get_dating_profile)
            .handler(handler::update_dating_profile)
            .handler(handler::start_date)
            .handler(handler::get_date)
            .handler(handler::answer_date)
            .handler(handler::bring_theme)
            .handler(handler::date_night)
            .handler(handler::come_back_to_date)
            .wrap(AccountRequiredLayer),
    )
}
