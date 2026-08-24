//! Handlers for the card-wide tags

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

use crate::http::handler_frontend::decks::schema::DeckTagResponse;
use crate::http::handler_frontend::tags::schema::CreateGlobalTagRequest;
use crate::http::handler_frontend::tags::schema::ListGlobalTagsResponse;
use crate::http::handler_frontend::tags::schema::UpdateGlobalTagRequest;
use crate::models::account::Account;
use crate::models::deck::DeckAccess;
use crate::models::deck::tag::DeckTag;
use crate::models::deck::tag::DeckTagInsert;
use crate::models::deck::tag::DeckTagUuid;

/// Every tag the account keeps for all of its decks and collections
#[get("/")]
pub async fn get_all_global_tags(account: Account) -> ApiResult<ApiJson<ListGlobalTagsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let tags = DeckTag::get_global(&mut tx, account.uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(ListGlobalTagsResponse {
        tags: tags.into_iter().map(DeckTagResponse::from).collect(),
    }))
}

/// Create a tag that follows a card through every deck and every collection
///
/// The same thing a deck's tag manager makes when it is asked for a global tag,
/// reachable without naming a deck: a shelf is worth sorting before the first
/// deck exists.
#[post("/")]
pub async fn create_global_tag(
    account: Account,
    ApiJson(CreateGlobalTagRequest { name, color, icon }): ApiJson<CreateGlobalTagRequest>,
) -> ApiResult<ApiJson<DeckTagResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let tag = DeckTag::create(
        &mut tx,
        account.uuid,
        DeckTagInsert {
            deck: None,
            name,
            color,
            icon,
        },
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(DeckTagResponse::from(tag)))
}

/// Rename a card-wide tag or change its marker
#[put("/{tag}")]
pub async fn update_global_tag(
    account: Account,
    Path(tag_uuid): Path<DeckTagUuid>,
    ApiJson(UpdateGlobalTagRequest { name, color, icon }): ApiJson<UpdateGlobalTagRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match DeckTag::update_global(&mut tx, account.uuid, tag_uuid, name, color, icon).await? {
        DeckAccess::Granted(()) => {}
        DeckAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Throw a card-wide tag away, taking it off every card it sat on
#[delete("/{tag}")]
pub async fn delete_global_tag(
    account: Account,
    Path(tag_uuid): Path<DeckTagUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match DeckTag::delete_global(&mut tx, account.uuid, tag_uuid).await? {
        DeckAccess::Granted(()) => {}
        DeckAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}
