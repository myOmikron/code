//! Guests that sign themselves up, and the Guest seats their sessions hold (ADR 0007)
//!
//! Reached without an Account: a public Tournament by its id here, an
//! unlisted one through its share link in [`super::super::shared`]. Both
//! ways share one rate limit per IP address for signing up and one for
//! restoring a seat.

use std::sync::LazyLock;
use std::time::Duration;

use galvyn::core::GalvynRouter;
use service_bootstrap::http::rate_limit::RateLimitLayer;

pub mod handler;
pub mod schema;

/// Guest sign-ups per IP address and minute, repeats and refusals included
///
/// A store's players share one address, and a QR code on the wall sends many
/// of them at once: 30 a minute serves a full store signing up together,
/// while a script from one address cannot fill a Tournament before the
/// per-Tournament cap ([`handler::GUEST_SIGN_UPS`]) holds it.
const SIGN_UPS_PER_MINUTE: u32 = 30;

/// Guest seat recoveries per IP address and minute
///
/// A device recovers once after its session ran out, so a store's players
/// need far fewer than they need sign-ups; a Recovery code cannot be guessed
/// at any rate, this only bounds the load.
const RECOVERIES_PER_MINUTE: u32 = 20;

/// The one sign-up limit both ways share
static SIGN_UP_LIMIT: LazyLock<RateLimitLayer> =
    LazyLock::new(|| RateLimitLayer::new(SIGN_UPS_PER_MINUTE, Duration::from_secs(60)));

/// The one recovery limit both ways share
static RECOVERY_LIMIT: LazyLock<RateLimitLayer> =
    LazyLock::new(|| RateLimitLayer::new(RECOVERIES_PER_MINUTE, Duration::from_secs(60)));

/// The rate limit of Guest sign-up, see [`SIGN_UPS_PER_MINUTE`]
pub fn sign_up_limit() -> RateLimitLayer {
    SIGN_UP_LIMIT.clone()
}

/// The rate limit of restoring a Guest seat, see [`RECOVERIES_PER_MINUTE`]
pub fn recovery_limit() -> RateLimitLayer {
    RECOVERY_LIMIT.clone()
}

/// Signing up as a Guest, for whoever sees the Tournament, logged in or not
pub fn sign_up_routes() -> GalvynRouter {
    GalvynRouter::new().handler(handler::sign_up_as_tournament_guest)
}

/// Restoring a Guest seat, for whoever sees the Tournament, logged in or not
pub fn recovery_routes() -> GalvynRouter {
    GalvynRouter::new().handler(handler::recover_tournament_guest_seat)
}
