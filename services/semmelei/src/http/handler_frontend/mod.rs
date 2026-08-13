//! All handlers for the frontend are defined in this module

use galvyn::core::GalvynRouter;

use crate::http::middleware::admin_required::AdminRequiredLayer;
use crate::http::middleware::auth_required::AuthRequiredLayer;
use crate::http::middleware::rate_limit::RateLimitLayer;

pub mod admin;
pub mod auth;
pub mod orders;
pub mod shop;

/// Initializes all routes for the frontend
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .nest("/auth", auth::initialize_routes())
        .nest("/shop", shop::initialize_routes())
        .nest(
            "/verkauf",
            orders::initialize_routes().wrap(AuthRequiredLayer),
        )
        .nest(
            "/admin",
            admin::initialize_routes().wrap(AdminRequiredLayer),
        )
}

/// Shared rate limiter instance for the public order endpoints.
///
/// Generous on purpose: a human places one or two orders, so this only
/// exists to stop a script hammering order creation. It must not reject
/// real customers who share a public IP (shop wifi, carrier-grade NAT),
/// hence a per-minute burst well above any realistic human volume.
pub fn shop_rate_limit() -> RateLimitLayer {
    RateLimitLayer::new(30, std::time::Duration::from_secs(60))
}
