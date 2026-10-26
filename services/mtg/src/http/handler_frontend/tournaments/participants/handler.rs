use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
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

use crate::http::handler_frontend::tournaments::handler::denied;
use crate::http::handler_frontend::tournaments::handler::named_account;
use crate::http::handler_frontend::tournaments::handler::unknown_username;
use crate::http::handler_frontend::tournaments::live::TournamentEvent;
use crate::http::handler_frontend::tournaments::live::emit;
use crate::http::handler_frontend::tournaments::participants::schema::AddAccountParticipantErrors;
use crate::http::handler_frontend::tournaments::participants::schema::AddAccountParticipantRequest;
use crate::http::handler_frontend::tournaments::participants::schema::AddGuestParticipantErrors;
use crate::http::handler_frontend::tournaments::participants::schema::AddGuestParticipantRequest;
use crate::http::handler_frontend::tournaments::participants::schema::DropErrors;
use crate::http::handler_frontend::tournaments::participants::schema::ListParticipantsResponse;
use crate::http::handler_frontend::tournaments::participants::schema::ParticipantResponse;
use crate::http::handler_frontend::tournaments::participants::schema::SetPaidErrors;
use crate::http::handler_frontend::tournaments::participants::schema::SetPaidRequest;
use crate::http::handler_frontend::tournaments::participants::schema::SignUpErrors;
use crate::http::handler_frontend::tournaments::results::handler::announce;
use crate::models::account::Account;
use crate::models::account::extractor::Viewer;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::access::TournamentGrant;
use crate::models::tournament::participant::DropRefusal;
use crate::models::tournament::participant::PaidRefusal;
use crate::models::tournament::participant::Participant;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::participant::Player;
use crate::models::tournament::participant::SignUpRefusal;
use crate::models::tournament::participant::late_from_round;
use crate::models::tournament::result::ResultChange;

/// The Participants of a Tournament the reader may see
///
/// Says which of them is the reader, if any.
#[get("/{tournament}/participants")]
pub async fn list_tournament_participants(
    viewer: Viewer,
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<ApiJson<ListParticipantsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let tournament = grant.tournament;
    let response = list(&mut tx, &tournament, viewer).await?;

    tx.commit().await?;

    Ok(ApiJson(response))
}

/// Add an Account as a Participant by its username, as an Organizer
///
/// An Organizer may add itself. In Registration, and as a late Participant
/// until the Swiss Rounds are over; the participant limit does not hold
/// Organizers back. Unknown usernames are capped per caller, see
/// [`unknown_username`].
#[post("/{tournament}/participants/accounts")]
pub async fn add_tournament_account(
    account: Account,
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
    ApiJson(AddAccountParticipantRequest { username }): ApiJson<AddAccountParticipantRequest>,
) -> ApiResult<ApiJson<ParticipantResponse>, AddAccountParticipantErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    if !tournament.takes_participants() {
        tx.rollback().await?;
        let mut errors = FormErrors::<AddAccountParticipantErrors>::new();
        errors.roster_closed = true;
        return errors.fail();
    }

    let Some(named) = named_account(&mut tx, &username).await? else {
        tx.rollback().await?;
        return unknown_username(account.uuid);
    };
    let late_from_round = late_from_round(tournament.started_rounds(&mut tx).await?);
    let change = RosterChange::begin(&mut tx, &tournament).await?;
    let Some(participant) = tournament.add_account(&mut tx, named.uuid).await? else {
        tx.rollback().await?;
        let mut errors = FormErrors::<AddAccountParticipantErrors>::new();
        errors.already_participant = true;
        return errors.fail();
    };

    change.finish(tx, &tournament, Ok(())).await?;

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
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
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

    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
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
    let change = RosterChange::begin(&mut tx, &tournament).await?;
    let participant = tournament.add_guest(&mut tx, name.clone()).await?;

    change.finish(tx, &tournament, Ok(())).await?;

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
    grant: TournamentGrant,
    Path((_, participant)): Path<(TournamentUuid, ParticipantUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    let tournament = grant.tournament;
    tournament.lock_roster(&mut tx).await?;
    if !tournament.roster_open() {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Registration is over"));
    }
    let change = RosterChange::begin(&mut tx, &tournament).await?;
    if !tournament.remove_participant(&mut tx, participant).await? {
        tx.rollback().await?;
        return Err(ApiError::bad_request("No such participant"));
    }

    change.finish(tx, &tournament, Ok(ApiJson(()))).await
}

/// Drop a Participant, as an Organizer
///
/// Once the first Round started, until the Tournament is over. No later
/// Round pairs it; it stays in the standings with its Results so far.
#[post("/{tournament}/participants/{participant}/drop")]
pub async fn drop_tournament_participant(
    grant: TournamentGrant,
    Path((_, participant)): Path<(TournamentUuid, ParticipantUuid)>,
) -> ApiResult<ApiJson<()>, DropErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    let change = RosterChange::begin(&mut tx, &tournament).await?;
    let response = drop_participant(&mut tx, &tournament, participant).await;
    let forfeit = change.finish(tx, &tournament, response).await?;
    if let Some(forfeit) = forfeit {
        announce(&tournament, &forfeit);
    }
    Ok(ApiJson(()))
}

