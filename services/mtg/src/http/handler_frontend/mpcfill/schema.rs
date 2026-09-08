//! Schemas for [`super::handler`]

use std::sync::Arc;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::modules::mpcfill::Image;

/// The cards to look for art for
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MpcFillSearchRequest {
    /// The names to look for, as printed
    ///
    /// One entry per face rather than per card: the two halves of a
    /// double-faced card are two images in an order, and only the caller knows
    /// which half it is asking about.
    pub names: Vec<MaxStr<512>>,
}

/// What MPCFill has for the cards that were asked about
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MpcFillSearchResponse {
    /// One entry per name, in the order they were asked
    pub results: Vec<MpcFillArtResponse>,
}

/// The art found for one name
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MpcFillArtResponse {
    /// The name this answers, as it was asked
    pub name: String,
    /// What was found, in the order MPCFill ranks it — empty for a card nobody drew
    pub images: Vec<MpcFillImageResponse>,
}

/// The card backs MPCFill offers
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MpcFillCardbacksResponse {
    /// The backs, in the order MPCFill ranks them
    pub cardbacks: Vec<MpcFillImageResponse>,
}

/// One image of one card
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MpcFillImageResponse {
    /// The Google Drive file id — what the order xml names
    pub id: String,
    /// The file's name in the drive, which is what the order xml carries along
    pub name: String,
    /// The drive it came from, as its owner named it
    pub source: String,
    /// The resolution it was uploaded at
    pub dpi: i64,
    /// How large the file is, in bytes
    pub size: i64,
    /// The language the card is printed in, as a two-letter code
    pub language: String,
    /// What the image is tagged with, e.g. `NSFW`, `Extended`
    pub tags: Vec<String>,
    /// A thumbnail 400 pixels across, for a picker's grid
    pub thumbnail_small: String,
    /// A thumbnail 800 pixels across, for looking at one closely
    pub thumbnail_medium: String,
}

impl From<&Arc<Image>> for MpcFillImageResponse {
    fn from(image: &Arc<Image>) -> Self {
        Self {
            id: image.id.clone(),
            name: image.name.clone(),
            source: image.source.clone(),
            dpi: image.dpi,
            size: image.size,
            language: image.language.clone(),
            tags: image.tags.clone(),
            thumbnail_small: image.thumbnail_small.clone(),
            thumbnail_medium: image.thumbnail_medium.clone(),
        }
    }
}
