//! Customer pre-orders and their positions

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModel;
use rand::seq::IndexedRandom;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use time::Date;
use time::OffsetDateTime;
use tracing::instrument;
use uuid::Uuid;

use crate::models::item::Item;
use crate::models::item::ItemUuid;
use crate::models::order::db::OrderInsertPatch;
use crate::models::order::db::OrderItemInsertPatch;
use crate::models::order::db::OrderItemModel;
use crate::models::order::db::OrderModel;

pub(in crate::models) mod db;

/// Status of a pre-order
///
/// Allowed transitions: `Open -> Ready -> PickedUp`; `Open | Ready -> Cancelled`.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum OrderStatus {
    /// Placed by the customer, not assembled yet
    Open,
    /// Assembled and ready for pickup
    Ready,
    /// Handed over to the customer
    PickedUp,
    /// Cancelled by the shop
    Cancelled,
}
custom_db_enum! {
    enum: OrderStatus,
    variants: [Open, Ready, PickedUp, Cancelled],
    decoder: OrderStatusDecoder,
}

impl OrderStatus {
    /// Whether a transition from `self` to `target` is allowed
    pub fn can_transition_to(self, target: OrderStatus) -> bool {
        matches!(
            (self, target),
            (OrderStatus::Open, OrderStatus::Ready)
                | (OrderStatus::Ready, OrderStatus::PickedUp)
                | (
                    OrderStatus::Open | OrderStatus::Ready,
                    OrderStatus::Cancelled
                )
        )
    }
}

/// A customer pre-order
///
/// Customers have no accounts: the order carries their name and at least
/// one contact (phone or email, enforced in the handler). The `pickup_code`
/// is the customer's only reference to the order.
#[derive(Debug)]
pub struct Order {
    /// Primary key
    pub uuid: OrderUuid,

    /// Human-friendly unique code the customer uses to reference the order
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

    /// The point in time the order was placed
    pub created_at: OffsetDateTime,
}

/// Wrapper for the primary key of the [`Order`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct OrderUuid(Uuid);

impl OrderUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Create a new `OrderUuid` from a `ForeignModel<OrderModel>`
    pub(in crate::models) fn new_from_field(field: ForeignModel<OrderModel>) -> Self {
        Self(field.0)
    }
}

/// Data for inserting a new [`Order`]
///
/// New orders always start in [`OrderStatus::Open`].
#[derive(Debug)]
pub struct OrderInsert {
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
}

/// A single position of an [`Order`]
///
/// `name` and `price_cents` are snapshots taken when the order was placed:
/// admins editing or deleting items must never change agreed orders.
#[derive(Debug)]
pub struct OrderItem {
    /// Primary key
    pub uuid: OrderItemUuid,

    /// The order this position belongs to
    pub order: OrderUuid,

    /// Link to the catalog item, kept for statistics only
    pub item: Option<ItemUuid>,

    /// Snapshot of the item name at order time
    pub name: MaxStr<255>,

    /// Snapshot of the price (euro cents) at order time
    pub price_cents: i64,

    /// How many units were ordered
    pub quantity: i64,

    /// Whether the position has been packed (packing-list checkbox)
    pub packed: bool,
}

/// Wrapper for the primary key of the [`OrderItem`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct OrderItemUuid(Uuid);

impl OrderItemUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }
}

/// Data for inserting a single position of a new [`Order`]
#[derive(Debug)]
pub struct OrderPositionInsert {
    /// The catalog item — name and price are snapshotted from it
    pub item: Item,
    /// How many units are ordered
    pub quantity: i64,
}

/// Alphabet used for pickup codes: no 0/O, 1/I/L to stay unambiguous
/// when read aloud or written on a note.
const PICKUP_CODE_ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/// Length of a pickup code (~30 bit with the alphabet above)
const PICKUP_CODE_LEN: usize = 6;
/// Attempts to find an unused pickup code before giving up
const PICKUP_CODE_ATTEMPTS: usize = 5;

/// Generate a random (not yet uniqueness-checked) pickup code
fn generate_pickup_code() -> MaxStr<16> {
    let mut rng = rand::rng();
    let code: String = (0..PICKUP_CODE_LEN)
        .map(|_| {
            *PICKUP_CODE_ALPHABET
                .choose(&mut rng)
                .unwrap_or_else(|| unreachable!("alphabet is not empty")) as char
        })
        .collect();
    MaxStr::new(code).unwrap_or_else(|_| unreachable!("6 chars fit into 16"))
}

