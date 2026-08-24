//! Schemas for the card-wide tags

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::http::handler_frontend::decks::schema::DeckTagResponse;

/// The card-wide tags an account keeps
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListGlobalTagsResponse {
    /// The tags, by name
    pub tags: Vec<DeckTagResponse>,
}

/// Request to rename a card-wide tag or change its marker
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateGlobalTagRequest {
    /// What the tag is called
    pub name: MaxStr<64>,
    /// The colour it is drawn in
    pub color: MaxStr<16>,
    /// The icon drawn inside its colour marker
    pub icon: MaxStr<32>,
}

/// Request to create a tag that follows a card everywhere
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateGlobalTagRequest {
    /// What the tag is called
    pub name: MaxStr<64>,
    /// The colour it is drawn in
    pub color: MaxStr<16>,
    /// The icon drawn inside its colour marker
    pub icon: MaxStr<32>,
}
