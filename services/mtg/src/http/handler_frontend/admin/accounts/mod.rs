//! Accounts as an Admin sees and manages them

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// Initializes the admin Account routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::admin_list_accounts)
        .handler(handler::admin_get_account)
        .handler(handler::admin_set_role)
        .handler(handler::admin_lock_account)
        .handler(handler::admin_unlock_account)
        .handler(handler::admin_rename_account)
        .handler(handler::admin_delete_account)
}
