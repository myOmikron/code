//! Authorization requests waiting in the session for the login step

use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiResult;
use serde::Deserialize;
use serde::Serialize;
use uuid::Uuid;

use crate::http::handler_auth::auth::request::AuthRequest;
use crate::http::handler_auth::auth::schema::PendingAuthorizationId;

/// Session key of the pending authorization requests
const SESSION_PENDING_AUTHORIZATIONS: &str = "oidc-pending-authorizations";

/// How many requests a session keeps pending, the oldest is dropped beyond that
const MAX_PENDING: usize = 16;

/// The pending authorization requests of a session, oldest first
///
/// Keyed by request id, so sign-ins in parallel tabs do not overwrite each other.
#[derive(Debug, Default, Serialize, Deserialize)]
struct PendingAuthorizations(Vec<(PendingAuthorizationId, AuthRequest)>);

impl PendingAuthorizations {
    async fn load(session: &Session) -> ApiResult<Self> {
        Ok(session
            .get(SESSION_PENDING_AUTHORIZATIONS)
            .await?
            .unwrap_or_default())
    }

    async fn store(self, session: &Session) -> ApiResult<()> {
        if self.0.is_empty() {
            session
                .remove::<Self>(SESSION_PENDING_AUTHORIZATIONS)
                .await?;
        } else {
            session.insert(SESSION_PENDING_AUTHORIZATIONS, self).await?;
        }
        Ok(())
    }
}

/// Stores an authorization request in the session until the login step resumes it
pub async fn insert(session: &Session, request: AuthRequest) -> ApiResult<PendingAuthorizationId> {
    let mut pending = PendingAuthorizations::load(session).await?;
    let id = PendingAuthorizationId(Uuid::new_v4());
    pending.0.push((id, request));
    if pending.0.len() > MAX_PENDING {
        pending.0.drain(..pending.0.len() - MAX_PENDING);
    }
    pending.store(session).await?;
    Ok(id)
}

/// Removes the authorization request `id` from the session and returns it
///
/// `None` when this session has no pending request with that id.
pub async fn take(session: &Session, id: PendingAuthorizationId) -> ApiResult<Option<AuthRequest>> {
    let mut pending = PendingAuthorizations::load(session).await?;
    let Some(index) = pending.0.iter().position(|(key, _)| *key == id) else {
        return Ok(None);
    };
    let (_, query) = pending.0.remove(index);
    pending.store(session).await?;
    Ok(Some(query))
}

/// The authorization request `id` of this session, left pending
///
/// `None` when this session has no pending request with that id.
pub async fn get(session: &Session, id: PendingAuthorizationId) -> ApiResult<Option<AuthRequest>> {
    Ok(PendingAuthorizations::load(session)
        .await?
        .0
        .into_iter()
        .find_map(|(key, request)| (key == id).then_some(request)))
}
