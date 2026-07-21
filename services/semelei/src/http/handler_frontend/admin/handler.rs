//! Handlers of the admin endpoints

use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;

use crate::http::handler_frontend::admin::schema::AccountSchema;
use crate::http::handler_frontend::admin::schema::AdminItem;
use crate::http::handler_frontend::admin::schema::CategoryRequest;
use crate::http::handler_frontend::admin::schema::CreateAccountRequest;
use crate::http::handler_frontend::admin::schema::InviteResponse;
use crate::http::handler_frontend::admin::schema::ItemRequest;
use crate::http::handler_frontend::admin::schema::ListAccountsResponse;
use crate::http::handler_frontend::admin::schema::ListAdminItemsResponse;
use crate::http::handler_frontend::admin::schema::SetItemImageRequest;
use crate::http::handler_frontend::admin::schema::UpdateAccountRequest;
use crate::http::handler_frontend::shop::schema::ListCategoriesResponse;
use crate::http::handler_frontend::shop::schema::PublicCategory;
use crate::models::Account;
use crate::models::AccountUuid;
use crate::models::Category;
use crate::models::CategoryUuid;
use crate::models::Item;
use crate::models::ItemData;
use crate::models::ItemUuid;
use crate::models::RegistrationToken;
use crate::models::Role;
use crate::modules::webauthn::WebauthnModule;

// ------------- //
//  Categories   //
// ------------- //

/// List all categories
#[get("/categories")]
pub async fn list_categories() -> ApiResult<ApiJson<ListCategoriesResponse>> {
    let categories = Category::get_all(Database::global()).await?;
    Ok(ApiJson(ListCategoriesResponse {
        categories: categories
            .into_iter()
            .map(|c| PublicCategory {
                uuid: c.uuid,
                name: c.name.to_string(),
            })
            .collect(),
    }))
}

/// Create a category
#[post("/categories")]
pub async fn create_category(
    ApiJson(request): ApiJson<CategoryRequest>,
) -> ApiResult<ApiJson<CategoryUuid>> {
    if request.name.trim().is_empty() {
        return Err(ApiError::bad_request("Name must not be empty"));
    }
    let uuid = Category::insert(Database::global(), request.name)
        .await
        .map_err(|_| ApiError::bad_request("A category with this name exists already"))?;
    Ok(ApiJson(uuid))
}

/// Rename a category
#[put("/categories/{uuid}")]
pub async fn update_category(
    Path(uuid): Path<CategoryUuid>,
    ApiJson(request): ApiJson<CategoryRequest>,
) -> ApiResult<()> {
    if request.name.trim().is_empty() {
        return Err(ApiError::bad_request("Name must not be empty"));
    }
    let found = Category::rename(Database::global(), uuid, request.name)
        .await
        .map_err(|_| ApiError::bad_request("A category with this name exists already"))?;
    if !found {
        return Err(ApiError::bad_request("Unknown category"));
    }
    Ok(())
}

/// Delete a category
///
/// Items of the category are kept (their category is set to null).
#[delete("/categories/{uuid}")]
pub async fn delete_category(Path(uuid): Path<CategoryUuid>) -> ApiResult<()> {
    if !Category::delete(Database::global(), uuid).await? {
        return Err(ApiError::bad_request("Unknown category"));
    }
    Ok(())
}

// ------------- //
//    Items      //
// ------------- //

/// List all items, including inactive ones
#[get("/items")]
pub async fn list_items() -> ApiResult<ApiJson<ListAdminItemsResponse>> {
    let items = Item::get_all(Database::global()).await?;
    Ok(ApiJson(ListAdminItemsResponse {
        items: items
            .into_iter()
            .map(|i| AdminItem {
                uuid: i.uuid,
                name: i.name.to_string(),
                price_cents: i.price_cents,
                additional_info: i.additional_info.map(|info| info.to_string()),
                category: i.category,
                active: i.active,
                image_version: (i.image_version != 0).then_some(i.image_version),
                created_at: SchemaDateTime(i.created_at),
            })
            .collect(),
    }))
}

/// Validate an item request and convert it into the model's data struct
async fn validate_item(request: ItemRequest) -> ApiResult<ItemData> {
    if request.name.trim().is_empty() {
        return Err(ApiError::bad_request("Name must not be empty"));
    }
    if request.price_cents < 0 {
        return Err(ApiError::bad_request("Price must not be negative"));
    }
    if let Some(category) = request.category
        && !Category::exists(Database::global(), category).await?
    {
        return Err(ApiError::bad_request("Unknown category"));
    }
    Ok(ItemData {
        name: request.name,
        price_cents: request.price_cents,
        additional_info: request
            .additional_info
            .filter(|info| !info.trim().is_empty()),
        category: request.category,
        active: request.active,
    })
}

/// Create an item
#[post("/items")]
pub async fn create_item(ApiJson(request): ApiJson<ItemRequest>) -> ApiResult<ApiJson<ItemUuid>> {
    let data = validate_item(request).await?;
    let uuid = Item::insert(Database::global(), data).await?;
    Ok(ApiJson(uuid))
}

/// Update an item
///
/// Existing orders are unaffected: they carry name/price snapshots.
#[put("/items/{uuid}")]
pub async fn update_item(
    Path(uuid): Path<ItemUuid>,
    ApiJson(request): ApiJson<ItemRequest>,
) -> ApiResult<()> {
    let data = validate_item(request).await?;
    if !Item::update(Database::global(), uuid, data).await? {
        return Err(ApiError::bad_request("Unknown item"));
    }
    Ok(())
}

/// Longest edge of a stored product photo
const MAX_IMAGE_DIMENSION: u32 = 800;
/// Maximum accepted upload size (base64 characters)
const MAX_IMAGE_UPLOAD: usize = 10_000_000;
/// JPEG quality of the stored photo
const IMAGE_QUALITY: u8 = 82;

