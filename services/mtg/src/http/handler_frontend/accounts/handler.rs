use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;
use galvyn_identity::FinishDeviceEnrollmentError;
use galvyn_identity::Identity;
use galvyn_identity::IdentityModule;
use galvyn_identity::LoginMethod;
use galvyn_identity::RemovalRefused;
use galvyn_identity::RemovePasskeyError;

use crate::http::handler_frontend::accounts::schema::AddPasskeyErrors;
use crate::http::handler_frontend::accounts::schema::DeleteAccountErrors;
use crate::http::handler_frontend::accounts::schema::DeleteAccountRequest;
use crate::http::handler_frontend::accounts::schema::DeletePasskeyErrors;
use crate::http::handler_frontend::accounts::schema::FinishAddPasskeyRequest;
use crate::http::handler_frontend::accounts::schema::ListPasskeysResponse;
use crate::http::handler_frontend::accounts::schema::MeErrors;
use crate::http::handler_frontend::accounts::schema::MeResponse;
use crate::http::handler_frontend::accounts::schema::RenameAccountErrors;
use crate::http::handler_frontend::accounts::schema::RenameAccountRequest;
use crate::http::handler_frontend::accounts::schema::RenameAccountResponse;
use crate::http::handler_frontend::accounts::schema::RenamePasskeyErrors;
use crate::http::handler_frontend::accounts::schema::RenamePasskeyRequest;
use crate::http::handler_frontend::accounts::schema::SimplePasskey;
use crate::http::handler_frontend::accounts::schema::StartAddPasskeyResponse;
use crate::models::account::Account;
use crate::models::account::AccountPasskeyUuid;
use crate::models::account::DeletionMode;

/// The account the current session belongs to
///
/// The one route a locked Account's session still reaches: it answers with
/// the `locked` flag, never the Lock reason, and logs the session out.
#[get("/me")]
pub async fn me(session: Session, identity: Identity) -> ApiResult<ApiJson<MeResponse>, MeErrors> {
    let mut tx = Database::global().start_transaction().await?;
    let account = Account::get_by_identity(&mut tx, identity.uuid).await?;
    let login_method = IdentityModule::global()
        .login_method(&mut tx, identity.uuid)
        .await?;
    tx.commit().await?;

    let account = account.ok_or(ApiError::unauthorized("No account for the identity"))?;
    if account.locked {
        IdentityModule::global()
            .logout(&session)
            .await
            .map_err(ApiError::map_server_error("Failed to flush session"))?;
        let mut errors = FormErrors::<MeErrors>::new();
        errors.locked = true;
        return errors.fail();
    }

    Ok(ApiJson(MeResponse {
        uuid: account.uuid,
        username: account.username.as_str().to_string(),
        role: account.role,
        external: matches!(login_method, Some(LoginMethod::External { .. })),
    }))
}

/// Rename the logged-in account
///
/// The old username is free for anybody right away, and its profile link stops
/// working. The session stays: it belongs to the account's identity, not its name.
#[put("/me/username")]
pub async fn rename_account(
    account: Account,
    ApiJson(request): ApiJson<RenameAccountRequest>,
) -> ApiResult<ApiJson<RenameAccountResponse>, RenameAccountErrors> {
    let mut tx = Database::global().start_transaction().await?;
    if !Account::rename(&mut tx, account.uuid, request.username.clone()).await? {
        tx.rollback().await?;
        let mut errors = FormErrors::<RenameAccountErrors>::new();
        errors.username_taken = true;
        return errors.fail();
    }
    tx.commit().await?;

    let passkey_user = IdentityModule::global().passkey_user(account.identity);
    Ok(ApiJson(RenameAccountResponse {
        username: request.username.as_str().to_string(),
        rp_id: passkey_user.rp_id,
        user_id: passkey_user.user_id,
    }))
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
            .map(|passkey| SimplePasskey {
                uuid: AccountPasskeyUuid::from(passkey.uuid),
                label: passkey.label.to_string(),
                created_at: SchemaDateTime(passkey.created_at),
                last_used_at: passkey.last_used_at.map(SchemaDateTime),
            })
            .collect(),
    }))
}

/// Start registering another passkey for the logged-in account
///
/// This is how a second device is added. Unlike the invite flow it needs no token — proving
/// the session is proof enough, and the account already exists.
#[post("/passkeys/start")]
pub async fn start_add_passkey(
    session: Session,
    account: Account,
) -> ApiResult<ApiJson<StartAddPasskeyResponse>> {
    let options = IdentityModule::global()
        .begin_device_enrollment(&session, account.identity, account.username.as_str())
        .await?;

    Ok(ApiJson(StartAddPasskeyResponse { options }))
}

