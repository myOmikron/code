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
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use time::OffsetDateTime;
use webauthn_rs::prelude::CredentialID;
use webauthn_rs::prelude::Passkey;
use webauthn_rs::prelude::PasskeyAuthentication;
use webauthn_rs::prelude::PasskeyRegistration;
use webauthn_rs::prelude::PublicKeyCredential;
use webauthn_rs::prelude::RegisterPublicKeyCredential;

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
use crate::models::AccountPasskey;
use crate::models::AccountPasskeyInsert;
use crate::models::AccountPasskeyUuid;
use crate::models::AccountUuid;
use crate::models::RegistrationToken;
use crate::modules::webauthn::WebauthnModule;

/// Session key holding the state of a running login ceremony
const LOGIN_STATE: &str = "webauthn_login";
/// Session key holding the state of a running registration ceremony
const REGISTRATION_STATE: &str = "webauthn_registration";

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

/// Session key holding the account uuid of a running login ceremony
const LOGIN_ACCOUNT: &str = "webauthn_login_account";

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

    let passkeys: Vec<Passkey> = AccountPasskey::get_by_account(Database::global(), account.uuid)
        .await?
        .into_iter()
        .map(|pk| pk.credential)
        .collect();
    if passkeys.is_empty() {
        return Err(ApiError::bad_request("Unknown username or no passkey"));
    }

    let (challenge, state) = WebauthnModule::global()
        .webauthn
        .start_passkey_authentication(&passkeys)
        .map_err(ApiError::map_server_error("Failed to start authentication"))?;

    session
        .insert(LOGIN_STATE, state)
        .await
        .map_err(ApiError::map_server_error("Failed to write to session"))?;
    session
        .insert(LOGIN_ACCOUNT, account.uuid)
        .await
        .map_err(ApiError::map_server_error("Failed to write to session"))?;

    Ok(ApiJson(StartLoginResponse {
        options: serde_json::to_value(challenge)
            .map_err(ApiError::map_server_error("Failed to serialize challenge"))?,
    }))
}

/// Finish a passkey login
///
/// Verifies the browser's credential and logs the account in.
#[post("/login/finish")]
pub async fn finish_login(
    session: Session,
    ApiJson(request): ApiJson<FinishLoginRequest>,
) -> ApiResult<ApiJson<MeResponse>> {
    let state: PasskeyAuthentication = session
        .remove(LOGIN_STATE)
        .await
        .map_err(ApiError::map_server_error("Failed to read session"))?
        .ok_or(ApiError::bad_request("No login ceremony in progress"))?;
    let account_uuid: AccountUuid = session
        .remove(LOGIN_ACCOUNT)
        .await
        .map_err(ApiError::map_server_error("Failed to read session"))?
        .ok_or(ApiError::bad_request("No login ceremony in progress"))?;

    let credential: PublicKeyCredential = serde_json::from_value(request.credential)
        .map_err(|_| ApiError::bad_request("Malformed credential"))?;

    let webauthn = &WebauthnModule::global().webauthn;

    let result = webauthn
        .finish_passkey_authentication(&credential, &state)
        .map_err(|_| ApiError::bad_request("Authentication failed"))?;

    let mut tx = Database::global().start_transaction().await?;

    let account = Account::get_by_uuid(&mut tx, account_uuid)
        .await?
        .ok_or(ApiError::bad_request("Unknown account"))?;

    let passkeys = AccountPasskey::get_by_account(&mut tx, account.uuid).await?;

    // Persist updated counters / backup state on the passkey that was used
    for pk in passkeys {
        let mut credential = pk.credential.clone();
        if credential.update_credential(&result) == Some(true) {
            AccountPasskey::update_credential(&mut tx, pk.uuid, credential).await?;
        }
    }

    Account::record_login(&mut tx, account.uuid).await?;

    tx.commit().await?;

    account.set_logged_in(&session).await?;

    Ok(ApiJson(MeResponse {
        uuid: account.uuid,
        username: account.username.to_string(),
        role: account.role,
    }))
}

/// Validate an invite token and return its account
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

/// Start the registration ceremony shared by invite and add-device flows
fn start_passkey_ceremony(
    account: &Account,
    existing: &[AccountPasskey],
) -> ApiResult<(serde_json::Value, PasskeyRegistration)> {
    let exclude: Vec<CredentialID> = existing
        .iter()
        .map(|pk| pk.credential.cred_id().clone())
        .collect();

    let (challenge, state) = WebauthnModule::global()
        .webauthn
        .start_passkey_registration(
            account.uuid.into_inner(),
            &account.username,
            &account.username,
            (!exclude.is_empty()).then_some(exclude),
        )
        .map_err(ApiError::map_server_error("Failed to start registration"))?;

    let options = serde_json::to_value(challenge)
        .map_err(ApiError::map_server_error("Failed to serialize challenge"))?;
    Ok((options, state))
}

