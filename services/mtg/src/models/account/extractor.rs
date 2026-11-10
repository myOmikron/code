//! Reading the logged-in [`Account`] out of the session
//!
//! [`Caller`] is the single point of resolution: it reads the session's own
//! Account and, during an [`Impersonation`], the impersonated one. [`Account`]
//! and [`Viewer`] are the Account a request acts as, so every handler and
//! middleware built on them acts as the impersonated Account without knowing.
//!
//! A locked Account is refused like a missing one, so its sessions stop
//! working on their next request. The Lock that counts is the session's own
//! Account's: an Admin can impersonate a locked Account.

use std::future::Future;

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::FromRequestParts;
use galvyn::core::re_exports::axum::extract::OptionalFromRequestParts;
use galvyn::core::re_exports::axum::http::request::Parts;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::core::ApiErrorStatusCode;
use galvyn::rorm::Database;
use galvyn_identity::Identity;

use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::account::impersonation::Impersonation;

/// Who a request comes from and which Account it acts as
///
/// Outside an Impersonation both are the session's own Account. Resolved once
/// per request and cached, so extracting it, [`Account`] or [`Viewer`] again
/// costs no query.
#[derive(Clone, Debug)]
pub struct Caller {
    /// The Account the request acts as: the impersonated one during an Impersonation
    pub account: Account,
    /// The Impersonation the session is in, `None` outside of one
    pub impersonation: Option<ActiveImpersonation>,
}

/// An Impersonation in effect for a request
#[derive(Clone, Debug)]
pub struct ActiveImpersonation {
    /// The impersonating Admin, the session's own Account
    pub admin: Account,
    /// The Impersonation as the session stores it
    pub state: Impersonation,
}

impl Caller {
    /// Whether the request acts as an Account it does not belong to
    pub fn is_impersonating(&self) -> bool {
        self.impersonation.is_some()
    }

    /// The Account the request acts as and the Impersonation behind it, from the session
    async fn resolve(session: &Session, identity: &Identity) -> Result<Self, ApiError> {
        let impersonation = Impersonation::read(session).await?;

        let mut tx = Database::global().start_transaction().await?;
        let own = Account::get_by_identity(&mut tx, identity.uuid).await?;
        let impersonated = match &impersonation {
            Some(impersonation) if !impersonation.has_expired() => {
                Account::get_manageable(&mut tx, impersonation.account).await?
            }
            _ => None,
        };
        tx.commit().await?;

        let own = own.ok_or(ApiError::unauthorized("No account for the identity"))?;
        if own.locked {
            return Err(ApiError::unauthorized("The account is locked"));
        }

        match (impersonation, impersonated) {
            (Some(state), Some(account)) => Ok(Self {
                account,
                impersonation: Some(ActiveImpersonation { admin: own, state }),
            }),
            (Some(_), None) => {
                Impersonation::remove_from(session).await?;
                Ok(Self::own(own))
            }
            (None, _) => Ok(Self::own(own)),
        }
    }

    /// A request acting as the session's own Account
    fn own(account: Account) -> Self {
        Self {
            account,
            impersonation: None,
        }
    }
}

impl<S> FromRequestParts<S> for Caller {
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
            if let Some(caller) = parts.extensions.get::<Caller>() {
                return Ok(caller.clone());
            }

            let identity = Identity::from_request_parts(parts, &()).await?;
            let session =
                parts
                    .extensions
                    .get::<Session>()
                    .cloned()
                    .ok_or(ApiError::server_error(
                        "Can't extract session. Is `SessionManagerLayer` enabled?",
                    ))?;

            let caller = Self::resolve(&session, &identity).await?;
            parts.extensions.insert(caller.clone());
            Ok(caller)
        }
    }
}

/// `None` for a request nobody is logged in for: no session, an expired one or a locked Account
impl<S> OptionalFromRequestParts<S> for Caller {
    type Rejection = ApiError;

    #[expect(
        clippy::manual_async_fn,
        reason = "An async fn would capture `&S` which is not Send"
    )]
    fn from_request_parts(
        parts: &mut Parts,
        _: &S,
    ) -> impl Future<Output = Result<Option<Self>, Self::Rejection>> + Send {
        async move {
            match <Caller as FromRequestParts<()>>::from_request_parts(parts, &()).await {
                Ok(caller) => Ok(Some(caller)),
                Err(ApiError::CoreApiError(error))
                    if matches!(error.status_code, ApiErrorStatusCode::Unauthorized) =>
                {
                    Ok(None)
                }
                Err(error) => Err(error),
            }
        }
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
            let caller = <Caller as FromRequestParts<()>>::from_request_parts(parts, &()).await?;
            Ok(caller.account)
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
            let caller =
                <Caller as OptionalFromRequestParts<()>>::from_request_parts(parts, &()).await?;
            Ok(Self(caller.map(|caller| caller.account)))
        }
    }
}
