use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;

use crate::http::handler_frontend::admin::accounts::schema::AdminAccount;
use crate::http::handler_frontend::admin::accounts::schema::AdminAccountDetail;
use crate::http::handler_frontend::admin::accounts::schema::AdminDeleteAccountErrors;
use crate::http::handler_frontend::admin::accounts::schema::AdminDeleteAccountRequest;
use crate::http::handler_frontend::admin::accounts::schema::AdminListAccountsQuery;
use crate::http::handler_frontend::admin::accounts::schema::AdminListAccountsResponse;
use crate::http::handler_frontend::admin::accounts::schema::AdminLockAccountErrors;
use crate::http::handler_frontend::admin::accounts::schema::AdminLockAccountRequest;
use crate::http::handler_frontend::admin::accounts::schema::AdminRenameAccountErrors;
use crate::http::handler_frontend::admin::accounts::schema::AdminRenameAccountRequest;
use crate::http::handler_frontend::admin::accounts::schema::AdminSetRoleErrors;
use crate::http::handler_frontend::admin::accounts::schema::AdminSetRoleRequest;
use crate::http::handler_frontend::admin::accounts::schema::AdminUnlockAccountErrors;
use crate::http::handler_frontend::admin::accounts::schema::AdminUnlockAccountRequest;
use crate::http::handler_frontend::admin::page_limit;
use crate::models::account::ADMIN_REASON_MAX_LEN;
use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::account::Role;
use crate::models::account::overview::AccountDetail;
use crate::models::account::overview::AccountFilter;
use crate::models::account::overview::AccountOverview;
use crate::models::admin_log::AdminActor;
use crate::models::admin_log::AdminLogAction;
use crate::models::admin_log::AdminLogEntry;
use crate::models::admin_log::NewAdminLogEntry;
use crate::utils::mail::send_new_username;

