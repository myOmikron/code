//! Club admin endpoints

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::Page;
use galvyn::delete;
use galvyn::get;
use galvyn::rorm::Database;
use tracing::instrument;

use crate::http::extractors::session_user::SessionUser;
use crate::http::handler_frontend::accounts::SimpleMemberAccountSchema;
use crate::http::handler_frontend::clubs::PageParams;
use crate::http::handler_frontend::clubs::schema;
use crate::http::handler_frontend::invites::GetInvite;
use crate::models::account::AccountUuid;
use crate::models::account::ClubAccount;
use crate::models::club::Club;
use crate::models::club::ClubUuid;
use crate::models::invite::Invite;
use crate::modules::mailcow::Mailcow;

#[get("/")]
#[instrument(name = "Api::club_admin::get_club")]
pub async fn get_club(
    Path(club_uuid): Path<ClubUuid>,
    SessionUser { uuid: account_uuid }: SessionUser,
) -> ApiResult<ApiJson<schema::ClubSchema>> {
    let mut tx = Database::global().start_transaction().await?;

    let club = Club::find_by_uuid(&mut tx, club_uuid)
        .await?
        .ok_or(ApiError::bad_request("Club not found"))?;

    tx.commit().await?;

    Ok(ApiJson(schema::ClubSchema::from(club)))
}

#[get("/members")]
#[instrument(name = "Api::club_admin::get_club_members")]
pub async fn get_club_members(
    Path(club_uuid): Path<ClubUuid>,
    Query(PageParams {
        limit,
        offset,
        search,
    }): Query<PageParams>,
) -> ApiResult<ApiJson<Page<SimpleMemberAccountSchema>>> {
    let mut tx = Database::global().start_transaction().await?;

    let club = Club::find_by_uuid(&mut tx, club_uuid)
        .await?
        .ok_or(ApiError::bad_request("Club not found"))?;

    let page = club.members_page(&mut tx, limit, offset, search).await?;

    tx.commit().await?;

    Ok(ApiJson(Page {
        items: page
            .items
            .into_iter()
            .map(SimpleMemberAccountSchema::from)
            .collect(),
        limit: page.limit,
        offset: page.offset,
        total: page.total,
    }))
}

#[get("/members/invites")]
#[instrument(name = "Api::club_admin::get_club_member_invites")]
pub async fn get_club_member_invites(
    Path(club_uuid): Path<ClubUuid>,
) -> ApiResult<ApiJson<Vec<GetInvite>>> {
    let mut tx = Database::global().start_transaction().await?;

    let invites = Invite::find_by_club(&mut tx, club_uuid)
        .await?
        .into_iter()
        .filter_map(|x| x.email.is_some().then_some(GetInvite::from(x)))
        .collect();

    tx.commit().await?;

    Ok(ApiJson(invites))
}

#[get("/dashboard-stats")]
#[instrument(name = "Api::club_admin::get_dashboard_stats")]
pub async fn get_dashboard_stats(
    Path(club_uuid): Path<ClubUuid>,
) -> ApiResult<ApiJson<schema::DashboardStatsSchema>> {
    let mut tx = Database::global().start_transaction().await?;

    let club = Club::find_by_uuid(&mut tx, club_uuid)
        .await?
        .ok_or(ApiError::bad_request("Club not found"))?;

    let member_emails: std::collections::HashSet<String> = club
        .members_page(&mut tx, i64::MAX as u64, 0, None)
        .await?
        .items
        .into_iter()
        .map(|m| m.email.into_inner())
        .collect();

    tx.commit().await?;

    let primary_domain: String = club.primary_domain.into_inner();

    let cached = Mailcow::global()
        .get_cached_domain_stats(&primary_domain)
        .await
        .ok_or(ApiError::server_error("Domain stats not yet available"))?;

    let domain = cached.domain;
    let domain_quota = domain.def_quota_for_mbox;

    let domain_stats = vec![schema::DomainStatsSchema {
        domain: domain.domain_name,
        bytes_used: domain.bytes_total,
        quota: domain.max_quota_for_domain,
        mailboxes_used: domain.mboxes_in_domain,
        mailboxes_max: domain.max_num_mboxes_for_domain,
        messages: domain.msgs_total,
    }];

    let mut mailboxes: Vec<_> = cached
        .mailboxes
        .into_iter()
        .filter(|m| member_emails.contains(&m.username))
        .collect();

    // Use quota-based ordering, so that accounts with high usage quota are sorted first
    mailboxes.sort_by_key(|m| {
        let quota = if m.quota == 0 { domain_quota } else { m.quota };
        std::cmp::Reverse((m.quota_used as f64 / quota as f64 * 10000.0) as u64)
    });

    let mailbox_stats: Vec<_> = mailboxes
        .into_iter()
        .enumerate()
        .take_while(|(count, m)| {
            // Take at least 10 elements and all elements with high or exceeded usage
            // quota, depends on sorting order above
            let quota = if m.quota == 0 { domain_quota } else { m.quota };
            let relative_quota = m.quota_used as f64 / quota as f64;
            *count < 10 || relative_quota >= 0.9
        })
        .map(|(_, m)| schema::MailboxStatsSchema {
            email: m.username,
            quota_used: m.quota_used,
            quota: if m.quota == 0 { domain_quota } else { m.quota },
            messages: m.messages,
        })
        .collect();

    Ok(ApiJson(schema::DashboardStatsSchema {
        domains: domain_stats,
        mailboxes: mailbox_stats,
    }))
}

#[delete("/{member_uuid}")]
#[instrument(name = "Api::club_admin::delete_member")]
pub async fn delete_member(
    Path((club_uuid, account_uuid)): Path<(ClubUuid, AccountUuid)>,
) -> ApiResult<()> {
    let mut tx = Database::global().start_transaction().await?;

    let account = ClubAccount::get_by_uuid(&mut tx, account_uuid)
        .await?
        .ok_or(ApiError::bad_request("Account not found"))?;

    if account.club != club_uuid {
        return Err(ApiError::bad_request(
            "Cannot delete account of a different club",
        ));
    }

    Mailcow::global()
        .sdk
        .delete_mailbox(vec![account.email.clone().into_inner()])
        .await
        .map_err(ApiError::map_server_error(
            "Could not delete mailbox in mailcow",
        ))?;

    account.delete(&mut tx).await?;

    tx.commit().await?;

    Ok(())
}
