//! Handlers of OIDC login
//!
//! The browser leaves for the provider with the url [`start_oidc_login`]
//! answers and comes back to [`finish_oidc_login`], which redirects it to a
//! frontend page: logged in, the username step, or the login page with the
//! reason of a refusal. Refusals of an unknown External identity happen in
//! [`admit_pending`], before the username step; a locked Account is never
//! logged in.

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use galvyn::post;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use galvyn_identity::BeginOidcLoginError;
use galvyn_identity::BindError;
use galvyn_identity::FinishOidcLoginError;
use galvyn_identity::IdentityModule;
use galvyn_identity::IdentityUuid;
use galvyn_identity::OidcCallback;
use galvyn_identity::OidcLoginOutcome;
use galvyn_identity::OpenIdProvider;
use galvyn_identity::PendingExternalIdentity;
use tracing::info;

use crate::config::GOOGLE;
use crate::http::handler_frontend::oidc::LOGGED_IN_PAGE;
use crate::http::handler_frontend::oidc::USERNAME_STEP_PAGE;
use crate::http::handler_frontend::oidc::schema::ChooseUsernameErrors;
use crate::http::handler_frontend::oidc::schema::ChooseUsernameRequest;
use crate::http::handler_frontend::oidc::schema::GetPendingOidcLoginResponse;
use crate::http::handler_frontend::oidc::schema::ListOpenIdProvidersResponse;
use crate::http::handler_frontend::oidc::schema::OidcCallbackQuery;
use crate::http::handler_frontend::oidc::schema::OidcCallbackRedirect;
use crate::http::handler_frontend::oidc::schema::OidcLoginFailure;
use crate::http::handler_frontend::oidc::schema::PendingOidcLogin;
use crate::http::handler_frontend::oidc::schema::SimpleOpenIdProvider;
use crate::http::handler_frontend::oidc::schema::StartOidcLoginErrors;
use crate::http::handler_frontend::oidc::schema::StartOidcLoginRequest;
use crate::http::handler_frontend::oidc::schema::StartOidcLoginResponse;
use crate::models::account::Account;
use crate::models::account::AccountClash;
use crate::modules::config::Conf;

/// List the OpenID providers people may log in through
///
/// Empty while Google is not configured; the frontend then shows no button.
#[get("/providers")]
pub async fn list_openid_providers() -> ApiResult<ApiJson<ListOpenIdProvidersResponse>> {
    let providers = match offered_provider(GOOGLE).await? {
        Some(provider) => vec![SimpleOpenIdProvider {
            id: provider.slug().to_string(),
            display_name: provider.display_name().to_string(),
        }],
        None => Vec::new(),
    };
    Ok(ApiJson(ListOpenIdProvidersResponse { providers }))
}

/// The provider named `slug`, if mtg offers it
///
/// mtg offers Google alone, and only while it is configured: other rows of
/// the provider table, and Google's once its env vars are gone, stay unused.
async fn offered_provider<E>(slug: &str) -> ApiResult<Option<OpenIdProvider>, E> {
    if slug != GOOGLE || Conf::global().config.google.is_none() {
        return Ok(None);
    }
    let mut tx = Database::global().start_transaction().await?;
    let provider = IdentityModule::global()
        .openid_provider(&mut tx, slug)
        .await?;
    tx.commit().await?;
    Ok(provider)
}

/// Start an OIDC login, for signing up and logging in alike
///
/// Answers the provider's authorization url to send the browser to.
#[post("/start")]
pub async fn start_oidc_login(
    session: Session,
    ApiJson(request): ApiJson<StartOidcLoginRequest>,
) -> ApiResult<ApiJson<StartOidcLoginResponse>, StartOidcLoginErrors> {
    let mut errors = FormErrors::<StartOidcLoginErrors>::new();
    if offered_provider(&request.provider).await?.is_none() {
        return Err(ApiError::bad_request("Unknown provider"));
    }
    let started = IdentityModule::global()
        .begin_oidc_login(&session, &request.provider, request.remember_me)
        .await;
    match started {
        Ok(url) => Ok(ApiJson(StartOidcLoginResponse {
            url: url.to_string(),
        })),
        Err(BeginOidcLoginError::UnknownProvider) => Err(ApiError::bad_request("Unknown provider")),
        Err(BeginOidcLoginError::ProviderUnavailable) => {
            errors.provider_unavailable = true;
            errors.fail()
        }
        Err(BeginOidcLoginError::Internal(error)) => Err(error.into()),
    }
}

