//! Reading the logged-in [`Account`] out of the session
//!
//! A locked Account is refused like a missing one, so its sessions stop
//! working on their next request.

use std::future::Future;

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::FromRequestParts;
use galvyn::core::re_exports::axum::http::request::Parts;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::rorm::Database;
use galvyn_identity::Identity;

use crate::models::account::Account;

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

            let identity = Identity::from_request_parts(parts, &()).await?;

            let mut tx = Database::global().start_transaction().await?;
            let account = Account::get_by_identity(&mut tx, identity.uuid).await?;
            tx.commit().await?;

            let account = account.ok_or(ApiError::unauthorized("No account for the identity"))?;
            if account.locked {
                return Err(ApiError::unauthorized("The account is locked"));
            }

            parts.extensions.insert(CachedAccount(account.clone()));

            Ok(account)
        }
    }
}

/// The logged-in Account, cached on the request after the first lookup
///
/// A handler may extract it more than once (directly and through the middleware).
#[derive(Clone)]
struct CachedAccount(Account);
