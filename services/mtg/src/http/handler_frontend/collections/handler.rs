use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::SchemaDate;
use galvyn::delete;
use galvyn::get;
use galvyn::patch;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;

use crate::http::handler_frontend::collections::schema::AddCollectionEntriesRequest;
use crate::http::handler_frontend::collections::schema::CollectionEntryResponse;
use crate::http::handler_frontend::collections::schema::CollectionResponse;
use crate::http::handler_frontend::collections::schema::CollectionStatisticsResponse;
use crate::http::handler_frontend::collections::schema::CreateCollectionRequest;
use crate::http::handler_frontend::collections::schema::ListCardsQuery;
use crate::http::handler_frontend::collections::schema::ListCardsResponse;
use crate::http::handler_frontend::collections::schema::ListCollectionEntriesResponse;
use crate::http::handler_frontend::collections::schema::ListedEntryResponse;
use crate::http::handler_frontend::collections::schema::MergeCollectionEntriesRequest;
use crate::http::handler_frontend::collections::schema::RotateShareTokenResponse;
use crate::http::handler_frontend::collections::schema::SetCollectionVisibilityRequest;
use crate::http::handler_frontend::collections::schema::SplitCollectionEntryRequest;
use crate::http::handler_frontend::collections::schema::SplitCollectionEntryResponse;
use crate::http::handler_frontend::collections::schema::UpdateCollectionEntryRequest;
use crate::http::handler_frontend::collections::schema::UpdateCollectionRequest;
use crate::models::account::Account;
use crate::models::collection::Collection;
use crate::models::collection::CollectionAccess;
use crate::models::collection::CollectionEntry;
use crate::models::collection::CollectionEntryInsert;
use crate::models::collection::CollectionEntryPatch;
use crate::models::collection::CollectionEntrySplit;
use crate::models::collection::CollectionEntryUuid;
use crate::models::collection::CollectionInsert;
use crate::models::collection::CollectionUuid;
use crate::models::collection::MergeOutcome;
use crate::models::collection::SplitOutcome;
use crate::models::collection::listing::EntryPage;
use crate::models::collection::listing::EntryQuery;
use crate::models::collection::listing::MAX_LIMIT;
use crate::models::collection::statistics::CollectionStatistics;

#[get("/")]
pub async fn get_all_collections(account: Account) -> ApiResult<ApiJson<Vec<CollectionResponse>>> {
    let mut tx = Database::global().start_transaction().await?;

    let res = Collection::get_all_for_account(&mut tx, account.uuid)
        .await?
        .into_iter()
        .map(CollectionResponse::from)
        .collect();

    tx.commit().await?;

    Ok(ApiJson(res))
}

#[post("/")]
pub async fn create_collection(
    account: Account,
    ApiJson(CreateCollectionRequest {
        name,
        description,
        visibility,
    }): ApiJson<CreateCollectionRequest>,
) -> ApiResult<ApiJson<CollectionResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let collection = Collection::create(
        &mut tx,
        account.uuid,
        CollectionInsert {
            name,
            description,
            visibility,
        },
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(CollectionResponse::from(collection)))
}

/// Fetch a single collection
///
/// Resolves for the owner and for anything public — a page showing one
/// collection should not have to pull the whole list to learn its name.
#[get("/{collection}")]
pub async fn get_collection(
    account: Account,
    Path(collection_uuid): Path<CollectionUuid>,
) -> ApiResult<ApiJson<CollectionResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let collection = Collection::get_visible(&mut tx, collection_uuid, Some(account.uuid))
        .await?
        .ok_or_else(|| ApiError::bad_request("Request was denied"))?;

    tx.commit().await?;

    Ok(ApiJson(CollectionResponse::from(collection)))
}

/// Change who may see a collection
#[post("/{collection}")]
pub async fn set_visibility_collection(
    account: Account,
    Path(collection_uuid): Path<CollectionUuid>,
    ApiJson(SetCollectionVisibilityRequest { visibility }): ApiJson<SetCollectionVisibilityRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match Collection::set_visibility(&mut tx, account.uuid, collection_uuid, visibility).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;
    Ok(ApiJson(()))
}

