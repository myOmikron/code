//! Administration endpoints for accounts.

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::rorm::Database;
use tracing::instrument;

use crate::http::handler_frontend::accounts::CredentialResetSchema;
use crate::http::handler_frontend::accounts::SimpleAccountSchema;
use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::account::AdministrativeAccount;
use crate::models::account::ClubAdminAccount;
use crate::modules::mailcow::Mailcow;

#[get("/superadmins")]
#[instrument(name = "Api::admin::get_all_superadmins")]
pub async fn get_all_superadmins() -> ApiResult<ApiJson<Vec<SimpleAccountSchema>>> {
    let mut tx = Database::global().start_transaction().await?;

    let accounts = AdministrativeAccount::get_all(&mut tx)
        .await?
        .into_iter()
        .map(SimpleAccountSchema::from)
        .collect();

    tx.commit().await?;

    Ok(ApiJson(accounts))
}

#[delete("/club-admins/{uuid}")]
#[instrument(name = "Api::admin::delete_club_admin")]
pub async fn delete_club_admin(Path(account_uuid): Path<AccountUuid>) -> ApiResult<()> {
    let mut tx = Database::global().start_transaction().await?;

    let club_admin = ClubAdminAccount::get_by_uuid(&mut tx, account_uuid)
        .await?
        .ok_or(ApiError::bad_request("Club admin doesn't exist"))?;

    Mailcow::global()
        .sdk
        .delete_domain_admins(vec![club_admin.username.clone().into_inner()])
        .await
        .map_err(ApiError::map_server_error(
            "Couldn't delete domain administrator in mailcow",
        ))?;

    club_admin.delete(&mut tx).await?;

    tx.commit().await?;

    Ok(())
}

#[post("/{uuid}/reset-credentials")]
#[instrument(name = "Api::admin::reset_credentials")]
pub async fn reset_credentials(
    Path(account_uuid): Path<AccountUuid>,
) -> ApiResult<ApiJson<CredentialResetSchema>> {
    let mut tx = Database::global().start_transaction().await?;

    let account = Account::get_by_uuid(&mut tx, account_uuid)
        .await?
        .ok_or(ApiError::bad_request("Target account doesn't exist"))?;

    let reset = account.create_credential_reset(&mut tx).await?;

    tx.commit().await?;

    Ok(ApiJson(CredentialResetSchema::from(reset)))
}
