use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use galvyn::rorm::Database;

use crate::http::handler_frontend::admin::log::schema::AdminListLogQuery;
use crate::http::handler_frontend::admin::log::schema::AdminListLogResponse;
use crate::http::handler_frontend::admin::log::schema::AdminLogEntryResponse;
use crate::http::handler_frontend::admin::page_limit;
use crate::models::admin_log::AdminLogEntry;
use crate::models::admin_log::AdminLogFilter;

/// List the Admin log, newest first
#[get("/")]
pub async fn admin_list_log(
    Query(query): Query<AdminListLogQuery>,
) -> ApiResult<ApiJson<AdminListLogResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let page = AdminLogEntry::page(
        &mut tx,
        &AdminLogFilter {
            account: query.account,
            after: query.after,
            limit: page_limit(query.limit),
        },
    )
    .await?;
    tx.commit().await?;

    Ok(ApiJson(AdminListLogResponse {
        entries: page
            .entries
            .into_iter()
            .map(AdminLogEntryResponse::from)
            .collect(),
        next_cursor: page.next_cursor,
    }))
}
