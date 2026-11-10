//! Handlers for MPCFill's art index

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;
use tracing::warn;

use crate::http::handler_frontend::mpcfill::schema::MpcFillArtResponse;
use crate::http::handler_frontend::mpcfill::schema::MpcFillCardbacksResponse;
use crate::http::handler_frontend::mpcfill::schema::MpcFillFavoriteResponse;
use crate::http::handler_frontend::mpcfill::schema::MpcFillFavoritesResponse;
use crate::http::handler_frontend::mpcfill::schema::MpcFillImageResponse;
use crate::http::handler_frontend::mpcfill::schema::MpcFillSearchRequest;
use crate::http::handler_frontend::mpcfill::schema::MpcFillSearchResponse;
use crate::http::handler_frontend::mpcfill::schema::ReplaceMpcFillFavoriteRequest;
use crate::http::handler_frontend::mpcfill::schema::SetMpcFillFavoriteDrivesRequest;
use crate::http::handler_frontend::mpcfill::schema::StarMpcFillImageRequest;
use crate::models::account::Account;
use crate::models::mpcfill::MpcFillFavorite;
use crate::models::mpcfill::MpcFillFavoriteDrives;
use crate::models::mpcfill::MpcFillFavoriteUuid;
use crate::modules::mpcfill::MpcFill;

/// How many names one request may ask about
///
/// A commander deck is a hundred cards and a two-faced card is two names, so
/// this takes the largest sensible order in one request while still being a
/// bound on what one reader can ask MPCFill for at a time.
const MAX_NAMES: usize = 300;

/// How many drives an account may star
const MAX_FAVORITE_DRIVES: usize = 64;

/// The art MPCFill has for these cards
///
/// One list per name, in the order they were asked, each in the order MPCFill
/// ranks it. Every image carries the Google Drive id an order xml names it by,
/// plus the thumbnails to show it with, so a client can put the art in front
/// of a reader and write the order they pick.
///
/// Proxied rather than asked from the browser: MPCFill answers cross-origin
/// requests for their own site only. The answers are cached for a few hours per
/// name, so picking through a deck card by card is one request per card at
/// worst, not one per click.
#[post("/search")]
pub async fn search_mpcfill_art(
    ApiJson(MpcFillSearchRequest { names }): ApiJson<MpcFillSearchRequest>,
) -> ApiResult<ApiJson<MpcFillSearchResponse>> {
    if names.len() > MAX_NAMES {
        return Err(ApiError::bad_request("Too many cards in one request"));
    }

    let names: Vec<String> = names.into_iter().map(MaxStr::into_inner).collect();
    let found = MpcFill::global()
        .images_for(&names)
        .await
        .map_err(|error| {
            warn!(%error, "MPCFill did not answer the search");
            ApiError::server_error("MPCFill did not answer")
        })?;

    Ok(ApiJson(MpcFillSearchResponse {
        results: names
            .into_iter()
            .zip(found)
            .map(|(name, images)| MpcFillArtResponse {
                name,
                images: images.iter().map(MpcFillImageResponse::from).collect(),
            })
            .collect(),
    }))
}

/// The card backs MPCFill offers
///
/// An order names one back for every card that does not bring its own, so this
/// is the list that choice is made from. The same for everybody, so it is
/// fetched once and held for a few hours.
#[get("/cardbacks")]
pub async fn get_mpcfill_cardbacks() -> ApiResult<ApiJson<MpcFillCardbacksResponse>> {
    let cardbacks = MpcFill::global().cardbacks().await.map_err(|error| {
        warn!(%error, "MPCFill did not answer the cardbacks");
        ApiError::server_error("MPCFill did not answer")
    })?;

    Ok(ApiJson(MpcFillCardbacksResponse {
        cardbacks: cardbacks.iter().map(MpcFillImageResponse::from).collect(),
    }))
}

/// Everything the account starred
#[get("/favorites")]
pub async fn get_mpcfill_favorites(
    account: Account,
) -> ApiResult<ApiJson<MpcFillFavoritesResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let images = MpcFillFavorite::all_for(&mut tx, account.uuid).await?;
    let drives = MpcFillFavoriteDrives::all_for(&mut tx, account.uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(MpcFillFavoritesResponse {
        images: images
            .into_iter()
            .map(MpcFillFavoriteResponse::from)
            .collect(),
        drives,
    }))
}

/// Star an image for a face, or star it again as the newest
#[put("/favorites/images")]
pub async fn star_mpcfill_image(
    account: Account,
    ApiJson(StarMpcFillImageRequest { face, image }): ApiJson<StarMpcFillImageRequest>,
) -> ApiResult<ApiJson<MpcFillFavoriteResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let favorite = MpcFillFavorite::star(&mut tx, account.uuid, face, image).await?;

    tx.commit().await?;

    Ok(ApiJson(MpcFillFavoriteResponse::from(favorite)))
}

/// Take the star off an image
#[delete("/favorites/images/{favorite}")]
pub async fn unstar_mpcfill_image(
    account: Account,
    Path(favorite): Path<MpcFillFavoriteUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    MpcFillFavorite::unstar(&mut tx, account.uuid, favorite).await?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Move a star to the file that replaced its image
#[put("/favorites/images/{favorite}/replacement")]
pub async fn replace_mpcfill_favorite(
    account: Account,
    Path(favorite): Path<MpcFillFavoriteUuid>,
    ApiJson(ReplaceMpcFillFavoriteRequest { image }): ApiJson<ReplaceMpcFillFavoriteRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    MpcFillFavorite::replace(&mut tx, account.uuid, favorite, image).await?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Set the starred drives, first one first
#[put("/favorites/drives")]
pub async fn set_mpcfill_favorite_drives(
    account: Account,
    ApiJson(SetMpcFillFavoriteDrivesRequest { sources }): ApiJson<SetMpcFillFavoriteDrivesRequest>,
) -> ApiResult<ApiJson<()>> {
    if sources.len() > MAX_FAVORITE_DRIVES {
        return Err(ApiError::bad_request("Too many drives"));
    }

    let mut tx = Database::global().start_transaction().await?;

    MpcFillFavoriteDrives::set(&mut tx, account.uuid, sources).await?;

    tx.commit().await?;

    Ok(ApiJson(()))
}
