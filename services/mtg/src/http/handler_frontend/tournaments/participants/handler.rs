use std::sync::LazyLock;
use std::time::Duration;

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
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;

use crate::http::handler_frontend::tournaments::handler::denied;
use crate::http::handler_frontend::tournaments::participants::schema::AddAccountParticipantErrors;
use crate::http::handler_frontend::tournaments::participants::schema::AddAccountParticipantRequest;
use crate::http::handler_frontend::tournaments::participants::schema::AddGuestParticipantErrors;
use crate::http::handler_frontend::tournaments::participants::schema::AddGuestParticipantRequest;
use crate::http::handler_frontend::tournaments::participants::schema::ListParticipantsResponse;
use crate::http::handler_frontend::tournaments::participants::schema::ParticipantResponse;
use crate::http::handler_frontend::tournaments::participants::schema::PlayerCandidateResponse;
use crate::http::handler_frontend::tournaments::participants::schema::PlayerCandidatesResponse;
use crate::http::handler_frontend::tournaments::participants::schema::SearchPlayersQuery;
use crate::http::handler_frontend::tournaments::participants::schema::SignUpErrors;
use crate::models::account::Account;
use crate::models::account::Username;
use crate::models::account::extractor::Viewer;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::participant::Player;
use crate::models::tournament::participant::SignUpRefusal;
use crate::utils::account_budget::AccountBudget;

/// Unknown usernames an Organizer may try to add per hour
static UNKNOWN_USERNAMES: LazyLock<AccountBudget> =
    LazyLock::new(|| AccountBudget::new(20, Duration::from_secs(60 * 60)));

/// Username searches an Organizer may run per hour, about one per typed letter
static PLAYER_SEARCHES: LazyLock<AccountBudget> =
    LazyLock::new(|| AccountBudget::new(120, Duration::from_secs(60 * 60)));

/// How many Accounts a username search answers with at most
const CANDIDATE_LIMIT: u64 = 10;

/// How many characters a username search needs before it searches
const CANDIDATE_MIN_CHARS: usize = 2;

/// The Participants of a Tournament the reader may see
///
/// Says which of them is the reader, if any.
#[get("/{tournament}/participants")]
pub async fn list_tournament_participants(
    viewer: Viewer,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<ListParticipantsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_visible(&mut tx, tournament, viewer.account()).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let response = list(&mut tx, &tournament, viewer).await?;

    tx.commit().await?;

    Ok(ApiJson(response))
}

/// Add an Account as a Participant by its username, as an Organizer
///
/// An Organizer may add itself. Only while the Tournament is in Registration;
/// the participant limit does not hold Organizers back. Unknown usernames are
/// capped per caller, see [`UNKNOWN_USERNAMES`].
#[post("/{tournament}/participants/accounts")]
pub async fn add_tournament_account(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
    ApiJson(AddAccountParticipantRequest { username }): ApiJson<AddAccountParticipantRequest>,
) -> ApiResult<ApiJson<ParticipantResponse>, AddAccountParticipantErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_as_organizer(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    tournament.lock_roster(&mut tx).await?;
    if !tournament.roster_open() {
        tx.rollback().await?;
        let mut errors = FormErrors::<AddAccountParticipantErrors>::new();
        errors.registration_over = true;
        return errors.fail();
    }

    let named = match Username::new(username.to_string()) {
        Ok(username) => Account::get_by_username(&mut tx, &username).await?,
        Err(_) => None,
    };
    let Some(named) = named else {
        tx.rollback().await?;
        let mut errors = FormErrors::<AddAccountParticipantErrors>::new();
        if UNKNOWN_USERNAMES.take(account.uuid) {
            errors.unknown_username = true;
        } else {
            errors.too_many_unknown_usernames = true;
        }
        return errors.fail();
    };
    let Some(participant) = tournament.add_account(&mut tx, named.uuid).await? else {
        tx.rollback().await?;
        let mut errors = FormErrors::<AddAccountParticipantErrors>::new();
        errors.already_participant = true;
        return errors.fail();
    };

    tx.commit().await?;

    Ok(ApiJson(ParticipantResponse {
        uuid: participant,
        name: named.username.as_str().to_string(),
        guest: false,
    }))
}

/// Add a Guest by name, as an Organizer
///
/// Only while the Tournament is in Registration. The name is trimmed; two
/// Guests may share one.
#[post("/{tournament}/participants/guests")]
pub async fn add_tournament_guest(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
    ApiJson(AddGuestParticipantRequest { name }): ApiJson<AddGuestParticipantRequest>,
) -> ApiResult<ApiJson<ParticipantResponse>, AddGuestParticipantErrors> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        let mut errors = FormErrors::<AddGuestParticipantErrors>::new();
        errors.empty_name = true;
        return errors.fail();
    }
    let name = MaxStr::<64>::new(trimmed.to_string())
        .map_err(|_| ApiError::bad_request("Name too long"))?;

    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_as_organizer(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    tournament.lock_roster(&mut tx).await?;
    if !tournament.roster_open() {
        tx.rollback().await?;
        let mut errors = FormErrors::<AddGuestParticipantErrors>::new();
        errors.registration_over = true;
        return errors.fail();
    }
    let participant = tournament.add_guest(&mut tx, name.clone()).await?;

    tx.commit().await?;

    Ok(ApiJson(ParticipantResponse::from(
        crate::models::tournament::participant::Participant {
            uuid: participant,
            player: Player::Guest { name },
        },
    )))
}

