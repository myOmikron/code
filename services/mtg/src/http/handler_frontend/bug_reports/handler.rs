use galvyn::core::Module;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::post;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;
use tracing::warn;

use crate::http::handler_frontend::bug_reports::schema::BugReportUpload;
use crate::http::handler_frontend::bug_reports::schema::SendBugReportErrors;
use crate::http::handler_frontend::bug_reports::schema::SendBugReportRequest;
use crate::http::handler_frontend::bug_reports::schema::SendBugReportResponse;
use crate::models::account::Account;
use crate::models::bug_report::BUG_REPORT_MAX_IMAGE_BYTES;
use crate::models::bug_report::BUG_REPORT_MAX_IMAGES;
use crate::models::bug_report::BUG_REPORT_MAX_REPORT_BYTES;
use crate::models::bug_report::BUG_REPORT_TEXT_MAX_CHARS;
use crate::models::bug_report::BUG_REPORT_TEXT_MIN_CHARS;
use crate::models::bug_report::BugReport;
use crate::models::bug_report::BugReportImageType;
use crate::models::bug_report::NewBugReport;
use crate::models::bug_report::NewBugReportImage;
use crate::modules::config::Conf;
use crate::utils::mail::BugReportNotice;
use crate::utils::mail::send_bug_report_notice;

/// Send a Bug report
///
/// A multipart body: the `report` part as json and up to three `images`.
/// Every Admin is mailed a notice without diagnostics or images; a mail that
/// fails is logged and does not fail the send.
#[post("/")]
pub async fn send_bug_report(
    account: Account,
    upload: BugReportUpload,
) -> ApiResult<ApiJson<SendBugReportResponse>, SendBugReportErrors> {
    let mut errors = FormErrors::<SendBugReportErrors>::new();
    let request = upload
        .report
        .as_deref()
        .filter(|report| report.len() <= BUG_REPORT_MAX_REPORT_BYTES)
        .and_then(|report| serde_json::from_slice::<SendBugReportRequest>(report).ok());
    let Some(request) = request else {
        errors.report_invalid = true;
        return errors.fail();
    };

    let text = request.text.trim();
    let characters = text.chars().count();
    if characters < BUG_REPORT_TEXT_MIN_CHARS {
        errors.text_missing = true;
    } else if characters > BUG_REPORT_TEXT_MAX_CHARS {
        errors.text_too_long = true;
    }
    if upload.image_count > BUG_REPORT_MAX_IMAGES {
        errors.too_many_images = true;
    }
    let mut images = Vec::with_capacity(upload.images.len());
    for data in upload.images {
        if data.len() > BUG_REPORT_MAX_IMAGE_BYTES {
            errors.image_too_large = true;
        } else if let Some(kind) = BugReportImageType::sniff(&data) {
            images.push(NewBugReportImage {
                kind,
                data: data.to_vec(),
            });
        } else {
            errors.image_invalid = true;
        }
    }
    errors.check()?;
    let text = MaxStr::new(text.to_string())
        .unwrap_or_else(|_| unreachable!("trimming does not make a string longer"));

    let mut tx = Database::global().start_transaction().await?;
    let number = BugReport::insert(
        &mut tx,
        NewBugReport {
            reporter: account.uuid,
            text: text.clone(),
            route: request.route.clone(),
            release: request.release.clone(),
            user_agent: request.user_agent,
            viewport: request.viewport,
            language: request.language,
            diagnostics: request.diagnostics,
            images,
        },
        OffsetDateTime::now_utc(),
    )
    .await?;
    let Some(number) = number else {
        tx.rollback().await?;
        let mut errors = FormErrors::<SendBugReportErrors>::new();
        errors.rate_limited = true;
        return errors.fail();
    };
    let admins = Account::get_admins(&mut tx).await?;
    tx.commit().await?;

    let link = Conf::global()
        .config
        .public_origin
        .join(&format!("/admin/bug-reports/{}", number.into_inner()))
        .map_err(ApiError::map_server_error(
            "Failed to build the dashboard link",
        ))?;
    for admin in admins {
        let notice = BugReportNotice {
            number,
            reporter: &account.username,
            route: &request.route,
            release: &request.release,
            text: &text,
            link: &link,
        };
        if let Err(error) = send_bug_report_notice(&admin.email, notice).await {
            warn!(
                error.display = %error,
                admin = admin.username.as_str(),
                "Failed to queue a Bug report notice"
            );
        }
    }

    Ok(ApiJson(SendBugReportResponse { number }))
}
