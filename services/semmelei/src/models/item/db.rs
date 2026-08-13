use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::MaxStr;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::models::category::db::CategoryModel;

/// An item customers can pre-order
#[derive(Model, Debug, Clone)]
#[rorm(rename = "item")]
pub struct ItemModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The name of the item
    pub name: MaxStr<255>,

    /// The price in euro cents
    ///
    /// Only the current price for new orders — existing orders keep
    /// their own snapshot (see `OrderItemModel`).
    pub price_cents: i64,

    /// Optional customer-facing details such as allergens or ingredients
    pub additional_info: Option<MaxStr<2048>>,

    /// Optional category the item is grouped under
    ///
    /// Deleting a category must not delete its items.
    #[rorm(on_delete = "SetNull", on_update = "Cascade")]
    pub category: Option<ForeignModel<CategoryModel>>,

    /// Whether the item is currently orderable (shown in the shop)
    pub active: bool,

    /// Product photo (processed server-side into a bounded jpeg)
    pub image: Option<Vec<u8>>,

    /// Cache-busting version of `image` (unix seconds of the upload, 0 = none)
    #[rorm(default = 0)]
    pub image_version: i64,

    /// The point in time the item was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Query patch for [`ItemModel`] without the image blob.
///
/// Use this for every list/lookup that doesn't serve the image itself.
#[derive(Patch, Debug, Clone)]
#[rorm(model = "ItemModel")]
pub struct ItemMetaPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The name of the item
    pub name: MaxStr<255>,
    /// The price in euro cents
    pub price_cents: i64,
    /// Optional customer-facing details such as allergens or ingredients
    pub additional_info: Option<MaxStr<2048>>,
    /// Optional category
    pub category: Option<ForeignModel<CategoryModel>>,
    /// Whether the item is currently orderable
    pub active: bool,
    /// Cache-busting version of the image (0 = none)
    pub image_version: i64,
    /// The point in time the item was created
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`ItemModel`]
#[derive(Patch)]
#[rorm(model = "ItemModel")]
pub struct ItemInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The name of the item
    pub name: MaxStr<255>,
    /// The price in euro cents
    pub price_cents: i64,
    /// Optional customer-facing details such as allergens or ingredients
    pub additional_info: Option<MaxStr<2048>>,
    /// Optional category
    pub category: Option<ForeignModel<CategoryModel>>,
    /// Whether the item is currently orderable
    pub active: bool,
    /// Product photo
    pub image: Option<Vec<u8>>,
    /// Cache-busting version of `image`
    pub image_version: i64,
}
