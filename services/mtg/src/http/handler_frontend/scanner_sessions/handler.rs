//! Handlers for persisted scanner sessions

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::delete;
use galvyn::get;
use galvyn::patch;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;

use crate::http::handler_frontend::scanner_sessions::schema::AddScannerSessionEntryRequest;
use crate::http::handler_frontend::scanner_sessions::schema::CreateScannerSessionRequest;
use crate::http::handler_frontend::scanner_sessions::schema::FileScannerSessionRequest;
use crate::http::handler_frontend::scanner_sessions::schema::FileScannerSessionResponse;
use crate::http::handler_frontend::scanner_sessions::schema::ListScannerSessionsResponse;
use crate::http::handler_frontend::scanner_sessions::schema::ScannerSessionDetailResponse;
use crate::http::handler_frontend::scanner_sessions::schema::ScannerSessionEntryResponse;
use crate::http::handler_frontend::scanner_sessions::schema::ScannerSessionResponse;
use crate::http::handler_frontend::scanner_sessions::schema::UpdateScannerSessionEntryRequest;
use crate::http::handler_frontend::scanner_sessions::schema::UpdateScannerSessionRequest;
use crate::models::account::Account;
use crate::models::card_attributes::CardCondition;
use crate::models::collection::Collection;
use crate::models::collection::CollectionAccess;
use crate::models::collection::CollectionEntry;
use crate::models::collection::CollectionEntryInsert;
use crate::models::scanner_session::ScannerSession;
use crate::models::scanner_session::ScannerSessionAccess;
use crate::models::scanner_session::ScannerSessionEntry;
use crate::models::scanner_session::ScannerSessionEntryInsert;
use crate::models::scanner_session::ScannerSessionEntryPatch;
use crate::models::scanner_session::ScannerSessionEntryUuid;
use crate::models::scanner_session::ScannerSessionInsert;
use crate::models::scanner_session::ScannerSessionUpdate;
use crate::models::scanner_session::ScannerSessionUuid;

/// List every scanner session and its current staging count
#[get("/")]
pub async fn get_all_scanner_sessions(
    account: Account,
) -> ApiResult<ApiJson<ListScannerSessionsResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let sessions = ScannerSession::get_all(&mut tx, account.uuid).await?;
    let mut responses = Vec::with_capacity(sessions.len());
    for session in sessions {
        let entries = ScannerSessionEntry::get_all(&mut tx, session.uuid).await?;
        responses.push(ScannerSessionResponse::new(session, &entries));
    }
    tx.commit().await?;
    Ok(ApiJson(ListScannerSessionsResponse {
        sessions: responses,
    }))
}

/// Start a new persisted scanner session
#[post("/")]
pub async fn create_scanner_session(
    account: Account,
    ApiJson(request): ApiJson<CreateScannerSessionRequest>,
) -> ApiResult<ApiJson<ScannerSessionResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    ensure_collection(&mut tx, account.uuid, request.collection).await?;
    let session = ScannerSession::create(
        &mut tx,
        account.uuid,
        ScannerSessionInsert {
            name: request.name,
            color: request.color,
            icon: request.icon,
            collection: request.collection,
        },
    )
    .await?;
    tx.commit().await?;
    Ok(ApiJson(ScannerSessionResponse::new(session, &[])))
}

/// Read one session from any signed-in device
#[get("/{session}")]
pub async fn get_scanner_session(
    account: Account,
    Path(session_uuid): Path<ScannerSessionUuid>,
) -> ApiResult<ApiJson<ScannerSessionDetailResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let session = owned_session(&mut tx, account.uuid, session_uuid).await?;
    let entries = ScannerSessionEntry::get_all(&mut tx, session_uuid).await?;
    let response = ScannerSessionDetailResponse {
        session: ScannerSessionResponse::new(session, &entries),
        entries: entries
            .into_iter()
            .map(ScannerSessionEntryResponse::from)
            .collect(),
    };
    tx.commit().await?;
    Ok(ApiJson(response))
}

