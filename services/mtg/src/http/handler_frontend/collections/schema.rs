use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::collection::Collection;
use crate::models::collection::CollectionUuid;
use crate::models::visibility::Visibility;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CollectionResponse {
    pub uuid: CollectionUuid,
    pub name: MaxStr<255>,
    pub description: MaxStr<1024>,
    pub visibility: Visibility,
    pub share_token: Option<MaxStr<64>>,
    pub created_at: SchemaDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateCollectionRequest {
    pub name: MaxStr<255>,
    pub description: MaxStr<1024>,
    pub visibility: Visibility,
}

/// Request to change who may see a collection
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SetCollectionVisibilityRequest {
    /// The visibility to switch to
    pub visibility: Visibility,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateCollectionRequest {
    pub name: MaxStr<255>,
    pub description: MaxStr<1024>,
}

/// The freshly minted secret of a collection's share link
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RotateShareTokenResponse {
    /// The new secret — every link handed out before this call stopped working
    pub share_token: MaxStr<64>,
}

impl From<Collection> for CollectionResponse {
    fn from(collection: Collection) -> Self {
        Self {
            uuid: collection.uuid,
            name: collection.name,
            visibility: collection.visibility,
            share_token: collection.share_token,
            description: collection.description,
            created_at: SchemaDateTime(collection.created_at),
        }
    }
}