/// Set an item's product photo
///
/// Accepts jpeg/png/webp, downscales to a bounded size and stores
/// a re-encoded jpeg.
#[put("/items/{uuid}/image")]
pub async fn set_item_image(
    Path(uuid): Path<ItemUuid>,
    ApiJson(request): ApiJson<SetItemImageRequest>,
) -> ApiResult<()> {
    if request.data.len() > MAX_IMAGE_UPLOAD {
        return Err(ApiError::bad_request("Image too large"));
    }
    let raw = BASE64_STANDARD
        .decode(request.data.as_bytes())
        .map_err(|_| ApiError::bad_request("Invalid base64"))?;

    // Decoding + re-encoding is CPU work — keep it off the async workers
    let jpeg = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, image::ImageError> {
        let img = image::load_from_memory(&raw)?;
        let img = if img.width() > MAX_IMAGE_DIMENSION || img.height() > MAX_IMAGE_DIMENSION {
            img.thumbnail(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION)
        } else {
            img
        };
        let mut out = Vec::new();
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, IMAGE_QUALITY);
        image::DynamicImage::ImageRgb8(img.to_rgb8()).write_with_encoder(encoder)?;
        Ok(out)
    })
    .await
    .map_err(ApiError::map_server_error("Image processing crashed"))?
    .map_err(|_| ApiError::bad_request("Not a supported image (jpeg/png/webp)"))?;

    if !Item::set_image(Database::global(), uuid, jpeg).await? {
        return Err(ApiError::bad_request("Unknown item"));
    }
    Ok(())
}

/// Remove an item's product photo
#[delete("/items/{uuid}/image")]
pub async fn delete_item_image(Path(uuid): Path<ItemUuid>) -> ApiResult<()> {
    if !Item::clear_image(Database::global(), uuid).await? {
        return Err(ApiError::bad_request("Unknown item"));
    }
    Ok(())
}

/// Delete an item
///
/// Positions of existing orders keep their snapshots (item link set to null).
/// Prefer deactivating items over deleting them.
#[delete("/items/{uuid}")]
pub async fn delete_item(Path(uuid): Path<ItemUuid>) -> ApiResult<()> {
    if !Item::delete(Database::global(), uuid).await? {
        return Err(ApiError::bad_request("Unknown item"));
    }
    Ok(())
}

// ------------- //
//   Accounts    //
// ------------- //

/// List all staff accounts
#[get("/accounts")]
pub async fn list_accounts() -> ApiResult<ApiJson<ListAccountsResponse>> {
    let accounts = Account::get_all(Database::global()).await?;
    Ok(ApiJson(ListAccountsResponse {
        accounts: accounts
            .into_iter()
            .map(|a| AccountSchema {
                uuid: a.uuid,
                username: a.username.to_string(),
                role: a.role,
                last_login_at: a.last_login_at.map(SchemaDateTime),
                created_at: SchemaDateTime(a.created_at),
            })
            .collect(),
    }))
}

/// Create a staff account and return its one-time registration link
#[post("/accounts")]
pub async fn create_account(
    ApiJson(request): ApiJson<CreateAccountRequest>,
) -> ApiResult<ApiJson<InviteResponse>> {
    if request.username.trim().is_empty() {
        return Err(ApiError::bad_request("Username must not be empty"));
    }

    let mut tx = Database::global().start_transaction().await?;

    let uuid = Account::insert(&mut tx, request.username, request.role)
        .await
        .map_err(|_| ApiError::bad_request("An account with this username exists already"))?;

    let token = RegistrationToken::create(&mut tx, uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(InviteResponse {
        uuid,
        registration_link: WebauthnModule::global()
            .registration_link(&token)
            .to_string(),
    }))
}

/// Update a staff account
///
/// Admins cannot demote themselves — this avoids locking the last
/// admin out of account management.
#[put("/accounts/{uuid}")]
pub async fn update_account(
    admin: Account,
    Path(uuid): Path<AccountUuid>,
    ApiJson(request): ApiJson<UpdateAccountRequest>,
) -> ApiResult<()> {
    if request.username.trim().is_empty() {
        return Err(ApiError::bad_request("Username must not be empty"));
    }
    if admin.uuid == uuid && request.role != Role::Admin {
        return Err(ApiError::bad_request("You cannot demote yourself"));
    }
    let found = Account::update(Database::global(), uuid, request.username, request.role)
        .await
        .map_err(|_| ApiError::bad_request("An account with this username exists already"))?;
    if !found {
        return Err(ApiError::bad_request("Unknown account"));
    }
    Ok(())
}

/// Issue a new one-time registration link for an account ("lost device")
#[post("/accounts/{uuid}/invite")]
pub async fn create_invite(Path(uuid): Path<AccountUuid>) -> ApiResult<ApiJson<InviteResponse>> {
    if !Account::exists(Database::global(), uuid).await? {
        return Err(ApiError::bad_request("Unknown account"));
    }

    let token = RegistrationToken::create(Database::global(), uuid).await?;

    Ok(ApiJson(InviteResponse {
        uuid,
        registration_link: WebauthnModule::global()
            .registration_link(&token)
            .to_string(),
    }))
}

/// Delete a staff account
///
/// Admins cannot delete themselves.
#[delete("/accounts/{uuid}")]
pub async fn delete_account(admin: Account, Path(uuid): Path<AccountUuid>) -> ApiResult<()> {
    if admin.uuid == uuid {
        return Err(ApiError::bad_request("You cannot delete yourself"));
    }
    if !Account::delete(Database::global(), uuid).await? {
        return Err(ApiError::bad_request("Unknown account"));
    }
    Ok(())
}
