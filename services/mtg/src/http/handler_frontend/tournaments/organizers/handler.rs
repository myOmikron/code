use std::sync::LazyLock;
use std::time::Duration;

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
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

use crate::http::handler_frontend::tournaments::handler::denied;
use crate::http::handler_frontend::tournaments::organizers::schema::AddCoOrganizerErrors;
use crate::http::handler_frontend::tournaments::organizers::schema::ListOrganizersResponse;
use crate::http::handler_frontend::tournaments::organizers::schema::NameAccountRequest;
use crate::http::handler_frontend::tournaments::organizers::schema::OfferHandoverErrors;
use crate::http::handler_frontend::tournaments::organizers::schema::OrganizerResponse;
use crate::http::handler_frontend::tournaments::schema::ListTournamentsResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentSummaryResponse;
use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::account::Username;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::access::OrganizerRole;
use crate::models::tournament::listing::ListedTournament;
use crate::models::tournament::organizer::AddCoOrganizerRefusal;
use crate::utils::account_budget::AccountBudget;

/// Unknown usernames a caller may try to name per hour, as Co-organizer or heir
static UNKNOWN_USERNAMES: LazyLock<AccountBudget> =
    LazyLock::new(|| AccountBudget::new(20, Duration::from_secs(60 * 60)));

/// Who runs a Tournament, and whom its Owner offered it to
///
/// Every Organizer reads it.
#[get("/{tournament}/organizers")]
pub async fn list_tournament_organizers(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<ListOrganizersResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_as_organizer(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let owner = tournament.owner_name(&mut tx).await?;
    let co_organizers = tournament.co_organizers(&mut tx).await?;
    let handover = tournament.handover(&mut tx).await?;

    tx.commit().await?;

    Ok(ApiJson(ListOrganizersResponse {
        owner: owner.map(|owner| OrganizerResponse::new(tournament.owner, &owner)),
        co_organizers: co_organizers
            .into_iter()
            .map(OrganizerResponse::from)
            .collect(),
        handover: handover.map(OrganizerResponse::from),
    }))
}

/// Name an Account a Co-organizer by its username, as one of the Organizers
///
/// Unknown usernames are capped per caller, see [`UNKNOWN_USERNAMES`].
#[post("/{tournament}/organizers")]
pub async fn add_tournament_co_organizer(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
    ApiJson(NameAccountRequest { username }): ApiJson<NameAccountRequest>,
) -> ApiResult<ApiJson<OrganizerResponse>, AddCoOrganizerErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_as_organizer(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let Some(named) = named_account(&mut tx, &username).await? else {
        tx.rollback().await?;
        let mut errors = FormErrors::<AddCoOrganizerErrors>::new();
        if UNKNOWN_USERNAMES.take(account.uuid) {
            errors.unknown_username = true;
        } else {
            errors.too_many_unknown_usernames = true;
        }
        return errors.fail();
    };
    if let Err(refusal) = tournament.add_co_organizer(&mut tx, named.uuid).await? {
        tx.rollback().await?;
        let mut errors = FormErrors::<AddCoOrganizerErrors>::new();
        match refusal {
            AddCoOrganizerRefusal::Owner => errors.owner = true,
            AddCoOrganizerRefusal::AlreadyCoOrganizer => errors.already_co_organizer = true,
        }
        return errors.fail();
    }

    tx.commit().await?;

    Ok(ApiJson(OrganizerResponse::new(named.uuid, &named.username)))
}

/// Take a Co-organizer off a Tournament
///
/// The Owner takes off any Co-organizer, a Co-organizer only itself.
#[delete("/{tournament}/organizers/{account}")]
pub async fn remove_tournament_co_organizer(
    account: Account,
    Path((tournament, co_organizer)): Path<(TournamentUuid, AccountUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some((tournament, role)) =
        Tournament::get_with_role(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    if !role.may_remove(account.uuid, co_organizer) {
        tx.rollback().await?;
        return Err(denied());
    }
    tournament
        .remove_co_organizer(&mut tx, co_organizer)
        .await?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Offer a Tournament to an Account by its username, as its Owner
///
/// Replaces a pending offer. Nothing changes until the Account accepts.
/// Unknown usernames are capped per caller, see [`UNKNOWN_USERNAMES`].
#[put("/{tournament}/handover")]
pub async fn offer_tournament_handover(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
    ApiJson(NameAccountRequest { username }): ApiJson<NameAccountRequest>,
) -> ApiResult<ApiJson<OrganizerResponse>, OfferHandoverErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_as_owner(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let Some(named) = named_account(&mut tx, &username).await? else {
        tx.rollback().await?;
        let mut errors = FormErrors::<OfferHandoverErrors>::new();
        if UNKNOWN_USERNAMES.take(account.uuid) {
            errors.unknown_username = true;
        } else {
            errors.too_many_unknown_usernames = true;
        }
        return errors.fail();
    };
    if named.uuid == tournament.owner {
        tx.rollback().await?;
        let mut errors = FormErrors::<OfferHandoverErrors>::new();
        errors.own_account = true;
        return errors.fail();
    }
    tournament.offer_handover(&mut tx, named.uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(OrganizerResponse::new(named.uuid, &named.username)))
}

/// Withdraw the pending offer of a Tournament, as its Owner
#[delete("/{tournament}/handover")]
pub async fn withdraw_tournament_handover(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_as_owner(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    tournament.withdraw_handover(&mut tx).await?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// The Tournaments offered to the logged-in Account to take over, latest start first
#[get("/handovers")]
pub async fn get_tournament_handovers(
    account: Account,
) -> ApiResult<ApiJson<ListTournamentsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let tournaments = ListedTournament::offered_to(&mut tx, account.uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(ListTournamentsResponse {
        tournaments: tournaments
            .into_iter()
            .map(TournamentSummaryResponse::from)
            .collect(),
    }))
}

/// Take over a Tournament offered to the logged-in Account
///
/// It becomes the Owner; the former Owner stays as a Co-organizer.
#[post("/{tournament}/handover/accept")]
pub async fn accept_tournament_handover(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<TournamentResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::accept_handover(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };

    tx.commit().await?;

    Ok(ApiJson(TournamentResponse::new(
        tournament,
        Some(account.username),
        Some(OrganizerRole::Owner),
    )))
}

/// Turn down a Tournament offered to the logged-in Account
///
/// Everything stays as it was, and the offer is gone.
#[post("/{tournament}/handover/decline")]
pub async fn decline_tournament_handover(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    if !Tournament::decline_handover(&mut tx, tournament, account.uuid).await? {
        tx.rollback().await?;
        return Err(denied());
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// The Account a request names by username, `None` for an unknown one
async fn named_account(
    tx: &mut Transaction,
    username: &MaxStr<255>,
) -> Result<Option<Account>, galvyn::rorm::Error> {
    match Username::new(username.to_string()) {
        Ok(username) => Account::get_by_username(tx, &username).await,
        Err(_) => Ok(None),
    }
}
