//! Handlers for signup and invite-based passkey registration

use galvyn::core::Module;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::post;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use tracing::info;
use webauthn_rs::prelude::CredentialID;
use webauthn_rs::prelude::PasskeyRegistration;
use webauthn_rs::prelude::RegisterPublicKeyCredential;

use crate::http::handler_frontend::auth::schema::FinishRegistrationRequest;
use crate::http::handler_frontend::auth::schema::SignupRequest;
use crate::http::handler_frontend::auth::schema::StartRegistrationRequest;
use crate::http::handler_frontend::auth::schema::StartRegistrationResponse;
use crate::models::accounts::Account;
use crate::models::accounts::AccountPasskey;
use crate::models::accounts::AccountPasskeyInsert;
use crate::models::accounts::RegistrationToken;
use crate::models::accounts::Username;
use crate::modules::webauthn::WebauthnModule;
use crate::utils::mail::send_registration_link;

/// Session key holding the state of a running registration ceremony
const REGISTRATION_STATE: &str = "webauthn_registration";

/// Sign up for a new account
///
/// Always answers `200`, whether or not anything was created: the response
/// must not reveal which usernames or email addresses are taken.
///
/// A link is only ever sent to the address stored on the account, never to
/// the one in the request, so this endpoint cannot be used to mail a third
/// party.
#[post("/signup")]
pub async fn signup(ApiJson(request): ApiJson<SignupRequest>) -> ApiResult<()> {
    if !is_plausible_email(&request.email) {
        return Err(ApiError::bad_request("Malformed email address"));
    }

    let mut tx = Database::global().start_transaction().await?;
    let invite = prepare_signup(&mut tx, &request).await?;
    tx.commit().await?;

    // Sent after the commit: a failing mail must not roll back the token, and
    // a rolled-back transaction must never produce a live link.
    if let Some((email, username, token)) = invite {
        let link = WebauthnModule::global().registration_link(&token);
        send_registration_link(&email, &username, &link)
            .await
            .map_err(ApiError::map_server_error("Failed to queue mail"))?;
    }

    Ok(())
}

