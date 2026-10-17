use galvyn::core::GalvynRouter;

use crate::modules::passkeys::AuthRequiredLayer;

pub mod handler;
pub mod schema;

pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new().merge(
        GalvynRouter::new()
            .handler(handler::get_all_watch_lists)
            .handler(handler::create_watch_list)
            .handler(handler::get_watch_list_alarms)
            .handler(handler::get_watch_list)
            .handler(handler::update_watch_list)
            .handler(handler::delete_watch_list)
            .handler(handler::list_watch_list_entries)
            .handler(handler::add_watch_list_entry)
            .handler(handler::list_watch_list_copies)
            .handler(handler::update_watch_list_entry)
            .handler(handler::delete_watch_list_entry)
            .handler(handler::acknowledge_watch_list_alarm)
            .wrap(AuthRequiredLayer),
    )
}