/// Rename a session or change its marker and preferred collection
#[put("/{session}")]
pub async fn update_scanner_session(
    account: Account,
    Path(session_uuid): Path<ScannerSessionUuid>,
    ApiJson(request): ApiJson<UpdateScannerSessionRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;
    ensure_collection(&mut tx, account.uuid, request.collection).await?;
    match ScannerSession::update(
        &mut tx,
        account.uuid,
        session_uuid,
        ScannerSessionUpdate {
            name: request.name,
            color: request.color,
            icon: request.icon,
            collection: request.collection,
        },
    )
    .await?
    {
        ScannerSessionAccess::Granted(()) => {}
        ScannerSessionAccess::Denied => return denied(),
    }
    tx.commit().await?;
    Ok(ApiJson(()))
}

/// Delete a session and its staging area
#[delete("/{session}")]
pub async fn delete_scanner_session(
    account: Account,
    Path(session_uuid): Path<ScannerSessionUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;
    match ScannerSession::delete(&mut tx, account.uuid, session_uuid).await? {
        ScannerSessionAccess::Granted(()) => {}
        ScannerSessionAccess::Denied => return denied(),
    }
    tx.commit().await?;
    Ok(ApiJson(()))
}

/// Add scanned copies to a session
#[post("/{session}/entries")]
pub async fn add_scanner_session_entry(
    account: Account,
    Path(session_uuid): Path<ScannerSessionUuid>,
    ApiJson(request): ApiJson<AddScannerSessionEntryRequest>,
) -> ApiResult<ApiJson<ScannerSessionEntryResponse>> {
    if request.quantity < 1 {
        return Err(ApiError::bad_request(
            "A staged stack holds at least one copy",
        ));
    }
    if request.purchase_price_cents.is_some_and(|price| price < 0) {
        return Err(ApiError::bad_request("A purchase price cannot be negative"));
    }
    let mut tx = Database::global().start_transaction().await?;
    owned_session(&mut tx, account.uuid, session_uuid).await?;
    let entry = ScannerSessionEntry::create(
        &mut tx,
        session_uuid,
        ScannerSessionEntryInsert {
            printing: request.printing,
            quantity: request.quantity,
            finish: request.finish,
            signed: request.signed,
            purchase_price_cents: request.purchase_price_cents,
        },
    )
    .await?;
    tx.commit().await?;
    Ok(ApiJson(ScannerSessionEntryResponse::from(entry)))
}

/// Adjust count, finish, signed state, paid price or printing
#[patch("/{session}/entries/{entry}")]
pub async fn update_scanner_session_entry(
    account: Account,
    Path((session_uuid, entry_uuid)): Path<(ScannerSessionUuid, ScannerSessionEntryUuid)>,
    ApiJson(request): ApiJson<UpdateScannerSessionEntryRequest>,
) -> ApiResult<ApiJson<ScannerSessionEntryResponse>> {
    if request.quantity.is_some_and(|quantity| quantity < 1) {
        return Err(ApiError::bad_request(
            "A staged stack holds at least one copy",
        ));
    }
    if request
        .purchase_price_cents
        .flatten()
        .is_some_and(|price| price < 0)
    {
        return Err(ApiError::bad_request("A purchase price cannot be negative"));
    }
    let mut tx = Database::global().start_transaction().await?;
    owned_session(&mut tx, account.uuid, session_uuid).await?;
    let entry = match ScannerSessionEntry::update(
        &mut tx,
        session_uuid,
        entry_uuid,
        ScannerSessionEntryPatch {
            printing: request.printing,
            quantity: request.quantity,
            finish: request.finish,
            signed: request.signed,
            purchase_price_cents: request.purchase_price_cents,
        },
    )
    .await?
    {
        ScannerSessionAccess::Granted(entry) => entry,
        ScannerSessionAccess::Denied => return denied(),
    };
    tx.commit().await?;
    Ok(ApiJson(ScannerSessionEntryResponse::from(entry)))
}

