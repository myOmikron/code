//! Request/response schemas of the staff order handlers

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDate;
use galvyn::core::stuff::schema::SchemaDateTime;
use serde::Deserialize;
use serde::Serialize;

use crate::models::OrderItemUuid;
use crate::models::OrderStatus;
use crate::models::OrderUuid;

/// Query filters for the order list
#[derive(Deserialize, JsonSchema)]
pub struct ListOrdersQuery {
    /// Only orders with this status
    pub status: Option<OrderStatus>,
    /// Only orders with this pickup date
    pub pickup_date: Option<SchemaDate>,
}

/// A position of an order as shown to staff
#[derive(Serialize, JsonSchema)]
pub struct FullOrderPosition {
    /// Primary key (PATCH target for packing)
    pub uuid: OrderItemUuid,
    /// Item name (snapshot at order time)
    pub name: String,
    /// How many units were ordered
    pub quantity: i64,
    /// Price per unit in euro cents (snapshot at order time)
    pub price_cents: i64,
    /// Whether the position has been packed
    pub packed: bool,
}

/// An order as shown to staff (includes contact data)
#[derive(Serialize, JsonSchema)]
pub struct FullOrder {
    /// Primary key
    pub uuid: OrderUuid,
    /// The customer-facing order code
    pub pickup_code: String,
    /// Current status
    pub status: OrderStatus,
    /// Requested pickup date
    pub pickup_date: SchemaDate,
    /// The customer's name
    pub customer_name: String,
    /// The customer's phone number
    pub phone: Option<String>,
    /// The customer's email address
    pub email: Option<String>,
    /// Optional note
    pub note: Option<String>,
    /// The order's positions
    pub positions: Vec<FullOrderPosition>,
    /// Total over all positions in euro cents
    pub total_cents: i64,
    /// The point in time the order was placed
    pub created_at: SchemaDateTime,
}

/// All orders matching the filters
#[derive(Serialize, JsonSchema)]
pub struct ListOrdersResponse {
    /// The orders
    pub orders: Vec<FullOrder>,
}

/// Request to change an order's status
#[derive(Deserialize, JsonSchema)]
pub struct UpdateOrderStatusRequest {
    /// The new status
    pub status: OrderStatus,
}

/// Request to change a position's packed flag
#[derive(Deserialize, JsonSchema)]
pub struct UpdateOrderItemPackedRequest {
    /// Whether the position has been packed
    pub packed: bool,
}