#[put("/{collection}")]
pub async fn update_collection(
    account: Account,
    Path(collection_uuid): Path<CollectionUuid>,
    ApiJson(UpdateCollectionRequest { name, description }): ApiJson<UpdateCollectionRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match Collection::update(&mut tx, account.uuid, collection_uuid, name, description).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

#[delete("/{collection}")]
pub async fn delete_collection(
    account: Account,
    Path(collection_uuid): Path<CollectionUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match Collection::delete(&mut tx, account.uuid, collection_uuid).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Mint a fresh secret for a collection's share link
///
/// Invalidates every link handed out so far. Does not change the visibility —
/// a token only resolves while the collection is `Unlisted`.
#[post("/{collection}/share-token")]
pub async fn rotate_share_token(
    account: Account,
    Path(collection_uuid): Path<CollectionUuid>,
) -> ApiResult<ApiJson<RotateShareTokenResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let share_token =
        match Collection::rotate_share_token(&mut tx, account.uuid, collection_uuid).await? {
            CollectionAccess::Granted(token) => token,
            CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
        };

    tx.commit().await?;

    Ok(ApiJson(RotateShareTokenResponse { share_token }))
}

/// List a page of a collection's cards, sorted and filtered
///
/// The endpoint the card list is meant to be read through. Everything comes out
/// of one query joined against the catalog, so a page costs one request and the
/// client resolves nothing against Scryfall.
#[get("/{collection}/cards")]
pub async fn list_collection_cards(
    account: Account,
    Path(collection_uuid): Path<CollectionUuid>,
    Query(query): Query<ListCardsQuery>,
) -> ApiResult<ApiJson<ListCardsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    // Checked here rather than folded into the listing query: that one is
    // hand-written sql, and an ownership condition spelled out inside it is a
    // thing to forget the next time it is edited.
    match Collection::may_administer(&mut tx, collection_uuid, account.uuid).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    let limit = query.limit.clamp(1, MAX_LIMIT);
    let page = EntryPage::read(
        &mut tx,
        collection_uuid,
        &EntryQuery {
            sort: query.sort,
            descending: query.descending,
            limit,
            offset: query.offset,
            after: query.after,
            search: query.search,
            condition: query.condition,
            finish: query.finish,
            rarity: query.rarity,
            printing: query.printing,
        },
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(ListCardsResponse {
        entries: page
            .entries
            .into_iter()
            .map(ListedEntryResponse::from)
            .collect(),
        total: page.total,
        limit,
        offset: query.offset,
        next_cursor: page.next_cursor,
    }))
}

/// Count a collection's statistics
///
/// Everything the statistics tab draws, from one query joined against the
/// catalog — the client fetches this single object instead of every entry and
/// every card behind it. All money is euro cents, all counts are copies.
#[get("/{collection}/statistics")]
pub async fn get_collection_statistics(
    account: Account,
    Path(collection_uuid): Path<CollectionUuid>,
) -> ApiResult<ApiJson<CollectionStatisticsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    // Checked here rather than folded into the statistics query: that one is
    // hand-written sql, and an ownership condition spelled out inside it is a
    // thing to forget the next time it is edited.
    match Collection::may_administer(&mut tx, collection_uuid, account.uuid).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    let statistics = CollectionStatistics::compute(&mut tx, collection_uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(CollectionStatisticsResponse::from(statistics)))
}

/// List every stack filed in a collection
///
/// Superseded by [`list_collection_cards`], which pages and carries the card
/// data with it. Kept while the import dialog still reads the whole collection
/// to work out what it would be topping up.
#[get("/{collection}/entries")]
pub async fn list_collection_entries(
    account: Account,
    Path(collection_uuid): Path<CollectionUuid>,
) -> ApiResult<ApiJson<ListCollectionEntriesResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let entries = CollectionEntry::get_all_in_collection(&mut tx, account.uuid, collection_uuid)
        .await?
        .into_iter()
        .map(CollectionEntryResponse::from)
        .collect();

    tx.commit().await?;

    Ok(ApiJson(ListCollectionEntriesResponse { entries }))
}

