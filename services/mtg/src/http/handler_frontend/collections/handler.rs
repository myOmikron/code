use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;

use crate::http::handler_frontend::collections::schema::AddCollectionEntriesRequest;
use crate::http::handler_frontend::collections::schema::CollectionEntryResponse;
use crate::http::handler_frontend::collections::schema::CollectionResponse;
use crate::http::handler_frontend::collections::schema::CreateCollectionRequest;
use crate::http::handler_frontend::collections::schema::ListCollectionEntriesResponse;
use crate::http::handler_frontend::collections::schema::RotateShareTokenResponse;
use crate::http::handler_frontend::collections::schema::SetCollectionVisibilityRequest;
use crate::http::handler_frontend::collections::schema::SetEntryQuantityRequest;
use crate::http::handler_frontend::collections::schema::UpdateCollectionRequest;
use crate::models::account::Account;
use crate::models::collection::Collection;
use crate::models::collection::CollectionAccess;
use crate::models::collection::CollectionEntry;
use crate::models::collection::CollectionEntryInsert;
use crate::models::collection::CollectionEntryUuid;
use crate::models::collection::CollectionInsert;
use crate::models::collection::CollectionUuid;

#[get("/")]
pub async fn get_all_collections(account: Account) -> ApiResult<ApiJson<Vec<CollectionResponse>>> {
    let mut tx = Database::global().start_transaction().await?;

    let res = Collection::get_all_for_account(&mut tx, account.uuid)
        .await?
        .into_iter()
        .map(CollectionResponse::from)
        .collect();

    tx.commit().await?;

    Ok(ApiJson(res))
}

#[post("/")]
pub async fn create_collection(
    account: Account,
    ApiJson(CreateCollectionRequest {
        name,
        description,
        visibility,
    }): ApiJson<CreateCollectionRequest>,
) -> ApiResult<ApiJson<CollectionResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let collection = Collection::create(
        &mut tx,
        account.uuid,
        CollectionInsert {
            name,
            description,
            visibility,
        },
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(CollectionResponse::from(collection)))
}

/// Change who may see a collection
#[post("/{collection}")]
pub async fn set_visibility_collection(
    account: Account,
    Path(collection_uuid): Path<CollectionUuid>,
    ApiJson(SetCollectionVisibilityRequest { visibility }): ApiJson<SetCollectionVisibilityRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match Collection::set_visibility(&mut tx, account.uuid, collection_uuid, visibility).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;
    Ok(ApiJson(()))
}

#[put("/{collection}")]
pub async fn update_collection(
    account: Account,
    Path(collection_uuid): Path<CollectionUuid>,
    ApiJson(UpdateCollectionRequest { name, description }): ApiJson<UpdateCollectionRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match Collection::update(&mut tx, account.uuid, collection_uuid, name, description).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

#[delete("/{collection}")]
pub async fn delete_collection(
    account: Account,
    Path(collection_uuid): Path<CollectionUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match Collection::delete(&mut tx, account.uuid, collection_uuid).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Mint a fresh secret for a collection's share link
///
/// Invalidates every link handed out so far. Does not change the visibility —
/// a token only resolves while the collection is `Unlisted`.
#[post("/{collection}/share-token")]
pub async fn rotate_share_token(
    account: Account,
    Path(collection_uuid): Path<CollectionUuid>,
) -> ApiResult<ApiJson<RotateShareTokenResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let share_token =
        match Collection::rotate_share_token(&mut tx, account.uuid, collection_uuid).await? {
            CollectionAccess::Granted(token) => token,
            CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
        };

    tx.commit().await?;

    Ok(ApiJson(RotateShareTokenResponse { share_token }))
}

/// List the stacks filed in a collection
#[get("/{collection}/entries")]
pub async fn list_collection_entries(
    account: Account,
    Path(collection_uuid): Path<CollectionUuid>,
) -> ApiResult<ApiJson<ListCollectionEntriesResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let entries = CollectionEntry::get_all_in_collection(&mut tx, account.uuid, collection_uuid)
        .await?
        .into_iter()
        .map(CollectionEntryResponse::from)
        .collect();

    tx.commit().await?;

    Ok(ApiJson(ListCollectionEntriesResponse { entries }))
}

/// File stacks of cards into a collection
#[post("/{collection}/entries")]
pub async fn add_collection_entries(
    account: Account,
    Path(collection_uuid): Path<CollectionUuid>,
    ApiJson(AddCollectionEntriesRequest { entries }): ApiJson<AddCollectionEntriesRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    // The insert cannot carry the ownership condition itself, so it is checked
    // first — inside the same transaction, so nothing can change in between.
    match Collection::may_administer(&mut tx, collection_uuid, account.uuid).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    let inserts = entries
        .into_iter()
        .map(|entry| CollectionEntryInsert {
            printing: entry.printing,
            quantity: entry.quantity,
            condition: entry.condition,
            finish: entry.finish,
            purchase_price_cents: entry.purchase_price_cents,
            acquired_at: entry.acquired_at.map(|date| date.0),
        })
        .collect();
    CollectionEntry::create_many(&mut tx, collection_uuid, inserts).await?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Change how many copies a stack holds
#[put("/{collection}/entries/{entry}")]
pub async fn set_entry_quantity(
    account: Account,
    Path((collection_uuid, entry_uuid)): Path<(CollectionUuid, CollectionEntryUuid)>,
    ApiJson(SetEntryQuantityRequest { quantity }): ApiJson<SetEntryQuantityRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match Collection::may_administer(&mut tx, collection_uuid, account.uuid).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    match CollectionEntry::set_quantity(&mut tx, collection_uuid, entry_uuid, quantity).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Remove a stack from a collection
#[delete("/{collection}/entries/{entry}")]
pub async fn delete_collection_entry(
    account: Account,
    Path((collection_uuid, entry_uuid)): Path<(CollectionUuid, CollectionEntryUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match Collection::may_administer(&mut tx, collection_uuid, account.uuid).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    match CollectionEntry::delete(&mut tx, collection_uuid, entry_uuid).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}
