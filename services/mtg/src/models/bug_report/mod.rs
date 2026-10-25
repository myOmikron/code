//! Bug reports: what players tell the Admins about faults in mtg
//!
//! A Bug report keeps its text, note and metadata for good; its images and
//! diagnostics go [`PURGE_AFTER`] it was marked done, see [`BugReport::purge`].

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::AffectedRows;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::executor::One;
use galvyn::rorm::db::row::Row;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::bug_report::db::BugReportImageInsertPatch;
use crate::models::bug_report::db::BugReportImageModel;
use crate::models::bug_report::db::BugReportInsertPatch;
use crate::models::bug_report::db::BugReportModel;
use crate::models::row::decode;

pub(in crate::models) mod db;

/// Most characters the player's text may have
pub const BUG_REPORT_TEXT_MAX_CHARS: usize = 5000;
/// Fewest characters the player's text must have, once trimmed
pub const BUG_REPORT_TEXT_MIN_CHARS: usize = 5;
/// Most bytes of the player's text: [`BUG_REPORT_TEXT_MAX_CHARS`] of four bytes each
pub const BUG_REPORT_TEXT_MAX_LEN: usize = 4 * BUG_REPORT_TEXT_MAX_CHARS;
/// Most bytes of an Admin's note
pub const BUG_REPORT_NOTE_MAX_LEN: usize = 4096;
/// Most bytes of the route
pub const BUG_REPORT_ROUTE_MAX_LEN: usize = 2048;
/// Most bytes of the Release
pub const BUG_REPORT_RELEASE_MAX_LEN: usize = 64;
/// Most bytes of the user agent
pub const BUG_REPORT_USER_AGENT_MAX_LEN: usize = 1024;
/// Most bytes of the viewport
pub const BUG_REPORT_VIEWPORT_MAX_LEN: usize = 32;
/// Most bytes of the language
pub const BUG_REPORT_LANGUAGE_MAX_LEN: usize = 64;
/// Most images a Bug report carries
pub const BUG_REPORT_MAX_IMAGES: usize = 3;
/// Most bytes of the `report` part, diagnostics included
pub const BUG_REPORT_MAX_REPORT_BYTES: usize = 512 * 1024;
/// Most bytes of one image
pub const BUG_REPORT_MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;
/// Most Bug reports an Account sends within [`BUG_REPORT_RATE_WINDOW`]
pub const BUG_REPORT_RATE_LIMIT: i64 = 15;
/// The rolling window [`BUG_REPORT_RATE_LIMIT`] counts in
pub const BUG_REPORT_RATE_WINDOW: Duration = Duration::hours(1);
/// How long after being marked done a Bug report keeps its images and diagnostics
pub const PURGE_AFTER: Duration = Duration::days(90);

/// The running number of a Bug report, shown as `#<n>`
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct BugReportNumber(i64);

impl BugReportNumber {
    /// Get the underlying number
    pub fn into_inner(self) -> i64 {
        self.0
    }
}

/// Primary key of an image of a Bug report
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct BugReportImageUuid(Uuid);

/// Whether a Bug report still needs an Admin's attention
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum BugReportState {
    /// Not looked into yet, or reopened
    Open,
    /// Marked done by an Admin
    Done,
}
custom_db_enum! {
    enum: BugReportState,
    variants: [Open, Done],
    decoder: BugReportStateDecoder,
}

/// The kinds of image a Bug report takes
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, JsonSchema)]
pub enum BugReportImageType {
    /// `image/jpeg`
    Jpeg,
    /// `image/png`
    Png,
    /// `image/webp`
    Webp,
}

