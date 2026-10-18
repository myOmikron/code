use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use galvyn::put;
use galvyn::rorm::Database;

use crate::http::handler_frontend::admin::accounts::schema::AdminAccount;
use crate::http::handler_frontend::admin::accounts::schema::AdminAccountDetail;
use crate::http::handler_frontend::admin::accounts::schema::AdminListAccountsQuery;
use crate::http::handler_frontend::admin::accounts::schema::AdminListAccountsResponse;
use crate::http::handler_frontend::admin::accounts::schema::AdminSetRoleErrors;
use crate::http::handler_frontend::admin::accounts::schema::AdminSetRoleRequest;
use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::account::Role;
use crate::models::account::overview::AccountDetail;
use crate::models::account::overview::AccountFilter;
use crate::models::account::overview::AccountOverview;

/// The largest page a client may ask for
const MAX_LIMIT: u32 = 100;

/// List Accounts, newest first
#[get("/")]
pub async fn admin_list_accounts(
    Query(query): Query<AdminListAccountsQuery>,
) -> ApiResult<ApiJson<AdminListAccountsResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let page = AccountOverview::page(
        &mut tx,
        &AccountFilter {
            search: query.search,
            role: query.role,
            after: query.after,
            limit: query.limit.clamp(1, MAX_LIMIT),
        },
    )
    .await?;
    tx.commit().await?;

    Ok(ApiJson(AdminListAccountsResponse {
        accounts: page.accounts.into_iter().map(AdminAccount::from).collect(),
        next_cursor: page.next_cursor,
    }))
}

/// One Account with its card and passkey counts
#[get("/{uuid}")]
pub async fn admin_get_account(
    Path(uuid): Path<AccountUuid>,
) -> ApiResult<ApiJson<AdminAccountDetail>> {
    let mut tx = Database::global().start_transaction().await?;
    let detail = AccountDetail::get(&mut tx, uuid).await?;
    tx.commit().await?;

    let detail = detail.ok_or(ApiError::bad_request("Unknown account"))?;
    Ok(ApiJson(AdminAccountDetail {
        account: AdminAccount::from(detail.overview),
        cards: detail.cards,
        passkeys: detail.passkeys,
    }))
}

/// Change an Account's Role
///
/// An Admin cannot demote itself, so there is always an Admin left to undo a change.
#[put("/{uuid}/role")]
pub async fn admin_set_role(
    admin: Account,
    Path(uuid): Path<AccountUuid>,
    ApiJson(request): ApiJson<AdminSetRoleRequest>,
) -> ApiResult<ApiJson<()>, AdminSetRoleErrors> {
    if uuid == admin.uuid && request.role != Role::Admin {
        let mut errors = FormErrors::<AdminSetRoleErrors>::new();
        errors.own_account = true;
        return errors.fail();
    }

    let mut tx = Database::global().start_transaction().await?;
    let changed = Account::set_role(&mut tx, uuid, request.role).await?;
    tx.commit().await?;

    if !changed {
        return Err(ApiError::bad_request("Unknown account"));
    }
    Ok(ApiJson(()))
}
