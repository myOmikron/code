//! Handlers for passkey login, invite-based registration and passkey management

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::rorm::Database;
use galvyn_identity::BeginLoginError;
use galvyn_identity::FinishEnrollmentError;
use galvyn_identity::FinishLoginError;
use galvyn_identity::IdentityModule;
use galvyn_identity::LinkError;
use galvyn_identity::OpenLinkError;
use galvyn_identity::RemovalRefused;
use galvyn_identity::RemovePasskeyError;

use crate::http::handler_frontend::auth::schema::FinishAddPasskeyRequest;
use crate::http::handler_frontend::auth::schema::FinishLoginRequest;
use crate::http::handler_frontend::auth::schema::FinishRegistrationRequest;
use crate::http::handler_frontend::auth::schema::ListPasskeysResponse;
use crate::http::handler_frontend::auth::schema::MeResponse;
use crate::http::handler_frontend::auth::schema::PasskeySchema;
use crate::http::handler_frontend::auth::schema::StartAddPasskeyResponse;
use crate::http::handler_frontend::auth::schema::StartLoginRequest;
use crate::http::handler_frontend::auth::schema::StartLoginResponse;
use crate::http::handler_frontend::auth::schema::StartRegistrationRequest;
use crate::http::handler_frontend::auth::schema::StartRegistrationResponse;
use crate::models::Account;
use crate::models::AccountPasskeyUuid;

/// Start a passkey login for a given username
///
/// The account's passkeys are sent as the credential allow-list, so this
/// works with roaming authenticators (e.g. YubiKeys) whose credentials are
/// not client-side discoverable.
#[post("/login/start")]
pub async fn start_login(
    session: Session,
    ApiJson(request): ApiJson<StartLoginRequest>,
) -> ApiResult<ApiJson<StartLoginResponse>> {
    let account = Account::get_by_username(Database::global(), &request.username)
        .await?
        .ok_or(ApiError::bad_request("Unknown username or no passkey"))?;

    let options = IdentityModule::global()
        .begin_login(&session, account.identity)
        .await
        .map_err(|error| match error {
            BeginLoginError::NoPasskey => ApiError::bad_request("Unknown username or no passkey"),
            BeginLoginError::Internal(error) => error.into(),
        })?;

    Ok(ApiJson(StartLoginResponse { options }))
}

/// Finish a passkey login
///
/// Verifies the browser's credential and logs the account in.
#[post("/login/finish")]
pub async fn finish_login(
    session: Session,
    ApiJson(request): ApiJson<FinishLoginRequest>,
) -> ApiResult<ApiJson<MeResponse>> {
    let identity = IdentityModule::global()
        .finish_login(&session, request.credential, false)
        .await
        .map_err(|error| match error {
            FinishLoginError::NoLoginInProgress => {
                ApiError::bad_request("No login ceremony in progress")
            }
            FinishLoginError::MalformedCredential => ApiError::bad_request("Malformed credential"),
            FinishLoginError::VerificationFailed => ApiError::bad_request("Authentication failed"),
            FinishLoginError::UnknownIdentity => ApiError::bad_request("Unknown account"),
            FinishLoginError::Internal(error) => error.into(),
        })?;

    let account = Account::get_by_identity(Database::global(), identity)
        .await?
        .ok_or(ApiError::bad_request("Unknown account"))?;

    Ok(ApiJson(MeResponse {
        uuid: account.uuid,
        username: account.username.to_string(),
        role: account.role,
    }))
}

/// Why a Registration link cannot be used
fn link_refused(error: LinkError) -> ApiError {
    match error {
        LinkError::UnknownLink => ApiError::bad_request("Invalid registration token"),
        LinkError::LinkUsed => ApiError::bad_request("Registration token already used"),
        LinkError::LinkExpired => ApiError::bad_request("Registration token expired"),
    }
}

/// Why an Enrollment could not be finished
fn enrollment_refused(error: FinishEnrollmentError) -> ApiError {
    match error {
        FinishEnrollmentError::NoEnrollmentInProgress => {
            ApiError::bad_request("No enrollment ceremony in progress")
        }
        FinishEnrollmentError::MalformedCredential => ApiError::bad_request("Malformed credential"),
        FinishEnrollmentError::Link(error) => link_refused(error),
        FinishEnrollmentError::VerificationFailed => ApiError::bad_request("Registration failed"),
        FinishEnrollmentError::AlreadyEnrolled => {
            ApiError::bad_request("This passkey is already registered")
        }
        FinishEnrollmentError::Internal(error) => error.into(),
    }
}

