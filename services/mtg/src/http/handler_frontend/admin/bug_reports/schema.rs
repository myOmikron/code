use galvyn::core::handler::context::EndpointContext;
use galvyn::core::handler::response_body::ResponseBody;
use galvyn::core::handler::response_body::ShouldBeResponseBody;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::http::header;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Response;
use galvyn::core::re_exports::mime;
use galvyn::core::re_exports::mime::Mime;
use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::schemars::schema::Schema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::bug_report::BUG_REPORT_NOTE_MAX_LEN;
use crate::models::bug_report::BugReportAccount;
use crate::models::bug_report::BugReportDetail;
use crate::models::bug_report::BugReportImageInfo;
use crate::models::bug_report::BugReportImageType;
use crate::models::bug_report::BugReportNumber;
use crate::models::bug_report::BugReportOverview;
use crate::models::bug_report::BugReportState;

/// Which Bug reports the list shows
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema)]
pub enum AdminBugReportFilter {
    /// The open ones
    #[default]
    Open,
    /// The done ones
    Done,
    /// All of them
    All,
}

impl AdminBugReportFilter {
    /// The state the list is narrowed to, `None` for all
    pub fn state(self) -> Option<BugReportState> {
        match self {
            Self::Open => Some(BugReportState::Open),
            Self::Done => Some(BugReportState::Done),
            Self::All => None,
        }
    }
}

/// How to page and narrow the Bug reports
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct AdminListBugReportsQuery {
    /// Which Bug reports to list, the open ones by default
    #[serde(default)]
    pub filter: AdminBugReportFilter,
    /// Continue after this Bug report, from a previous page's `next_cursor`
    #[serde(default)]
    pub after: Option<BugReportNumber>,
    /// How many Bug reports to return, capped server-side
    #[serde(default = "crate::http::handler_frontend::admin::default_limit")]
    pub limit: u32,
}

/// A Bug report as the list shows it
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminBugReport {
    /// The running number
    pub number: BugReportNumber,
    /// When it was sent
    pub created_at: SchemaDateTime,
    /// Who sent it
    pub reporter: BugReportAccount,
    /// The route the app was on
    pub route: String,
    /// The Release the app was running
    pub release: String,
    /// Open or done
    pub state: BugReportState,
    /// Whether its images and diagnostics were purged
    pub purged: bool,
}

impl From<BugReportOverview> for AdminBugReport {
    fn from(value: BugReportOverview) -> Self {
        Self {
            number: value.number,
            created_at: SchemaDateTime(value.created_at),
            reporter: value.reporter,
            route: value.route,
            release: value.release,
            state: value.state,
            purged: value.purged,
        }
    }
}

/// One page of Bug reports, newest first
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminListBugReportsResponse {
    /// The Bug reports
    pub reports: Vec<AdminBugReport>,
    /// Pass as `after` for the next page, `None` on the last one
    pub next_cursor: Option<BugReportNumber>,
}

/// A Bug report with everything it holds
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminBugReportDetail {
    /// What the list shows
    pub report: AdminBugReport,
    /// What went wrong, in the player's words
    pub text: String,
    /// The browser's user agent
    pub user_agent: String,
    /// The browser window's size
    pub viewport: String,
    /// The browser's language
    pub language: String,
    /// The diagnostics document the app built, `None` once purged
    pub diagnostics: Option<serde_json::Value>,
    /// The Admin that marked it done, `None` while open or once that Admin is deleted
    pub done_by: Option<BugReportAccount>,
    /// When it was marked done
    pub done_at: Option<SchemaDateTime>,
    /// The Admins' internal note
    pub note: Option<String>,
    /// When its images and diagnostics were purged
    pub purged_at: Option<SchemaDateTime>,
    /// Its images, in the order they were sent, empty once purged
    pub images: Vec<BugReportImageInfo>,
}

impl From<BugReportDetail> for AdminBugReportDetail {
    fn from(value: BugReportDetail) -> Self {
        Self {
            report: AdminBugReport::from(value.overview),
            text: value.text,
            user_agent: value.user_agent,
            viewport: value.viewport,
            language: value.language,
            diagnostics: value.diagnostics,
            done_by: value.done_by,
            done_at: value.done_at.map(SchemaDateTime),
            note: value.note,
            purged_at: value.purged_at.map(SchemaDateTime),
            images: value.images,
        }
    }
}

/// Request to set the Admins' note on a Bug report
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct AdminSetBugReportNoteRequest {
    /// The note, empty to remove it
    pub note: MaxStr<BUG_REPORT_NOTE_MAX_LEN>,
}

/// An image of a Bug report, served with its own media type
#[derive(Debug, Clone)]
pub struct BugReportImageResponse {
    /// What kind of image it is
    pub kind: BugReportImageType,
    /// The encoded image
    pub data: Vec<u8>,
}

impl IntoResponse for BugReportImageResponse {
    fn into_response(self) -> Response {
        (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, self.kind.content_type()),
                (header::CACHE_CONTROL, "private, max-age=86400"),
            ],
            self.data,
        )
            .into_response()
    }
}

impl ShouldBeResponseBody for BugReportImageResponse {}
impl ResponseBody for BugReportImageResponse {
    fn body(_ctx: &mut EndpointContext) -> Vec<(StatusCode, Option<(Mime, Option<Schema>)>)> {
        vec![(StatusCode::OK, Some((mime::IMAGE_STAR, None)))]
    }
}
