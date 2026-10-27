use std::sync::LazyLock;
use std::time::Duration;

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
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;

use crate::http::handler_frontend::tournaments::live::TournamentEvent;
use crate::http::handler_frontend::tournaments::live::emit;
use crate::http::handler_frontend::tournaments::organizers::schema::AddCoOrganizerErrors;
use crate::http::handler_frontend::tournaments::organizers::schema::OfferHandoverErrors;
use crate::http::handler_frontend::tournaments::participants::schema::AddAccountParticipantErrors;
use crate::http::handler_frontend::tournaments::schema::ListPublicTournamentsQuery;
use crate::http::handler_frontend::tournaments::schema::ListTournamentsResponse;
use crate::http::handler_frontend::tournaments::schema::MyTournamentsResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentSettingsErrors;
use crate::http::handler_frontend::tournaments::schema::TournamentSettingsRequest;
use crate::http::handler_frontend::tournaments::schema::TournamentSummaryResponse;
use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::account::Username;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentState;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::access::OrganizerRole;
use crate::models::tournament::access::TournamentGrant;
use crate::models::tournament::listing::ListedTournament;
use crate::models::tournament::listing::OverviewFilter;
use crate::models::tournament::settings::TournamentSettings;
use crate::utils::budget::Budget;

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
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<ApiJson<TournamentResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let owner = grant.tournament.owner_name(&mut tx).await?;

    tx.commit().await?;

    Ok(ApiJson(TournamentResponse::new(
        grant.tournament,
        owner,
        grant.role,
    )))
}

/// The Tournaments the logged-in Account organizes and the ones it plays in
///
/// Private and unlisted ones included: the Account has its part in each.
#[get("/mine")]
pub async fn get_my_tournaments(account: Account) -> ApiResult<ApiJson<MyTournamentsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let organizing = ListedTournament::organized_by(&mut tx, account.uuid).await?;
    let participating = ListedTournament::played_in_by(&mut tx, account.uuid).await?;
    let ongoing_participations =
        ListedTournament::ongoing_participations(&mut tx, account.uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(MyTournamentsResponse {
        ongoing_participations,
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
/// the Top cut and its best-of once the Swiss Rounds are over. Settings that
/// change which Participants are pairable throw a previewed Round away.
#[put("/{tournament}")]
pub async fn update_tournament(
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
    ApiJson(request): ApiJson<TournamentSettingsRequest>,
) -> ApiResult<ApiJson<TournamentResponse>, TournamentSettingsErrors> {
    let settings = TournamentSettings::check(request.into())
        .map_err(|refusal| ApiError::FormError(refusal.into()))?;

    let mut tx = Database::global().start_transaction().await?;

    let TournamentGrant {
        tournament, role, ..
    } = grant;
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
    let outdated = if settings.changes_pairable_of(&tournament) {
        tournament.previewed_round(&mut tx).await?
    } else {
        None
    };
    let tournament = tournament.update_settings(&mut tx, settings).await?;
    if outdated.is_some() {
        tournament.discard_preview(&mut tx).await?;
    }
    let owner = tournament.owner_name(&mut tx).await?;

    tx.commit().await?;

    emit(tournament.uuid, TournamentEvent::TournamentChanged);
    if let Some(round) = outdated {
        emit(tournament.uuid, TournamentEvent::PreviewOutdated { round });
    }
    Ok(ApiJson(TournamentResponse::new(tournament, owner, role)))
}

/// Delete a Tournament and everything in it, as its Owner
#[delete("/{tournament}")]
pub async fn delete_tournament(
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    let tournament = grant.tournament;
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

/// Unknown usernames a caller may name per hour, as Participant, Co-organizer or heir
static UNKNOWN_USERNAMES: LazyLock<Budget<AccountUuid>> =
    LazyLock::new(|| Budget::new(20, Duration::from_secs(60 * 60)));

/// Form errors of a request that names an Account by its username
pub trait UnknownUsernameErrors: Default {
    /// The errors saying no Account goes by the username, or with
    /// `too_many` that the username was not looked up at all
    fn naming_nobody(too_many: bool) -> Self;
}

/// The Account a request names by `username`, `None` for an unknown one
pub async fn named_account(
    tx: &mut Transaction,
    username: &MaxStr<255>,
) -> Result<Option<Account>, rorm::Error> {
    match Username::new(username.to_string()) {
        Ok(username) => Account::get_by_username(tx, &username).await,
        Err(_) => Ok(None),
    }
}

/// The refusal of a request whose username names no Account
///
/// Counts against `caller`'s budget of unknown usernames, one budget for
/// every request that names an Account, see [`UNKNOWN_USERNAMES`]; past it
/// the answer says the caller named too many lately instead.
pub fn unknown_username<T, E: UnknownUsernameErrors>(caller: AccountUuid) -> ApiResult<T, E> {
    Err(ApiError::FormError(E::naming_nobody(
        !UNKNOWN_USERNAMES.take(caller),
    )))
}

impl UnknownUsernameErrors for AddAccountParticipantErrors {
    fn naming_nobody(too_many: bool) -> Self {
        Self {
            unknown_username: !too_many,
            too_many_unknown_usernames: too_many,
            ..Self::default()
        }
    }
}

impl UnknownUsernameErrors for AddCoOrganizerErrors {
    fn naming_nobody(too_many: bool) -> Self {
        Self {
            unknown_username: !too_many,
            too_many_unknown_usernames: too_many,
            ..Self::default()
        }
    }
}

impl UnknownUsernameErrors for OfferHandoverErrors {
    fn naming_nobody(too_many: bool) -> Self {
        Self {
            unknown_username: !too_many,
            too_many_unknown_usernames: too_many,
            ..Self::default()
        }
    }
}
