//! Reading the logged-in [`Account`] out of the session
//!
//! A locked Account is refused like a missing one, so its sessions stop
//! working on their next request.

use std::future::Future;

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::FromRequestParts;
use galvyn::core::re_exports::axum::http::request::Parts;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::core::ApiErrorStatusCode;
use galvyn::rorm::Database;
use galvyn_identity::Identity;

use crate::models::account::Account;
use crate::models::account::AccountUuid;

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

/// Whoever reads a page anybody may open: an [`Account`], or nobody
///
/// For the routes without an auth layer that still answer a logged-in reader
/// more, like a private Tournament its Organizers see. A session without an
/// Account, an expired one and a locked Account all read as nobody; any other
/// failure is passed on.
#[derive(Clone)]
pub struct Viewer(pub Option<Account>);

impl Viewer {
    /// The reading Account's id, `None` for nobody
    pub fn account(&self) -> Option<AccountUuid> {
        self.0.as_ref().map(|account| account.uuid)
    }
}

impl<S> FromRequestParts<S> for Viewer {
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
            match Account::from_request_parts(parts, &()).await {
                Ok(account) => Ok(Self(Some(account))),
                Err(ApiError::CoreApiError(error))
                    if matches!(error.status_code, ApiErrorStatusCode::Unauthorized) =>
                {
                    Ok(Self(None))
                }
                Err(error) => Err(error),
            }
        }
    }
}

/// The logged-in Account, cached on the request after the first lookup
///
/// A handler may extract it more than once (directly and through the middleware).
#[derive(Clone)]
struct CachedAccount(Account);
