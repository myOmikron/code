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
    /// The day the order is picked up on
    pub pickup_date: SchemaDate,
    /// Whether the order is frozen: the customer can no longer cancel it
    pub locked: bool,
    /// Whether the order's pickup day was Dispatched: the Bakery has it
    ///
    /// Staff may still cancel the order; what went to the Bakery stays as it is.
    pub dispatched: bool,
    /// The customer's first name, if given
    pub first_name: Option<String>,
    /// The customer's last name
    pub last_name: String,
    /// The customer's phone number
    pub phone: Option<String>,
    /// The customer's email address
    pub email: Option<String>,
    /// Optional note
    pub note: Option<String>,
    /// Whether the customer wants to pick the order up early in the day
    pub early_pickup: bool,
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

/// One item summed over every order of a pickup day
#[derive(Serialize, JsonSchema)]
pub struct ProcurementPosition {
    /// Item name (snapshot at order time)
    pub name: String,
    /// How many units to procure in total
    pub total_quantity: i64,
    /// How many orders contain the item
    pub order_count: i64,
    /// Price per unit in euro cents (snapshot at order time)
    pub price_cents: i64,
    /// The distinct Bakery Article Numbers of the line's Items, sorted
    ///
    /// Read live from the Items: deleted Items and Items without a number add none.
    pub bakery_article_numbers: Vec<String>,
}

/// What keeps a frozen pickup day from being Dispatched
///
/// Reported from the freeze on, not only once the Dispatch is due, so Verkauf
/// learns during the Review Window that the order will not go out.
#[derive(Serialize, JsonSchema, Debug, Clone, Copy, PartialEq, Eq)]
pub enum NotDispatchedReason {
    /// Nothing: the day is open, waits for its Dispatch time, was Dispatched or called off
    None,
    /// No Bakery address is set, so the Dispatch waits for one
    NoBakeryAddress,
}

/// What has to be procured for one pickup day
#[derive(Serialize, JsonSchema)]
pub struct ProcurementSummary {
    /// The day the orders are picked up on
    pub pickup_date: SchemaDate,
    /// The point in time orders close
    pub deadline: SchemaDateTime,
    /// The point in time the day is Dispatched: its Deadline plus the Review Window
    pub dispatch_due: SchemaDateTime,
    /// When the day was Dispatched; from then on the list is final
    pub dispatched_at: Option<SchemaDateTime>,
    /// Why a frozen day is not Dispatched (yet)
    pub not_dispatched_reason: NotDispatchedReason,
    /// Whether the day is frozen: customers can no longer order or cancel
    pub locked: bool,
    /// Whether the day was called off
    pub closed: bool,
    /// How many orders the summary covers (cancelled ones excluded)
    pub order_count: i64,
    /// The items to procure, most units first
    pub positions: Vec<ProcurementPosition>,
    /// Total over all positions in euro cents
    pub total_cents: i64,
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
