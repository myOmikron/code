use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Request;
use galvyn::core::re_exports::axum::middleware::Next;
use galvyn::core::re_exports::axum::response::Response;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::rorm::Database;
use serde::Deserialize;
use serde::Serialize;

use crate::http::extractors::session_user::SessionUser;
use crate::models::account::ClubAdminAccount;
use crate::models::club::ClubUuid;

/// Represents the path or identifier for a specific club.
#[derive(Deserialize, Serialize, Debug, Clone, Copy)]
pub struct ClubPath {
    club_uuid: ClubUuid,
}

/// Asynchronous middleware function `auth_club_admin` for authenticating a club administrator.
///
/// This function checks whether the authenticated user (SessionUser) has administrative privileges
/// for the specified club (ClubPath). If the user is verified as an administrator, the middleware
/// will proceed to the next handler in the chain. Otherwise, it will return an error.
pub async fn auth_club_admin(
    Path(ClubPath { club_uuid }): Path<ClubPath>,
    SessionUser { uuid: account_uuid }: SessionUser,
    req: Request,
    next: Next,
) -> ApiResult<Response> {
    let mut tx = Database::global().start_transaction().await?;

    let account = ClubAdminAccount::get_by_uuid(&mut tx, account_uuid)
        .await?
        .ok_or(ApiError::server_error("Account not found"))?;
    if account.club != club_uuid {
        return Err(ApiError::server_error(
            "Account is not an admin for the club",
        ));
    }

    tx.commit().await?;

    Ok(next.run(req).await)
}