/// Finish an OIDC login: the provider sends the browser back here
///
/// A known External identity is logged in and lands on the app, unless its
/// Account is locked. An unknown one is held pending and goes to the username
/// step. A refused login goes back to the login page with `oidc_error`
/// naming why.
#[get("/callback/{provider}")]
pub async fn finish_oidc_login(
    session: Session,
    Path(provider): Path<MaxStr<64>>,
    Query(query): Query<OidcCallbackQuery>,
) -> ApiResult<OidcCallbackRedirect> {
    let identity_module = IdentityModule::global();
    let finished = identity_module
        .finish_oidc_login(
            &session,
            &provider,
            OidcCallback {
                state: query.state.to_string(),
                code: query.code.map(|code| code.to_string()),
                error: query.error.map(|error| error.to_string()),
            },
        )
        .await;

    let failure = match finished {
        Ok(OidcLoginOutcome::Known(known)) => {
            if !is_locked(known.identity()).await? {
                identity_module.log_in_bound(&session, known).await?;
                return Ok(OidcCallbackRedirect::to(LOGGED_IN_PAGE));
            }
            OidcLoginFailure::Locked
        }
        Ok(OidcLoginOutcome::Admitted(_)) => {
            return Err(ApiError::server_error(
                "mtg admits through the username step, never through a hook",
            ));
        }
        Ok(OidcLoginOutcome::Pending(pending)) => match admit_pending(&pending).await? {
            Ok(()) => return Ok(OidcCallbackRedirect::to(USERNAME_STEP_PAGE)),
            Err(failure) => {
                discard_pending(&session).await?;
                failure
            }
        },
        Err(FinishOidcLoginError::Denied { error }) => {
            info!(error, "OIDC login denied by the provider");
            OidcLoginFailure::Cancelled
        }
        Err(FinishOidcLoginError::NoLoginInProgress | FinishOidcLoginError::StateMismatch) => {
            OidcLoginFailure::Expired
        }
        Err(FinishOidcLoginError::ProviderUnavailable) => OidcLoginFailure::ProviderUnavailable,
        Err(
            FinishOidcLoginError::MissingCode
            | FinishOidcLoginError::UnknownProvider
            | FinishOidcLoginError::TokenExchangeFailed
            | FinishOidcLoginError::InvalidIdToken
            | FinishOidcLoginError::MissingIdentifyingClaim
            | FinishOidcLoginError::NotAdmitted
            | FinishOidcLoginError::Declined,
        ) => OidcLoginFailure::Failed,
        Err(FinishOidcLoginError::Internal(error)) => return Err(error.into()),
    };
    Ok(OidcCallbackRedirect::refused(failure))
}

/// End the session's pending OIDC login
async fn discard_pending<E>(session: &Session) -> ApiResult<(), E> {
    IdentityModule::global()
        .discard_pending_external_identity(session)
        .await
        .map_err(ApiError::map_server_error("Failed to write session"))
}

/// Whether the Account signing in as `identity` is locked
async fn is_locked(identity: IdentityUuid) -> ApiResult<bool> {
    let mut tx = Database::global().start_transaction().await?;
    let account = Account::get_by_identity(&mut tx, identity).await?;
    tx.commit().await?;
    Ok(account.is_some_and(|account| account.locked))
}

/// Decide whether an unknown External identity may go on to the username step
///
/// Its email must be verified and must not belong to an Account yet, in any
/// case: saying so reveals the address is in use, which only its owner can
/// learn here.
async fn admit_pending(
    pending: &PendingExternalIdentity,
) -> ApiResult<Result<(), OidcLoginFailure>> {
    let Some(email) = verified_email(pending) else {
        info!(provider = %pending.provider, "OIDC login without a verified email");
        return Ok(Err(OidcLoginFailure::EmailUnverified));
    };
    let mut tx = Database::global().start_transaction().await?;
    let in_use = email_in_use(&mut tx, &email).await?;
    tx.commit().await?;
    if in_use {
        return Ok(Err(OidcLoginFailure::EmailInUse));
    }
    Ok(Ok(()))
}

