use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::MaxStr;
use time::OffsetDateTime;
use uuid::Uuid;

/// A category grouping items in the shop view
#[derive(Model, Debug, Clone)]
#[rorm(rename = "category")]
pub struct CategoryModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The name of the category
    #[rorm(unique)]
    pub name: MaxStr<255>,

    /// The point in time the category was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`CategoryModel`]
#[derive(Patch)]
#[rorm(model = "CategoryModel")]
pub struct CategoryInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The name of the category
    pub name: MaxStr<255>,
}
