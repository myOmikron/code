use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;

use crate::http::handler_frontend::tournaments::schema::ListTournamentsResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentSettingsErrors;
use crate::http::handler_frontend::tournaments::schema::TournamentSettingsRequest;
use crate::http::handler_frontend::tournaments::schema::TournamentSummaryResponse;
use crate::models::account::Account;
use crate::models::account::extractor::Viewer;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::listing::ListedTournament;
use crate::models::tournament::settings::TournamentSettings;

/// The public Tournaments, latest start first
#[get("/")]
pub async fn list_public_tournaments() -> ApiResult<ApiJson<ListTournamentsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let tournaments = ListedTournament::public(&mut tx).await?;

    tx.commit().await?;

    Ok(ApiJson(ListTournamentsResponse {
        tournaments: tournaments
            .into_iter()
            .map(TournamentSummaryResponse::from)
            .collect(),
    }))
}

/// Fetch a Tournament by its id
///
/// Anybody gets a public one; its Organizers get it whatever its Visibility.
/// An unlisted one is read through its share link, see `get_shared_tournament`.
#[get("/{tournament}")]
pub async fn get_tournament(
    viewer: Viewer,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<TournamentResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_visible(&mut tx, tournament, viewer.account()).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let owner = tournament.owner_name(&mut tx).await?;

    tx.commit().await?;

    let role = viewer
        .account()
        .and_then(|account| tournament.organizer_role(account));
    Ok(ApiJson(TournamentResponse::new(tournament, owner, role)))
}

/// The Tournaments the logged-in Account owns, latest start first
#[get("/mine")]
pub async fn get_my_tournaments(account: Account) -> ApiResult<ApiJson<ListTournamentsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let tournaments = Tournament::owned_by(&mut tx, account.uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(ListTournamentsResponse {
        tournaments: tournaments
            .into_iter()
            .map(|tournament| TournamentSummaryResponse::new(tournament, Some(&account.username)))
            .collect(),
    }))
}

/// Create a Tournament, owned by the logged-in Account
#[post("/")]
pub async fn create_tournament(
    account: Account,
    ApiJson(request): ApiJson<TournamentSettingsRequest>,
) -> ApiResult<ApiJson<TournamentResponse>, TournamentSettingsErrors> {
    let settings = TournamentSettings::check(request.into())
        .map_err(|refusal| ApiError::FormError(refusal.into()))?;

    let mut tx = Database::global().start_transaction().await?;

    let tournament = Tournament::create(&mut tx, account.uuid, settings).await?;

    tx.commit().await?;

    let role = tournament.organizer_role(account.uuid);
    Ok(ApiJson(TournamentResponse::new(
        tournament,
        Some(account.username),
        role,
    )))
}

/// Replace a Tournament's settings, as one of its Organizers
#[put("/{tournament}")]
pub async fn update_tournament(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
    ApiJson(request): ApiJson<TournamentSettingsRequest>,
) -> ApiResult<ApiJson<TournamentResponse>, TournamentSettingsErrors> {
    let settings = TournamentSettings::check(request.into())
        .map_err(|refusal| ApiError::FormError(refusal.into()))?;

    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_as_organizer(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let tournament = tournament.update_settings(&mut tx, settings).await?;
    let owner = tournament.owner_name(&mut tx).await?;

    tx.commit().await?;

    let role = tournament.organizer_role(account.uuid);
    Ok(ApiJson(TournamentResponse::new(tournament, owner, role)))
}

/// Delete a Tournament and everything in it, as its Owner
#[delete("/{tournament}")]
pub async fn delete_tournament(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_as_owner(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    tournament.delete(&mut tx).await?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// The refusal for a Tournament that is missing or not the caller's to touch
///
/// One answer for both, so it says nothing about whether a private Tournament exists.
pub fn denied<E>() -> ApiError<E> {
    ApiError::bad_request("No such tournament")
}
