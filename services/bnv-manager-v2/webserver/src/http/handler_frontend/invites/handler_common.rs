//! Common handlers for invites.

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::FormResult;
use galvyn::core::stuff::schema::SingleUuid;
use galvyn::get;
use galvyn::post;
use galvyn::rorm::Database;
use mailcow::domain_admins::schema::CreateDomainAdminRequest;
use tracing::error;
use tracing::info;
use tracing::instrument;

use crate::http::handler_frontend::invites::AcceptInvite;
use crate::http::handler_frontend::invites::AcceptInviteError;
use crate::http::handler_frontend::invites::GetInvite;
use crate::models::account::Account;
use crate::models::domain::Domain;
use crate::models::invite::AcceptInviteParams;
use crate::models::invite::Invite;
use crate::models::invite::InviteUuid;
use crate::modules::mailcow::Mailcow;

#[get("/{uuid}")]
#[instrument(name = "Api::common::get_invite")]
pub async fn get_invite_common(
    Path(SingleUuid { uuid }): Path<SingleUuid>,
) -> ApiResult<ApiJson<GetInvite>> {
    let mut tx = Database::global().start_transaction().await?;

    let invite = Invite::find_by_uuid(&mut tx, InviteUuid(uuid))
        .await?
        .ok_or(ApiError::bad_request("Invite not found"))?;

    tx.commit().await?;

    Ok(ApiJson(GetInvite::from(invite)))
}

#[post("/{uuid}/accept")]
#[instrument(name = "Api::common::accept_invite", skip(password))]
pub async fn accept_invite(
    Path(SingleUuid { uuid }): Path<SingleUuid>,
    ApiJson(AcceptInvite { password }): ApiJson<AcceptInvite>,
) -> ApiResult<ApiJson<FormResult<(), AcceptInviteError>>> {
    let mut tx = Database::global().start_transaction().await?;

    let invite = Invite::find_by_uuid(&mut tx, InviteUuid(uuid))
        .await?
        .ok_or(ApiError::bad_request("Invite not found"))?;

    let res = invite
        .accept_invite(
            &mut tx,
            AcceptInviteParams {
                password: password.clone(),
            },
        )
        .await?;

    match res {
        Ok(Account::ClubAdmin(club_admin)) => {
            let mut domains = vec![];
            domains.extend(Domain::find_all_by_club(&mut tx, club_admin.club).await?);

            // Associate corresponding domains
            tokio::spawn(async move {
                let username = club_admin.username.into_inner();

                let u = username.clone();
                let res: anyhow::Result<()> = async move {
                    let hashed_password =
                        format!("{{BLF-CRYPT}}{}", Account::hash_password(&password)?);
                    Mailcow::global()
                        .sdk
                        .create_domain_admin(CreateDomainAdminRequest {
                            active: 1,
                            domains: domains.into_iter().map(|x| x.domain.into_inner()).collect(),
                            password: hashed_password.clone(),
                            password2: hashed_password,
                            username: u,
                        })
                        .await?;

                    Ok(())
                }
                .await;

                if let Err(err) = res {
                    error!(err = ?err, "Could not create domain admin for account {username}");
                } else {
                    info!("Successfully added domain admin in mailcow for account {username}");
                }
            });
        }
        Ok(_) => {}
        Err(err) => {
            return match err {
                crate::models::invite::AcceptInviteError::Expired => {
                    Ok(ApiJson(FormResult::err(AcceptInviteError {
                        expired: true,
                        ..Default::default()
                    })))
                }
            };
        }
    }

    tx.commit().await?;

    Ok(ApiJson(FormResult::ok(())))
}