/// Whether `email` belongs to an Account already, case ignored
///
/// Signup compares exactly; a provider may spell a held address in another case.
async fn email_in_use(tx: &mut Transaction, email: &MaxStr<255>) -> Result<bool, rorm::Error> {
    let in_use = Account::email_in_use_ignoring_case(tx, email).await?;
    if in_use {
        info!("OIDC login for an email address that is already in use");
    }
    Ok(in_use)
}

/// The email of a pending External identity, if the provider verified it and it fits an Account
fn verified_email(pending: &PendingExternalIdentity) -> Option<MaxStr<255>> {
    if !pending.email_verified {
        return None;
    }
    MaxStr::new(pending.email.clone()?).ok()
}

/// The session's OIDC login waiting for its username step
#[get("/pending")]
pub async fn get_pending_oidc_login(
    session: Session,
) -> ApiResult<ApiJson<GetPendingOidcLoginResponse>> {
    let identity_module = IdentityModule::global();
    let pending = identity_module
        .pending_external_identity(&session)
        .await
        .map_err(ApiError::map_server_error("Failed to read session"))?;

    let provider = match &pending {
        Some(pending) => offered_provider(&pending.provider).await?,
        None => None,
    };
    let pending = pending.zip(provider).and_then(|(pending, provider)| {
        Some(PendingOidcLogin {
            provider: provider.display_name().to_string(),
            email: verified_email(&pending)?.to_string(),
        })
    });

    Ok(ApiJson(GetPendingOidcLoginResponse { pending }))
}

/// Finish the username step: create the External Account and log it in
///
/// Creates the Identity, the External identity and the Account, with the
/// provider's verified email, in one transaction. A refused username keeps
/// the login pending, so the person can pick another, also when a concurrent
/// request took it after the check. An email an Account took since the
/// callback ends the pending login.
#[post("/username")]
pub async fn choose_username(
    session: Session,
    ApiJson(request): ApiJson<ChooseUsernameRequest>,
) -> ApiResult<ApiJson<()>, ChooseUsernameErrors> {
    let mut errors = FormErrors::<ChooseUsernameErrors>::new();
    let identity_module = IdentityModule::global();

    let pending = identity_module
        .pending_external_identity(&session)
        .await
        .map_err(ApiError::map_server_error("Failed to read session"))?;
    let Some(pending) = pending else {
        errors.nothing_pending = true;
        return errors.fail();
    };
    let email =
        verified_email(&pending).ok_or(ApiError::server_error("Pending without verified email"))?;

    let mut tx = Database::global().start_transaction().await?;
    if Account::get_by_username(&mut tx, &request.username)
        .await?
        .is_some()
    {
        tx.rollback().await?;
        errors.username_taken = true;
        return errors.fail();
    }
    if email_in_use(&mut tx, &email).await? {
        tx.rollback().await?;
        discard_pending(&session).await?;
        errors.email_in_use = true;
        return errors.fail();
    }

    let bound = match identity_module
        .bind_pending_external_identity(&session, &mut tx)
        .await
    {
        Ok(bound) => bound,
        Err(BindError::NothingPending) => {
            tx.rollback().await?;
            errors.nothing_pending = true;
            return errors.fail();
        }
        Err(BindError::AlreadyBound) => {
            tx.rollback().await?;
            discard_pending(&session).await?;
            errors.nothing_pending = true;
            return errors.fail();
        }
        Err(BindError::Internal(error)) => {
            tx.rollback().await?;
            return Err(error.into());
        }
    };
    let inserted =
        Account::insert_for_identity(&mut tx, bound.identity(), request.username, email).await;
    match inserted {
        Ok(()) => tx.commit().await?,
        Err(error) => {
            tx.rollback().await?;
            match Account::clash(&error) {
                Some(AccountClash::Username) => errors.username_taken = true,
                Some(AccountClash::Email) => {
                    discard_pending(&session).await?;
                    errors.email_in_use = true;
                }
                None => return Err(error.into()),
            }
            return errors.fail();
        }
    }

    identity_module.log_in_bound(&session, bound).await?;
    Ok(ApiJson(()))
}
