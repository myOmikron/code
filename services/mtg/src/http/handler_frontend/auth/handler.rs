//! Handlers for signup and invite-based passkey registration

use galvyn::core::Module;
use galvyn::core::re_exports::time::OffsetDateTime;
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
use tower_sessions::Expiry;
use tower_sessions::cookie::time::Duration;
use tracing::info;
use webauthn_rs::prelude::CredentialID;
use webauthn_rs::prelude::Passkey;
use webauthn_rs::prelude::PasskeyAuthentication;
use webauthn_rs::prelude::PasskeyRegistration;
use webauthn_rs::prelude::PublicKeyCredential;
use webauthn_rs::prelude::RegisterPublicKeyCredential;

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
use crate::models::account::AccountPasskey;
use crate::models::account::AccountPasskeyInsert;
use crate::models::account::AccountUuid;
use crate::models::account::RegistrationToken;
use crate::models::account::Username;
use crate::modules::webauthn::WebauthnModule;
use crate::modules::webauthn::credential_id_string;
use crate::modules::webauthn::passkey_label;
use crate::modules::webauthn::registration_aaguid;
use crate::modules::webauthn::request_attestation;
use crate::modules::webauthn::require_discoverable_credential;
use crate::utils::mail::send_recovery_link;
use crate::utils::mail::send_registration_link;

/// Session key holding the state of a running registration ceremony
const REGISTRATION_STATE: &str = "webauthn_registration";

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
    // Both fields are reported together rather than one per round-trip.
    errors.check()?;
    tx.commit().await?;

    // Sent after the commit: a failing mail must not roll back the token, and
    // a rolled-back transaction must never produce a live link.
    if let Some((email, username, token)) = invite {
        let link = WebauthnModule::global().registration_link(&token);
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
        // Same answer as the happy path, just without mail.
        info!("Recovery for an unknown username");
        return Ok(ApiJson(()));
    };

    let token = RegistrationToken::create(&mut tx, account.uuid).await?;
    tx.commit().await?;

    // Sent after the commit: a failing mail must not roll back the token, and
    // a rolled-back transaction must never produce a live link.
    let link = WebauthnModule::global().registration_link(&token);
    send_recovery_link(&account.email, &account.username, &link, request.language)
        .await
        .map_err(ApiError::map_server_error("Failed to queue mail"))?;

    Ok(ApiJson(()))
}

/// Decide what a signup request should do, if anything
///
/// Returns the recipient, username, and token of the mail to send.
async fn prepare_signup(
    tx: &mut Transaction,
    request: &SignupRequest,
    errors: &mut FormErrors<SignupErrors>,
) -> ApiResult<Option<(MaxStr<255>, Username, MaxStr<64>)>, SignupErrors> {
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
            errors.username_taken = true;
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

/// How long a remembered session survives without being used
///
/// Long enough that a weekly visitor stays signed in, short enough that a forgotten session on
/// a borrowed machine does not last forever.
const REMEMBER_ME: Duration = Duration::days(30);

/// Session key holding the state of a running login ceremony
const LOGIN_STATE: &str = "webauthn_login";

/// Session key holding the account uuid of a running login ceremony
const LOGIN_ACCOUNT: &str = "webauthn_login_account";

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
    let mut tx = Database::global().start_transaction().await?;
    let account = Account::get_by_username(&mut tx, &request.username).await?;
    let passkeys: Vec<Passkey> = match &account {
        Some(account) => AccountPasskey::get_by_account(&mut tx, account.uuid)
            .await?
            .into_iter()
            .map(|passkey| passkey.credential)
            .collect(),
        None => Vec::new(),
    };
    tx.commit().await?;

    // An unknown username and a username without a passkey give the same answer on purpose:
    // usernames are public, but which of them can actually log in is not worth spelling out.
    let (Some(account), false) = (account, passkeys.is_empty()) else {
        let mut errors = FormErrors::<StartLoginErrors>::new();
        errors.unknown_username = true;
        return errors.fail();
    };

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
) -> ApiResult<ApiJson<()>, FinishLoginErrors> {
    // Both are removed, so a failed attempt cannot be replayed against the same challenge.
    let state: Option<PasskeyAuthentication> = session
        .remove(LOGIN_STATE)
        .await
        .map_err(ApiError::map_server_error("Failed to read session"))?;
    let account_uuid: Option<AccountUuid> = session
        .remove(LOGIN_ACCOUNT)
        .await
        .map_err(ApiError::map_server_error("Failed to read session"))?;

    let mut errors = FormErrors::<FinishLoginErrors>::new();
    let (Some(state), Some(account_uuid)) = (state, account_uuid) else {
        errors.no_ceremony = true;
        return errors.fail();
    };

    let Ok(credential) = serde_json::from_value::<PublicKeyCredential>(request.credential) else {
        errors.malformed_credential = true;
        return errors.fail();
    };

    let Ok(result) = WebauthnModule::global()
        .webauthn
        .finish_passkey_authentication(&credential, &state)
    else {
        errors.authentication_failed = true;
        return errors.fail();
    };

    let mut tx = Database::global().start_transaction().await?;

    let account = Account::get_by_uuid(&mut tx, account_uuid)
        .await?
        .ok_or(ApiError::bad_request("Unknown account"))?;

    // Persist the updated signature counter / backup state on the passkey that was used —
    // that is what lets a cloned authenticator be spotted later. Which one that
    // was is read off the stored credential id rather than off the credential
    // blob beside it, so the row is found even where the two have drifted
    // apart, and the stamp does not depend on the ceremony having changed
    // anything: most authenticators keep their counter at zero forever.
    let used = credential_id_string::<FinishLoginErrors>(result.cred_id())?;
    for passkey in AccountPasskey::get_by_account(&mut tx, account.uuid).await? {
        if passkey.credential_id != used {
            continue;
        }
        let mut credential = passkey.credential.clone();
        credential.update_credential(&result);
        AccountPasskey::update_credential(&mut tx, passkey.uuid, credential).await?;
        break;
    }

    Account::record_login(&mut tx, account.uuid).await?;
    tx.commit().await?;

    account.set_logged_in(&session).await?;
    // Set after the session is authenticated, so an abandoned ceremony cannot leave a
    // long-lived anonymous session behind.
    session.set_expiry(Some(if request.remember_me {
        Expiry::OnInactivity(REMEMBER_ME)
    } else {
        Expiry::OnSessionEnd
    }));

    Ok(ApiJson(()))
}

