//! Item categories (e.g. Backwaren, Getränke)

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModel;
use serde::Deserialize;
use serde::Serialize;
use time::OffsetDateTime;
use tracing::instrument;
use uuid::Uuid;

use crate::models::category::db::CategoryInsertPatch;
use crate::models::category::db::CategoryModel;

pub(in crate::models) mod db;

/// A category grouping items in the shop view
#[derive(Debug, Clone)]
pub struct Category {
    /// Primary key
    pub uuid: CategoryUuid,

    /// The name of the category
    pub name: MaxStr<255>,

    /// The point in time the category was created
    pub created_at: OffsetDateTime,
}

/// Wrapper for the primary key of the [`Category`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct CategoryUuid(Uuid);

impl CategoryUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Create a new `CategoryUuid` from a `ForeignModel<CategoryModel>`
    pub(in crate::models) fn new_from_field(field: ForeignModel<CategoryModel>) -> Self {
        Self(field.0)
    }
}

impl Category {
    /// Fetch all categories
    #[instrument(name = "Category::get_all", skip(exe))]
    pub async fn get_all(exe: impl Executor<'_>) -> Result<Vec<Category>, rorm::Error> {
        let categories = rorm::query(exe, CategoryModel).all().await?;
        Ok(categories.into_iter().map(Category::from).collect())
    }

    /// Check whether a category exists
    #[instrument(name = "Category::exists", skip(exe))]
    pub async fn exists(exe: impl Executor<'_>, uuid: CategoryUuid) -> Result<bool, rorm::Error> {
        Ok(rorm::query(exe, (CategoryModel.uuid,))
            .condition(CategoryModel.uuid.equals(uuid.0))
            .optional()
            .await?
            .is_some())
    }

    /// Insert a new category and return its primary key
    ///
    /// Fails with a unique violation if the name is already taken.
    #[instrument(name = "Category::insert", skip(exe))]
    pub async fn insert(
        exe: impl Executor<'_>,
        name: MaxStr<255>,
    ) -> Result<CategoryUuid, rorm::Error> {
        let uuid = rorm::insert(exe, CategoryModel)
            .return_primary_key()
            .single(&CategoryInsertPatch {
                uuid: Uuid::new_v4(),
                name,
            })
            .await?;
        Ok(CategoryUuid(uuid))
    }

    /// Rename a category
    ///
    /// Returns `false` if the category does not exist.
    /// Fails with a unique violation if the name is already taken.
    #[instrument(name = "Category::rename", skip(exe))]
    pub async fn rename(
        exe: impl Executor<'_>,
        uuid: CategoryUuid,
        name: MaxStr<255>,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(exe, CategoryModel)
            .set(CategoryModel.name, name)
            .condition(CategoryModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Delete a category
    ///
    /// Returns `false` if the category does not exist.
    #[instrument(name = "Category::delete", skip(exe))]
    pub async fn delete(exe: impl Executor<'_>, uuid: CategoryUuid) -> Result<bool, rorm::Error> {
        let affected = rorm::delete(exe, CategoryModel)
            .condition(CategoryModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }
}

impl From<CategoryModel> for Category {
    fn from(value: CategoryModel) -> Self {
        Self {
            uuid: CategoryUuid(value.uuid),
            name: value.name,
            created_at: value.created_at,
        }
    }
}