/// Decide what a signup request should do, if anything
///
/// Returns the recipient, username and token of the mail to send.
async fn prepare_signup(
    tx: &mut Transaction,
    request: &SignupRequest,
) -> ApiResult<Option<(MaxStr<255>, Username, MaxStr<64>)>> {
    if let Some(account) = Account::get_by_username(&mut *tx, &request.username).await? {
        // The username is taken. Re-issue a token only while the account has
        // no passkey yet — that is the "my invite mail got lost" case. Once a
        // passkey exists the account is somebody's, and a stranger typing the
        // username must not be able to trigger mail to them.
        let has_passkey = !AccountPasskey::get_by_account(&mut *tx, account.uuid)
            .await?
            .is_empty();
        if has_passkey {
            info!("Signup for a username that is already registered");
            return Ok(None);
        }

        let token = RegistrationToken::create(&mut *tx, account.uuid).await?;
        return Ok(Some((account.email, account.username, token)));
    }

    // The email is unique too, and just as unrevealable.
    if Account::get_by_email(&mut *tx, &request.email)
        .await?
        .is_some()
    {
        info!("Signup for an email address that is already in use");
        return Ok(None);
    }

    let uuid = Account::insert(&mut *tx, request.username.clone(), request.email.clone()).await?;
    let token = RegistrationToken::create(&mut *tx, uuid).await?;

    Ok(Some((
        request.email.clone(),
        request.username.clone(),
        token,
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

/// Validate a registration token and return it together with its account
async fn validate_token(
    tx: &mut Transaction,
    token: &MaxStr<64>,
) -> ApiResult<(RegistrationToken, Account)> {
    let registration_token = RegistrationToken::get_by_token(&mut *tx, token)
        .await?
        .ok_or(ApiError::bad_request("Invalid registration token"))?;

    if registration_token.used {
        return Err(ApiError::bad_request("Registration token already used"));
    }
    if registration_token.expires_at < OffsetDateTime::now_utc() {
        return Err(ApiError::bad_request("Registration token expired"));
    }

    let account = Account::get_by_uuid(&mut *tx, registration_token.account)
        .await?
        .ok_or(ApiError::server_error("Token without account"))?;

    Ok((registration_token, account))
}

/// Start a passkey registration
#[post("/register/start")]
pub async fn start_registration(
    session: Session,
    ApiJson(request): ApiJson<StartRegistrationRequest>,
) -> ApiResult<ApiJson<StartRegistrationResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let (_token, account) = validate_token(&mut tx, &request.token).await?;
    let existing = AccountPasskey::get_by_account(&mut tx, account.uuid).await?;
    tx.commit().await?;

    let exclude: Vec<CredentialID> = existing
        .iter()
        .map(|passkey| passkey.credential.cred_id().clone())
        .collect();

    let (challenge, state) = WebauthnModule::global()
        .webauthn
        .start_passkey_registration(
            account.uuid.into_inner(),
            account.username.as_str(),
            account.username.as_str(),
            (!exclude.is_empty()).then_some(exclude),
        )
        .map_err(ApiError::map_server_error("Failed to start registration"))?;

    session
        .insert(REGISTRATION_STATE, state)
        .await
        .map_err(ApiError::map_server_error("Failed to write to session"))?;

    Ok(ApiJson(StartRegistrationResponse {
        username: account.username.as_str().to_string(),
        options: serde_json::to_value(challenge)
            .map_err(ApiError::map_server_error("Failed to serialize challenge"))?,
    }))
}

/// Finish a passkey registration
#[post("/register/finish")]
pub async fn finish_registration(
    session: Session,
    ApiJson(request): ApiJson<FinishRegistrationRequest>,
) -> ApiResult<()> {
    let state: PasskeyRegistration = session
        .remove(REGISTRATION_STATE)
        .await
        .map_err(ApiError::map_server_error("Failed to read session"))?
        .ok_or(ApiError::bad_request(
            "No registration ceremony in progress",
        ))?;

    let credential: RegisterPublicKeyCredential = serde_json::from_value(request.credential)
        .map_err(|_| ApiError::bad_request("Malformed credential"))?;

    let mut tx = Database::global().start_transaction().await?;

    let (token, account) = validate_token(&mut tx, &request.token).await?;

    let passkey = WebauthnModule::global()
        .webauthn
        .finish_passkey_registration(&credential, &state)
        .map_err(|_| ApiError::bad_request("Registration failed"))?;

    let existing = AccountPasskey::get_by_account(&mut tx, account.uuid)
        .await?
        .len();

    AccountPasskey::insert(
        &mut tx,
        AccountPasskeyInsert {
            account: account.uuid,
            label: default_passkey_label(existing),
            credential_id: credential_id_string(passkey.cred_id())?,
            credential: passkey,
        },
    )
    .await
    .map_err(|_| ApiError::bad_request("This passkey is already registered"))?;

    RegistrationToken::mark_used(&mut tx, token.uuid).await?;

    tx.commit().await?;
    Ok(())
}

/// Auto-assigned device name for a newly registered passkey
///
/// The user is not asked for one — "Passkey N" (N counting the account's
/// existing passkeys) is enough to tell devices apart later.
fn default_passkey_label(existing: usize) -> MaxStr<255> {
    MaxStr::new(format!("Passkey {}", existing + 1))
        .unwrap_or_else(|_| unreachable!("short label fits"))
}

/// Extract the base64url credential id of a passkey
fn credential_id_string(cred_id: &CredentialID) -> ApiResult<MaxStr<1024>> {
    let value = serde_json::to_value(cred_id).map_err(ApiError::map_server_error(
        "Failed to serialize credential id",
    ))?;
    let string = value
        .as_str()
        .ok_or(ApiError::server_error("Credential id is not a string"))?;
    MaxStr::new(string.to_string()).map_err(|_| ApiError::server_error("Credential id too long"))
}