/// Log out, dropping the session
#[get("/logout")]
pub async fn logout(session: Session) -> ApiResult<()> {
    session
        .flush()
        .await
        .map_err(ApiError::map_server_error("Failed to flush session"))?;
    Ok(())
}

/// Validate a registration token and return it together with its account
async fn validate_token(
    tx: &mut Transaction,
    token: &MaxStr<64>,
    errors: &mut FormErrors<RegistrationErrors>,
) -> ApiResult<Option<(RegistrationToken, Account)>, RegistrationErrors> {
    let Some(registration_token) = RegistrationToken::get_by_token(&mut *tx, token).await? else {
        errors.token_invalid = true;
        return Ok(None);
    };

    if registration_token.used {
        errors.token_used = true;
        return Ok(None);
    }
    if registration_token.expires_at < OffsetDateTime::now_utc() {
        errors.token_expired = true;
        return Ok(None);
    }

    let account = Account::get_by_uuid(&mut *tx, registration_token.account)
        .await?
        .ok_or(ApiError::server_error("Token without account"))?;

    Ok(Some((registration_token, account)))
}

/// Start a passkey registration
#[post("/register/start")]
pub async fn start_registration(
    session: Session,
    ApiJson(request): ApiJson<StartRegistrationRequest>,
) -> ApiResult<ApiJson<StartRegistrationResponse>, RegistrationErrors> {
    let mut errors = FormErrors::<RegistrationErrors>::new();
    let mut tx = Database::global().start_transaction().await?;
    let Some((_token, account)) = validate_token(&mut tx, &request.token, &mut errors).await?
    else {
        return errors.fail();
    };
    let existing = AccountPasskey::get_by_account(&mut tx, account.uuid).await?;
    tx.commit().await?;

    let exclude: Vec<CredentialID> = existing
        .iter()
        .map(|passkey| passkey.credential.cred_id().clone())
        .collect();

    let (mut challenge, state) = WebauthnModule::global()
        .webauthn
        .start_passkey_registration(
            account.uuid.into_inner(),
            account.username.as_str(),
            account.username.as_str(),
            (!exclude.is_empty()).then_some(exclude),
        )
        .map_err(ApiError::map_server_error("Failed to start registration"))?;
    require_discoverable_credential(&mut challenge);
    request_attestation(&mut challenge);

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
) -> ApiResult<ApiJson<()>, RegistrationErrors> {
    let mut errors = FormErrors::<RegistrationErrors>::new();

    let state: Option<PasskeyRegistration> = session
        .remove(REGISTRATION_STATE)
        .await
        .map_err(ApiError::map_server_error("Failed to read session"))?;
    let Some(state) = state else {
        errors.no_ceremony = true;
        return errors.fail();
    };

    let Ok(credential) = serde_json::from_value::<RegisterPublicKeyCredential>(request.credential)
    else {
        errors.malformed_credential = true;
        return errors.fail();
    };

    let mut tx = Database::global().start_transaction().await?;

    let Some((token, account)) = validate_token(&mut tx, &request.token, &mut errors).await? else {
        return errors.fail();
    };

    let Ok(passkey) = WebauthnModule::global()
        .webauthn
        .finish_passkey_registration(&credential, &state)
    else {
        errors.registration_failed = true;
        return errors.fail();
    };

    let existing = AccountPasskey::get_by_account(&mut tx, account.uuid)
        .await?
        .len();

    let inserted = AccountPasskey::insert(
        &mut tx,
        AccountPasskeyInsert {
            account: account.uuid,
            label: passkey_label(registration_aaguid(&credential), existing),
            credential_id: credential_id_string(passkey.cred_id())?,
            credential: passkey,
        },
    )
    .await;
    if inserted.is_err() {
        errors.already_registered = true;
        return errors.fail();
    }

    RegistrationToken::mark_used(&mut tx, token.uuid).await?;

    tx.commit().await?;
    Ok(ApiJson(()))
}
