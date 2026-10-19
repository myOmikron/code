//! Request/response schemas of the News Post handlers

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::models::NewsPost;
use crate::models::NewsPostUuid;

/// Request to create a News Post or change its title and body
#[derive(Deserialize, JsonSchema)]
pub struct NewsPostRequest {
    /// The title
    pub title: MaxStr<255>,
    /// The text, as Markdown
    pub body: MaxStr<20000>,
}

/// A News Post as Admins see it, Draft or Published
#[derive(Serialize, JsonSchema)]
pub struct AdminNewsPost {
    /// Primary key
    pub uuid: NewsPostUuid,
    /// The title
    pub title: String,
    /// The text, as Markdown
    pub body: String,
    /// The point in time the News Post was published, unset for a Draft
    pub published_at: Option<SchemaDateTime>,
    /// The point in time the News Post was created
    pub created_at: SchemaDateTime,
    /// The point in time the News Post was last changed
    pub updated_at: SchemaDateTime,
}

impl From<NewsPost> for AdminNewsPost {
    fn from(post: NewsPost) -> Self {
        Self {
            uuid: post.uuid,
            title: post.title.into_inner(),
            body: post.body.into_inner(),
            published_at: post.published_at.map(SchemaDateTime),
            created_at: SchemaDateTime(post.created_at),
            updated_at: SchemaDateTime(post.updated_at),
        }
    }
}

/// All News Posts, Drafts included, newest first
#[derive(Serialize, JsonSchema)]
pub struct ListAdminNewsPostsResponse {
    /// The News Posts
    pub news_posts: Vec<AdminNewsPost>,
}

/// A Published News Post as customers see it
#[derive(Serialize, JsonSchema)]
pub struct PublishedNewsPost {
    /// The title
    pub title: String,
    /// The text, as Markdown
    pub body: String,
    /// The point in time the News Post was published
    pub published_at: SchemaDateTime,
}

/// All Published News Posts, newest first
#[derive(Serialize, JsonSchema)]
pub struct ListPublishedNewsPostsResponse {
    /// The News Posts
    pub news_posts: Vec<PublishedNewsPost>,
}
