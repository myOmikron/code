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
use galvyn::rorm::Database;
use webauthn_rs::prelude::CredentialID;
use webauthn_rs::prelude::PasskeyRegistration;
use webauthn_rs::prelude::RegisterPublicKeyCredential;

use crate::http::handler_frontend::accounts::schema::AddPasskeyErrors;
use crate::http::handler_frontend::accounts::schema::DeleteAccountErrors;
use crate::http::handler_frontend::accounts::schema::DeleteAccountRequest;
use crate::http::handler_frontend::accounts::schema::DeletePasskeyErrors;
use crate::http::handler_frontend::accounts::schema::FinishAddPasskeyRequest;
use crate::http::handler_frontend::accounts::schema::ListPasskeysResponse;
use crate::http::handler_frontend::accounts::schema::MeResponse;
use crate::http::handler_frontend::accounts::schema::SimplePasskey;
use crate::http::handler_frontend::accounts::schema::StartAddPasskeyResponse;
use crate::models::account::Account;
use crate::models::account::AccountPasskey;
use crate::models::account::AccountPasskeyInsert;
use crate::models::account::AccountPasskeyUuid;
use crate::modules::webauthn::WebauthnModule;
use crate::modules::webauthn::credential_id_string;
use crate::modules::webauthn::passkey_label;
use crate::modules::webauthn::registration_aaguid;
use crate::modules::webauthn::request_attestation;
use crate::modules::webauthn::require_discoverable_credential;

/// Session key holding the state of a running add-passkey ceremony
const ADD_PASSKEY_STATE: &str = "webauthn_add_passkey";

/// The account the current session belongs to
#[get("/me")]
pub async fn me(account: Account) -> ApiResult<ApiJson<MeResponse>> {
    Ok(ApiJson(MeResponse {
        uuid: account.uuid,
        username: account.username.as_str().to_string(),
    }))
}

/// List the passkeys of the logged-in account
#[get("/passkeys")]
pub async fn list_passkeys(account: Account) -> ApiResult<ApiJson<ListPasskeysResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let passkeys = AccountPasskey::get_by_account(&mut tx, account.uuid).await?;
    tx.commit().await?;

    Ok(ApiJson(ListPasskeysResponse {
        passkeys: passkeys
            .into_iter()
            .map(|passkey| SimplePasskey {
                uuid: passkey.uuid,
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
    let mut tx = Database::global().start_transaction().await?;
    let existing = AccountPasskey::get_by_account(&mut tx, account.uuid).await?;
    tx.commit().await?;

    // Registering the same authenticator twice would leave the user with two entries for one
    // device and no way to tell them apart.
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
        .insert(ADD_PASSKEY_STATE, state)
        .await
        .map_err(ApiError::map_server_error("Failed to write to session"))?;

    Ok(ApiJson(StartAddPasskeyResponse {
        options: serde_json::to_value(challenge)
            .map_err(ApiError::map_server_error("Failed to serialize challenge"))?,
    }))
}

/// Finish registering another passkey for the logged-in account
#[post("/passkeys/finish")]
pub async fn finish_add_passkey(
    session: Session,
    account: Account,
    ApiJson(request): ApiJson<FinishAddPasskeyRequest>,
) -> ApiResult<ApiJson<()>, AddPasskeyErrors> {
    let mut errors = FormErrors::<AddPasskeyErrors>::new();

    let state: Option<PasskeyRegistration> = session
        .remove(ADD_PASSKEY_STATE)
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

    let Ok(passkey) = WebauthnModule::global()
        .webauthn
        .finish_passkey_registration(&credential, &state)
    else {
        errors.registration_failed = true;
        return errors.fail();
    };

    let mut tx = Database::global().start_transaction().await?;
    let existing = AccountPasskey::get_by_account(&mut tx, account.uuid)
        .await?
        .len();

    let inserted = AccountPasskey::insert(
        &mut tx,
        AccountPasskeyInsert {
            account: account.uuid,
            label: request
                .label
                .unwrap_or_else(|| passkey_label(registration_aaguid(&credential), existing)),
            credential_id: credential_id_string(passkey.cred_id())?,
            credential: passkey,
        },
    )
    .await;
    if inserted.is_err() {
        errors.already_registered = true;
        return errors.fail();
    }

    tx.commit().await?;
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
    let mut tx = Database::global().start_transaction().await?;

    let passkeys = AccountPasskey::get_by_account(&mut tx, account.uuid).await?;
    // Checked against the account's own passkeys, so a stranger's uuid reads as unknown rather
    // than deleting somebody else's device.
    if !passkeys.iter().any(|passkey| passkey.uuid == uuid) {
        errors.unknown_passkey = true;
    }
    if passkeys.len() <= 1 {
        errors.last_passkey = true;
    }
    errors.check()?;

    AccountPasskey::delete(&mut tx, uuid).await?;

    tx.commit().await?;
    Ok(ApiJson(()))
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
    // Case-insensitive, like every other lookup by name.
    if !request
        .username
        .eq_ignore_ascii_case(account.username.as_str())
    {
        errors.username_mismatch = true;
        return errors.fail();
    }

    let mut tx = Database::global().start_transaction().await?;
    Account::delete(&mut tx, account.uuid).await?;
    tx.commit().await?;

    // The session outlives the account it named, and the extractor would answer
    // every later request with a 401 anyway. Dropped here so the browser is not
    // left holding a cookie for somebody who no longer exists.
    session
        .flush()
        .await
        .map_err(ApiError::map_server_error("Failed to flush session"))?;

    Ok(ApiJson(()))
}