impl Order {
    /// Create a new order with its positions
    ///
    /// Snapshots each position's name and price from its catalog item and
    /// starts the order in [`OrderStatus::Open`]. Returns the order's pickup
    /// code, or `None` if no unused pickup code could be found.
    #[instrument(name = "Order::create", skip(tx, insert, positions))]
    pub async fn create(
        tx: &mut Transaction,
        insert: OrderInsert,
        positions: Vec<OrderPositionInsert>,
    ) -> Result<Option<MaxStr<16>>, rorm::Error> {
        // Find an unused pickup code
        let mut pickup_code = None;
        for _ in 0..PICKUP_CODE_ATTEMPTS {
            let candidate = generate_pickup_code();
            let (existing,) = rorm::query(&mut *tx, (OrderModel.uuid.count(),))
                .condition(OrderModel.pickup_code.equals(&candidate))
                .one()
                .await?;
            if existing == 0 {
                pickup_code = Some(candidate);
                break;
            }
        }
        let Some(pickup_code) = pickup_code else {
            return Ok(None);
        };

        let order_uuid = rorm::insert(&mut *tx, OrderModel)
            .return_primary_key()
            .single(&OrderInsertPatch {
                uuid: Uuid::new_v4(),
                pickup_code: pickup_code.clone(),
                customer_name: insert.customer_name,
                phone: insert.phone,
                email: insert.email,
                pickup_date: insert.pickup_date,
                note: insert.note,
                status: OrderStatus::Open,
            })
            .await?;

        for position in positions {
            rorm::insert(&mut *tx, OrderItemModel)
                .single(&OrderItemInsertPatch {
                    uuid: Uuid::new_v4(),
                    order: ForeignModelByField(order_uuid),
                    item: Some(ForeignModelByField(position.item.uuid.into_inner())),
                    name: position.item.name,
                    price_cents: position.item.price_cents,
                    quantity: position.quantity,
                    packed: false,
                })
                .await?;
        }

        Ok(Some(pickup_code))
    }

    /// Fetch all orders
    #[instrument(name = "Order::get_all", skip(exe))]
    pub async fn get_all(exe: impl Executor<'_>) -> Result<Vec<Order>, rorm::Error> {
        let orders = rorm::query(exe, OrderModel).all().await?;
        Ok(orders.into_iter().map(Order::from).collect())
    }

    /// Fetch an order by its primary key
    #[instrument(name = "Order::get_by_uuid", skip(exe))]
    pub async fn get_by_uuid(
        exe: impl Executor<'_>,
        uuid: OrderUuid,
    ) -> Result<Option<Order>, rorm::Error> {
        let order = rorm::query(exe, OrderModel)
            .condition(OrderModel.uuid.equals(uuid.0))
            .optional()
            .await?;
        Ok(order.map(Order::from))
    }

    /// Fetch an order by its pickup code
    #[instrument(name = "Order::get_by_pickup_code", skip(exe))]
    pub async fn get_by_pickup_code(
        exe: impl Executor<'_>,
        pickup_code: &MaxStr<16>,
    ) -> Result<Option<Order>, rorm::Error> {
        let order = rorm::query(exe, OrderModel)
            .condition(OrderModel.pickup_code.equals(pickup_code))
            .optional()
            .await?;
        Ok(order.map(Order::from))
    }

    /// Set an order's status
    ///
    /// Transition rules are checked by the caller
    /// (see [`OrderStatus::can_transition_to`]).
    /// Returns `false` if the order does not exist.
    #[instrument(name = "Order::set_status", skip(exe))]
    pub async fn set_status(
        exe: impl Executor<'_>,
        uuid: OrderUuid,
        status: OrderStatus,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(exe, OrderModel)
            .set(OrderModel.status, status)
            .condition(OrderModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }
}

impl OrderItem {
    /// Fetch all positions of an order
    #[instrument(name = "OrderItem::get_by_order", skip(exe))]
    pub async fn get_by_order(
        exe: impl Executor<'_>,
        order: OrderUuid,
    ) -> Result<Vec<OrderItem>, rorm::Error> {
        let positions = rorm::query(exe, OrderItemModel)
            .condition(OrderItemModel.order.equals(order.0))
            .all()
            .await?;
        Ok(positions.into_iter().map(OrderItem::from).collect())
    }

    /// Set a position's packed flag (packing-list checkbox)
    ///
    /// Returns `false` if the position does not exist.
    #[instrument(name = "OrderItem::set_packed", skip(exe))]
    pub async fn set_packed(
        exe: impl Executor<'_>,
        uuid: OrderItemUuid,
        packed: bool,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(exe, OrderItemModel)
            .set(OrderItemModel.packed, packed)
            .condition(OrderItemModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }
}

impl From<OrderModel> for Order {
    fn from(value: OrderModel) -> Self {
        Self {
            uuid: OrderUuid(value.uuid),
            pickup_code: value.pickup_code,
            customer_name: value.customer_name,
            phone: value.phone,
            email: value.email,
            pickup_date: value.pickup_date,
            note: value.note,
            status: value.status,
            created_at: value.created_at,
        }
    }
}

impl From<OrderItemModel> for OrderItem {
    fn from(value: OrderItemModel) -> Self {
        Self {
            uuid: OrderItemUuid(value.uuid),
            order: OrderUuid::new_from_field(value.order),
            item: value.item.map(ItemUuid::new_from_field),
            name: value.name,
            price_cents: value.price_cents,
            quantity: value.quantity,
            packed: value.packed,
        }
    }
}
