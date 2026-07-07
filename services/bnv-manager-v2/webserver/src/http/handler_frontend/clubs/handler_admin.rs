//! Administrative endpoints for managing clubs.

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::FormResult;
use galvyn::core::stuff::schema::Page;
use galvyn::core::stuff::schema::SingleUuid;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::rorm::Database;
use mailcow::domain_admins::schema::EditDomainAdminsChanges;
use mailcow::domain_admins::schema::EditDomainAdminsRequest;
use tracing::instrument;

use crate::http::handler_frontend::accounts::SimpleAccountSchema;
use crate::http::handler_frontend::accounts::SimpleMemberAccountSchema;
use crate::http::handler_frontend::clubs::AssociateDomainRequest;
use crate::http::handler_frontend::clubs::CreateClubError;
use crate::http::handler_frontend::clubs::CreateClubRequest;
use crate::http::handler_frontend::clubs::PageParams;
use crate::http::handler_frontend::clubs::UnassociateDomainRequest;
use crate::http::handler_frontend::clubs::schema;
use crate::http::handler_frontend::domains::DomainSchema;
use crate::http::handler_frontend::invites::GetInvite;
use crate::models::club::Club;
use crate::models::club::ClubUuid;
use crate::models::club::CreateClub;
use crate::models::domain::Domain;
use crate::models::invite::Invite;
use crate::modules::mailcow::Mailcow;

#[get("/")]
#[instrument(name = "Api::admin::get_clubs")]
pub async fn get_clubs() -> ApiResult<ApiJson<Vec<schema::ClubSchema>>> {
    let mut tx = Database::global().start_transaction().await?;

    let clubs = Club::find_all(&mut tx)
        .await?
        .into_iter()
        .map(schema::ClubSchema::from)
        .collect();

    tx.commit().await?;

    Ok(ApiJson(clubs))
}

#[post("/")]
#[instrument(name = "Api::admin::create_club")]
pub async fn create_club(
    ApiJson(CreateClubRequest {
        name,
        primary_domain,
        use_xauth,
    }): ApiJson<CreateClubRequest>,
) -> ApiResult<ApiJson<FormResult<ClubUuid, CreateClubError>>> {
    let mut tx = Database::global().start_transaction().await?;

    let existing_club = Club::find_by_name(&mut tx, &name).await?;

    if existing_club.is_some() {
        return Ok(ApiJson(FormResult::err(CreateClubError {
            name_already_exists: true,
            ..Default::default()
        })));
    }

    let existing_domain = Domain::find_by_uuid(&mut tx, primary_domain)
        .await?
        .ok_or(ApiError::bad_request("Domain not found"))?;

    if existing_domain.associated_club.is_some() {
        return Ok(ApiJson(FormResult::err(CreateClubError {
            domain_already_associated: true,
            ..Default::default()
        })));
    }

    let club = Club::create(
        &mut tx,
        CreateClub {
            name,
            primary_domain: &existing_domain,
            use_xauth,
        },
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(FormResult::ok(club.uuid)))
}

#[delete("/{uuid}")]
#[instrument(name = "Api::admin::delete_club")]
pub async fn delete_club(Path(SingleUuid { uuid }): Path<SingleUuid>) -> ApiResult<()> {
    let mut tx = Database::global().start_transaction().await?;

    let club = Club::find_by_uuid(&mut tx, ClubUuid(uuid)).await?;
    if let Some(club) = club {
        // Delete club admins for the given club in mailcow
        let admins = club
            .admins_page(&mut tx, i64::MAX as u64, 0, None)
            .await?
            .items
            .into_iter()
            .map(|x| x.username.into_inner())
            .collect();

        Mailcow::global()
            .sdk
            .delete_domain_admins(admins)
            .await
            .map_err(ApiError::map_server_error(
                "Couldn't delete domain admins in mailcow",
            ))?;

        let members = club
            .members_page(&mut tx, i64::MAX as u64, 0, None)
            .await?
            .items
            .into_iter()
            .map(|x| x.email.into_inner())
            .collect();

        Mailcow::global()
            .sdk
            .delete_mailbox(members)
            .await
            .map_err(ApiError::map_server_error("Couldn't delete mailboxes"))?;

        club.delete(&mut tx).await?;
    }

    tx.commit().await?;

    Ok(())
}

#[get("/{uuid}")]
#[instrument(name = "Api::admin::get_club")]
pub async fn get_club(
    Path(SingleUuid { uuid }): Path<SingleUuid>,
) -> ApiResult<ApiJson<schema::ClubSchema>> {
    let club = Club::find_by_uuid(Database::global(), ClubUuid(uuid))
        .await?
        .ok_or(ApiError::bad_request("Club not found"))?;

    Ok(ApiJson(schema::ClubSchema::from(club)))
}