/// Remove a staged stack
#[delete("/{session}/entries/{entry}")]
pub async fn delete_scanner_session_entry(
    account: Account,
    Path((session_uuid, entry_uuid)): Path<(ScannerSessionUuid, ScannerSessionEntryUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;
    owned_session(&mut tx, account.uuid, session_uuid).await?;
    match ScannerSessionEntry::delete(&mut tx, session_uuid, entry_uuid).await? {
        ScannerSessionAccess::Granted(()) => {}
        ScannerSessionAccess::Denied => return denied(),
    }
    tx.commit().await?;
    Ok(ApiJson(()))
}

/// Atomically file every staged stack and empty the session
#[post("/{session}/file")]
pub async fn file_scanner_session(
    account: Account,
    Path(session_uuid): Path<ScannerSessionUuid>,
    ApiJson(request): ApiJson<FileScannerSessionRequest>,
) -> ApiResult<ApiJson<FileScannerSessionResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let session = owned_session(&mut tx, account.uuid, session_uuid).await?;
    let collection = request
        .collection
        .or(session.collection)
        .ok_or_else(|| ApiError::bad_request("Choose a collection first"))?;
    ensure_collection(&mut tx, account.uuid, Some(collection)).await?;
    let entries = ScannerSessionEntry::get_all(&mut tx, session_uuid).await?;
    let copies = entries.iter().map(|entry| i64::from(entry.quantity)).sum();
    let stacks = entries.len() as i64;
    // Folded into the stack each card belongs to rather than laid down beside
    // it. `create_many` would keep every filing its own row, which is right for
    // an import naming what it imported and wrong here: a box is sorted in
    // sittings, and the second stack of Lightning Bolt out of the same box is
    // the same stack. Price and date fold with them, so the numbers keep
    // describing every copy.
    for entry in &entries {
        CollectionEntry::file_into(
            &mut tx,
            collection,
            CollectionEntryInsert {
                printing: entry.printing,
                quantity: entry.quantity,
                condition: CardCondition::NearMint,
                finish: entry.finish,
                signed: entry.signed,
                purchase_price_cents: entry.purchase_price_cents,
                acquired_at: None,
            },
            None,
        )
        .await?;
    }
    ScannerSessionEntry::clear(&mut tx, session_uuid).await?;
    if session.collection != Some(collection) {
        match ScannerSession::update(
            &mut tx,
            account.uuid,
            session_uuid,
            ScannerSessionUpdate {
                name: session.name,
                color: session.color,
                icon: session.icon,
                collection: Some(collection),
            },
        )
        .await?
        {
            ScannerSessionAccess::Granted(()) => {}
            ScannerSessionAccess::Denied => return denied(),
        }
    }
    tx.commit().await?;
    Ok(ApiJson(FileScannerSessionResponse {
        collection,
        stacks,
        copies,
    }))
}

async fn owned_session(
    tx: &mut galvyn::rorm::db::transaction::Transaction,
    owner: crate::models::account::AccountUuid,
    session: ScannerSessionUuid,
) -> ApiResult<ScannerSession> {
    ScannerSession::get(tx, owner, session)
        .await?
        .ok_or_else(|| ApiError::bad_request("Request was denied"))
}

async fn ensure_collection(
    tx: &mut galvyn::rorm::db::transaction::Transaction,
    owner: crate::models::account::AccountUuid,
    collection: Option<crate::models::collection::CollectionUuid>,
) -> ApiResult<()> {
    let Some(collection) = collection else {
        return Ok(());
    };
    match Collection::may_administer(tx, collection, owner).await? {
        CollectionAccess::Granted(()) => Ok(()),
        CollectionAccess::Denied => Err(ApiError::bad_request("Request was denied")),
    }
}

fn denied<T>() -> ApiResult<T> {
    Err(ApiError::bad_request("Request was denied"))
}
