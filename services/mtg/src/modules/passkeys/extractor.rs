//! Reading the logged-in [`Identity`] out of the session

use std::future::Future;

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::FromRequestParts;
use galvyn::core::re_exports::axum::http::request::Parts;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::rorm::Database;

use super::models::Identity;
use super::session;

impl<S> FromRequestParts<S> for Identity {
    type Rejection = ApiError;

    #[expect(
        clippy::manual_async_fn,
        reason = "An async fn would capture `&S` which is not Send"
    )]
    fn from_request_parts(
        parts: &mut Parts,
        _: &S,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        async move {
            if let Some(CachedIdentity(identity)) = parts.extensions.get() {
                return Ok(identity.clone());
            }

            let session = parts
                .extensions
                .get::<Session>()
                .ok_or(ApiError::server_error(
                    "Can't extract session. Is `SessionManagerLayer` enabled?",
                ))?;

            let uuid = session::logged_in(session)
                .await?
                .ok_or(ApiError::unauthorized("Missing identity uuid in session"))?;

            let Some(identity) = Identity::get_by_uuid(Database::global(), uuid).await? else {
                session::forget_logged_in(session).await?;
                return Err(ApiError::unauthorized("Unknown identity uuid in session"));
            };

            parts.extensions.insert(CachedIdentity(identity.clone()));

            Ok(identity)
        }
    }
}

/// The logged-in Identity, cached on the request after the first lookup
///
/// A handler may extract it more than once (directly, through the
/// middleware and through the service's Account extractor).
#[derive(Clone)]
struct CachedIdentity(Identity);