#[get("/{uuid}/members")]
#[instrument(name = "Api::admin::get_club_members")]
pub async fn get_club_members(
    Path(SingleUuid { uuid }): Path<SingleUuid>,
    Query(PageParams {
        limit,
        offset,
        search,
    }): Query<PageParams>,
) -> ApiResult<ApiJson<Page<SimpleMemberAccountSchema>>> {
    let mut tx = Database::global().start_transaction().await?;

    let club = Club::find_by_uuid(&mut tx, ClubUuid(uuid))
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

#[get("/{uuid}/admins")]
#[instrument(name = "Api::admin::get_club_admins")]
pub async fn get_club_admins(
    Path(SingleUuid { uuid }): Path<SingleUuid>,
    Query(PageParams {
        limit,
        offset,
        search,
    }): Query<PageParams>,
) -> ApiResult<ApiJson<Page<SimpleAccountSchema>>> {
    let mut tx = Database::global().start_transaction().await?;

    let club = Club::find_by_uuid(&mut tx, ClubUuid(uuid))
        .await?
        .ok_or(ApiError::bad_request("Club not found"))?;

    let page = club.admins_page(&mut tx, limit, offset, search).await?;

    tx.commit().await?;

    Ok(ApiJson(Page {
        items: page
            .items
            .into_iter()
            .map(SimpleAccountSchema::from)
            .collect(),
        limit: page.limit,
        offset: page.offset,
        total: page.total,
    }))
}

#[get("/{uuid}/admins/invites")]
#[instrument(name = "Api::admin::get_club_admin_invites")]
pub async fn get_club_admin_invites(
    Path(SingleUuid { uuid }): Path<SingleUuid>,
) -> ApiResult<ApiJson<Vec<GetInvite>>> {
    let mut tx = Database::global().start_transaction().await?;

    let invites = Invite::find_by_club(&mut tx, ClubUuid(uuid))
        .await?
        .into_iter()
        .filter_map(|x| x.email.is_none().then_some(GetInvite::from(x)))
        .collect();

    tx.commit().await?;

    Ok(ApiJson(invites))
}

#[get("/{uuid}/members/invites")]
#[instrument(name = "Api::admin::get_club_member_invites")]
pub async fn get_club_member_invites(
    Path(SingleUuid { uuid }): Path<SingleUuid>,
) -> ApiResult<ApiJson<Vec<GetInvite>>> {
    let mut tx = Database::global().start_transaction().await?;

    let invites = Invite::find_by_club(&mut tx, ClubUuid(uuid))
        .await?
        .into_iter()
        .filter_map(|x| x.email.is_some().then_some(GetInvite::from(x)))
        .collect();

    tx.commit().await?;

    Ok(ApiJson(invites))
}

#[get("/{uuid}/dashboard-stats")]
#[instrument(name = "Api::admin::get_dashboard_stats")]
pub async fn get_dashboard_stats(
    Path(SingleUuid { uuid }): Path<SingleUuid>,
) -> ApiResult<ApiJson<schema::DashboardStatsSchema>> {
    let mut tx = Database::global().start_transaction().await?;

    let club = Club::find_by_uuid(&mut tx, ClubUuid(uuid))
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

#[get("/{uuid}/domains")]
#[instrument(name = "Api::admin::get_club_domains")]
pub async fn get_club_domains(
    Path(SingleUuid { uuid }): Path<SingleUuid>,
) -> ApiResult<ApiJson<Vec<DomainSchema>>> {
    let mut tx = Database::global().start_transaction().await?;

    let domains = Domain::find_all_by_club(&mut tx, ClubUuid(uuid))
        .await?
        .into_iter()
        .map(DomainSchema::from)
        .collect();

    tx.commit().await?;

    Ok(ApiJson(domains))
}

#[post("/{uuid}/domains/associate")]
#[instrument(name = "Api::admin::associate_domain")]
pub async fn associate_domain(
    Path(club_uuid): Path<ClubUuid>,
    ApiJson(AssociateDomainRequest { domain }): ApiJson<AssociateDomainRequest>,
) -> ApiResult<()> {
    let mut tx = Database::global().start_transaction().await?;

    let domain = Domain::find_by_uuid(&mut tx, domain)
        .await?
        .ok_or(ApiError::bad_request("Domain not found"))?;

    let mut club = Club::find_by_uuid(&mut tx, club_uuid)
        .await?
        .ok_or(ApiError::bad_request("Club not found"))?;

    club.associate_domain(&mut tx, &domain, false).await?;

    let admins = club.admins_page(&mut tx, i64::MAX as u64, 0, None).await?;

    let domains = Domain::find_all_by_club(&mut tx, club_uuid)
        .await?
        .into_iter()
        .map(|x| x.domain.into_inner())
        .collect();

    Mailcow::global()
        .sdk
        .edit_domain_admins(EditDomainAdminsRequest {
            attr: EditDomainAdminsChanges { domains },
            items: admins
                .items
                .into_iter()
                .map(|x| x.username.into_inner())
                .collect(),
        })
        .await
        .map_err(ApiError::map_server_error(
            "Couldn't edit domain admins in mailcow",
        ))?;

    tx.commit().await?;

    Ok(())
}

#[post("/{uuid}/domains/unassociate")]
#[instrument(name = "Api::admin::unassociate_domain")]
pub async fn unassociate_domain(
    Path(club_uuid): Path<ClubUuid>,
    ApiJson(UnassociateDomainRequest { domain }): ApiJson<UnassociateDomainRequest>,
) -> ApiResult<()> {
    let mut tx = Database::global().start_transaction().await?;

    let domain = Domain::find_by_uuid(&mut tx, domain)
        .await?
        .ok_or(ApiError::bad_request("Domain not found"))?;

    let club = Club::find_by_uuid(&mut tx, club_uuid)
        .await?
        .ok_or(ApiError::bad_request("Club not found"))?;

    club.unassociate_domain(&mut tx, &domain).await?;

    let admins = club.admins_page(&mut tx, i64::MAX as u64, 0, None).await?;

    let domains = Domain::find_all_by_club(&mut tx, club_uuid)
        .await?
        .into_iter()
        .map(|x| x.domain.into_inner())
        .collect();

    Mailcow::global()
        .sdk
        .edit_domain_admins(EditDomainAdminsRequest {
            attr: EditDomainAdminsChanges { domains },
            items: admins
                .items
                .into_iter()
                .map(|x| x.username.into_inner())
                .collect(),
        })
        .await
        .map_err(ApiError::map_server_error(
            "Couldn't edit domain admins in mailcow",
        ))?;

    tx.commit().await?;

    Ok(())
}
