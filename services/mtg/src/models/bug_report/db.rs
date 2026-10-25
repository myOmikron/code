//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::models::account::db::AccountModel;
use crate::models::bug_report::BUG_REPORT_LANGUAGE_MAX_LEN;
use crate::models::bug_report::BUG_REPORT_NOTE_MAX_LEN;
use crate::models::bug_report::BUG_REPORT_RELEASE_MAX_LEN;
use crate::models::bug_report::BUG_REPORT_ROUTE_MAX_LEN;
use crate::models::bug_report::BUG_REPORT_TEXT_MAX_LEN;
use crate::models::bug_report::BUG_REPORT_USER_AGENT_MAX_LEN;
use crate::models::bug_report::BUG_REPORT_VIEWPORT_MAX_LEN;
use crate::models::bug_report::BugReportState;

/// A Bug report
#[derive(Model, Debug)]
#[rorm(rename = "bug_report")]
pub struct BugReportModel {
    /// The running number, shown as `#<n>`
    ///
    /// The second half of the `bug_report_state` index, see [`Self::state`].
    #[rorm(id, index(name = "bug_report_state", priority = 2))]
    pub id: i64,

    /// When the Bug report was sent
    ///
    /// The second half of the `bug_report_reporter` index, see [`Self::reporter`].
    #[rorm(auto_create_time, index(name = "bug_report_reporter", priority = 2))]
    pub created_at: OffsetDateTime,

    /// The Account that sent it
    ///
    /// Indexed with [`Self::created_at`], so counting an Account's recent Bug
    /// reports reads only those.
    #[rorm(
        index(name = "bug_report_reporter", priority = 1),
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    pub reporter: ForeignModel<AccountModel>,

    /// What went wrong, in the player's words
    pub text: MaxStr<BUG_REPORT_TEXT_MAX_LEN>,

    /// The route the app was on
    pub route: MaxStr<BUG_REPORT_ROUTE_MAX_LEN>,

    /// The Release the app was running
    pub release: MaxStr<BUG_REPORT_RELEASE_MAX_LEN>,

    /// The browser's user agent
    pub user_agent: MaxStr<BUG_REPORT_USER_AGENT_MAX_LEN>,

    /// The browser window's size
    pub viewport: MaxStr<BUG_REPORT_VIEWPORT_MAX_LEN>,

    /// The browser's language
    pub language: MaxStr<BUG_REPORT_LANGUAGE_MAX_LEN>,

    /// What the app knew, as the browser sent it, `None` once purged
    pub diagnostics: Option<Json<serde_json::Value>>,

    /// Whether an Admin marked it done
    ///
    /// Indexed with [`Self::id`], so a filtered list pages newest first
    /// without reading the other state.
    #[rorm(index(name = "bug_report_state", priority = 1))]
    pub state: BugReportState,

    /// The Admin that marked it done, `None` while open or once that Admin is deleted
    #[rorm(on_update = "Cascade", on_delete = "SetNull")]
    pub done_by: Option<ForeignModel<AccountModel>>,

    /// When it was marked done, `None` while open
    pub done_at: Option<OffsetDateTime>,

    /// An Admin's internal note
    pub note: Option<MaxStr<BUG_REPORT_NOTE_MAX_LEN>>,

    /// When its images and diagnostics were purged
    pub purged_at: Option<OffsetDateTime>,
}

/// Insert patch for [`BugReportModel`]
#[derive(Patch)]
#[rorm(model = "BugReportModel")]
pub struct BugReportInsertPatch {
    /// The reporting Account
    pub reporter: ForeignModel<AccountModel>,
    /// The player's text
    pub text: MaxStr<BUG_REPORT_TEXT_MAX_LEN>,
    /// The route
    pub route: MaxStr<BUG_REPORT_ROUTE_MAX_LEN>,
    /// The Release
    pub release: MaxStr<BUG_REPORT_RELEASE_MAX_LEN>,
    /// The user agent
    pub user_agent: MaxStr<BUG_REPORT_USER_AGENT_MAX_LEN>,
    /// The viewport
    pub viewport: MaxStr<BUG_REPORT_VIEWPORT_MAX_LEN>,
    /// The language
    pub language: MaxStr<BUG_REPORT_LANGUAGE_MAX_LEN>,
    /// The diagnostics
    pub diagnostics: Option<Json<serde_json::Value>>,
    /// Open, for a new Bug report
    pub state: BugReportState,
}

/// An image attached to a Bug report
#[derive(Model, Debug)]
#[rorm(rename = "bug_report_image")]
pub struct BugReportImageModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The Bug report it belongs to
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub bug_report: ForeignModel<BugReportModel>,

    /// Where it stands among the Bug report's images, from 0
    pub position: i16,

    /// The image's media type
    pub content_type: MaxStr<32>,

    /// The encoded image
    pub data: Vec<u8>,
}

/// Insert patch for [`BugReportImageModel`]
#[derive(Patch)]
#[rorm(model = "BugReportImageModel")]
pub struct BugReportImageInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The Bug report
    pub bug_report: ForeignModel<BugReportModel>,
    /// The position
    pub position: i16,
    /// The media type
    pub content_type: MaxStr<32>,
    /// The encoded image
    pub data: Vec<u8>,
}
