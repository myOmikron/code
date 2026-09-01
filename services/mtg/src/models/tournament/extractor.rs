//! Reading the acting [`super::TournamentActor`] out of the session or a logged-in account

use std::future::Future;

use galvyn::core::re_exports::axum::extract::FromRequestParts;
use galvyn::core::re_exports::axum::http::request::Parts;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use uuid::Uuid;

use crate::models::account::Account;
use crate::models::tournament::TournamentActor;
use crate::models::tournament::TournamentParticipantUuid;

/// Session key holding the participant uuids a guest has joined as
///
/// A `Vec<Uuid>` rather than a single one: a phone that joins two events in
/// one sitting stays a guest of both without a second cookie.
pub const GUEST_SESSION_KEY: &str = "tournament_guests";

impl TournamentActor {
    /// Append a freshly joined guest participant to the session
    ///
    /// Generic over the form-error type so it composes with handlers that
    /// report typed errors, the same shape as
    /// [`Account::set_logged_in`](crate::models::account::Account::set_logged_in).
    pub async fn remember_guest<E>(
        session: &Session,
        participant: TournamentParticipantUuid,
    ) -> ApiResult<(), E> {
        let mut guests: Vec<Uuid> = session
            .get::<Vec<Uuid>>(GUEST_SESSION_KEY)
            .await
            .map_err(ApiError::map_server_error("Failed to read from session"))?
            .unwrap_or_default();
        guests.push(participant.into_inner());
        session
            .insert(GUEST_SESSION_KEY, guests)
            .await
            .map_err(ApiError::map_server_error("Failed to write to session"))?;
        Ok(())
    }
}

impl<S> FromRequestParts<S> for TournamentActor
where
    S: Sync,
{
    type Rejection = ApiError;

    #[expect(
        clippy::manual_async_fn,
        reason = "An async fn would capture `&S` which is not Send"
    )]
    fn from_request_parts(
        parts: &mut Parts,
        state: &S,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        async move {
            // `Account` caches itself on the request, so trying it first and
            // falling back to the guest session costs no extra query over
            // extracting an `Account` directly would.
            match Account::from_request_parts(parts, state).await {
                Ok(account) => Ok(TournamentActor::Account(account)),
                Err(rejection) => {
                    let session =
                        parts
                            .extensions
                            .get::<Session>()
                            .ok_or(ApiError::server_error(
                                "Can't extract session. Is `SessionManagerLayer` enabled?",
                            ))?;

                    let guests: Vec<Uuid> = session
                        .get::<Vec<Uuid>>(GUEST_SESSION_KEY)
                        .await?
                        .unwrap_or_default();
                    if guests.is_empty() {
                        // Neither a logged-in account nor a guest history —
                        // the same opaque rejection an unauthorized `Account`
                        // gets, so a caller cannot tell "never signed in"
                        // apart from "never joined anything" from the outside.
                        return Err(rejection);
                    }

                    Ok(TournamentActor::Guest(
                        guests
                            .into_iter()
                            .map(TournamentParticipantUuid::from_uuid)
                            .collect(),
                    ))
                }
            }
        }
    }
}
