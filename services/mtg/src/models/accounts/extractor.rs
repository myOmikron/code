//! Reading the logged-in [`Account`] out of the session

use std::future::Future;

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::FromRequestParts;
use galvyn::core::re_exports::axum::http::request::Parts;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::rorm::Database;

use crate::models::accounts::Account;
use crate::models::accounts::AccountUuid;

/// Session key holding the uuid of the logged-in account
const SESSION_KEY: &str = "current_account";

impl Account {
    /// Set the account's session as logged-in
    ///
    /// Generic over the form-error type so it composes with handlers that report typed errors.
    pub async fn set_logged_in<E>(&self, session: &Session) -> ApiResult<(), E> {
        session
            .insert(SESSION_KEY, self.uuid)
            .await
            .map_err(ApiError::map_server_error("Failed to write to session"))?;
        Ok(())
    }
}

impl<S> FromRequestParts<S> for Account {
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
            // A handler may extract the account more than once (directly and through the
            // middleware); the first lookup caches it on the request.
            if let Some(CachedAccount(account)) = parts.extensions.get() {
                return Ok(account.clone());
            }

            let session = parts
                .extensions
                .get::<Session>()
                .ok_or(ApiError::server_error(
                    "Can't extract session. Is `SessionManagerLayer` enabled?",
                ))?;

            let account_uuid = session
                .get::<AccountUuid>(SESSION_KEY)
                .await?
                .ok_or(ApiError::unauthorized("Missing account uuid in session"))?;

            let mut tx = Database::global().start_transaction().await?;
            let account = Account::get_by_uuid(&mut tx, account_uuid).await?;
            tx.commit().await?;

            // The account may have been deleted while its session was still alive.
            let Some(account) = account else {
                session.remove_value(SESSION_KEY).await?;
                session.save().await?;
                return Err(ApiError::unauthorized("Unknown account uuid in session"));
            };

            parts.extensions.insert(CachedAccount(account.clone()));

            Ok(account)
        }
    }
}

/// Private struct used by `Account`'s implementation of `FromRequestParts`
#[derive(Clone)]
struct CachedAccount(Account);