/// Mark a Participant paid or unpaid, as an Organizer
///
/// Only in a Tournament with an entry fee, until it is over. An unpaid
/// Participant is left out of the pairing; changing the flag discards a
/// previewed Round.
#[put("/{tournament}/participants/{participant}/paid")]
pub async fn set_tournament_participant_paid(
    grant: TournamentGrant,
    Path((_, participant)): Path<(TournamentUuid, ParticipantUuid)>,
    ApiJson(SetPaidRequest { paid }): ApiJson<SetPaidRequest>,
) -> ApiResult<ApiJson<()>, SetPaidErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    let change = RosterChange::begin(&mut tx, &tournament).await?;
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
    change.finish(tx, &tournament, response).await
}

/// Drop the logged-in Account out of a Tournament it plays in
///
/// Once the first Round started, until the Tournament is over; before the
/// first Round an Account withdraws its sign-up instead. No later Round
/// pairs it; it stays in the standings with its Results so far.
#[post("/{tournament}/drop")]
pub async fn drop_out_of_tournament(
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<ApiJson<()>, DropErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(participant) = grant.participant else {
        tx.rollback().await?;
        return Err(denied());
    };
    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    let change = RosterChange::begin(&mut tx, &tournament).await?;
    let response = drop_participant(&mut tx, &tournament, participant).await;
    let forfeit = change.finish(tx, &tournament, response).await?;
    if let Some(forfeit) = forfeit {
        announce(&tournament, &forfeit);
    }
    Ok(ApiJson(()))
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
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<ApiJson<ParticipantResponse>, SignUpErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let tournament = grant.tournament;
    let change = RosterChange::begin(&mut tx, &tournament).await?;
    let response = sign_up(&mut tx, &tournament, &account).await;
    change.finish(tx, &tournament, response).await
}

/// Withdraw the logged-in Account's own sign-up
///
/// Only before the first Round starts; afterwards a Participant leaves by a Drop.
#[delete("/{tournament}/sign-up")]
pub async fn withdraw_tournament_sign_up(
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(participant) = grant.participant else {
        tx.rollback().await?;
        return Err(denied());
    };
    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    if !tournament.roster_open() {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Registration is over"));
    }
    let change = RosterChange::begin(&mut tx, &tournament).await?;
    tournament.remove_participant(&mut tx, participant).await?;

    change.finish(tx, &tournament, Ok(ApiJson(()))).await
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
/// Answers the Result of the Top cut Match it lost by that, to announce once
/// committed. Leaves the transaction to the caller, see [`finish`].
async fn drop_participant(
    tx: &mut Transaction,
    tournament: &Tournament,
    participant: ParticipantUuid,
) -> ApiResult<Option<ResultChange>, DropErrors> {
    tournament.lock_roster(tx).await?;
    match tournament.drop_participant(tx, participant).await? {
        Ok(Some(dropped)) => Ok(dropped.forfeit),
        Ok(None) => Err(ApiError::bad_request("No such participant")),
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

/// A change to a Tournament's roster under way
///
/// Every change to the roster throws a previewed Round away, see
/// [`Tournament::discard_preview`]. Begun before the change, it remembers
/// the previewed Round, so the Organizers hear when the change threw it away.
pub struct RosterChange {
    /// The previewed Round before the change
    previewed: Option<i16>,
}

impl RosterChange {
    /// Begin a change to `tournament`'s roster, before anything changed
    pub async fn begin(tx: &mut Transaction, tournament: &Tournament) -> Result<Self, rorm::Error> {
        Ok(Self {
            previewed: tournament.previewed_round(tx).await?,
        })
    }

    /// [`finish`] the change behind `response`, telling the followers of
    /// `tournament` once it is committed
    ///
    /// Everybody hears that the roster changed, and with it the standings;
    /// the Organizers also hear about the previewed Round it threw away.
    pub async fn finish<T, E>(
        self,
        mut tx: Transaction,
        tournament: &Tournament,
        response: ApiResult<T, E>,
    ) -> ApiResult<T, E> {
        if response.is_err() {
            return finish(tx, response).await;
        }
        let outdated = match self.previewed {
            Some(round) if tournament.previewed_round(&mut tx).await?.is_none() => Some(round),
            _ => None,
        };
        let response = finish(tx, response).await;
        emit(tournament.uuid, TournamentEvent::ParticipantsChanged);
        emit(tournament.uuid, TournamentEvent::StandingsChanged);
        if let Some(round) = outdated {
            emit(tournament.uuid, TournamentEvent::PreviewOutdated { round });
        }
        response
    }
}
