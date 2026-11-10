//! Schemas for [`super::handler`]

use std::sync::Arc;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::mpcfill::MpcFillFavorite;
use crate::models::mpcfill::MpcFillImage;
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

/// An MPCFill image as it was found when it was starred
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MpcFillFavoriteImage {
    /// The Google Drive file id
    pub drive_id: MaxStr<128>,
    /// The file's name in its drive
    pub file_name: MaxStr<255>,
    /// The drive it lies in
    pub source: MaxStr<255>,
    /// Its resolution
    pub dpi: i64,
    /// Its size in bytes
    pub size: i64,
}

/// Request to star an image
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct StarMpcFillImageRequest {
    /// The card face it is starred for, `None` for a cardback
    pub face: Option<MaxStr<255>>,
    /// The image
    pub image: MpcFillFavoriteImage,
}

/// Request to move a star to the file that replaced the starred one
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ReplaceMpcFillFavoriteRequest {
    /// The file that replaced it
    pub image: MpcFillFavoriteImage,
}

/// Request to set the starred drives
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SetMpcFillFavoriteDrivesRequest {
    /// The drives' names, first one first
    pub sources: Vec<MaxStr<255>>,
}

/// An image the account starred
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MpcFillFavoriteResponse {
    /// The card face it was starred for, `None` for a cardback
    pub face: Option<MaxStr<255>>,
    /// The image
    pub image: MpcFillFavoriteImage,
    /// When it was starred
    pub starred_at: SchemaDateTime,
}

/// Everything the account starred
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MpcFillFavoritesResponse {
    /// The starred images, newest first
    pub images: Vec<MpcFillFavoriteResponse>,
    /// The starred drives, first one first
    pub drives: Vec<MaxStr<255>>,
}

impl From<MpcFillImage> for MpcFillFavoriteImage {
    fn from(image: MpcFillImage) -> Self {
        Self {
            drive_id: image.drive_id,
            file_name: image.file_name,
            source: image.source,
            dpi: image.dpi,
            size: image.size,
        }
    }
}

impl From<MpcFillFavoriteImage> for MpcFillImage {
    fn from(image: MpcFillFavoriteImage) -> Self {
        Self {
            drive_id: image.drive_id,
            file_name: image.file_name,
            source: image.source,
            dpi: image.dpi,
            size: image.size,
        }
    }
}

impl From<MpcFillFavorite> for MpcFillFavoriteResponse {
    fn from(favorite: MpcFillFavorite) -> Self {
        Self {
            face: favorite.face,
            image: MpcFillFavoriteImage::from(favorite.image),
            starred_at: SchemaDateTime(favorite.starred_at),
        }
    }
}
