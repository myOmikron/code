//! Joining a tournament by its typed code
//!
//! The one surface in this service genuinely reachable without a session at
//! all: a phone reading a whiteboard code has neither a cookie nor an
//! account yet. [`look_up_join_code`](handler::look_up_join_code) and
//! [`join_tournament_as_guest`](handler::join_tournament_as_guest) share one
//! [`RateLimitLayer`], the same construction [`crate::http::handler_frontend::auth`]
//! uses for its own unauthenticated endpoints — a whole venue sits behind
//! one NAT IP, so the budget is generous (30 requests/minute) rather than
//! per-person. [`join_tournament_by_code`](handler::join_tournament_by_code)
//! needs a logged-in [`Account`](crate::models::account::Account) and sits
//! behind [`AuthRequiredLayer`] instead — no rate limiting: a passkey
//! session is already the scarce thing an abuse budget would be protecting.

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
                .wrap(RateLimitLayer::new(30, Duration::from_secs(60))),
        )
        .merge(
            GalvynRouter::new()
                .handler(handler::join_tournament_by_code)
                .wrap(AuthRequiredLayer),
        )
}
