//! Live updates: a Server-Sent Events stream per Tournament
//!
//! Every route that changes a Tournament calls [`emit`] once its transaction
//! is committed; the stream tells each reader what changed, and the reader
//! fetches it again. Viewing rights are the Tournament's own, checked when the
//! stream opens.

use galvyn::core::GalvynRouter;

pub mod handler;
pub mod hub;
pub mod schema;

pub use self::hub::emit;
pub use self::schema::TournamentEvent;

/// What anybody may read, whatever the Tournament shows them
pub fn public_routes() -> GalvynRouter {
    GalvynRouter::new().handler(handler::follow_tournament)
}
