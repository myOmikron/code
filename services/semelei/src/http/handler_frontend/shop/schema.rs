//! Request/response schemas of the public shop handlers

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDate;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::CategoryUuid;
use crate::models::ItemUuid;
use crate::models::OrderStatus;

/// A category as shown in the public shop
#[derive(Serialize, JsonSchema)]
pub struct PublicCategory {
    /// Primary key
    pub uuid: CategoryUuid,
    /// The name of the category
    pub name: String,
}

/// All categories
#[derive(Serialize, JsonSchema)]
pub struct ListCategoriesResponse {
    /// The categories
    pub categories: Vec<PublicCategory>,
}

/// An orderable item as shown in the public shop
#[derive(Serialize, JsonSchema)]
pub struct PublicItem {
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
    /// Cache-busting version of the item's image, unset if there is none
    pub image_version: Option<i64>,
}

/// All orderable items
#[derive(Serialize, JsonSchema)]
pub struct ListItemsResponse {
    /// The items
    pub items: Vec<PublicItem>,
}

/// A single position of an order request
#[derive(Deserialize, JsonSchema)]
pub struct OrderPositionRequest {
    /// The item to order
    pub item: ItemUuid,
    /// How many units to order (1..=99)
    pub quantity: u32,
}

/// Request to place a pre-order
#[derive(Deserialize, JsonSchema)]
pub struct CreateOrderRequest {
    /// The customer's name
    pub customer_name: MaxStr<255>,
    /// The customer's phone number (this or `email` must be set)
    pub phone: Option<MaxStr<64>>,
    /// The customer's email address (this or `phone` must be set)
    pub email: Option<MaxStr<255>>,
    /// Optional free-text note
    pub note: Option<MaxStr<1024>>,
    /// The positions to order
    pub items: Vec<OrderPositionRequest>,
}

/// A position of an order as shown to the customer
#[derive(Serialize, JsonSchema)]
pub struct PublicOrderPosition {
    /// Item name (snapshot at order time)
    pub name: String,
    /// How many units were ordered
    pub quantity: i64,
    /// Price per unit in euro cents (snapshot at order time)
    pub price_cents: i64,
}

/// An order as shown to the customer (no contact data echoed)
#[derive(Serialize, JsonSchema)]
pub struct PublicOrder {
    /// The customer-facing order code
    pub pickup_code: String,
    /// Current status
    pub status: OrderStatus,
    /// Pickup date (the Saturday after the order was placed)
    pub pickup_date: SchemaDate,
    /// The customer's name
    pub customer_name: String,
    /// Optional note
    pub note: Option<String>,
    /// The order's positions
    pub positions: Vec<PublicOrderPosition>,
    /// Total over all positions in euro cents
    pub total_cents: i64,
}

/// Response to a placed order
#[derive(Serialize, JsonSchema)]
pub struct CreateOrderResponse {
    /// The customer-facing order code
    pub pickup_code: String,
    /// The created order
    pub order: PublicOrder,
}
