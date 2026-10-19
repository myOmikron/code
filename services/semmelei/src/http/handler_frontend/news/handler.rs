//! Handlers of the News Post endpoints

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;

use crate::http::handler_frontend::news::schema::AdminNewsPost;
use crate::http::handler_frontend::news::schema::ListAdminNewsPostsResponse;
use crate::http::handler_frontend::news::schema::ListPublishedNewsPostsResponse;
use crate::http::handler_frontend::news::schema::NewsPostRequest;
use crate::http::handler_frontend::news::schema::PublishedNewsPost;
use crate::models::NewsPost;
use crate::models::NewsPostUuid;

/// List all News Posts, Drafts included, newest first
#[get("/news-posts")]
pub async fn list_news_posts() -> ApiResult<ApiJson<ListAdminNewsPostsResponse>> {
    let posts = NewsPost::get_all(Database::global()).await?;
    Ok(ApiJson(ListAdminNewsPostsResponse {
        news_posts: posts.into_iter().map(AdminNewsPost::from).collect(),
    }))
}

/// Get one News Post, Draft or Published
#[get("/news-posts/{uuid}")]
pub async fn get_news_post(Path(uuid): Path<NewsPostUuid>) -> ApiResult<ApiJson<AdminNewsPost>> {
    Ok(ApiJson(fetch(uuid).await?))
}

/// Create a News Post as a Draft
#[post("/news-posts")]
pub async fn create_news_post(
    ApiJson(request): ApiJson<NewsPostRequest>,
) -> ApiResult<ApiJson<NewsPostUuid>> {
    validate(&request)?;
    let uuid = NewsPost::insert(Database::global(), request.title, request.body).await?;
    Ok(ApiJson(uuid))
}

/// Change a News Post's title and body
///
/// A Published News Post keeps its publication time.
#[put("/news-posts/{uuid}")]
pub async fn update_news_post(
    Path(uuid): Path<NewsPostUuid>,
    ApiJson(request): ApiJson<NewsPostRequest>,
) -> ApiResult<ApiJson<AdminNewsPost>> {
    validate(&request)?;
    if !NewsPost::update(Database::global(), uuid, request.title, request.body).await? {
        return Err(ApiError::bad_request("Unknown news post"));
    }
    Ok(ApiJson(fetch(uuid).await?))
}

/// Publish a News Post now
///
/// Publishing a withdrawn News Post again gives it a new publication time.
#[post("/news-posts/{uuid}/publish")]
pub async fn publish_news_post(
    Path(uuid): Path<NewsPostUuid>,
) -> ApiResult<ApiJson<AdminNewsPost>> {
    if !NewsPost::publish(Database::global(), uuid).await? {
        return Err(ApiError::bad_request("Unknown news post"));
    }
    Ok(ApiJson(fetch(uuid).await?))
}

/// Withdraw a News Post, making it a Draft again
#[post("/news-posts/{uuid}/withdraw")]
pub async fn withdraw_news_post(
    Path(uuid): Path<NewsPostUuid>,
) -> ApiResult<ApiJson<AdminNewsPost>> {
    if !NewsPost::withdraw(Database::global(), uuid).await? {
        return Err(ApiError::bad_request("Unknown news post"));
    }
    Ok(ApiJson(fetch(uuid).await?))
}

/// Delete a News Post for good
#[delete("/news-posts/{uuid}")]
pub async fn delete_news_post(Path(uuid): Path<NewsPostUuid>) -> ApiResult<()> {
    if !NewsPost::delete(Database::global(), uuid).await? {
        return Err(ApiError::bad_request("Unknown news post"));
    }
    Ok(())
}

/// List the Published News Posts, newest first
#[get("/news-posts")]
pub async fn list_published_news_posts() -> ApiResult<ApiJson<ListPublishedNewsPostsResponse>> {
    let posts = NewsPost::get_published(Database::global()).await?;
    Ok(ApiJson(ListPublishedNewsPostsResponse {
        news_posts: posts
            .into_iter()
            .map(|post| PublishedNewsPost {
                published_at: SchemaDateTime(
                    post.published_at
                        .expect("get_published only returns Published News Posts"),
                ),
                title: post.title.into_inner(),
                body: post.body.into_inner(),
            })
            .collect(),
    }))
}

/// Rejects a blank title or body
fn validate(request: &NewsPostRequest) -> ApiResult<()> {
    if request.title.trim().is_empty() {
        return Err(ApiError::bad_request("Title must not be empty"));
    }
    if request.body.trim().is_empty() {
        return Err(ApiError::bad_request("Body must not be empty"));
    }
    Ok(())
}

/// The News Post as Admins see it
async fn fetch(uuid: NewsPostUuid) -> ApiResult<AdminNewsPost> {
    NewsPost::get_by_uuid(Database::global(), uuid)
        .await?
        .map(AdminNewsPost::from)
        .ok_or(ApiError::bad_request("Unknown news post"))
}