impl BugReportImageType {
    /// Recognizes an image by its first bytes, `None` for anything else
    pub fn sniff(data: &[u8]) -> Option<Self> {
        if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
            Some(Self::Jpeg)
        } else if data.starts_with(b"\x89PNG\r\n\x1a\n") {
            Some(Self::Png)
        } else if data.len() >= 12 && data.starts_with(b"RIFF") && &data[8..12] == b"WEBP" {
            Some(Self::Webp)
        } else {
            None
        }
    }

    /// The media type
    pub fn content_type(self) -> &'static str {
        match self {
            Self::Jpeg => "image/jpeg",
            Self::Png => "image/png",
            Self::Webp => "image/webp",
        }
    }

    /// Reads a media type written by [`Self::content_type`]
    fn from_content_type(content_type: &str) -> Option<Self> {
        [Self::Jpeg, Self::Png, Self::Webp]
            .into_iter()
            .find(|kind| kind.content_type() == content_type)
    }
}

/// An image of a new Bug report
#[derive(Debug, Clone)]
pub struct NewBugReportImage {
    /// What kind of image it is
    pub kind: BugReportImageType,
    /// The encoded image
    pub data: Vec<u8>,
}

/// What a new Bug report records
#[derive(Debug, Clone)]
pub struct NewBugReport {
    /// The reporting Account
    pub reporter: AccountUuid,
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
    /// The diagnostics document, stored as is
    pub diagnostics: serde_json::Value,
    /// The images, at most [`BUG_REPORT_MAX_IMAGES`]
    pub images: Vec<NewBugReportImage>,
}

/// An Account named by a Bug report
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct BugReportAccount {
    /// Primary key
    pub uuid: AccountUuid,
    /// Its current username
    pub username: String,
}

/// A Bug report as the list shows it
#[derive(Debug, Clone)]
pub struct BugReportOverview {
    /// The running number
    pub number: BugReportNumber,
    /// When it was sent
    pub created_at: OffsetDateTime,
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

/// An image of a Bug report, without its bytes
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct BugReportImageInfo {
    /// Primary key
    pub uuid: BugReportImageUuid,
    /// The image's media type
    pub content_type: String,
}

/// A Bug report with everything it holds
#[derive(Debug, Clone)]
pub struct BugReportDetail {
    /// What the list shows
    pub overview: BugReportOverview,
    /// The player's text
    pub text: String,
    /// The user agent
    pub user_agent: String,
    /// The viewport
    pub viewport: String,
    /// The language
    pub language: String,
    /// The diagnostics, `None` once purged
    pub diagnostics: Option<serde_json::Value>,
    /// The Admin that marked it done, `None` while open or once that Admin is deleted
    pub done_by: Option<BugReportAccount>,
    /// When it was marked done
    pub done_at: Option<OffsetDateTime>,
    /// The Admins' internal note
    pub note: Option<String>,
    /// When its images and diagnostics were purged
    pub purged_at: Option<OffsetDateTime>,
    /// Its images, in the order they were sent, empty once purged
    pub images: Vec<BugReportImageInfo>,
}

/// What a page of Bug reports is narrowed to
#[derive(Debug, Clone, Default)]
pub struct BugReportFilter {
    /// Only the Bug reports in this state, all of them for `None`
    pub state: Option<BugReportState>,
    /// Continue after this Bug report, newest first
    pub after: Option<BugReportNumber>,
    /// How many Bug reports to return
    pub limit: u32,
}

/// One page of Bug reports
#[derive(Debug, Clone)]
pub struct BugReportPage {
    /// The Bug reports, newest first
    pub reports: Vec<BugReportOverview>,
    /// Pass as [`BugReportFilter::after`] for the next page, `None` on the last
    pub next_cursor: Option<BugReportNumber>,
}

/// The columns [`decode_overview`] reads
const OVERVIEW_COLUMNS: &str = "\
    r.id, r.created_at, r.reporter, a.username AS reporter_username, \
    r.route, r.release, r.state, r.purged_at";

/// Locks the reporting Account's row, so its sends are counted one after the other
const LOCK_REPORTER: &str = "SELECT 1 FROM account WHERE uuid = $1 FOR UPDATE";

/// One Bug report, as [`BugReport`]'s functions work on it
pub struct BugReport;

impl BugReport {
    /// Store a Bug report unless its Account sent [`BUG_REPORT_RATE_LIMIT`] within the window
    ///
    /// The Account's row is locked first, so two sends of the same Account
    /// count one after the other. Returns `None` when the limit is reached.
    #[instrument(name = "BugReport::insert", skip(tx, report), fields(reporter = ?report.reporter))]
    pub async fn insert(
        tx: &mut Transaction,
        report: NewBugReport,
        now: OffsetDateTime,
    ) -> Result<Option<BugReportNumber>, rorm::Error> {
        let reporter = report.reporter.into_inner();
        (&mut *tx)
            .execute::<All>(LOCK_REPORTER.to_string(), vec![Value::Uuid(reporter)])
            .await?;
        let row = (&mut *tx)
            .execute::<One>(
                "SELECT count(*) AS sent FROM bug_report WHERE reporter = $1 AND created_at > $2"
                    .to_string(),
                vec![
                    Value::Uuid(reporter),
                    Value::TimeOffsetDateTime(now - BUG_REPORT_RATE_WINDOW),
                ],
            )
            .await?;
        let sent: i64 = row.get("sent").map_err(decode)?;
        if sent >= BUG_REPORT_RATE_LIMIT {
            return Ok(None);
        }

        let id = rorm::insert(&mut *tx, BugReportModel)
            .return_primary_key()
            .single(&BugReportInsertPatch {
                reporter: ForeignModelByField(reporter),
                text: report.text,
                route: report.route,
                release: report.release,
                user_agent: report.user_agent,
                viewport: report.viewport,
                language: report.language,
                diagnostics: Some(Json(report.diagnostics)),
                state: BugReportState::Open,
            })
            .await?;

        let images = report
            .images
            .into_iter()
            .enumerate()
            .map(|(position, image)| BugReportImageInsertPatch {
                uuid: Uuid::now_v7(),
                bug_report: ForeignModelByField(id),
                position: i16::try_from(position)
                    .unwrap_or_else(|_| unreachable!("a Bug report has a few images")),
                content_type: MaxStr::new(image.kind.content_type().to_string())
                    .unwrap_or_else(|_| unreachable!("a media type is a few ascii characters")),
                data: image.data,
            })
            .collect::<Vec<_>>();
        if !images.is_empty() {
            rorm::insert(&mut *tx, BugReportImageModel)
                .return_nothing()
                .bulk(&images)
                .await?;
        }

        Ok(Some(BugReportNumber(id)))
    }