/// Start an invite-based passkey registration
#[post("/register/start")]
pub async fn start_registration(
    session: Session,
    ApiJson(request): ApiJson<StartRegistrationRequest>,
) -> ApiResult<ApiJson<StartRegistrationResponse>> {
    let identity = IdentityModule::global();

    let link = identity
        .open_registration_link(&request.token)
        .await
        .map_err(|error| match error {
            OpenLinkError::Link(error) => link_refused(error),
            OpenLinkError::Internal(error) => error.into(),
        })?;

    let account = Account::get_by_identity(Database::global(), link.identity())
        .await?
        .ok_or(ApiError::server_error("Token without account"))?;

    let options = identity
        .begin_link_enrollment(&session, &link, &account.username)
        .await?;

    Ok(ApiJson(StartRegistrationResponse {
        username: account.username.to_string(),
        options,
    }))
}

/// Finish an invite-based passkey registration
#[post("/register/finish")]
pub async fn finish_registration(
    session: Session,
    ApiJson(request): ApiJson<FinishRegistrationRequest>,
) -> ApiResult<()> {
    IdentityModule::global()
        .finish_link_enrollment(&session, &request.token, request.credential, None)
        .await
        .map_err(enrollment_refused)
}

/// Start adding another passkey to the logged-in account
#[post("/passkeys/start")]
pub async fn start_add_passkey(
    session: Session,
    account: Account,
) -> ApiResult<ApiJson<StartAddPasskeyResponse>> {
    let options = IdentityModule::global()
        .begin_device_enrollment(&session, account.identity, &account.username)
        .await?;

    Ok(ApiJson(StartAddPasskeyResponse { options }))
}

/// Finish adding another passkey to the logged-in account
#[post("/passkeys/finish")]
pub async fn finish_add_passkey(
    session: Session,
    account: Account,
    ApiJson(request): ApiJson<FinishAddPasskeyRequest>,
) -> ApiResult<()> {
    IdentityModule::global()
        .finish_device_enrollment(&session, account.identity, request.credential, None)
        .await
        .map_err(enrollment_refused)
}

/// List the passkeys of the logged-in account
#[get("/passkeys")]
pub async fn list_passkeys(account: Account) -> ApiResult<ApiJson<ListPasskeysResponse>> {
    let passkeys = IdentityModule::global()
        .list_passkeys(Database::global(), account.identity)
        .await?;
    Ok(ApiJson(ListPasskeysResponse {
        passkeys: passkeys
            .into_iter()
            .map(|passkey| PasskeySchema {
                uuid: passkey.uuid.into(),
                label: passkey.label.to_string(),
                last_used_at: passkey.last_used_at.map(SchemaDateTime),
                created_at: SchemaDateTime(passkey.created_at),
            })
            .collect(),
    }))
}

/// Delete one of the logged-in account's passkeys
///
/// The last passkey cannot be deleted — the account would be locked out.
#[delete("/passkeys/{uuid}")]
pub async fn delete_passkey(
    account: Account,
    Path(uuid): Path<AccountPasskeyUuid>,
) -> ApiResult<()> {
    IdentityModule::global()
        .remove_passkey(account.identity, uuid.into())
        .await
        .map_err(|error| match error {
            RemovePasskeyError::Refused(RemovalRefused::UnknownPasskey { .. }) => {
                ApiError::bad_request("Unknown passkey")
            }
            RemovePasskeyError::Refused(RemovalRefused::LastPasskey) => {
                ApiError::bad_request("Cannot delete the last passkey of an account")
            }
            RemovePasskeyError::Internal(error) => error.into(),
        })
}

/// Log out of the current session
#[get("/logout")]
pub async fn logout(session: Session) -> ApiResult<()> {
    IdentityModule::global()
        .logout(&session)
        .await
        .map_err(ApiError::map_server_error("Failed to delete session"))?;
    Ok(())
}

/// Cheap probe whether the session is logged in
#[get("/test")]
pub async fn test() -> &'static str {
    "OK"
}

/// Get the currently logged-in account
#[get("/me")]
pub async fn me(account: Account) -> ApiResult<ApiJson<MeResponse>> {
    Ok(ApiJson(MeResponse {
        uuid: account.uuid,
        username: account.username.to_string(),
        role: account.role,
    }))
}
