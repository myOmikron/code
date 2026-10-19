use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::MaxStr;
use time::OffsetDateTime;
use uuid::Uuid;

/// A News Post the Nachbarschaftshilfe writes for its customers
#[derive(Model, Debug, Clone)]
#[rorm(rename = "news_post")]
pub struct NewsPostModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The title
    pub title: MaxStr<255>,

    /// The text, as Markdown
    pub body: MaxStr<20000>,

    /// The point in time the News Post was published, unset for a Draft
    pub published_at: Option<OffsetDateTime>,

    /// The point in time the News Post was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,

    /// The point in time the News Post was last changed
    #[rorm(auto_create_time, auto_update_time)]
    pub updated_at: OffsetDateTime,
}

/// Insert patch for [`NewsPostModel`]
#[derive(Patch)]
#[rorm(model = "NewsPostModel")]
pub struct NewsPostInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The title
    pub title: MaxStr<255>,
    /// The text, as Markdown
    pub body: MaxStr<20000>,
}