/// Finish registering another passkey for the logged-in account
#[post("/passkeys/finish")]
pub async fn finish_add_passkey(
    session: Session,
    account: Account,
    ApiJson(request): ApiJson<FinishAddPasskeyRequest>,
) -> ApiResult<ApiJson<()>, AddPasskeyErrors> {
    let mut errors = FormErrors::<AddPasskeyErrors>::new();
    let finished = IdentityModule::global()
        .finish_device_enrollment(
            &session,
            account.identity,
            request.credential,
            request.label,
        )
        .await;
    match finished {
        Ok(()) => return Ok(ApiJson(())),
        Err(FinishDeviceEnrollmentError::NoEnrollmentInProgress) => errors.no_ceremony = true,
        Err(FinishDeviceEnrollmentError::MalformedCredential) => errors.malformed_credential = true,
        Err(FinishDeviceEnrollmentError::VerificationFailed) => errors.registration_failed = true,
        Err(FinishDeviceEnrollmentError::AlreadyEnrolled) => errors.already_registered = true,
        Err(FinishDeviceEnrollmentError::ExternalIdentity) => {
            return Err(ApiError::bad_request("An External Account has no passkeys"));
        }
        Err(FinishDeviceEnrollmentError::Internal(error)) => return Err(error.into()),
    }
    errors.fail()
}

/// Rename one of the logged-in account's passkeys
#[put("/passkeys/{uuid}")]
pub async fn rename_passkey(
    account: Account,
    Path(uuid): Path<AccountPasskeyUuid>,
    ApiJson(request): ApiJson<RenamePasskeyRequest>,
) -> ApiResult<ApiJson<()>, RenamePasskeyErrors> {
    let mut errors = FormErrors::<RenamePasskeyErrors>::new();
    let label = request.label.trim();
    if label.is_empty() {
        errors.empty_label = true;
        return errors.fail();
    }
    let label = MaxStr::new(label.to_string())
        .unwrap_or_else(|_| unreachable!("trimming does not make a string longer"));

    let renamed = IdentityModule::global()
        .rename_passkey(Database::global(), account.identity, uuid.into(), label)
        .await?;
    if !renamed {
        errors.unknown_passkey = true;
        return errors.fail();
    }
    Ok(ApiJson(()))
}

/// Delete one of the logged-in account's passkeys
///
/// The last one cannot be deleted: with no passkey left there is no way back into the account,
/// and the invite flow only issues a token while an account has none — which this would not
/// restore, since the account still exists.
#[delete("/passkeys/{uuid}")]
pub async fn delete_passkey(
    account: Account,
    Path(uuid): Path<AccountPasskeyUuid>,
) -> ApiResult<ApiJson<()>, DeletePasskeyErrors> {
    let mut errors = FormErrors::<DeletePasskeyErrors>::new();
    let removed = IdentityModule::global()
        .remove_passkey(account.identity, uuid.into())
        .await;
    match removed {
        Ok(()) => return Ok(ApiJson(())),
        Err(RemovePasskeyError::Refused(RemovalRefused::UnknownPasskey { last_passkey })) => {
            errors.unknown_passkey = true;
            errors.last_passkey = last_passkey;
        }
        Err(RemovePasskeyError::Refused(RemovalRefused::LastPasskey)) => {
            errors.last_passkey = true;
        }
        Err(RemovePasskeyError::Internal(error)) => return Err(error.into()),
    }
    errors.fail()
}

/// Delete the logged-in account
///
/// The account, its passkeys, its collections, its watch lists and every deck
/// it kept to itself are gone for good. What stays are the decks it put on
/// show: those are handed to a tombstone, so a decklist somebody linked to
/// keeps working while nothing points back at the account that built it.
///
/// The request has to spell the account's own username. It is authenticated
/// either way, so this is not what makes the deletion safe: it is what makes it
/// deliberate.
#[delete("/me")]
pub async fn delete_account(
    session: Session,
    account: Account,
    ApiJson(request): ApiJson<DeleteAccountRequest>,
) -> ApiResult<ApiJson<()>, DeleteAccountErrors> {
    let mut errors = FormErrors::<DeleteAccountErrors>::new();
    if !request
        .username
        .eq_ignore_ascii_case(account.username.as_str())
    {
        errors.username_mismatch = true;
        return errors.fail();
    }

    let mut tx = Database::global().start_transaction().await?;
    Account::delete(&mut tx, account.uuid, DeletionMode::Tombstone).await?;
    tx.commit().await?;

    IdentityModule::global()
        .logout(&session)
        .await
        .map_err(ApiError::map_server_error("Failed to flush session"))?;

    Ok(ApiJson(()))
}
