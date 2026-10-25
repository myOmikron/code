use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;

use crate::http::handler_frontend::admin::bug_reports::schema::AdminBugReport;
use crate::http::handler_frontend::admin::bug_reports::schema::AdminBugReportDetail;
use crate::http::handler_frontend::admin::bug_reports::schema::AdminListBugReportsQuery;
use crate::http::handler_frontend::admin::bug_reports::schema::AdminListBugReportsResponse;
use crate::http::handler_frontend::admin::bug_reports::schema::AdminSetBugReportNoteRequest;
use crate::http::handler_frontend::admin::bug_reports::schema::BugReportImageResponse;
use crate::http::handler_frontend::admin::page_limit;
use crate::models::account::Account;
use crate::models::bug_report::BugReport;
use crate::models::bug_report::BugReportFilter;
use crate::models::bug_report::BugReportImageUuid;
use crate::models::bug_report::BugReportNumber;

/// List Bug reports, newest first, the open ones unless asked otherwise
#[get("/")]
pub async fn admin_list_bug_reports(
    Query(query): Query<AdminListBugReportsQuery>,
) -> ApiResult<ApiJson<AdminListBugReportsResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let page = BugReport::page(
        &mut tx,
        &BugReportFilter {
            state: query.filter.state(),
            after: query.after,
            limit: page_limit(query.limit),
        },
    )
    .await?;
    tx.commit().await?;

    Ok(ApiJson(AdminListBugReportsResponse {
        reports: page.reports.into_iter().map(AdminBugReport::from).collect(),
        next_cursor: page.next_cursor,
    }))
}

/// One Bug report with its text, diagnostics and image references
#[get("/{number}")]
pub async fn admin_get_bug_report(
    Path(number): Path<BugReportNumber>,
) -> ApiResult<ApiJson<AdminBugReportDetail>> {
    let mut tx = Database::global().start_transaction().await?;
    let detail = BugReport::get(&mut tx, number).await?;
    tx.commit().await?;

    let detail = detail.ok_or(ApiError::bad_request("Unknown bug report"))?;
    Ok(ApiJson(AdminBugReportDetail::from(detail)))
}

/// One image of a Bug report
#[get("/{number}/images/{image}")]
pub async fn admin_get_bug_report_image(
    Path((number, image)): Path<(BugReportNumber, BugReportImageUuid)>,
) -> ApiResult<BugReportImageResponse> {
    let mut tx = Database::global().start_transaction().await?;
    let found = BugReport::image(&mut tx, number, image).await?;
    tx.commit().await?;

    let (kind, data) = found.ok_or(ApiError::bad_request("Unknown image"))?;
    Ok(BugReportImageResponse { kind, data })
}

/// Mark a Bug report done, recording the Admin and the time
#[post("/{number}/done")]
pub async fn admin_mark_bug_report_done(
    admin: Account,
    Path(number): Path<BugReportNumber>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;
    if !BugReport::mark_done(&mut tx, number, &admin).await? {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Unknown bug report"));
    }
    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Open a done Bug report again
///
/// What a purge removed stays removed.
#[post("/{number}/reopen")]
pub async fn admin_reopen_bug_report(
    Path(number): Path<BugReportNumber>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;
    if !BugReport::reopen(&mut tx, number).await? {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Unknown bug report"));
    }
    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Set the Admins' internal note on a Bug report, an empty note removes it
#[put("/{number}/note")]
pub async fn admin_set_bug_report_note(
    Path(number): Path<BugReportNumber>,
    ApiJson(request): ApiJson<AdminSetBugReportNoteRequest>,
) -> ApiResult<ApiJson<()>> {
    let note = request.note.trim();
    let note = (!note.is_empty()).then_some(note);

    let mut tx = Database::global().start_transaction().await?;
    if !BugReport::set_note(&mut tx, number, note).await? {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Unknown bug report"));
    }
    tx.commit().await?;

    Ok(ApiJson(()))
}