/// List Accounts, newest first
#[get("/")]
pub async fn admin_list_accounts(
    Query(query): Query<AdminListAccountsQuery>,
) -> ApiResult<ApiJson<AdminListAccountsResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let page = AccountOverview::page(
        &mut tx,
        &AccountFilter {
            search: query.search.map(|search| search.to_string()),
            role: query.role,
            locked: query.locked,
            after: query.after,
            limit: page_limit(query.limit),
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
/// A change writes an Admin log entry; setting the Role an Account has already writes none.
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
    let account = manageable_account(&mut tx, uuid).await?;
    Account::change_role(&mut tx, AdminActor::Admin(&admin), &account, request.role).await?;
    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Lock an Account
///
/// Its Login and Registration link Enrollment are refused from now on, and
/// its sessions fail on their next request. An Admin cannot Lock itself.
#[post("/{uuid}/lock")]
pub async fn admin_lock_account(
    admin: Account,
    Path(uuid): Path<AccountUuid>,
    ApiJson(request): ApiJson<AdminLockAccountRequest>,
) -> ApiResult<ApiJson<()>, AdminLockAccountErrors> {
    let mut errors = FormErrors::<AdminLockAccountErrors>::new();
    if uuid == admin.uuid {
        errors.own_account = true;
    }
    let reason = trimmed_reason(&request.reason);
    if reason.is_none() {
        errors.reason_missing = true;
    }
    errors.check()?;
    let Some(reason) = reason else {
        unreachable!("a missing reason fails the check");
    };

    let mut tx = Database::global().start_transaction().await?;
    let account = manageable_account(&mut tx, uuid).await?;
    if !Account::lock(&mut tx, uuid, reason.clone()).await? {
        tx.rollback().await?;
        let mut errors = FormErrors::<AdminLockAccountErrors>::new();
        errors.already_locked = true;
        return errors.fail();
    }
    AdminLogEntry::record(
        &mut tx,
        NewAdminLogEntry {
            admin: AdminActor::Admin(&admin),
            account: &account,
            action: AdminLogAction::Lock { reason },
        },
    )
    .await?;
    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Lift an Account's Lock
#[post("/{uuid}/unlock")]
pub async fn admin_unlock_account(
    admin: Account,
    Path(uuid): Path<AccountUuid>,
    ApiJson(request): ApiJson<AdminUnlockAccountRequest>,
) -> ApiResult<ApiJson<()>, AdminUnlockAccountErrors> {
    let reason = request.reason.as_ref().and_then(trimmed_reason);

    let mut tx = Database::global().start_transaction().await?;
    let account = manageable_account(&mut tx, uuid).await?;
    if !Account::unlock(&mut tx, uuid).await? {
        tx.rollback().await?;
        let mut errors = FormErrors::<AdminUnlockAccountErrors>::new();
        errors.not_locked = true;
        return errors.fail();
    }
    AdminLogEntry::record(
        &mut tx,
        NewAdminLogEntry {
            admin: AdminActor::Admin(&admin),
            account: &account,
            action: AdminLogAction::Unlock { reason },
        },
    )
    .await?;
    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Rename an Account
///
/// Takes the same usernames as a Rename by the Account itself, also for a
/// locked Account, and mails the Account its new username without the reason.
/// An Admin renames itself through its own settings, not here.
#[put("/{uuid}/username")]
pub async fn admin_rename_account(
    admin: Account,
    Path(uuid): Path<AccountUuid>,
    ApiJson(request): ApiJson<AdminRenameAccountRequest>,
) -> ApiResult<ApiJson<()>, AdminRenameAccountErrors> {
    let mut errors = FormErrors::<AdminRenameAccountErrors>::new();
    if uuid == admin.uuid {
        errors.own_account = true;
    }
    let reason = trimmed_reason(&request.reason);
    if reason.is_none() {
        errors.reason_missing = true;
    }
    errors.check()?;
    let Some(reason) = reason else {
        unreachable!("a missing reason fails the check");
    };

    let mut tx = Database::global().start_transaction().await?;
    let account = manageable_account(&mut tx, uuid).await?;
    if !Account::rename(&mut tx, uuid, request.username.clone()).await? {
        tx.rollback().await?;
        let mut errors = FormErrors::<AdminRenameAccountErrors>::new();
        errors.username_taken = true;
        return errors.fail();
    }
    AdminLogEntry::record(
        &mut tx,
        NewAdminLogEntry {
            admin: AdminActor::Admin(&admin),
            account: &account,
            action: AdminLogAction::Rename {
                new_username: request.username.clone(),
                reason,
            },
        },
    )
    .await?;
    tx.commit().await?;

    send_new_username(&account.email, &request.username, request.language)
        .await
        .map_err(ApiError::map_server_error("Failed to queue mail"))?;

    Ok(ApiJson(()))
}

/// Delete an Account
///
/// By default its public decks go to the Tombstone, as on a self-deletion; a
/// full Deletion takes them too. The Admin types the Account's username to
/// confirm, and cannot delete itself. The Admin log entry is written first, so
/// it keeps the username once the Account is gone.
#[delete("/{uuid}")]
pub async fn admin_delete_account(
    admin: Account,
    Path(uuid): Path<AccountUuid>,
    ApiJson(request): ApiJson<AdminDeleteAccountRequest>,
) -> ApiResult<ApiJson<()>, AdminDeleteAccountErrors> {
    if uuid == admin.uuid {
        let mut errors = FormErrors::<AdminDeleteAccountErrors>::new();
        errors.own_account = true;
        return errors.fail();
    }

    let mut tx = Database::global().start_transaction().await?;
    let account = manageable_account(&mut tx, uuid).await?;
    if !request
        .username
        .trim()
        .eq_ignore_ascii_case(account.username.as_str())
    {
        tx.commit().await?;
        let mut errors = FormErrors::<AdminDeleteAccountErrors>::new();
        errors.username_mismatch = true;
        return errors.fail();
    }

    AdminLogEntry::record(
        &mut tx,
        NewAdminLogEntry {
            admin: AdminActor::Admin(&admin),
            account: &account,
            action: AdminLogAction::Deletion { mode: request.mode },
        },
    )
    .await?;
    Account::delete(&mut tx, uuid, request.mode).await?;
    tx.commit().await?;

    Ok(ApiJson(()))
}

/// The Account an admin route acts on
///
/// An unknown Account or the Tombstone is a bad request. Nothing is written
/// before the lookup, so the transaction rolling back on that error loses nothing.
async fn manageable_account<E>(
    tx: &mut Transaction,
    uuid: AccountUuid,
) -> Result<Account, ApiError<E>> {
    Account::get_manageable(tx, uuid)
        .await?
        .ok_or(ApiError::bad_request("Unknown account"))
}

/// The reason an Admin gave, trimmed, `None` when nothing is left
fn trimmed_reason(reason: &MaxStr<ADMIN_REASON_MAX_LEN>) -> Option<MaxStr<ADMIN_REASON_MAX_LEN>> {
    let reason = reason.trim();
    (!reason.is_empty()).then(|| {
        MaxStr::new(reason.to_string())
            .unwrap_or_else(|_| unreachable!("trimming does not make a string longer"))
    })
}
