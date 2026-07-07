//! Endpoints for club admins

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::post;
use galvyn::rorm::Database;
use tracing::instrument;

use crate::http::handler_frontend::accounts::CredentialResetSchema;
use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::club::ClubUuid;

#[post("/{uuid}/reset-credentials")]
#[instrument(name = "Api::club_admin::reset_credentials")]
pub async fn reset_credentials(
    Path((club_uuid, account_uuid)): Path<(ClubUuid, AccountUuid)>,
) -> ApiResult<ApiJson<CredentialResetSchema>> {
    let mut tx = Database::global().start_transaction().await?;

    let account = Account::get_by_uuid(&mut tx, account_uuid)
        .await?
        .ok_or(ApiError::bad_request("Target account doesn't exist"))?;

    let Account::ClubMember(club_member) = &account else {
        return Err(ApiError::bad_request(
            "Target account isn't a club member account",
        ));
    };

    if club_member.club != club_uuid {
        return Err(ApiError::bad_request(
            "Target account isn't part of the club of the executing admin",
        ));
    }

    let reset = account.create_credential_reset(&mut tx).await?;

    tx.commit().await?;

    Ok(ApiJson(CredentialResetSchema::from(reset)))
}
