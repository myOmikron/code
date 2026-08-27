//! Handlers for the watch lists

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;

use crate::http::handler_frontend::watch_lists::schema::AddWatchListEntryRequest;
use crate::http::handler_frontend::watch_lists::schema::CreateWatchListRequest;
use crate::http::handler_frontend::watch_lists::schema::ListWatchListAlarmsResponse;
use crate::http::handler_frontend::watch_lists::schema::ListWatchListCopiesResponse;
use crate::http::handler_frontend::watch_lists::schema::ListWatchListEntriesResponse;
use crate::http::handler_frontend::watch_lists::schema::ListWatchListsResponse;
use crate::http::handler_frontend::watch_lists::schema::UpdateWatchListEntryRequest;
use crate::http::handler_frontend::watch_lists::schema::UpdateWatchListRequest;
use crate::http::handler_frontend::watch_lists::schema::WatchListAlarmResponse;
use crate::http::handler_frontend::watch_lists::schema::WatchListEntryResponse;
use crate::http::handler_frontend::watch_lists::schema::WatchListOverviewResponse;
use crate::http::handler_frontend::watch_lists::schema::WatchListResponse;
use crate::http::handler_frontend::watch_lists::schema::WatchedCopyResponse;
use crate::models::account::Account;
use crate::models::watch_list::WatchList;
use crate::models::watch_list::WatchListAccess;
use crate::models::watch_list::WatchListEntry;
use crate::models::watch_list::WatchListEntryInsert;
use crate::models::watch_list::WatchListEntryPatch;
use crate::models::watch_list::WatchListEntryUuid;
use crate::models::watch_list::WatchListInsert;
use crate::models::watch_list::WatchListUpdate;
use crate::models::watch_list::WatchListUuid;
use crate::models::watch_list::alarms::TriggeredAlarm;
use crate::models::watch_list::availability::WatchedEntry;
use crate::models::watch_list::copies::WatchedCopy;
use crate::models::watch_list::listing::WatchListSummary;

/// Every watch list the account keeps
#[get("/")]
pub async fn get_all_watch_lists(account: Account) -> ApiResult<ApiJson<ListWatchListsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let lists = WatchListSummary::read_for_account(&mut tx, account.uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(ListWatchListsResponse {
        lists: lists
            .into_iter()
            .map(WatchListOverviewResponse::from)
            .collect(),
    }))
}

/// Start a new watch list
#[post("/")]
pub async fn create_watch_list(
    account: Account,
    ApiJson(CreateWatchListRequest {
        name,
        description,
        color,
        icon,
    }): ApiJson<CreateWatchListRequest>,
) -> ApiResult<ApiJson<WatchListResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let list = WatchList::create(
        &mut tx,
        account.uuid,
        WatchListInsert {
            name,
            description,
            color,
            icon,
        },
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(WatchListResponse::from(list)))
}

/// Every alarm standing across the account's watch lists
///
/// What the navigation badge is drawn from, which is why it is reachable
/// without naming a list: the point of an alarm is to be seen from wherever the
/// reader happens to be.
#[get("/alarms")]
pub async fn get_watch_list_alarms(
    account: Account,
) -> ApiResult<ApiJson<ListWatchListAlarmsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let alarms = TriggeredAlarm::read_for_account(&mut tx, account.uuid).await?;

    tx.commit().await?;

    let unread = alarms.iter().filter(|alarm| !alarm.acknowledged).count() as i64;
    Ok(ApiJson(ListWatchListAlarmsResponse {
        alarms: alarms
            .into_iter()
            .map(|alarm| WatchListAlarmResponse {
                watch_list: alarm.watch_list,
                watch_list_name: alarm.watch_list_name,
                entry: alarm.entry,
                name: alarm.name,
                triggered_price_cents: alarm.triggered_price_cents,
                alarm_price_cents: alarm.alarm_price_cents,
                triggered_at: SchemaDateTime(alarm.triggered_at),
            })
            .collect(),
        unread,
    }))
}

/// One watch list, without what is on it
#[get("/{list}")]
pub async fn get_watch_list(
    account: Account,
    Path(list_uuid): Path<WatchListUuid>,
) -> ApiResult<ApiJson<WatchListResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let list = WatchList::get(&mut tx, account.uuid, list_uuid).await?;

    tx.commit().await?;

    match list {
        Some(list) => Ok(ApiJson(WatchListResponse::from(list))),
        None => Err(ApiError::bad_request("Request was denied")),
    }
}

