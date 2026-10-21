//! Handlers of OIDC login
//!
//! The browser leaves for the provider with the url [`start_oidc_login`]
//! answers and comes back to [`finish_oidc_login`], which redirects it to a
//! frontend page: logged in, the username step, or the login page with the
//! reason of a refusal. Refusals of an unknown External identity happen in
//! [`admit_pending`], before the username step.

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::re_exports::axum::response::Redirect;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use galvyn::post;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;
use galvyn_identity::BeginOidcLoginError;
use galvyn_identity::BindError;
use galvyn_identity::FinishOidcLoginError;
use galvyn_identity::IdentityModule;
use galvyn_identity::OidcCallback;
use galvyn_identity::OidcLoginOutcome;
use galvyn_identity::PendingExternalIdentity;
use tracing::info;

use crate::http::handler_frontend::oidc::LOGGED_IN_PAGE;
use crate::http::handler_frontend::oidc::LOGIN_PAGE;
use crate::http::handler_frontend::oidc::USERNAME_STEP_PAGE;
use crate::http::handler_frontend::oidc::schema::ChooseUsernameErrors;
use crate::http::handler_frontend::oidc::schema::ChooseUsernameRequest;
use crate::http::handler_frontend::oidc::schema::GetPendingOidcLoginResponse;
use crate::http::handler_frontend::oidc::schema::ListOpenIdProvidersResponse;
use crate::http::handler_frontend::oidc::schema::OidcCallbackQuery;
use crate::http::handler_frontend::oidc::schema::OidcLoginFailure;
use crate::http::handler_frontend::oidc::schema::PendingOidcLogin;
use crate::http::handler_frontend::oidc::schema::SimpleOpenIdProvider;
use crate::http::handler_frontend::oidc::schema::StartOidcLoginErrors;
use crate::http::handler_frontend::oidc::schema::StartOidcLoginRequest;
use crate::http::handler_frontend::oidc::schema::StartOidcLoginResponse;
use crate::models::account::Account;

/// List the OpenID providers people may log in through
///
/// Empty while no provider is configured; the frontend then shows no button.
#[get("/providers")]
pub async fn list_openid_providers() -> ApiJson<ListOpenIdProvidersResponse> {
    ApiJson(ListOpenIdProvidersResponse {
        providers: IdentityModule::global()
            .openid_providers()
            .iter()
            .map(|provider| SimpleOpenIdProvider {
                id: provider.id().to_string(),
                display_name: provider.display_name().to_string(),
            })
            .collect(),
    })
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
/// A known External identity is logged in and lands on the app. An unknown
/// one is held pending and goes to the username step. A refused login goes
/// back to the login page with `oidc_error` naming why.
#[get("/callback")]
pub async fn finish_oidc_login(
    session: Session,
    Query(query): Query<OidcCallbackQuery>,
) -> ApiResult<Redirect> {
    let identity_module = IdentityModule::global();
    let finished = identity_module
        .finish_oidc_login(
            &session,
            OidcCallback {
                state: query.state.to_string(),
                code: query.code.map(|code| code.to_string()),
                error: query.error.map(|error| error.to_string()),
            },
        )
        .await;

    let failure = match finished {
        Ok(OidcLoginOutcome::LoggedIn(_)) => return Ok(Redirect::to(LOGGED_IN_PAGE)),
        Ok(OidcLoginOutcome::Pending(pending)) => match admit_pending(&pending) {
            Ok(()) => return Ok(Redirect::to(USERNAME_STEP_PAGE)),
            Err(failure) => {
                identity_module
                    .discard_pending_external_identity(&session)
                    .await
                    .map_err(ApiError::map_server_error("Failed to write session"))?;
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
            | FinishOidcLoginError::NotAdmitted,
        ) => OidcLoginFailure::Failed,
        Err(FinishOidcLoginError::Internal(error)) => return Err(error.into()),
    };
    Ok(Redirect::to(&format!(
        "{LOGIN_PAGE}?oidc_error={}",
        failure.code()
    )))
}

/// Decide whether an unknown External identity may go on to the username step
fn admit_pending(pending: &PendingExternalIdentity) -> Result<(), OidcLoginFailure> {
    if verified_email(pending).is_none() {
        info!(provider = %pending.provider, "OIDC login without a verified email");
        return Err(OidcLoginFailure::EmailUnverified);
    }
    Ok(())
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

    let pending = pending.and_then(|pending| {
        let provider = identity_module
            .openid_providers()
            .iter()
            .find(|provider| provider.id() == pending.provider)?;
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
/// the login pending, so the person can pick another.
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
            identity_module
                .discard_pending_external_identity(&session)
                .await
                .map_err(ApiError::map_server_error("Failed to write session"))?;
            errors.nothing_pending = true;
            return errors.fail();
        }
        Err(BindError::Internal(error)) => {
            tx.rollback().await?;
            return Err(error.into());
        }
    };
    Account::insert_for_identity(&mut tx, bound.identity(), request.username, email).await?;
    tx.commit().await?;

    identity_module
        .log_in_bound(&session, bound)
        .await
        .map_err(ApiError::map_server_error("Failed to write session"))?;
    Ok(ApiJson(()))
}
