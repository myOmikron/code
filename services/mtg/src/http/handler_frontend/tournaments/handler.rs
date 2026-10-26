use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;

use crate::http::handler_frontend::tournaments::live::TournamentEvent;
use crate::http::handler_frontend::tournaments::live::emit;
use crate::http::handler_frontend::tournaments::schema::ListPublicTournamentsQuery;
use crate::http::handler_frontend::tournaments::schema::ListTournamentsResponse;
use crate::http::handler_frontend::tournaments::schema::MyTournamentsResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentSettingsErrors;
use crate::http::handler_frontend::tournaments::schema::TournamentSettingsRequest;
use crate::http::handler_frontend::tournaments::schema::TournamentSummaryResponse;
use crate::models::account::Account;
use crate::models::account::extractor::Viewer;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentState;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::access::OrganizerRole;
use crate::models::tournament::listing::ListedTournament;
use crate::models::tournament::listing::OverviewFilter;
use crate::models::tournament::settings::TournamentSettings;

/// The public Tournaments, narrowed down by the filters given
///
/// Upcoming ones come soonest first, past and unfiltered ones latest first.
#[get("/")]
pub async fn list_public_tournaments(
    Query(query): Query<ListPublicTournamentsQuery>,
) -> ApiResult<ApiJson<ListTournamentsResponse>> {
    let filter = OverviewFilter::from(query);

    let mut tx = Database::global().start_transaction().await?;

    let tournaments = ListedTournament::public(&mut tx, &filter, OffsetDateTime::now_utc()).await?;

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
    let role = match viewer.account() {
        Some(account) => tournament.organizer_role(&mut tx, account).await?,
        None => None,
    };

    tx.commit().await?;

    Ok(ApiJson(TournamentResponse::new(tournament, owner, role)))
}

/// The Tournaments the logged-in Account organizes and the ones it plays in
///
/// Private and unlisted ones included: the Account has its part in each.
#[get("/mine")]
pub async fn get_my_tournaments(account: Account) -> ApiResult<ApiJson<MyTournamentsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let organizing = ListedTournament::organized_by(&mut tx, account.uuid).await?;
    let participating = ListedTournament::played_in_by(&mut tx, account.uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(MyTournamentsResponse {
        organizing: organizing
            .into_iter()
            .map(TournamentSummaryResponse::from)
            .collect(),
        participating: participating
            .into_iter()
            .map(TournamentSummaryResponse::from)
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

    Ok(ApiJson(TournamentResponse::new(
        tournament,
        Some(account.username),
        Some(OrganizerRole::Owner),
    )))
}

/// Replace a Tournament's settings, as one of its Organizers
///
/// Table size, Ruleset and best-of stay as they are once the first Round started,
/// the Top cut and its best-of once the Swiss Rounds are over.
#[put("/{tournament}")]
pub async fn update_tournament(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
    ApiJson(request): ApiJson<TournamentSettingsRequest>,
) -> ApiResult<ApiJson<TournamentResponse>, TournamentSettingsErrors> {
    let settings = TournamentSettings::check(request.into())
        .map_err(|refusal| ApiError::FormError(refusal.into()))?;

    let mut tx = Database::global().start_transaction().await?;

    let Some((tournament, role)) =
        Tournament::get_with_role(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    if tournament.state != TournamentState::Registration && settings.changes_rules_of(&tournament) {
        tx.rollback().await?;
        let mut errors = FormErrors::<TournamentSettingsErrors>::new();
        errors.rules_locked = true;
        return errors.fail();
    }
    if !tournament.top_cut_open() && settings.changes_top_cut_of(&tournament) {
        tx.rollback().await?;
        let mut errors = FormErrors::<TournamentSettingsErrors>::new();
        errors.top_cut_locked = true;
        return errors.fail();
    }
    let tournament = tournament.update_settings(&mut tx, settings).await?;
    let owner = tournament.owner_name(&mut tx).await?;

    tx.commit().await?;

    emit(tournament.uuid, TournamentEvent::TournamentChanged);
    Ok(ApiJson(TournamentResponse::new(
        tournament,
        owner,
        Some(role),
    )))
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
    let deleted = tournament.uuid;
    tournament.delete(&mut tx).await?;

    tx.commit().await?;

    emit(deleted, TournamentEvent::TournamentChanged);
    Ok(ApiJson(()))
}

/// The refusal for a Tournament that is missing or not the caller's to touch
///
/// One answer for both, so it says nothing about whether a private Tournament exists.
pub fn denied<E>() -> ApiError<E> {
    ApiError::bad_request("No such tournament")
}
