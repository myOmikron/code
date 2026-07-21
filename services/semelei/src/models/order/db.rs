use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::field;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::BackRef;
use time::Date;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::models::item::db::ItemModel;
use crate::models::order::OrderStatus;

/// A customer pre-order
///
/// Customers have no accounts: the order carries their name and at least
/// one contact (phone or email, enforced in the handler). The `pickup_code`
/// is the customer's only reference to the order.
#[derive(Model, Debug)]
#[rorm(rename = "order")]
pub struct OrderModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// Human-friendly unique code the customer uses to reference the order
    #[rorm(unique)]
    pub pickup_code: MaxStr<16>,

    /// The customer's name
    pub customer_name: MaxStr<255>,

    /// The customer's phone number (this or `email` must be set)
    pub phone: Option<MaxStr<64>>,

    /// The customer's email address (this or `phone` must be set)
    pub email: Option<MaxStr<255>>,

    /// The date the customer wants to pick the order up
    pub pickup_date: Date,

    /// Optional free-text note from the customer
    pub note: Option<MaxStr<1024>>,

    /// Current status of the order
    pub status: OrderStatus,

    /// The order's positions
    pub items: BackRef<field!(OrderItemModel.order)>,

    /// The point in time the order was placed
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`OrderModel`]
#[derive(Patch)]
#[rorm(model = "OrderModel")]
pub struct OrderInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// Unique customer-facing code
    pub pickup_code: MaxStr<16>,
    /// The customer's name
    pub customer_name: MaxStr<255>,
    /// The customer's phone number
    pub phone: Option<MaxStr<64>>,
    /// The customer's email address
    pub email: Option<MaxStr<255>>,
    /// Requested pickup date
    pub pickup_date: Date,
    /// Optional customer note
    pub note: Option<MaxStr<1024>>,
    /// Current status
    pub status: OrderStatus,
}

/// A single position of an [`OrderModel`]
///
/// `name` and `price_cents` are snapshots taken when the order was placed:
/// admins editing or deleting items must never change agreed orders.
#[derive(Model, Debug)]
#[rorm(rename = "orderitem")]
pub struct OrderItemModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The order this position belongs to
    #[rorm(on_delete = "Cascade", on_update = "Cascade")]
    pub order: ForeignModel<OrderModel>,

    /// Link to the catalog item, kept for statistics only
    #[rorm(on_delete = "SetNull", on_update = "Cascade")]
    pub item: Option<ForeignModel<ItemModel>>,

    /// Snapshot of the item name at order time
    pub name: MaxStr<255>,

    /// Snapshot of the price (euro cents) at order time
    pub price_cents: i64,

    /// How many units were ordered
    pub quantity: i64,

    /// Whether the position has been packed (packing-list checkbox)
    pub packed: bool,
}

/// Insert patch for [`OrderItemModel`]
#[derive(Patch)]
#[rorm(model = "OrderItemModel")]
pub struct OrderItemInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The order this position belongs to
    pub order: ForeignModel<OrderModel>,
    /// Link to the catalog item
    pub item: Option<ForeignModel<ItemModel>>,
    /// Snapshot of the item name
    pub name: MaxStr<255>,
    /// Snapshot of the price in euro cents
    pub price_cents: i64,
    /// How many units were ordered
    pub quantity: i64,
    /// Whether the position has been packed
    pub packed: bool,
}
