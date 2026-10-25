use galvyn::core::handler::context::EndpointContext;
use galvyn::core::handler::request_body::RequestBody;
use galvyn::core::handler::request_body::ShouldBeRequestBody;
use galvyn::core::re_exports::axum::body::Bytes;
use galvyn::core::re_exports::axum::extract::FromRequest;
use galvyn::core::re_exports::axum::extract::Request;
use galvyn::core::re_exports::mime;
use galvyn::core::re_exports::mime::Mime;
use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::schemars::r#gen::SchemaGenerator;
use galvyn::core::re_exports::schemars::schema::InstanceType;
use galvyn::core::re_exports::schemars::schema::Schema;
use galvyn::core::re_exports::schemars::schema::SchemaObject;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::bug_report::BUG_REPORT_LANGUAGE_MAX_LEN;
use crate::models::bug_report::BUG_REPORT_MAX_IMAGES;
use crate::models::bug_report::BUG_REPORT_RELEASE_MAX_LEN;
use crate::models::bug_report::BUG_REPORT_ROUTE_MAX_LEN;
use crate::models::bug_report::BUG_REPORT_TEXT_MAX_LEN;
use crate::models::bug_report::BUG_REPORT_USER_AGENT_MAX_LEN;
use crate::models::bug_report::BUG_REPORT_VIEWPORT_MAX_LEN;
use crate::models::bug_report::BugReportNumber;

/// The `report` part of a Bug report: what the player wrote and what the app knew
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct SendBugReportRequest {
    /// What went wrong, in the player's words
    pub text: MaxStr<BUG_REPORT_TEXT_MAX_LEN>,
    /// The route the app was on
    pub route: MaxStr<BUG_REPORT_ROUTE_MAX_LEN>,
    /// The Release the app was running
    pub release: MaxStr<BUG_REPORT_RELEASE_MAX_LEN>,
    /// The browser's user agent
    pub user_agent: MaxStr<BUG_REPORT_USER_AGENT_MAX_LEN>,
    /// The browser window's size, as `<width>x<height>`
    pub viewport: MaxStr<BUG_REPORT_VIEWPORT_MAX_LEN>,
    /// The browser's language
    pub language: MaxStr<BUG_REPORT_LANGUAGE_MAX_LEN>,
    /// The diagnostics document the app built, stored as is
    pub diagnostics: serde_json::Value,
}

/// A Bug report as the browser sends it: the `report` json and up to three `images`
#[derive(Debug, JsonSchema)]
#[allow(
    dead_code,
    reason = "Only describes the multipart body for the openapi document"
)]
pub struct SendBugReportForm {
    /// The [`SendBugReportRequest`] as json
    report: SendBugReportRequest,
    /// JPEG, PNG or WebP images of at most 5 MB each
    images: Option<Vec<ImageFile>>,
}

/// A file part of a multipart body
#[derive(Debug)]
struct ImageFile;

impl JsonSchema for ImageFile {
    fn schema_name() -> String {
        "ImageFile".to_string()
    }

    fn is_referenceable() -> bool {
        false
    }

    fn json_schema(_: &mut SchemaGenerator) -> Schema {
        Schema::Object(SchemaObject {
            instance_type: Some(InstanceType::String.into()),
            format: Some("binary".to_string()),
            ..Default::default()
        })
    }
}

/// The parts of a Bug report's multipart body, read but not yet checked
#[derive(Debug, Default)]
pub struct BugReportUpload {
    /// The `report` part
    pub report: Option<Bytes>,
    /// The first [`BUG_REPORT_MAX_IMAGES`] `images` parts
    pub images: Vec<Bytes>,
    /// How many `images` parts there were in all
    pub image_count: usize,
}

impl<S: Send + Sync> FromRequest<S> for BugReportUpload {
    type Rejection = ApiError;

    async fn from_request(request: Request, state: &S) -> Result<Self, Self::Rejection> {
        let mut multipart = axum::extract::Multipart::from_request(request, state)
            .await
            .map_err(|_| ApiError::bad_request("Not a multipart body"))?;
        let mut upload = BugReportUpload::default();
        while let Some(field) = multipart
            .next_field()
            .await
            .map_err(|_| ApiError::bad_request("Unreadable multipart body"))?
        {
            match field.name() {
                Some("report") => {
                    upload.report = Some(
                        field
                            .bytes()
                            .await
                            .map_err(|_| ApiError::bad_request("Unreadable report part"))?,
                    );
                }
                Some("images") => {
                    upload.image_count += 1;
                    if upload.images.len() < BUG_REPORT_MAX_IMAGES {
                        upload.images.push(
                            field
                                .bytes()
                                .await
                                .map_err(|_| ApiError::bad_request("Unreadable image part"))?,
                        );
                    }
                }
                _ => {}
            }
        }
        Ok(upload)
    }
}

impl ShouldBeRequestBody for BugReportUpload {}
impl RequestBody for BugReportUpload {
    fn body(ctx: &mut EndpointContext) -> (Mime, Option<Schema>) {
        (
            mime::MULTIPART_FORM_DATA,
            Some(ctx.generator.generate::<SendBugReportForm>()),
        )
    }
}

/// Why a Bug report could not be sent
#[derive(Debug, Default, Serialize, JsonSchema)]
pub struct SendBugReportErrors {
    /// The `report` part is missing, larger than 512 KB or not the expected json
    pub report_invalid: bool,
    /// The text is empty or too short
    pub text_missing: bool,
    /// The text has more than 5000 characters
    pub text_too_long: bool,
    /// More than three images
    pub too_many_images: bool,
    /// An image is larger than 5 MB
    pub image_too_large: bool,
    /// A part sent as an image is no JPEG, PNG or WebP
    pub image_invalid: bool,
    /// The Account sent 15 Bug reports within the last hour
    pub rate_limited: bool,
}

/// A sent Bug report
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct SendBugReportResponse {
    /// Its running number, for the player to quote
    pub number: BugReportNumber,
}
