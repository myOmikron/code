//! Admin handlers of the OpenID providers in the module's tables
//!
//! The handlers check no permission: the service nests
//! [`openid_provider_admin_routes`] in a route group behind its own role
//! layer. No handler answers a client secret.

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod schema;

/// The admin routes of the OpenID providers, for the service to nest behind its role layer
pub fn openid_provider_admin_routes() -> GalvynRouter {
    GalvynRouter::new()
        .handler(handler::admin_list_openid_providers)
        .handler(handler::admin_create_openid_provider)
        .handler(handler::admin_edit_openid_provider)
        .handler(handler::admin_deactivate_openid_provider)
        .handler(handler::admin_reactivate_openid_provider)
        .handler(handler::admin_delete_openid_provider)
        .handler(handler::admin_bulk_delete_openid_provider)
}
