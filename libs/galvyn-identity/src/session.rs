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
///
/// The session gets a fresh id, keeping its data: an id planted in the browser
/// before the login (session fixation) never names a logged-in session.
pub(crate) async fn set_logged_in(session: &Session, identity: IdentityUuid) -> Result<(), Error> {
    session.cycle_id().await?;
    session.insert(LOGGED_IN, identity).await
}

/// Forget the session's login, e.g. because its Identity is gone
pub(crate) async fn forget_logged_in(session: &Session) -> Result<(), Error> {
    session.remove_value(LOGGED_IN).await?;
    session.save().await
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use tower_sessions::MemoryStore;
    use tower_sessions::SessionStore;
    use uuid::Uuid;

    use super::*;

    #[tokio::test]
    async fn logging_in_gives_the_session_a_fresh_id() {
        let store = Arc::new(MemoryStore::default());
        let before = Session::new(None, store.clone(), None);
        before.insert("ceremony", 1).await.unwrap();
        before.save().await.unwrap();
        let fixed = before.id().expect("a saved session has an id");

        let session = Session::new(Some(fixed), store.clone(), None);
        let identity = IdentityUuid::new(Uuid::from_u128(1));
        set_logged_in(&session, identity).await.unwrap();
        session.save().await.unwrap();

        let fresh = session.id().expect("a saved session has an id");
        assert_ne!(fresh, fixed);
        assert!(store.load(&fixed).await.unwrap().is_none());
        let reloaded = Session::new(Some(fresh), store, None);
        assert_eq!(logged_in(&reloaded).await.unwrap(), Some(identity));
        assert_eq!(reloaded.get::<i32>("ceremony").await.unwrap(), Some(1));
    }
}
