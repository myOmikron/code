//! The session key of the logged-in Identity
//!
//! Key names and value formats are what sessions already in the store hold:
//! renaming a key or changing its value logs everyone out.

use galvyn::core::session::Session;
use tower_sessions::session::Error;

use super::models::IdentityUuid;

/// Session key holding the uuid of the logged-in Identity
///
/// Named after the account it used to hold. Every account that existed before
/// identities did shares its uuid with its identity, so sessions from back
/// then still name the right person.
const LOGGED_IN: &str = "current_account";

/// The logged-in Identity, if any
pub(crate) async fn logged_in(session: &Session) -> Result<Option<IdentityUuid>, Error> {
    session.get(LOGGED_IN).await
}

/// Mark the session as logged in as `identity`
pub(crate) async fn set_logged_in(session: &Session, identity: IdentityUuid) -> Result<(), Error> {
    session.insert(LOGGED_IN, identity).await
}

/// Forget the session's login, e.g. because its Identity is gone
pub(crate) async fn forget_logged_in(session: &Session) -> Result<(), Error> {
    session.remove_value(LOGGED_IN).await?;
    session.save().await
}
