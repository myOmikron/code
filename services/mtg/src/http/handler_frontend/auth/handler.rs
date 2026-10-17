//! Handlers for signup and invite-based passkey registration

use galvyn::core::Module;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use galvyn::post;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use tracing::info;
use url::Url;

use crate::http::handler_frontend::auth::schema::FinishLoginErrors;
use crate::http::handler_frontend::auth::schema::FinishLoginRequest;
use crate::http::handler_frontend::auth::schema::FinishRegistrationRequest;
use crate::http::handler_frontend::auth::schema::RecoverAccountRequest;
use crate::http::handler_frontend::auth::schema::RegistrationErrors;
use crate::http::handler_frontend::auth::schema::SignupErrors;
use crate::http::handler_frontend::auth::schema::SignupRequest;
use crate::http::handler_frontend::auth::schema::SignupResponse;
use crate::http::handler_frontend::auth::schema::StartLoginErrors;
use crate::http::handler_frontend::auth::schema::StartLoginRequest;
use crate::http::handler_frontend::auth::schema::StartLoginResponse;
use crate::http::handler_frontend::auth::schema::StartRegistrationRequest;
use crate::http::handler_frontend::auth::schema::StartRegistrationResponse;
use crate::models::account::Account;
use crate::models::account::Username;
use crate::modules::passkeys::BeginLoginError;
use crate::modules::passkeys::FinishEnrollmentError;
use crate::modules::passkeys::FinishLoginError;
use crate::modules::passkeys::LinkError;
use crate::modules::passkeys::OpenLinkError;
use crate::modules::passkeys::Passkeys;
use crate::utils::mail::send_recovery_link;
use crate::utils::mail::send_registration_link;

/// Sign up for a new account
///
/// Reports a taken username back to the form — profiles are reachable by name, so that is
/// public information anyway. Everything else answers `200` whether or not anything was
/// created, so the response cannot be used to probe which email addresses are in use.
///
/// A link is only ever sent to the address stored on the account, never to the one in the
/// request, so this endpoint cannot be used to mail a third party.
#[post("/signup")]
pub async fn signup(
    ApiJson(request): ApiJson<SignupRequest>,
) -> ApiResult<ApiJson<SignupResponse>, SignupErrors> {
    let mut errors = FormErrors::<SignupErrors>::new();
    if !is_plausible_email(&request.email) {
        errors.email_malformed = true;
    }

    let mut tx = Database::global().start_transaction().await?;
    let invite = prepare_signup(&mut tx, &request, &mut errors).await?;
    errors.check()?;
    tx.commit().await?;

    if let Some((email, username, link)) = invite {
        send_registration_link(&email, &username, &link, request.language)
            .await
            .map_err(ApiError::map_server_error("Failed to queue mail"))?;
    }

    Ok(ApiJson(SignupResponse {
        username: request.username.as_str().to_string(),
    }))
}

/// Send a fresh registration link to an account's stored address
///
/// The "lost passkey" flow: a new device has no passkey, so the login form
/// offers this instead of a dead end. Registering over the link only *adds* a
/// passkey — the existing ones keep working until their owner removes them.
///
/// Always answers `200`, whether or not the username exists — the response
/// must not be usable to probe which usernames are registered. The link is
/// only ever sent to the address stored on the account, never to one from the
/// request, so this endpoint cannot be used to mail a third party.
#[post("/recover")]
pub async fn recover_account(
    ApiJson(request): ApiJson<RecoverAccountRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(account) = Account::get_by_username(&mut tx, &request.username).await? else {
        info!("Recovery for an unknown username");
        tx.commit().await?;
        return Ok(ApiJson(()));
    };

    let link = Passkeys::global()
        .issue_registration_link(&mut tx, account.identity)
        .await?;
    tx.commit().await?;

    send_recovery_link(&account.email, &account.username, &link, request.language)
        .await
        .map_err(ApiError::map_server_error("Failed to queue mail"))?;

    Ok(ApiJson(()))
}

/// Decide what a signup request should do, if anything
///
/// Returns the recipient, username, and Registration link of the mail to send.
///
/// A taken username gets a fresh link only while its account has no passkey
/// yet: that is the "my invite mail got lost" case. Once a passkey exists the
/// account is somebody's, and a stranger typing the username must not be able
/// to trigger mail to them. The email is unique too, and just as unrevealable.
async fn prepare_signup(
    tx: &mut Transaction,
    request: &SignupRequest,
    errors: &mut FormErrors<SignupErrors>,
) -> ApiResult<Option<(MaxStr<255>, Username, Url)>, SignupErrors> {
    let passkeys = Passkeys::global();

    if let Some(account) = Account::get_by_username(&mut *tx, &request.username).await? {
        let has_passkey = !passkeys
            .list_passkeys(&mut *tx, account.identity)
            .await?
            .is_empty();
        if has_passkey {
            info!("Signup for a username that is already registered");
            errors.username_taken = true;
            return Ok(None);
        }

        let link = passkeys
            .issue_registration_link(&mut *tx, account.identity)
            .await?;
        return Ok(Some((account.email, account.username, link)));
    }

    if Account::get_by_email(&mut *tx, &request.email)
        .await?
        .is_some()
    {
        info!("Signup for an email address that is already in use");
        return Ok(None);
    }

    let identity =
        Account::insert(&mut *tx, request.username.clone(), request.email.clone()).await?;
    let link = passkeys.issue_registration_link(&mut *tx, identity).await?;

    Ok(Some((
        request.email.clone(),
        request.username.clone(),
        link,
    )))
}

