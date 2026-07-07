//! Common handlers for credential resets via 6-digit code or UUID link

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::FormResult;
use galvyn::core::stuff::schema::SingleUuid;
use galvyn::get;
use galvyn::post;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;
use zxcvbn::Score;
use zxcvbn::zxcvbn;

use crate::http::handler_frontend::credential_reset::ResetPasswordError;
use crate::http::handler_frontend::credential_reset::ResetPasswordRequest;
use crate::http::handler_frontend::credential_reset::VerifyResetCodeResponse;
use crate::models::account::Account;
use crate::models::club::Club;
use crate::models::credential_reset::CredentialReset;
use crate::models::credential_reset::CredentialResetUuid;
use crate::modules::mailcow::Mailcow;

fn display_name_of(account: &Account) -> MaxStr<255> {
    match account {
        Account::ClubMember(a) => a.display_name.clone(),
        Account::ClubAdmin(a) => a.display_name.clone(),
        Account::Superadmin(a) => a.display_name.clone(),
    }
}

fn do_reset(
    account: &mut Account,
    password: &MaxStr<72>,
) -> Result<(), ApiJson<FormResult<(), ResetPasswordError>>> {
    let [display_name, username] = match account {
        Account::ClubMember(a) => [
            a.display_name.clone().into_inner(),
            a.username.clone().into_inner(),
        ],
        Account::ClubAdmin(a) => [
            a.display_name.clone().into_inner(),
            a.username.clone().into_inner(),
        ],
        Account::Superadmin(a) => [
            a.display_name.clone().into_inner(),
            a.username.clone().into_inner(),
        ],
    };

    let entropy = zxcvbn(password, &[&display_name, &username]);
    if entropy.score() < Score::Three {
        return Err(ApiJson(FormResult::err(ResetPasswordError {
            low_entropy: true,
            ..Default::default()
        })));
    }

    Ok(())
}

// --- Code-based endpoints ---

#[get("/{code}")]
#[instrument(name = "Api::common::verify_reset_code")]
pub async fn verify_code(
    Path(code): Path<MaxStr<6>>,
) -> ApiResult<ApiJson<VerifyResetCodeResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let (_reset, account) = CredentialReset::find_by_code(&mut tx, &code)
        .await?
        .ok_or(ApiError::bad_request("Invalid or expired code"))?;

    tx.commit().await?;

    Ok(ApiJson(VerifyResetCodeResponse {
        display_name: display_name_of(&account),
    }))
}

#[post("/{code}/reset")]
#[instrument(name = "Api::common::reset_password_by_code", skip(password))]
pub async fn reset_password(
    Path(code): Path<MaxStr<6>>,
    ApiJson(ResetPasswordRequest { password }): ApiJson<ResetPasswordRequest>,
) -> ApiResult<ApiJson<FormResult<(), ResetPasswordError>>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some((reset, mut account)) = CredentialReset::find_by_code(&mut tx, &code).await? else {
        return Ok(ApiJson(FormResult::err(ResetPasswordError {
            invalid_code: true,
            ..Default::default()
        })));
    };

    if password.is_empty() {
        return Err(ApiError::bad_request("Empty password"));
    }

    if let Err(err) = do_reset(&mut account, &password) {
        return Ok(err);
    }

    account.set_password(&mut tx, &password).await?;
    CredentialReset::delete_by_uuid(&mut tx, reset.uuid).await?;

    let mut app_password_mailbox = None;
    if let Account::ClubMember(ref member) = account {
        let club = Club::find_by_uuid(&mut tx, member.club)
            .await?
            .ok_or(ApiError::server_error("Club should exist"))?;

        if !club.use_xauth {
            app_password_mailbox = Some(member.email.clone());
        }
    }

    tx.commit().await?;

    if let Some(member_mailbox) = app_password_mailbox {
        Mailcow::global().create_app_password(member_mailbox);
    }

    Ok(ApiJson(FormResult::ok(())))
}

// --- UUID-based endpoints ---

#[get("/by-uuid/{uuid}")]
#[instrument(name = "Api::common::verify_reset_uuid")]
pub async fn verify_uuid(
    Path(SingleUuid { uuid }): Path<SingleUuid>,
) -> ApiResult<ApiJson<VerifyResetCodeResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let (_reset, account) = CredentialReset::find_by_uuid(&mut tx, CredentialResetUuid(uuid))
        .await?
        .ok_or(ApiError::bad_request("Invalid or expired reset link"))?;

    tx.commit().await?;

    Ok(ApiJson(VerifyResetCodeResponse {
        display_name: display_name_of(&account),
    }))
}

#[post("/by-uuid/{uuid}/reset")]
#[instrument(name = "Api::common::reset_password_by_uuid", skip(password))]
pub async fn reset_password_by_uuid(
    Path(SingleUuid { uuid }): Path<SingleUuid>,
    ApiJson(ResetPasswordRequest { password }): ApiJson<ResetPasswordRequest>,
) -> ApiResult<ApiJson<FormResult<(), ResetPasswordError>>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some((reset, mut account)) =
        CredentialReset::find_by_uuid(&mut tx, CredentialResetUuid(uuid)).await?
    else {
        return Ok(ApiJson(FormResult::err(ResetPasswordError {
            invalid_code: true,
            ..Default::default()
        })));
    };

    if password.is_empty() {
        return Err(ApiError::bad_request("Empty password"));
    }

    if let Err(err) = do_reset(&mut account, &password) {
        return Ok(err);
    }

    account.set_password(&mut tx, &password).await?;
    CredentialReset::delete_by_uuid(&mut tx, reset.uuid).await?;

    let mut app_password_mailbox = None;
    if let Account::ClubMember(ref member) = account {
        let club = Club::find_by_uuid(&mut tx, member.club)
            .await?
            .ok_or(ApiError::server_error("Club should exist"))?;

        if !club.use_xauth {
            app_password_mailbox = Some(member.email.clone());
        }
    }

    tx.commit().await?;

    if let Some(member_mailbox) = app_password_mailbox {
        Mailcow::global().create_app_password(member_mailbox);
    }

    Ok(ApiJson(FormResult::ok(())))
}
