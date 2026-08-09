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

use crate::http::handler_frontend::collections::schema::CollectionResponse;
use crate::http::handler_frontend::collections::schema::CreateCollectionRequest;
use crate::http::handler_frontend::collections::schema::RotateShareTokenResponse;
use crate::http::handler_frontend::collections::schema::SetCollectionVisibilityRequest;
use crate::http::handler_frontend::collections::schema::UpdateCollectionRequest;
use crate::models::account::Account;
use crate::models::collection::Collection;
use crate::models::collection::CollectionAccess;
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