/// Cheap structural check on an email address
///
/// The `mail-gateway` parses the address properly when it picks the message
/// up; this only keeps obvious garbage out of the database.
fn is_plausible_email(email: &str) -> bool {
    let mut parts = email.split('@');
    let (Some(local), Some(domain), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    !local.is_empty()
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && !email.chars().any(char::is_whitespace)
}

/// Start a passkey login for a given username
///
/// The account's passkeys are sent as the credential allow-list. Registration asks for
/// `residentKey: discouraged`, so the credentials are not necessarily discoverable by the
/// authenticator on its own — it has to be told which ones to look for.
#[post("/login/start")]
pub async fn start_login(
    session: Session,
    ApiJson(request): ApiJson<StartLoginRequest>,
) -> ApiResult<ApiJson<StartLoginResponse>, StartLoginErrors> {
    let mut errors = FormErrors::<StartLoginErrors>::new();

    let mut tx = Database::global().start_transaction().await?;
    let account = Account::get_by_username(&mut tx, &request.username).await?;
    tx.commit().await?;

    let Some(account) = account else {
        errors.unknown_username = true;
        return errors.fail();
    };

    let options = match Passkeys::global()
        .begin_login(&session, account.identity)
        .await
    {
        Ok(options) => options,
        Err(BeginLoginError::NoPasskey) => {
            errors.unknown_username = true;
            return errors.fail();
        }
        Err(BeginLoginError::Internal(error)) => return Err(error.into()),
    };

    Ok(ApiJson(StartLoginResponse { options }))
}

/// Finish a passkey login
///
/// Verifies the browser's credential and logs the account in.
#[post("/login/finish")]
pub async fn finish_login(
    session: Session,
    ApiJson(request): ApiJson<FinishLoginRequest>,
) -> ApiResult<ApiJson<()>, FinishLoginErrors> {
    let mut errors = FormErrors::<FinishLoginErrors>::new();
    let finished = Passkeys::global()
        .finish_login(&session, request.credential, request.remember_me)
        .await;
    match finished {
        Ok(_identity) => return Ok(ApiJson(())),
        Err(FinishLoginError::NoLoginInProgress) => errors.no_ceremony = true,
        Err(FinishLoginError::MalformedCredential) => errors.malformed_credential = true,
        Err(FinishLoginError::VerificationFailed) => errors.authentication_failed = true,
        Err(FinishLoginError::UnknownIdentity) => {
            return Err(ApiError::bad_request("Unknown account"));
        }
        Err(FinishLoginError::Internal(error)) => return Err(error.into()),
    }
    errors.fail()
}

/// Log out, dropping the session
#[get("/logout")]
pub async fn logout(session: Session) -> ApiResult<()> {
    Passkeys::global()
        .logout(&session)
        .await
        .map_err(ApiError::map_server_error("Failed to flush session"))?;
    Ok(())
}

/// Report why a Registration link cannot be used
fn report_link_error(errors: &mut FormErrors<RegistrationErrors>, error: LinkError) {
    match error {
        LinkError::UnknownLink => errors.token_invalid = true,
        LinkError::LinkUsed => errors.token_used = true,
        LinkError::LinkExpired => errors.token_expired = true,
    }
}

/// Start a passkey registration
#[post("/register/start")]
pub async fn start_registration(
    session: Session,
    ApiJson(request): ApiJson<StartRegistrationRequest>,
) -> ApiResult<ApiJson<StartRegistrationResponse>, RegistrationErrors> {
    let mut errors = FormErrors::<RegistrationErrors>::new();
    let passkeys = Passkeys::global();

    let link = match passkeys.open_registration_link(&request.token).await {
        Ok(link) => link,
        Err(OpenLinkError::Link(error)) => {
            report_link_error(&mut errors, error);
            return errors.fail();
        }
        Err(OpenLinkError::Internal(error)) => return Err(error.into()),
    };

    let mut tx = Database::global().start_transaction().await?;
    let account = Account::get_by_identity(&mut tx, link.identity()).await?;
    tx.commit().await?;
    let account = account.ok_or(ApiError::server_error("Token without account"))?;

    let options = passkeys
        .begin_link_enrollment(&session, &link, account.username.as_str())
        .await?;

    Ok(ApiJson(StartRegistrationResponse {
        username: account.username.as_str().to_string(),
        options,
    }))
}

/// Finish a passkey registration
#[post("/register/finish")]
pub async fn finish_registration(
    session: Session,
    ApiJson(request): ApiJson<FinishRegistrationRequest>,
) -> ApiResult<ApiJson<()>, RegistrationErrors> {
    let mut errors = FormErrors::<RegistrationErrors>::new();
    let finished = Passkeys::global()
        .finish_link_enrollment(&session, &request.token, request.credential, None)
        .await;
    match finished {
        Ok(()) => return Ok(ApiJson(())),
        Err(FinishEnrollmentError::NoEnrollmentInProgress) => errors.no_ceremony = true,
        Err(FinishEnrollmentError::MalformedCredential) => errors.malformed_credential = true,
        Err(FinishEnrollmentError::Link(error)) => report_link_error(&mut errors, error),
        Err(FinishEnrollmentError::VerificationFailed) => errors.registration_failed = true,
        Err(FinishEnrollmentError::AlreadyEnrolled) => errors.already_registered = true,
        Err(FinishEnrollmentError::Internal(error)) => return Err(error.into()),
    }
    errors.fail()
}
