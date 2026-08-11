//! Authentication: signup and invite-based passkey registration

use std::time::Duration;

use galvyn::core::GalvynRouter;

use crate::http::middleware::rate_limit::RateLimitLayer;

pub mod handler;
pub mod schema;

/// Initializes the auth routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        // Signup and recovery are unauthenticated and send mail, so they are
        // the endpoints worth bounding per IP. A human signs up or recovers
        // once; anything above this is a script trying to use us as a mail
        // relay. One shared budget, since the abuse they bound is the same.
        .merge(
            GalvynRouter::new()
                .handler(handler::signup)
                .handler(handler::recover_account)
                .wrap(RateLimitLayer::new(5, Duration::from_secs(60 * 60))),
        )
        .handler(handler::start_registration)
        .handler(handler::finish_registration)
        // Login is not rate limited: it sends no mail, and the signup budget of 5/h would
        // lock a user out after a handful of cancelled authenticator prompts. A passkey
        // cannot be guessed, so the endpoint has nothing to brute-force.
        .handler(handler::start_login)
        .handler(handler::finish_login)
        .handler(handler::logout)
}