/// Take a Participant out of a Tournament, as an Organizer
///
/// Only before the first Round starts; afterwards a Participant leaves by a Drop.
#[delete("/{tournament}/participants/{participant}")]
pub async fn remove_tournament_participant(
    account: Account,
    Path((tournament, participant)): Path<(TournamentUuid, ParticipantUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_as_organizer(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    tournament.lock_roster(&mut tx).await?;
    if !tournament.roster_open() {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Registration is over"));
    }
    if !tournament.remove_participant(&mut tx, participant).await? {
        tx.rollback().await?;
        return Err(ApiError::bad_request("No such participant"));
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Accounts whose username starts with what an Organizer typed, to add as Participants
///
/// Answers with up to ten Accounts, the caller among them if it matches,
/// alphabetically by username. Fewer than two characters search nothing.
/// Searches are capped per caller, see [`PLAYER_SEARCHES`]; past the cap
/// the answer is empty and says so.
#[get("/{tournament}/player-search")]
pub async fn search_tournament_players(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
    Query(SearchPlayersQuery { query }): Query<SearchPlayersQuery>,
) -> ApiResult<ApiJson<PlayerCandidatesResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    if Tournament::get_as_organizer(&mut tx, tournament, account.uuid)
        .await?
        .is_none()
    {
        tx.rollback().await?;
        return Err(denied());
    }

    let prefix = query.trim();
    if prefix.chars().count() < CANDIDATE_MIN_CHARS {
        tx.commit().await?;
        return Ok(ApiJson(PlayerCandidatesResponse {
            accounts: Vec::new(),
            too_many_searches: false,
        }));
    }
    if !PLAYER_SEARCHES.take(account.uuid) {
        tx.commit().await?;
        return Ok(ApiJson(PlayerCandidatesResponse {
            accounts: Vec::new(),
            too_many_searches: true,
        }));
    }
    let found = Account::search_by_username_prefix(&mut tx, prefix, CANDIDATE_LIMIT).await?;

    tx.commit().await?;

    Ok(ApiJson(PlayerCandidatesResponse {
        accounts: found
            .into_iter()
            .map(|(account, username)| PlayerCandidateResponse {
                account,
                username: username.as_str().to_string(),
            })
            .collect(),
        too_many_searches: false,
    }))
}

/// Sign the logged-in Account up for a Tournament it sees by its id
///
/// Takes effect at once. Refused unless the Owner turned self sign-up on and
/// the Tournament is in Registration, and once the participant limit is
/// reached. An unlisted Tournament is signed up for through its share link,
/// see `sign_up_for_shared_tournament`.
#[post("/{tournament}/sign-up")]
pub async fn sign_up_for_tournament(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<ParticipantResponse>, SignUpErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_visible(&mut tx, tournament, Some(account.uuid)).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let response = sign_up(&mut tx, &tournament, &account).await;
    finish(tx, response).await
}

/// Withdraw the logged-in Account's own sign-up
///
/// Only before the first Round starts; afterwards a Participant leaves by a Drop.
#[delete("/{tournament}/sign-up")]
pub async fn withdraw_tournament_sign_up(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_visible(&mut tx, tournament, Some(account.uuid)).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    tournament.lock_roster(&mut tx).await?;
    if !tournament.roster_open() {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Registration is over"));
    }
    let Some(participant) = tournament.participant_of(&mut tx, account.uuid).await? else {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Not a participant"));
    };
    tournament.remove_participant(&mut tx, participant).await?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// The Participants of `tournament` as `viewer` reads them
pub async fn list(
    tx: &mut Transaction,
    tournament: &Tournament,
    viewer: Viewer,
) -> ApiResult<ListParticipantsResponse> {
    let participants = tournament.participants(tx).await?;
    let me = match viewer.account() {
        Some(account) => tournament.participant_of(tx, account).await?,
        None => None,
    };
    Ok(ListParticipantsResponse {
        participants: participants
            .into_iter()
            .map(ParticipantResponse::from)
            .collect(),
        me,
    })
}

/// Sign `account` up for `tournament`, which it reached by id or by share link
///
/// Leaves the transaction to the caller, see [`finish`].
pub async fn sign_up(
    tx: &mut Transaction,
    tournament: &Tournament,
    account: &Account,
) -> ApiResult<ApiJson<ParticipantResponse>, SignUpErrors> {
    tournament.lock_roster(tx).await?;
    let participants = tournament.count_participants(tx).await?;
    let already = tournament.participant_of(tx, account.uuid).await?.is_some();
    if let Some(refusal) = tournament.sign_up_refusal(participants, already) {
        let mut errors = FormErrors::<SignUpErrors>::new();
        match refusal {
            SignUpRefusal::Closed => errors.closed = true,
            SignUpRefusal::AlreadyParticipant => errors.already_participant = true,
            SignUpRefusal::Full => errors.full = true,
        }
        return errors.fail();
    }
    let participant = tournament
        .add_account(tx, account.uuid)
        .await?
        .ok_or_else(|| ApiError::server_error("Participant appeared under the roster lock"))?;
    Ok(ApiJson(ParticipantResponse {
        uuid: participant,
        name: account.username.as_str().to_string(),
        guest: false,
    }))
}

/// Commit the transaction behind a successful `response`, roll it back behind a refusal
pub async fn finish<T, E>(tx: Transaction, response: ApiResult<T, E>) -> ApiResult<T, E> {
    match response {
        Ok(response) => {
            tx.commit().await?;
            Ok(response)
        }
        Err(error) => {
            tx.rollback().await?;
            Err(error)
        }
    }
}