    /// One page of Bug reports, newest first
    #[instrument(name = "BugReport::page", skip(tx))]
    pub async fn page(
        tx: &mut Transaction,
        filter: &BugReportFilter,
    ) -> Result<BugReportPage, rorm::Error> {
        let mut conditions = Vec::new();
        let mut values = Vec::new();
        if let Some(state) = filter.state {
            values.push(Value::String(state.as_str()));
            conditions.push(format!("r.state = ${}", values.len()));
        }
        if let Some(after) = filter.after {
            values.push(Value::I64(after.0));
            conditions.push(format!("r.id < ${}", values.len()));
        }
        values.push(Value::I64(i64::from(filter.limit) + 1));
        let condition = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };
        let statement = format!(
            "SELECT {OVERVIEW_COLUMNS} FROM bug_report r JOIN account a ON a.uuid = r.reporter \
             {condition} ORDER BY r.id DESC LIMIT ${}",
            values.len()
        );
        let rows = (&mut *tx).execute::<All>(statement, values).await?;

        let mut reports = rows
            .iter()
            .map(decode_overview)
            .collect::<Result<Vec<_>, _>>()?;
        let next_cursor = if reports.len() > filter.limit as usize {
            reports.truncate(filter.limit as usize);
            reports.last().map(|report| report.number)
        } else {
            None
        };
        Ok(BugReportPage {
            reports,
            next_cursor,
        })
    }

