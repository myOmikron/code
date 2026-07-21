//! Request/response schemas of the admin handlers

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::AccountUuid;
use crate::models::CategoryUuid;
use crate::models::ItemUuid;
use crate::models::Role;

/// Request to create or update a category
#[derive(Deserialize, JsonSchema)]
pub struct CategoryRequest {
    /// The name of the category
    pub name: MaxStr<255>,
}

/// An item as shown to admins (includes inactive items)
#[derive(Serialize, JsonSchema)]
pub struct AdminItem {
    /// Primary key
    pub uuid: ItemUuid,
    /// The name of the item
    pub name: String,
    /// The price in euro cents
    pub price_cents: i64,
    /// Optional customer-facing details such as allergens or ingredients
    pub additional_info: Option<String>,
    /// The category the item belongs to
    pub category: Option<CategoryUuid>,
    /// Whether the item is currently orderable
    pub active: bool,
    /// Cache-busting version of the item's image, unset if there is none
    pub image_version: Option<i64>,
    /// The point in time the item was created
    pub created_at: SchemaDateTime,
}

/// All items
#[derive(Serialize, JsonSchema)]
pub struct ListAdminItemsResponse {
    /// The items
    pub items: Vec<AdminItem>,
}

/// Request to create or update an item
#[derive(Deserialize, JsonSchema)]
pub struct ItemRequest {
    /// The name of the item
    pub name: MaxStr<255>,
    /// The price in euro cents
    pub price_cents: i64,
    /// Optional customer-facing details such as allergens or ingredients
    pub additional_info: Option<MaxStr<2048>>,
    /// The category the item belongs to
    pub category: Option<CategoryUuid>,
    /// Whether the item is currently orderable
    pub active: bool,
}

/// A staff account as shown to admins
#[derive(Serialize, JsonSchema)]
pub struct AccountSchema {
    /// Primary key
    pub uuid: AccountUuid,
    /// The username of the account
    pub username: String,
    /// The account's role
    pub role: Role,
    /// The point in time when the account logged in recently
    pub last_login_at: Option<SchemaDateTime>,
    /// The point in time the account was created
    pub created_at: SchemaDateTime,
}

/// All staff accounts
#[derive(Serialize, JsonSchema)]
pub struct ListAccountsResponse {
    /// The accounts
    pub accounts: Vec<AccountSchema>,
}

/// Request to create a staff account
#[derive(Deserialize, JsonSchema)]
pub struct CreateAccountRequest {
    /// The username of the account
    pub username: MaxStr<255>,
    /// The account's role
    pub role: Role,
}

/// Response to a created account or invite
#[derive(Serialize, JsonSchema)]
pub struct InviteResponse {
    /// Primary key of the account
    pub uuid: AccountUuid,
    /// One-time link the new device opens to register its passkey
    pub registration_link: String,
}

/// Request to set an item's product photo
#[derive(Deserialize, JsonSchema)]
pub struct SetItemImageRequest {
    /// The image file (jpeg/png/webp), base64 encoded
    pub data: String,
}

/// Request to update a staff account
#[derive(Deserialize, JsonSchema)]
pub struct UpdateAccountRequest {
    /// The username of the account
    pub username: MaxStr<255>,
    /// The account's role
    pub role: Role,
}
