//! Items sold in the shop

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModel;
use serde::Deserialize;
use serde::Serialize;
use time::OffsetDateTime;
use tracing::instrument;
use uuid::Uuid;

use crate::models::category::CategoryUuid;
use crate::models::item::db::ItemInsertPatch;
use crate::models::item::db::ItemMetaPatch;
use crate::models::item::db::ItemModel;

pub(in crate::models) mod db;

/// An item customers can pre-order
///
/// Does not carry the product photo — that is only served
/// through [`Item::get_image`].
#[derive(Debug, Clone)]
pub struct Item {
    /// Primary key
    pub uuid: ItemUuid,

    /// The name of the item
    pub name: MaxStr<255>,

    /// The price in euro cents
    ///
    /// Only the current price for new orders — existing orders keep
    /// their own snapshot (see [`OrderItem`](crate::models::OrderItem)).
    pub price_cents: i64,

    /// Optional customer-facing details such as allergens or ingredients
    pub additional_info: Option<MaxStr<2048>>,

    /// Optional category the item is grouped under
    pub category: Option<CategoryUuid>,

    /// Whether the item is currently orderable (shown in the shop)
    pub active: bool,

    /// Cache-busting version of the image (unix seconds of the upload, 0 = none)
    pub image_version: i64,

    /// The point in time the item was created
    pub created_at: OffsetDateTime,
}

/// Wrapper for the primary key of the [`Item`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct ItemUuid(Uuid);

impl ItemUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Create a new `ItemUuid` from a `ForeignModel<ItemModel>`
    pub(in crate::models) fn new_from_field(field: ForeignModel<ItemModel>) -> Self {
        Self(field.0)
    }
}

/// The editable fields of an [`Item`]
///
/// Used for both inserting and updating items. The referenced category
/// must be validated by the caller (see [`Category::exists`](crate::models::Category::exists)).
#[derive(Debug)]
pub struct ItemData {
    /// The name of the item
    pub name: MaxStr<255>,
    /// The price in euro cents
    pub price_cents: i64,
    /// Optional customer-facing details such as allergens or ingredients
    pub additional_info: Option<MaxStr<2048>>,
    /// Optional category the item is grouped under
    pub category: Option<CategoryUuid>,
    /// Whether the item is currently orderable
    pub active: bool,
}

impl Item {
    /// Fetch all items, including inactive ones
    #[instrument(name = "Item::get_all", skip(exe))]
    pub async fn get_all(exe: impl Executor<'_>) -> Result<Vec<Item>, rorm::Error> {
        let items = rorm::query(exe, ItemMetaPatch).all().await?;
        Ok(items.into_iter().map(Item::from).collect())
    }

    /// Fetch all currently orderable items
    #[instrument(name = "Item::get_active", skip(exe))]
    pub async fn get_active(exe: impl Executor<'_>) -> Result<Vec<Item>, rorm::Error> {
        let items = rorm::query(exe, ItemMetaPatch)
            .condition(ItemModel.active.equals(true))
            .all()
            .await?;
        Ok(items.into_iter().map(Item::from).collect())
    }

    /// Fetch a single item by its primary key
    #[instrument(name = "Item::get_by_uuid", skip(exe))]
    pub async fn get_by_uuid(
        exe: impl Executor<'_>,
        uuid: ItemUuid,
    ) -> Result<Option<Item>, rorm::Error> {
        let item = rorm::query(exe, ItemMetaPatch)
            .condition(ItemModel.uuid.equals(uuid.0))
            .optional()
            .await?;
        Ok(item.map(Item::from))
    }

    /// Fetch an item's product photo
    ///
    /// The outer `Option` is `None` for an unknown item,
    /// the inner one if the item has no photo.
    #[instrument(name = "Item::get_image", skip(exe))]
    pub async fn get_image(
        exe: impl Executor<'_>,
        uuid: ItemUuid,
    ) -> Result<Option<Option<Vec<u8>>>, rorm::Error> {
        Ok(rorm::query(exe, (ItemModel.image,))
            .condition(ItemModel.uuid.equals(uuid.0))
            .optional()
            .await?
            .map(|(image,)| image))
    }

    /// Insert a new item (without image) and return its primary key
    #[instrument(name = "Item::insert", skip(exe))]
    pub async fn insert(exe: impl Executor<'_>, data: ItemData) -> Result<ItemUuid, rorm::Error> {
        let uuid = rorm::insert(exe, ItemModel)
            .return_primary_key()
            .single(&ItemInsertPatch {
                uuid: Uuid::new_v4(),
                name: data.name,
                price_cents: data.price_cents,
                additional_info: data.additional_info,
                category: data.category.map(|c| ForeignModelByField(c.into_inner())),
                active: data.active,
                image: None,
                image_version: 0,
            })
            .await?;
        Ok(ItemUuid(uuid))
    }

    /// Update an item's editable fields
    ///
    /// Returns `false` if the item does not exist.
    #[instrument(name = "Item::update", skip(exe))]
    pub async fn update(
        exe: impl Executor<'_>,
        uuid: ItemUuid,
        data: ItemData,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(exe, ItemModel)
            .set(ItemModel.name, data.name)
            .set(ItemModel.price_cents, data.price_cents)
            .set(ItemModel.additional_info, data.additional_info)
            .set(
                ItemModel.category,
                data.category.map(|c| ForeignModelByField(c.into_inner())),
            )
            .set(ItemModel.active, data.active)
            .condition(ItemModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Set an item's product photo, bumping the cache-busting version
    ///
    /// Returns `false` if the item does not exist.
    #[instrument(name = "Item::set_image", skip(exe, jpeg))]
    pub async fn set_image(
        exe: impl Executor<'_>,
        uuid: ItemUuid,
        jpeg: Vec<u8>,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(exe, ItemModel)
            .set(ItemModel.image, Some(jpeg))
            .set(
                ItemModel.image_version,
                OffsetDateTime::now_utc().unix_timestamp(),
            )
            .condition(ItemModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Remove an item's product photo
    ///
    /// Returns `false` if the item does not exist.
    #[instrument(name = "Item::clear_image", skip(exe))]
    pub async fn clear_image(exe: impl Executor<'_>, uuid: ItemUuid) -> Result<bool, rorm::Error> {
        let affected = rorm::update(exe, ItemModel)
            .set(ItemModel.image, None)
            .set(ItemModel.image_version, 0)
            .condition(ItemModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Delete an item
    ///
    /// Returns `false` if the item does not exist.
    #[instrument(name = "Item::delete", skip(exe))]
    pub async fn delete(exe: impl Executor<'_>, uuid: ItemUuid) -> Result<bool, rorm::Error> {
        let affected = rorm::delete(exe, ItemModel)
            .condition(ItemModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }
}

impl From<ItemMetaPatch> for Item {
    fn from(value: ItemMetaPatch) -> Self {
        Self {
            uuid: ItemUuid(value.uuid),
            name: value.name,
            price_cents: value.price_cents,
            additional_info: value.additional_info,
            category: value.category.map(CategoryUuid::new_from_field),
            active: value.active,
            image_version: value.image_version,
            created_at: value.created_at,
        }
    }
}