    /// One Bug report with everything it holds
    #[instrument(name = "BugReport::get", skip(tx))]
    pub async fn get(
        tx: &mut Transaction,
        number: BugReportNumber,
    ) -> Result<Option<BugReportDetail>, rorm::Error> {
        let rows = (&mut *tx)
            .execute::<All>(
                format!(
                    "SELECT {OVERVIEW_COLUMNS}, r.text, r.user_agent, r.viewport, r.language, \
                       r.diagnostics, r.done_by, d.username AS done_by_username, \
                       r.done_at, r.note \
                     FROM bug_report r JOIN account a ON a.uuid = r.reporter \
                     LEFT JOIN account d ON d.uuid = r.done_by \
                     WHERE r.id = $1"
                ),
                vec![Value::I64(number.0)],
            )
            .await?;
        let Some(row) = rows.first() else {
            return Ok(None);
        };

        let images = rorm::query(
            &mut *tx,
            (BugReportImageModel.uuid, BugReportImageModel.content_type),
        )
        .condition(BugReportImageModel.bug_report.equals(number.0))
        .order_asc(BugReportImageModel.position)
        .all()
        .await?
        .into_iter()
        .map(|(uuid, content_type)| BugReportImageInfo {
            uuid: BugReportImageUuid(uuid),
            content_type: content_type.into_inner(),
        })
        .collect();

        let diagnostics: Option<Vec<u8>> = row.get("diagnostics").map_err(decode)?;
        let done_by: Option<Uuid> = row.get("done_by").map_err(decode)?;
        let done_by_username: Option<String> = row.get("done_by_username").map_err(decode)?;
        Ok(Some(BugReportDetail {
            overview: decode_overview(row)?,
            text: row.get("text").map_err(decode)?,
            user_agent: row.get("user_agent").map_err(decode)?,
            viewport: row.get("viewport").map_err(decode)?,
            language: row.get("language").map_err(decode)?,
            diagnostics: diagnostics.map(|diagnostics| {
                serde_json::from_slice(&diagnostics)
                    .unwrap_or_else(|_| unreachable!("the column holds json"))
            }),
            done_by: done_by
                .zip(done_by_username)
                .map(|(uuid, username)| BugReportAccount {
                    uuid: AccountUuid::new(uuid),
                    username,
                }),
            done_at: row.get("done_at").map_err(decode)?,
            note: row.get("note").map_err(decode)?,
            purged_at: row.get("purged_at").map_err(decode)?,
            images,
        }))
    }

    /// One image of a Bug report, with its kind
    #[instrument(name = "BugReport::image", skip(tx))]
    pub async fn image(
        tx: &mut Transaction,
        number: BugReportNumber,
        image: BugReportImageUuid,
    ) -> Result<Option<(BugReportImageType, Vec<u8>)>, rorm::Error> {
        let found = rorm::query(
            &mut *tx,
            (BugReportImageModel.content_type, BugReportImageModel.data),
        )
        .condition(rorm::and![
            BugReportImageModel.uuid.equals(image.0),
            BugReportImageModel.bug_report.equals(number.0),
        ])
        .optional()
        .await?;
        Ok(found.map(|(content_type, data)| {
            let kind = BugReportImageType::from_content_type(&content_type)
                .unwrap_or_else(|| unreachable!("only a sniffed media type is written"));
            (kind, data)
        }))
    }

    /// Mark a Bug report done by `admin`, now
    ///
    /// Marking a done Bug report done again makes `admin` the one that did.
    /// Returns `false` if the Bug report does not exist.
    #[instrument(name = "BugReport::mark_done", skip(tx, admin))]
    pub async fn mark_done(
        tx: &mut Transaction,
        number: BugReportNumber,
        admin: &Account,
    ) -> Result<bool, rorm::Error> {
        let changed = (&mut *tx)
            .execute::<AffectedRows>(
                "UPDATE bug_report SET state = $2, done_by = $3, done_at = now() WHERE id = $1"
                    .to_string(),
                vec![
                    Value::I64(number.0),
                    Value::String(BugReportState::Done.as_str()),
                    Value::Uuid(admin.uuid.into_inner()),
                ],
            )
            .await?;
        Ok(changed == 1)
    }

