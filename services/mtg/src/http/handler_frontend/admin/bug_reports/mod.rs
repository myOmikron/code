//! Bug reports as an Admin reads and settles them

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// Initializes the admin Bug report routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::admin_list_bug_reports)
        .handler(handler::admin_get_bug_report)
        .handler(handler::admin_get_bug_report_image)
        .handler(handler::admin_mark_bug_report_done)
        .handler(handler::admin_reopen_bug_report)
        .handler(handler::admin_set_bug_report_note)
}