/// Rename a watch list or change its marker
#[put("/{list}")]
pub async fn update_watch_list(
    account: Account,
    Path(list_uuid): Path<WatchListUuid>,
    ApiJson(UpdateWatchListRequest {
        name,
        description,
        color,
        icon,
    }): ApiJson<UpdateWatchListRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match WatchList::update(
        &mut tx,
        account.uuid,
        list_uuid,
        WatchListUpdate {
            name,
            description,
            color,
            icon,
        },
    )
    .await?
    {
        WatchListAccess::Granted(()) => {}
        WatchListAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Throw a watch list away, taking every entry on it with it
#[delete("/{list}")]
pub async fn delete_watch_list(
    account: Account,
    Path(list_uuid): Path<WatchListUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match WatchList::delete(&mut tx, account.uuid, list_uuid).await? {
        WatchListAccess::Granted(()) => {}
        WatchListAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Everything one watch list page is drawn from
///
/// The catalog data, the stock counts and the alarm state in one request: the
/// counting follows each entry's own switches, so it is the database that does
/// it and the client is handed numbers rather than the whole shelf.
#[get("/{list}/entries")]
pub async fn list_watch_list_entries(
    account: Account,
    Path(list_uuid): Path<WatchListUuid>,
) -> ApiResult<ApiJson<ListWatchListEntriesResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    // Checked here rather than folded into the listing query: that one is
    // hand-written sql, and an ownership condition spelled out inside it is a
    // thing to forget the next time it is edited.
    let Some(list) = WatchList::get(&mut tx, account.uuid, list_uuid).await? else {
        return Err(ApiError::bad_request("Request was denied"));
    };

    let entries = WatchedEntry::read_for_list(&mut tx, account.uuid, list_uuid).await?;

    tx.commit().await?;

    let prices_updated_at = entries
        .iter()
        .filter_map(|entry| entry.card.as_ref().map(|card| card.updated_at))
        .max()
        .map(SchemaDateTime);

    Ok(ApiJson(ListWatchListEntriesResponse {
        list: WatchListResponse::from(list),
        entries: entries
            .into_iter()
            .map(WatchListEntryResponse::from)
            .collect(),
        prices_updated_at,
    }))
}

/// Put a card on a watch list
#[post("/{list}/entries")]
pub async fn add_watch_list_entry(
    account: Account,
    Path(list_uuid): Path<WatchListUuid>,
    ApiJson(AddWatchListEntryRequest {
        printing,
        finish,
        exact_printing,
        match_finish,
        wanted,
        note,
        alarm_price_cents,
    }): ApiJson<AddWatchListEntryRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match WatchList::may_administer(&mut tx, account.uuid, list_uuid).await? {
        WatchListAccess::Granted(()) => {}
        WatchListAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    WatchListEntry::create(
        &mut tx,
        list_uuid,
        WatchListEntryInsert {
            printing,
            finish,
            exact_printing,
            match_finish,
            wanted,
            note,
            alarm_price_cents,
        },
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Change some of an entry's fields, leaving the rest alone
#[put("/{list}/entries/{entry}")]
pub async fn update_watch_list_entry(
    account: Account,
    Path((list_uuid, entry_uuid)): Path<(WatchListUuid, WatchListEntryUuid)>,
    ApiJson(UpdateWatchListEntryRequest {
        printing,
        finish,
        exact_printing,
        match_finish,
        wanted,
        note,
        alarm_price_cents,
    }): ApiJson<UpdateWatchListEntryRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match WatchList::may_administer(&mut tx, account.uuid, list_uuid).await? {
        WatchListAccess::Granted(()) => {}
        WatchListAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    match WatchListEntry::update(
        &mut tx,
        list_uuid,
        entry_uuid,
        WatchListEntryPatch {
            printing,
            finish,
            exact_printing,
            match_finish,
            wanted,
            note,
            alarm_price_cents,
        },
    )
    .await?
    {
        WatchListAccess::Granted(_) => {}
        WatchListAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Where the copies of one watched card are
///
/// Fetched when a row is opened rather than with the list: most rows are never
/// opened, and a shelf of full collections is a lot of stacks to send along on
/// the chance that one of them is.
#[get("/{list}/entries/{entry}/copies")]
pub async fn list_watch_list_copies(
    account: Account,
    Path((list_uuid, entry_uuid)): Path<(WatchListUuid, WatchListEntryUuid)>,
) -> ApiResult<ApiJson<ListWatchListCopiesResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    match WatchList::may_administer(&mut tx, account.uuid, list_uuid).await? {
        WatchListAccess::Granted(()) => {}
        WatchListAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    let copies = WatchedCopy::read_for_entry(&mut tx, account.uuid, list_uuid, entry_uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(ListWatchListCopiesResponse {
        copies: copies.into_iter().map(WatchedCopyResponse::from).collect(),
    }))
}

/// Take a card off a watch list
#[delete("/{list}/entries/{entry}")]
pub async fn delete_watch_list_entry(
    account: Account,
    Path((list_uuid, entry_uuid)): Path<(WatchListUuid, WatchListEntryUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match WatchList::may_administer(&mut tx, account.uuid, list_uuid).await? {
        WatchListAccess::Granted(()) => {}
        WatchListAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    match WatchListEntry::delete(&mut tx, list_uuid, entry_uuid).await? {
        WatchListAccess::Granted(()) => {}
        WatchListAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Mark an alarm as seen
///
/// Only the reading is recorded. The alarm itself stays on the entry until the
/// price rises back through the threshold, because it is still true.
#[post("/{list}/entries/{entry}/acknowledge")]
pub async fn acknowledge_watch_list_alarm(
    account: Account,
    Path((list_uuid, entry_uuid)): Path<(WatchListUuid, WatchListEntryUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match WatchList::may_administer(&mut tx, account.uuid, list_uuid).await? {
        WatchListAccess::Granted(()) => {}
        WatchListAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    match WatchListEntry::acknowledge(&mut tx, list_uuid, entry_uuid).await? {
        WatchListAccess::Granted(()) => {}
        WatchListAccess::Denied => return Err(ApiError::bad_request("Request was denied")),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}