    /// Open a done Bug report again
    ///
    /// A purge stays a purge: what it removed does not come back. Returns
    /// `false` if the Bug report does not exist.
    #[instrument(name = "BugReport::reopen", skip(tx))]
    pub async fn reopen(
        tx: &mut Transaction,
        number: BugReportNumber,
    ) -> Result<bool, rorm::Error> {
        let changed = (&mut *tx)
            .execute::<AffectedRows>(
                "UPDATE bug_report SET state = $2, done_by = NULL, done_at = NULL WHERE id = $1"
                    .to_string(),
                vec![
                    Value::I64(number.0),
                    Value::String(BugReportState::Open.as_str()),
                ],
            )
            .await?;
        Ok(changed == 1)
    }

    /// Set the Admins' internal note, removing it for `None`
    ///
    /// Returns `false` if the Bug report does not exist.
    #[instrument(name = "BugReport::set_note", skip(tx, note))]
    pub async fn set_note(
        tx: &mut Transaction,
        number: BugReportNumber,
        note: Option<&str>,
    ) -> Result<bool, rorm::Error> {
        let note = match note {
            Some(note) => Value::String(note),
            None => Value::Null(rorm::db::sql::value::NullType::String),
        };
        let changed = (&mut *tx)
            .execute::<AffectedRows>(
                "UPDATE bug_report SET note = $2 WHERE id = $1".to_string(),
                vec![Value::I64(number.0), note],
            )
            .await?;
        Ok(changed == 1)
    }

    /// Purge images and diagnostics of the Bug reports done for longer than [`PURGE_AFTER`]
    ///
    /// Keeps text, note and metadata, and stamps the Bug report as purged.
    /// Returns how many Bug reports were purged.
    #[instrument(name = "BugReport::purge", skip(tx))]
    pub async fn purge(tx: &mut Transaction, now: OffsetDateTime) -> Result<u64, rorm::Error> {
        let rows = (&mut *tx)
            .execute::<All>(
                "UPDATE bug_report SET diagnostics = NULL, purged_at = $1 \
                 WHERE state = $2 AND done_at < $3 AND purged_at IS NULL \
                 RETURNING id"
                    .to_string(),
                vec![
                    Value::TimeOffsetDateTime(now),
                    Value::String(BugReportState::Done.as_str()),
                    Value::TimeOffsetDateTime(now - PURGE_AFTER),
                ],
            )
            .await?;
        let ids = rows
            .iter()
            .map(|row| row.get::<i64>("id").map_err(decode))
            .collect::<Result<Vec<_>, _>>()?;
        for id in &ids {
            rorm::delete(&mut *tx, BugReportImageModel)
                .condition(BugReportImageModel.bug_report.equals(*id))
                .await?;
        }
        Ok(ids.len() as u64)
    }
}

/// Reads a [`BugReportOverview`] from a row selecting [`OVERVIEW_COLUMNS`]
fn decode_overview(row: &Row) -> Result<BugReportOverview, rorm::Error> {
    let state: String = row.get("state").map_err(decode)?;
    let purged_at: Option<OffsetDateTime> = row.get("purged_at").map_err(decode)?;
    Ok(BugReportOverview {
        number: BugReportNumber(row.get("id").map_err(decode)?),
        created_at: row.get("created_at").map_err(decode)?,
        reporter: BugReportAccount {
            uuid: AccountUuid::new(row.get("reporter").map_err(decode)?),
            username: row.get("reporter_username").map_err(decode)?,
        },
        route: row.get("route").map_err(decode)?,
        release: row.get("release").map_err(decode)?,
        state: BugReportState::from_str(&state)
            .unwrap_or_else(|| unreachable!("only the state's own encoding is written")),
        purged: purged_at.is_some(),
    })
}