/// File stacks of cards into a collection
#[post("/{collection}/entries")]
pub async fn add_collection_entries(
    account: Account,
    Path(collection_uuid): Path<CollectionUuid>,
    ApiJson(AddCollectionEntriesRequest { entries }): ApiJson<AddCollectionEntriesRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    // The insert cannot carry the ownership condition itself, so it is checked
    // first — inside the same transaction, so nothing can change in between.
    match Collection::may_administer(&mut tx, collection_uuid, account.uuid).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    let inserts = entries
        .into_iter()
        .map(|entry| CollectionEntryInsert {
            printing: entry.printing,
            quantity: entry.quantity,
            condition: entry.condition,
            finish: entry.finish,
            purchase_price_cents: entry.purchase_price_cents,
            acquired_at: entry.acquired_at.map(|date| date.0),
        })
        .collect();
    CollectionEntry::create_many(&mut tx, collection_uuid, inserts).await?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Change a stack: its count, condition, finish, price, acquisition date or printing
///
/// Every field is optional; whatever is left out stays as it is.
#[patch("/{collection}/entries/{entry}")]
pub async fn update_collection_entry(
    account: Account,
    Path((collection_uuid, entry_uuid)): Path<(CollectionUuid, CollectionEntryUuid)>,
    ApiJson(request): ApiJson<UpdateCollectionEntryRequest>,
) -> ApiResult<ApiJson<CollectionEntryResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    match Collection::may_administer(&mut tx, collection_uuid, account.uuid).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    if request.quantity.is_some_and(|quantity| quantity < 1) {
        return Err(ApiError::bad_request("A stack holds at least one copy"));
    }

    let patch = CollectionEntryPatch {
        printing: request.printing,
        quantity: request.quantity,
        condition: request.condition,
        finish: request.finish,
        purchase_price_cents: request.purchase_price_cents,
        acquired_at: request
            .acquired_at
            .map(|date| date.map(|SchemaDate(date)| date)),
    };

    let entry = match CollectionEntry::update(&mut tx, collection_uuid, entry_uuid, patch).await? {
        CollectionAccess::Granted(entry) => entry,
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    };

    tx.commit().await?;

    Ok(ApiJson(CollectionEntryResponse::from(entry)))
}

/// Move copies out of a stack into a new one
///
/// For the case where part of a stack is no longer interchangeable with the
/// rest — one of four copies got played, or was sleeved as a foil by mistake.
#[post("/{collection}/entries/{entry}/split")]
pub async fn split_collection_entry(
    account: Account,
    Path((collection_uuid, entry_uuid)): Path<(CollectionUuid, CollectionEntryUuid)>,
    ApiJson(request): ApiJson<SplitCollectionEntryRequest>,
) -> ApiResult<ApiJson<SplitCollectionEntryResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    match Collection::may_administer(&mut tx, collection_uuid, account.uuid).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    let split = CollectionEntrySplit {
        condition: request.condition,
        finish: request.finish,
        purchase_price_cents: request.purchase_price_cents,
        acquired_at: request
            .acquired_at
            .map(|date| date.map(|SchemaDate(date)| date)),
    };

    let (source, created) = match CollectionEntry::split(
        &mut tx,
        collection_uuid,
        entry_uuid,
        request.quantity,
        split,
    )
    .await?
    {
        SplitOutcome::Split { source, created } => (source, created),
        SplitOutcome::Denied => return Err(ApiError::bad_request("Request was denied")),
        SplitOutcome::TooFewCopies => {
            return Err(ApiError::bad_request(
                "Fewer copies than the stack holds have to move out",
            ));
        }
    };

    tx.commit().await?;

    Ok(ApiJson(SplitCollectionEntryResponse {
        source: CollectionEntryResponse::from(source),
        created: CollectionEntryResponse::from(created),
    }))
}

/// Combine stacks of the same cards into one
///
/// The oldest of them survives and takes over the copies, the averaged purchase
/// price and the earliest acquisition date.
#[post("/{collection}/entries/merge")]
pub async fn merge_collection_entries(
    account: Account,
    Path(collection_uuid): Path<CollectionUuid>,
    ApiJson(MergeCollectionEntriesRequest { entries }): ApiJson<MergeCollectionEntriesRequest>,
) -> ApiResult<ApiJson<CollectionEntryResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    match Collection::may_administer(&mut tx, collection_uuid, account.uuid).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    let merged = match CollectionEntry::merge(&mut tx, collection_uuid, &entries).await? {
        MergeOutcome::Merged(entry) => entry,
        MergeOutcome::Denied => return Err(ApiError::bad_request("Request was denied")),
        MergeOutcome::Incompatible => {
            return Err(ApiError::bad_request(
                "Only two or more stacks of the same printing, condition and finish can be merged",
            ));
        }
    };

    tx.commit().await?;

    Ok(ApiJson(CollectionEntryResponse::from(merged)))
}

/// Remove a stack from a collection
#[delete("/{collection}/entries/{entry}")]
pub async fn delete_collection_entry(
    account: Account,
    Path((collection_uuid, entry_uuid)): Path<(CollectionUuid, CollectionEntryUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match Collection::may_administer(&mut tx, collection_uuid, account.uuid).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    match CollectionEntry::delete(&mut tx, collection_uuid, entry_uuid).await? {
        CollectionAccess::Granted(_) => {}
        CollectionAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}
