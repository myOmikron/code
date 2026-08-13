use std::future::Future;

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::FromRequestParts;
use galvyn::core::re_exports::axum::http::request::Parts;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::rorm::Database;

use crate::models::account::Account;
use crate::models::account::AccountUuid;

const SESSION_KEY: &str = "current_account";

impl Account {
    /// Set the account's session as logged-in
    pub async fn set_logged_in(&self, session: &Session) -> ApiResult<()> {
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

            let Some(account) = Account::get_by_uuid(Database::global(), account_uuid).await?
            else {
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
