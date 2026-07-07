//! Administrative endpoints for invites.

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::FormResult;
use galvyn::core::stuff::schema::SingleLink;
use galvyn::post;
use galvyn::rorm::Database;
use time::Duration;
use time::OffsetDateTime;
use tracing::instrument;

use crate::http::handler_frontend::invites::CreateInviteError;
use crate::http::handler_frontend::invites::CreateInviteRequestAdmin;
use crate::models::invite::CreateInviteParams;
use crate::models::invite::Invite;
use crate::models::invite::InviteUuid;
use crate::utils::links::Link;

#[post("/")]
#[instrument(name = "Api::admin::create_invite")]
pub async fn create_invite(
    ApiJson(CreateInviteRequestAdmin {
        username,
        display_name,
        valid_days,
        invite_type,
    }): ApiJson<CreateInviteRequestAdmin>,
) -> ApiResult<ApiJson<FormResult<SingleLink, CreateInviteError>>> {
    let mut tx = Database::global().start_transaction().await?;

    let invite = Invite::create(
        &mut tx,
        CreateInviteParams {
            username,
            display_name,
            expires_at: OffsetDateTime::now_utc() + Duration::days(valid_days.get() as i64),
            invite_type,
        },
    )
    .await?;

    let invite = match invite {
        Ok(invite) => invite,
        Err(err) => {
            return match err {
                crate::models::invite::CreateInviteError::UsernameTaken => {
                    Ok(ApiJson(FormResult::err(CreateInviteError {
                        username_already_occupied: true,
                    })))
                }
            };
        }
    };

    tx.commit().await?;

    Ok(ApiJson(FormResult::ok(SingleLink {
        link: Link::invite(invite.uuid).to_string(),
    })))
}

#[post("/{uuid}/retract")]
#[instrument(name = "Api::admin::retract_invite")]
pub async fn retract_invite(Path(invite_uuid): Path<InviteUuid>) -> ApiResult<()> {
    let mut tx = Database::global().start_transaction().await?;

    let invite = Invite::find_by_uuid(&mut tx, invite_uuid)
        .await?
        .ok_or(ApiError::bad_request("Invite not found."))?;

    invite.delete(&mut tx).await?;

    tx.commit().await?;

    Ok(())
}
