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
use galvyn::put;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;

use crate::http::handler_frontend::tournaments::handler::denied;
use crate::http::handler_frontend::tournaments::live::TournamentEvent;
use crate::http::handler_frontend::tournaments::live::emit;
use crate::http::handler_frontend::tournaments::participants::schema::AddAccountParticipantErrors;
use crate::http::handler_frontend::tournaments::participants::schema::AddAccountParticipantRequest;
use crate::http::handler_frontend::tournaments::participants::schema::AddGuestParticipantErrors;
use crate::http::handler_frontend::tournaments::participants::schema::AddGuestParticipantRequest;
use crate::http::handler_frontend::tournaments::participants::schema::DropErrors;
use crate::http::handler_frontend::tournaments::participants::schema::ListParticipantsResponse;
use crate::http::handler_frontend::tournaments::participants::schema::ParticipantResponse;
use crate::http::handler_frontend::tournaments::participants::schema::PlayerCandidateResponse;
use crate::http::handler_frontend::tournaments::participants::schema::PlayerCandidatesResponse;
use crate::http::handler_frontend::tournaments::participants::schema::SearchPlayersQuery;
use crate::http::handler_frontend::tournaments::participants::schema::SetPaidErrors;
use crate::http::handler_frontend::tournaments::participants::schema::SetPaidRequest;
use crate::http::handler_frontend::tournaments::participants::schema::SignUpErrors;
use crate::models::account::Account;
use crate::models::account::Username;
use crate::models::account::extractor::Viewer;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::participant::DropRefusal;
use crate::models::tournament::participant::PaidRefusal;
use crate::models::tournament::participant::Participant;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::participant::Player;
use crate::models::tournament::participant::SignUpRefusal;
use crate::models::tournament::participant::late_from_round;
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
/// An Organizer may add itself. In Registration, and as a late Participant
/// until the Swiss Rounds are over; the participant limit does not hold
/// Organizers back. Unknown usernames are capped per caller, see
/// [`UNKNOWN_USERNAMES`].
#[post("/{tournament}/participants/accounts")]
pub async fn add_tournament_account(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
    ApiJson(AddAccountParticipantRequest { username }): ApiJson<AddAccountParticipantRequest>,
) -> ApiResult<ApiJson<ParticipantResponse>, AddAccountParticipantErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) =
        Tournament::get_as_organizer_for_update(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    if !tournament.takes_participants() {
        tx.rollback().await?;
        let mut errors = FormErrors::<AddAccountParticipantErrors>::new();
        errors.roster_closed = true;
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
    let late_from_round = late_from_round(tournament.started_rounds(&mut tx).await?);
    let Some(participant) = tournament.add_account(&mut tx, named.uuid).await? else {
        tx.rollback().await?;
        let mut errors = FormErrors::<AddAccountParticipantErrors>::new();
        errors.already_participant = true;
        return errors.fail();
    };

    tx.commit().await?;

    roster_changed(tournament.uuid);

    Ok(ApiJson(ParticipantResponse::for_organizers(Participant {
        uuid: participant,
        player: Player::Account {
            account: named.uuid,
            username: named.username,
        },
        late_from_round,
        dropped_after_round: None,
        unpaid: tournament.owes_entry_fee(false),
    })))
}

/// Add a Guest by name, as an Organizer
///
/// In Registration, and as a late Participant until the Swiss Rounds are
/// over. The name is trimmed; two Guests may share one.
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

    let Some(tournament) =
        Tournament::get_as_organizer_for_update(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    if !tournament.takes_participants() {
        tx.rollback().await?;
        let mut errors = FormErrors::<AddGuestParticipantErrors>::new();
        errors.roster_closed = true;
        return errors.fail();
    }
    let late_from_round = late_from_round(tournament.started_rounds(&mut tx).await?);
    let participant = tournament.add_guest(&mut tx, name.clone()).await?;

    tx.commit().await?;

    roster_changed(tournament.uuid);

    Ok(ApiJson(ParticipantResponse::for_organizers(Participant {
        uuid: participant,
        player: Player::Guest { name },
        late_from_round,
        dropped_after_round: None,
        unpaid: tournament.owes_entry_fee(false),
    })))
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

    roster_changed(tournament.uuid);
    Ok(ApiJson(()))
}

/// Drop a Participant, as an Organizer
///
/// Once the first Round started, until the Tournament is over. No later
/// Round pairs it; it stays in the standings with its Results so far.
#[post("/{tournament}/participants/{participant}/drop")]
pub async fn drop_tournament_participant(
    account: Account,
    Path((tournament, participant)): Path<(TournamentUuid, ParticipantUuid)>,
) -> ApiResult<ApiJson<()>, DropErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) =
        Tournament::get_as_organizer_for_update(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let response = drop_participant(&mut tx, &tournament, participant).await;
    finish_roster_change(tx, tournament.uuid, response).await
}