/// Auto-assigned device name for a newly registered passkey.
///
/// The user is not asked for one — "Passkey N" (N counting the account's
/// existing passkeys) is enough to tell devices apart in the management list.
fn default_passkey_label(existing: usize) -> MaxStr<255> {
    MaxStr::new(format!("Passkey {}", existing + 1))
        .unwrap_or_else(|_| unreachable!("short label fits"))
}

/// Store a freshly registered passkey
async fn insert_passkey(
    exe: impl Executor<'_>,
    account: AccountUuid,
    label: MaxStr<255>,
    passkey: Passkey,
) -> ApiResult<()> {
    let credential_id = credential_id_string(passkey.cred_id())?;

    AccountPasskey::insert(
        exe,
        AccountPasskeyInsert {
            account,
            label,
            credential_id,
            credential: passkey,
        },
    )
    .await
    .map_err(|_| ApiError::bad_request("This passkey is already registered"))?;
    Ok(())
}

/// Start an invite-based passkey registration
#[post("/register/start")]
pub async fn start_registration(
    session: Session,
    ApiJson(request): ApiJson<StartRegistrationRequest>,
) -> ApiResult<ApiJson<StartRegistrationResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let (_token, account) = validate_token(&mut tx, &request.token).await?;
    let existing = AccountPasskey::get_by_account(&mut tx, account.uuid).await?;
    tx.commit().await?;

    let (options, state) = start_passkey_ceremony(&account, &existing)?;

    session
        .insert(REGISTRATION_STATE, state)
        .await
        .map_err(ApiError::map_server_error("Failed to write to session"))?;

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
    insert_passkey(
        &mut tx,
        account.uuid,
        default_passkey_label(existing),
        passkey,
    )
    .await?;

    RegistrationToken::mark_used(&mut tx, token.uuid).await?;

    tx.commit().await?;
    Ok(())
}

/// Start adding another passkey to the logged-in account
#[post("/passkeys/start")]
pub async fn start_add_passkey(
    session: Session,
    account: Account,
) -> ApiResult<ApiJson<StartAddPasskeyResponse>> {
    let existing = AccountPasskey::get_by_account(Database::global(), account.uuid).await?;
    let (options, state) = start_passkey_ceremony(&account, &existing)?;

    session
        .insert(REGISTRATION_STATE, state)
        .await
        .map_err(ApiError::map_server_error("Failed to write to session"))?;

    Ok(ApiJson(StartAddPasskeyResponse { options }))
}

/// Finish adding another passkey to the logged-in account
#[post("/passkeys/finish")]
pub async fn finish_add_passkey(
    session: Session,
    account: Account,
    ApiJson(request): ApiJson<FinishAddPasskeyRequest>,
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

    let passkey = WebauthnModule::global()
        .webauthn
        .finish_passkey_registration(&credential, &state)
        .map_err(|_| ApiError::bad_request("Registration failed"))?;

    let existing = AccountPasskey::get_by_account(Database::global(), account.uuid)
        .await?
        .len();
    insert_passkey(
        Database::global(),
        account.uuid,
        default_passkey_label(existing),
        passkey,
    )
    .await?;
    Ok(())
}

/// List the passkeys of the logged-in account
#[get("/passkeys")]
pub async fn list_passkeys(account: Account) -> ApiResult<ApiJson<ListPasskeysResponse>> {
    let passkeys = AccountPasskey::get_by_account(Database::global(), account.uuid).await?;
    Ok(ApiJson(ListPasskeysResponse {
        passkeys: passkeys
            .into_iter()
            .map(|pk| PasskeySchema {
                uuid: pk.uuid,
                label: pk.label.to_string(),
                last_used_at: pk.last_used_at.map(SchemaDateTime),
                created_at: SchemaDateTime(pk.created_at),
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
    let mut tx = Database::global().start_transaction().await?;

    let passkeys = AccountPasskey::get_by_account(&mut tx, account.uuid).await?;
    if !passkeys.iter().any(|pk| pk.uuid == uuid) {
        return Err(ApiError::bad_request("Unknown passkey"));
    }
    if passkeys.len() <= 1 {
        return Err(ApiError::bad_request(
            "Cannot delete the last passkey of an account",
        ));
    }

    AccountPasskey::delete(&mut tx, uuid).await?;

    tx.commit().await?;
    Ok(())
}

/// Log out of the current session
#[get("/logout")]
pub async fn logout(session: Session) -> ApiResult<()> {
    session
        .delete()
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
