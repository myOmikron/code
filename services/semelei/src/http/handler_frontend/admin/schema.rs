//! Request/response schemas of the admin handlers

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDate;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::core::stuff::schema::SchemaTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::AccountUuid;
use crate::models::CategoryUuid;
use crate::models::ItemUuid;
use crate::models::Role;
use crate::models::ScheduleWeekday;

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

/// The recurring rule every pickup date and deadline is derived from
#[derive(Serialize, Deserialize, JsonSchema)]
pub struct ScheduleSchema {
    /// The weekday orders are picked up on
    pub pickup_weekday: ScheduleWeekday,
    /// How many days before the pickup date orders close (0 = the day itself)
    pub deadline_offset_days: i16,
    /// Wall-clock time (Europe/Berlin) orders close at
    pub deadline_time: SchemaTime,
}

/// A single upcoming pickup day, rule and override already applied
#[derive(Serialize, JsonSchema)]
pub struct AdminPickupDay {
    /// The date the recurring rule produced — the identity of this day
    pub rule_date: SchemaDate,
    /// The date orders are actually picked up on
    pub pickup_date: SchemaDate,
    /// The point in time orders close
    pub deadline: SchemaDateTime,
    /// Whether the pickup day was called off
    pub closed: bool,
    /// Whether the day is frozen: past its deadline or locked early
    pub locked: bool,
    /// When the day was frozen, if it already was
    pub locked_at: Option<SchemaDateTime>,
    /// How many orders are placed for this day (cancelled ones excluded)
    pub order_count: i64,
    /// Whether the day deviates from the rule
    pub overridden: bool,
}

/// The upcoming pickup days
#[derive(Serialize, JsonSchema)]
pub struct ListPickupDaysResponse {
    /// The days, earliest first
    pub days: Vec<AdminPickupDay>,
}

/// Request to change a single pickup day
#[derive(Deserialize, JsonSchema)]
pub struct UpdatePickupDayRequest {
    /// The date orders are actually picked up on
    pub pickup_date: SchemaDate,
    /// The point in time orders close
    pub deadline: SchemaDateTime,
    /// Whether the pickup day is called off
    ///
    /// Calling off a day cancels every order placed for it.
    pub closed: bool,
}

/// What a change to a pickup day did
#[derive(Serialize, JsonSchema)]
pub struct PickupDayChangeResponse {
    /// The day after the change
    pub day: AdminPickupDay,
    /// How many orders were cancelled by calling the day off
    pub cancelled_orders: i64,
    /// How many confirmation mails were queued by freezing the day
    pub confirmed_orders: i64,
}
