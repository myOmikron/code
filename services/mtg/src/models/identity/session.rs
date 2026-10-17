//! The logged-in [`Identity`] in the session

use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;

use crate::models::identity::Identity;
use crate::models::identity::IdentityUuid;

/// Session key holding the uuid of the logged-in identity
///
/// Named after the account it used to hold. Every account that existed before
/// identities did shares its uuid with its identity, so sessions from back
/// then still name the right person.
const LOGGED_IN: &str = "current_account";

impl Identity {
    /// Mark the session as logged in as `identity`
    ///
    /// Generic over the form-error type so it composes with handlers that report typed errors.
    pub async fn set_logged_in<E>(session: &Session, identity: IdentityUuid) -> ApiResult<(), E> {
        session
            .insert(LOGGED_IN, identity)
            .await
            .map_err(ApiError::map_server_error("Failed to write to session"))?;
        Ok(())
    }

    /// The identity the session is logged in as, if any
    pub async fn logged_in(session: &Session) -> ApiResult<Option<IdentityUuid>> {
        Ok(session.get::<IdentityUuid>(LOGGED_IN).await?)
    }

    /// Forget the session's login, e.g. because its identity is gone
    pub async fn forget_logged_in(session: &Session) -> ApiResult<()> {
        session.remove_value(LOGGED_IN).await?;
        session.save().await?;
        Ok(())
    }
}
