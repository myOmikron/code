//! Extractors for the session user.

use galvyn::core::re_exports::axum::extract::FromRequestParts;
use galvyn::core::re_exports::axum::http::request::Parts;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiError;
use serde::Deserialize;
use serde::Serialize;

use crate::models::account::AccountUuid;

/// Extractor for the session user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionUser {
    /// The user's UUID.
    pub uuid: AccountUuid,
}

/// The key of the session user in the session.
pub const SESSION_USER: &str = "session_user";

impl<S: Sync + Send> FromRequestParts<S> for SessionUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let session = Session::from_request_parts(parts, state)
            .await
            .map_err(|_| ApiError::server_error("Session error"))?;

        let session_user: SessionUser = session
            .get(SESSION_USER)
            .await
            .map_err(|_| ApiError::server_error("Session error"))?
            .ok_or(ApiError::unauthorized(""))?;

        Ok(session_user)
    }
}
