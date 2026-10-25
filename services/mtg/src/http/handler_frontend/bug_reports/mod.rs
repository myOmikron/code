//! Bug reports as a player sends them

use galvyn::core::GalvynRouter;
use galvyn::core::re_exports::axum::extract::DefaultBodyLimit;

use crate::http::middleware::account_required::AccountRequiredLayer;
use crate::models::bug_report::BUG_REPORT_MAX_IMAGE_BYTES;
use crate::models::bug_report::BUG_REPORT_MAX_IMAGES;

pub mod handler;
pub mod schema;

/// Most bytes of a Bug report's body: its images and a megabyte for the rest
const BODY_LIMIT: usize = BUG_REPORT_MAX_IMAGES * BUG_REPORT_MAX_IMAGE_BYTES + 1024 * 1024;

/// Initializes the Bug report routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::send_bug_report)
        .wrap(AccountRequiredLayer)
        .layer(DefaultBodyLimit::max(BODY_LIMIT))
}