/// Mark a Participant paid or unpaid, as an Organizer
///
/// Only in a Tournament with an entry fee, until it is over. An unpaid
/// Participant is left out of the pairing; changing the flag discards a
/// previewed Round.
#[put("/{tournament}/participants/{participant}/paid")]
pub async fn set_tournament_participant_paid(
    account: Account,
    Path((tournament, participant)): Path<(TournamentUuid, ParticipantUuid)>,
    ApiJson(SetPaidRequest { paid }): ApiJson<SetPaidRequest>,
) -> ApiResult<ApiJson<()>, SetPaidErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) =
        Tournament::get_as_organizer_for_update(&mut tx, tournament, account.uuid).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let response = match tournament.mark_paid(&mut tx, participant, paid).await? {
        Ok(true) => Ok(ApiJson(())),
        Ok(false) => Err(ApiError::bad_request("No such participant")),
        Err(refusal) => {
            let mut errors = FormErrors::<SetPaidErrors>::new();
            match refusal {
                PaidRefusal::NoEntryFee => errors.no_entry_fee = true,
                PaidRefusal::TournamentOver => errors.tournament_over = true,
            }
            errors.fail()
        }
    };
    finish_roster_change(tx, tournament.uuid, response).await
}

/// Drop the logged-in Account out of a Tournament it plays in
///
/// Once the first Round started, until the Tournament is over; before the
/// first Round an Account withdraws its sign-up instead. No later Round
/// pairs it; it stays in the standings with its Results so far.
#[post("/{tournament}/drop")]
pub async fn drop_out_of_tournament(
    account: Account,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<ApiJson<()>, DropErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(seen) = Tournament::get_visible(&mut tx, tournament, Some(account.uuid)).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    seen.lock_roster(&mut tx).await?;
    let Some(tournament) = Tournament::get_visible(&mut tx, tournament, Some(account.uuid)).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let Some(participant) = tournament.participant_of(&mut tx, account.uuid).await? else {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Not a participant"));
    };
    let response = drop_participant(&mut tx, &tournament, participant).await;
    finish_roster_change(tx, tournament.uuid, response).await
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
    finish_roster_change(tx, tournament.uuid, response).await
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

    roster_changed(tournament.uuid);
    Ok(ApiJson(()))
}

/// The Participants of `tournament` as `viewer` reads them
pub async fn list(
    tx: &mut Transaction,
    tournament: &Tournament,
    viewer: Viewer,
) -> ApiResult<ListParticipantsResponse> {
    let participants = tournament.participants(tx).await?;
    let (me, organizer) = match viewer.account() {
        Some(account) => (
            tournament.participant_of(tx, account).await?,
            tournament.organizer_role(tx, account).await?.is_some(),
        ),
        None => (None, false),
    };
    let view = if organizer {
        ParticipantResponse::for_organizers
    } else {
        ParticipantResponse::from
    };
    Ok(ListParticipantsResponse {
        participants: participants.into_iter().map(view).collect(),
        me,
    })
}

/// Drop `participant` out of `tournament`, under the roster lock
///
/// Leaves the transaction to the caller, see [`finish`].
async fn drop_participant(
    tx: &mut Transaction,
    tournament: &Tournament,
    participant: ParticipantUuid,
) -> ApiResult<ApiJson<()>, DropErrors> {
    tournament.lock_roster(tx).await?;
    match tournament.drop_participant(tx, participant).await? {
        Ok(true) => Ok(ApiJson(())),
        Ok(false) => Err(ApiError::bad_request("No such participant")),
        Err(refusal) => {
            let mut errors = FormErrors::<DropErrors>::new();
            match refusal {
                DropRefusal::NotStarted => errors.not_started = true,
                DropRefusal::TournamentOver => errors.tournament_over = true,
            }
            errors.fail()
        }
    }
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
    let refusal = match tournament.started_rounds(tx).await? {
        0 => tournament.sign_up_refusal(participants, already),
        _ => Some(SignUpRefusal::Closed),
    };
    if let Some(refusal) = refusal {
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
    Ok(ApiJson(ParticipantResponse::from(Participant {
        uuid: participant,
        player: Player::Account {
            account: account.uuid,
            username: account.username.clone(),
        },
        late_from_round: None,
        dropped_after_round: None,
        unpaid: tournament.owes_entry_fee(false),
    })))
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

/// [`finish`] a change to the roster of `tournament`, telling its followers once it is committed
pub async fn finish_roster_change<T, E>(
    tx: Transaction,
    tournament: TournamentUuid,
    response: ApiResult<T, E>,
) -> ApiResult<T, E> {
    let response = finish(tx, response).await;
    if response.is_ok() {
        roster_changed(tournament);
    }
    response
}

/// Tell the followers of `tournament` that its roster changed, and with it the standings
fn roster_changed(tournament: TournamentUuid) {
    emit(tournament, TournamentEvent::ParticipantsChanged);
    emit(tournament, TournamentEvent::StandingsChanged);
}
