//! News Posts: what the Nachbarschaftshilfe tells its customers

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use time::OffsetDateTime;
use tracing::instrument;
use uuid::Uuid;

use crate::models::news_post::db::NewsPostInsertPatch;
use crate::models::news_post::db::NewsPostModel;

pub(in crate::models) mod db;

/// A News Post, Draft or Published
#[derive(Debug, Clone)]
pub struct NewsPost {
    /// Primary key
    pub uuid: NewsPostUuid,

    /// The title
    pub title: MaxStr<255>,

    /// The text, as Markdown
    pub body: MaxStr<20000>,

    /// The point in time the News Post was published, unset for a Draft
    pub published_at: Option<OffsetDateTime>,

    /// The point in time the News Post was created
    pub created_at: OffsetDateTime,

    /// The point in time the News Post was last changed
    pub updated_at: OffsetDateTime,
}

/// Wrapper for the primary key of the [`NewsPost`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct NewsPostUuid(Uuid);

impl NewsPost {
    /// Fetch all News Posts, Drafts included, newest first
    ///
    /// A Published News Post counts from its publication, a Draft from its creation.
    #[instrument(name = "NewsPost::get_all", skip(exe))]
    pub async fn get_all(exe: impl Executor<'_>) -> Result<Vec<NewsPost>, rorm::Error> {
        let mut posts: Vec<NewsPost> = rorm::query(exe, NewsPostModel)
            .all()
            .await?
            .into_iter()
            .map(NewsPost::from)
            .collect();
        posts.sort_by_key(|post| std::cmp::Reverse(post.published_at.unwrap_or(post.created_at)));
        Ok(posts)
    }

    /// Fetch the Published News Posts, newest first
    #[instrument(name = "NewsPost::get_published", skip(exe))]
    pub async fn get_published(exe: impl Executor<'_>) -> Result<Vec<NewsPost>, rorm::Error> {
        let posts = rorm::query(exe, NewsPostModel)
            .condition(NewsPostModel.published_at.is_some())
            .order_desc(NewsPostModel.published_at)
            .all()
            .await?;
        Ok(posts.into_iter().map(NewsPost::from).collect())
    }

    /// Fetch a News Post by its primary key
    #[instrument(name = "NewsPost::get_by_uuid", skip(exe))]
    pub async fn get_by_uuid(
        exe: impl Executor<'_>,
        uuid: NewsPostUuid,
    ) -> Result<Option<NewsPost>, rorm::Error> {
        let post = rorm::query(exe, NewsPostModel)
            .condition(NewsPostModel.uuid.equals(uuid.0))
            .optional()
            .await?;
        Ok(post.map(NewsPost::from))
    }

    /// Insert a new News Post as a Draft and return its primary key
    #[instrument(name = "NewsPost::insert", skip(exe, body))]
    pub async fn insert(
        exe: impl Executor<'_>,
        title: MaxStr<255>,
        body: MaxStr<20000>,
    ) -> Result<NewsPostUuid, rorm::Error> {
        let uuid = rorm::insert(exe, NewsPostModel)
            .return_primary_key()
            .single(&NewsPostInsertPatch {
                uuid: Uuid::new_v4(),
                title,
                body,
            })
            .await?;
        Ok(NewsPostUuid(uuid))
    }

    /// Change title and body, leaving the publication time as it is
    ///
    /// Returns `false` if the News Post does not exist.
    #[instrument(name = "NewsPost::update", skip(exe, body))]
    pub async fn update(
        exe: impl Executor<'_>,
        uuid: NewsPostUuid,
        title: MaxStr<255>,
        body: MaxStr<20000>,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(exe, NewsPostModel)
            .set(NewsPostModel.title, title)
            .set(NewsPostModel.body, body)
            .set(NewsPostModel.updated_at, OffsetDateTime::now_utc())
            .condition(NewsPostModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Publish a News Post now, also one that was Published before
    ///
    /// Returns `false` if the News Post does not exist.
    #[instrument(name = "NewsPost::publish", skip(exe))]
    pub async fn publish(exe: impl Executor<'_>, uuid: NewsPostUuid) -> Result<bool, rorm::Error> {
        Self::set_published_at(exe, uuid, Some(OffsetDateTime::now_utc())).await
    }

    /// Withdraw a News Post, making it a Draft again
    ///
    /// Returns `false` if the News Post does not exist.
    #[instrument(name = "NewsPost::withdraw", skip(exe))]
    pub async fn withdraw(exe: impl Executor<'_>, uuid: NewsPostUuid) -> Result<bool, rorm::Error> {
        Self::set_published_at(exe, uuid, None).await
    }

    async fn set_published_at(
        exe: impl Executor<'_>,
        uuid: NewsPostUuid,
        published_at: Option<OffsetDateTime>,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(exe, NewsPostModel)
            .set(NewsPostModel.published_at, published_at)
            .set(NewsPostModel.updated_at, OffsetDateTime::now_utc())
            .condition(NewsPostModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Delete a News Post
    ///
    /// Returns `false` if the News Post does not exist.
    #[instrument(name = "NewsPost::delete", skip(exe))]
    pub async fn delete(exe: impl Executor<'_>, uuid: NewsPostUuid) -> Result<bool, rorm::Error> {
        let affected = rorm::delete(exe, NewsPostModel)
            .condition(NewsPostModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }
}

impl From<NewsPostModel> for NewsPost {
    fn from(value: NewsPostModel) -> Self {
        Self {
            uuid: NewsPostUuid(value.uuid),
            title: value.title,
            body: value.body,
            published_at: value.published_at,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}
