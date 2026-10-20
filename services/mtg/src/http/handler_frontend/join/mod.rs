//! Joining a tournament by join code or claim token
//!
//! The code/claim lookups are reachable without a session, so they sit behind a venue-sized
//! rate limit (one NAT IP per venue); joining with an account needs `AuthRequiredLayer`.

use std::time::Duration;

use galvyn::core::GalvynRouter;

use crate::http::middleware::auth_required::AuthRequiredLayer;
use crate::http::middleware::rate_limit::RateLimitLayer;

pub mod handler;
pub mod schema;

/// Initialize the join routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .merge(
            GalvynRouter::new()
                .handler(handler::look_up_join_code)
                .handler(handler::join_tournament_as_guest)
                .handler(handler::look_up_claim_token)
                .handler(handler::reattach_claim_token)
                .wrap(RateLimitLayer::new(30, Duration::from_secs(60))),
        )
        .merge(
            GalvynRouter::new()
                .handler(handler::join_tournament_by_code)
                .wrap(AuthRequiredLayer),
        )
}
