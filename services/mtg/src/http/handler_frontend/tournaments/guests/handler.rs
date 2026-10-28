use std::sync::LazyLock;
use std::time::Duration;

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::post;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;

use crate::http::handler_frontend::tournaments::guests::schema::ClaimGuestSeatErrors;
use crate::http::handler_frontend::tournaments::guests::schema::GuestSignUpErrors;
use crate::http::handler_frontend::tournaments::guests::schema::GuestSignUpRequest;
use crate::http::handler_frontend::tournaments::guests::schema::GuestSignUpResponse;
use crate::http::handler_frontend::tournaments::guests::schema::RecoverGuestSeatErrors;
use crate::http::handler_frontend::tournaments::guests::schema::RecoverGuestSeatRequest;
use crate::http::handler_frontend::tournaments::guests::schema::RedeemSeatLinkErrors;
use crate::http::handler_frontend::tournaments::guests::schema::RedeemSeatLinkRequest;
use crate::http::handler_frontend::tournaments::guests::schema::RedeemSeatLinkResponse;
use crate::http::handler_frontend::tournaments::guests::schema::SeatLinkErrors;
use crate::http::handler_frontend::tournaments::guests::schema::SeatLinkResponse;
use crate::http::handler_frontend::tournaments::handler::denied;
use crate::http::handler_frontend::tournaments::participants::handler::RosterChange;
use crate::http::handler_frontend::tournaments::participants::schema::ParticipantResponse;
use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::account::extractor::Viewer;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::access::TournamentGrant;
use crate::models::tournament::guest_seat::ClaimRefusal;
use crate::models::tournament::guest_seat::GuestSeats;
use crate::models::tournament::guest_seat::RecoveryCode;
use crate::models::tournament::guest_seat::RecoveryRefusal;
use crate::models::tournament::guest_seat::RedeemRefusal;
use crate::models::tournament::guest_seat::SeatLinkRefusal;
use crate::models::tournament::participant::Participant;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::participant::Player;
use crate::models::tournament::participant::SignUpRefusal;
use crate::models::tournament::participant::guest_name;
use crate::utils::budget::Budget;

/// Guests that may sign themselves up for one Tournament per window
pub const GUEST_SIGN_UPS_PER_WINDOW: u32 = 60;

/// The window [`GUEST_SIGN_UPS_PER_WINDOW`] counts in
const GUEST_SIGN_UP_WINDOW: Duration = Duration::from_secs(10 * 60);

/// Guests each Tournament took by Guest sign-up lately
///
/// The desk checks every Guest in, one by one; 60 in ten minutes is more
/// than a desk confirms, so a real crowd never waits on it, while Guests
/// signed up from many addresses at once stop well short of burying the
/// roster. Repeats that answer a seat the session holds do not count.
pub static GUEST_SIGN_UPS: LazyLock<Budget<TournamentUuid>> =
    LazyLock::new(|| Budget::new(GUEST_SIGN_UPS_PER_WINDOW, GUEST_SIGN_UP_WINDOW));

/// Sign up as a Guest for a public Tournament, without an Account
///
/// Takes effect at once; the Guest is paired once the desk checked it in.
/// The session then holds a Guest seat, and the answer carries the Recovery
/// code that restores the seat into a fresh session. Refused unless the
/// Owner allowed Guest sign-up and the Tournament is in Registration, and
/// once the participant limit is reached. A session that holds a seat for
/// the Tournament gets that Guest back with a new code instead of a second
/// Guest. An unlisted Tournament is signed up for through its share link,
/// see `sign_up_as_shared_tournament_guest`.
#[post("/{tournament}/guest-sign-up")]
pub async fn sign_up_as_tournament_guest(
    session: Session,
    viewer: Viewer,
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
    ApiJson(request): ApiJson<GuestSignUpRequest>,
) -> ApiResult<ApiJson<GuestSignUpResponse>, GuestSignUpErrors> {
    sign_up_guest(&session, viewer.account(), &grant.tournament, request).await
}

/// Restore a Guest seat into this session with the Recovery code its device kept
///
/// Until the Tournament is over, when its Recovery codes are gone. An
/// unlisted Tournament restores through its share link, see
/// `recover_shared_tournament_guest_seat`.
#[post("/{tournament}/guest-seat/recover")]
pub async fn recover_tournament_guest_seat(
    session: Session,
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
    ApiJson(request): ApiJson<RecoverGuestSeatRequest>,
) -> ApiResult<ApiJson<()>, RecoverGuestSeatErrors> {
    recover_seat(&session, &grant.tournament, request).await
}

/// Sign the visitor of `session` up as a Guest of `tournament`, which it reached by id or by share link
///
/// `viewer` is the logged-in Account, if any: one that plays in the
/// Tournament already is refused.
pub async fn sign_up_guest(
    session: &Session,
    viewer: Option<AccountUuid>,
    tournament: &Tournament,
    request: GuestSignUpRequest,
) -> ApiResult<ApiJson<GuestSignUpResponse>, GuestSignUpErrors> {
    let Some(name) = guest_name(&request.name) else {
        let mut errors = FormErrors::<GuestSignUpErrors>::new();
        errors.empty_name = true;
        return errors.fail();
    };

    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = tournament.lock_for_update(&mut tx).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    if let Some(participant) = held_guest(&mut tx, session, &tournament, &request).await? {
        let code = RecoveryCode::generate();
        tournament
            .renew_recovery_code(&mut tx, participant, &code)
            .await?;
        GuestSeats::hold(session, &mut tx, tournament.uuid, participant).await?;
        let guest = tournament
            .guest(&mut tx, participant)
            .await?
            .ok_or_else(|| ApiError::server_error("Guest vanished under the roster lock"))?;

        tx.commit().await?;

        return Ok(ApiJson(GuestSignUpResponse {
            participant: ParticipantResponse::for_itself(guest),
            recovery_code: code.into_inner(),
        }));
    }

    let already = match viewer {
        Some(account) => tournament.participant_of(&mut tx, account).await?.is_some(),
        None => false,
    };
    let participants = tournament.count_participants(&mut tx).await?;
    let refusal = if already {
        Some(SignUpRefusal::AlreadyParticipant)
    } else if tournament.started_rounds(&mut tx).await? > 0 {
        Some(SignUpRefusal::Closed)
    } else {
        tournament.guest_sign_up_refusal(participants)
    };
    if let Some(refusal) = refusal {
        tx.rollback().await?;
        let mut errors = FormErrors::<GuestSignUpErrors>::new();
        match refusal {
            SignUpRefusal::Closed => errors.closed = true,
            SignUpRefusal::AlreadyParticipant => errors.already_participant = true,
            SignUpRefusal::Full => errors.full = true,
        }
        return errors.fail();
    }
    if !GUEST_SIGN_UPS.take(tournament.uuid) {
        tx.rollback().await?;
        let mut errors = FormErrors::<GuestSignUpErrors>::new();
        errors.busy = true;
        return errors.fail();
    }

    let change = RosterChange::begin(&mut tx, &tournament).await?;
    let code = RecoveryCode::generate();
    let participant = tournament.add_signed_up_guest(&mut tx, name, &code).await?;
    GuestSeats::hold(session, &mut tx, tournament.uuid, participant).await?;
    let guest = tournament
        .guest(&mut tx, participant)
        .await?
        .ok_or_else(|| ApiError::server_error("Guest vanished under the roster lock"))?;
    let response = Ok(ApiJson(GuestSignUpResponse {
        participant: ParticipantResponse::for_itself(guest),
        recovery_code: code.into_inner(),
    }));
    change.finish(tx, &tournament, response).await
}

/// The Guest of `tournament` the visitor of `session` holds already
///
/// The Guest seat its session holds, read afresh under the roster lock, or
/// else the one its device restores with the Recovery code of `request`;
/// `None` if neither names a Guest.
async fn held_guest(
    tx: &mut Transaction,
    session: &Session,
    tournament: &Tournament,
    request: &GuestSignUpRequest,
) -> ApiResult<Option<ParticipantUuid>, GuestSignUpErrors> {
    if let Some(seat) = GuestSeats::current(session).await?.seat_in(tournament.uuid)
        && let Some(guest) = tournament.guest_of_seat(tx, seat).await?
    {
        return Ok(Some(guest));
    }
    let Some(recovery) = &request.recovery else {
        return Ok(None);
    };
    let restored = tournament
        .recover_guest(tx, recovery.participant, &recovery.code)
        .await?;
    Ok(restored.ok())
}

/// Restore the Guest seat `request` names into `session`, for `tournament` reached by id or by share link
pub async fn recover_seat(
    session: &Session,
    tournament: &Tournament,
    request: RecoverGuestSeatRequest,
) -> ApiResult<ApiJson<()>, RecoverGuestSeatErrors> {
    let mut tx = Database::global().start_transaction().await?;

    match tournament
        .recover_guest(&mut tx, request.participant, &request.code)
        .await?
    {
        Ok(participant) => {
            GuestSeats::hold(session, &mut tx, tournament.uuid, participant).await?;

            tx.commit().await?;

            Ok(ApiJson(()))
        }
        Err(refusal) => {
            tx.rollback().await?;
            let mut errors = FormErrors::<RecoverGuestSeatErrors>::new();
            match refusal {
                RecoveryRefusal::UnknownCode => errors.unknown_code = true,
                RecoveryRefusal::TournamentOver => errors.tournament_over = true,
            }
            errors.fail()
        }
    }
}

/// Keep the Guest this session holds a seat of as the logged-in Account's own Participant
///
/// The Guest becomes the Account's Participant with its Seats, Results and
/// any Drop; its name gives way to the username, its Recovery code and Seat
/// link go, and so does the seat. Refused for an Account that plays in the
/// Tournament already.
#[post("/{tournament}/guest-seat/claim")]
pub async fn claim_tournament_guest_seat(
    session: Session,
    account: Account,
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<ApiJson<ParticipantResponse>, ClaimGuestSeatErrors> {
    let seat = GuestSeats::of(&session)
        .await?
        .seat_in(grant.tournament.uuid);

    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    let change = RosterChange::begin(&mut tx, &tournament).await?;
    let guest = match seat {
        Some(seat) => tournament.guest(&mut tx, seat).await?,
        None => None,
    };
    let response = match tournament.claim_guest(&mut tx, seat, account.uuid).await? {
        Ok(participant) => {
            let guest = guest
                .ok_or_else(|| ApiError::server_error("Guest vanished under the roster lock"))?;
            Ok(ApiJson(ParticipantResponse::for_itself(Participant {
                uuid: participant,
                player: Player::Account {
                    account: account.uuid,
                    username: account.username.clone(),
                },
                ..guest
            })))
        }
        Err(refusal) => {
            let mut errors = FormErrors::<ClaimGuestSeatErrors>::new();
            match refusal {
                ClaimRefusal::AlreadyParticipant => errors.already_participant = true,
                ClaimRefusal::NoSeat => errors.no_seat = true,
            }
            errors.fail()
        }
    };
    let response = change.finish(tx, &tournament, response).await?;
    if let Some(seat) = seat {
        GuestSeats::release(&session, tournament.uuid, seat).await?;
    }
    Ok(response)
}

/// Issue a Seat link for a Guest whose device lost its Guest seat, as an Organizer
///
/// Single use and good for 15 minutes; a new one replaces the last. The
/// answer carries the secret once, for the fragment of the link the desk
/// shows: a fragment never reaches a server, so the secret lands in no log.
#[post("/{tournament}/participants/{participant}/seat-link")]
pub async fn issue_tournament_seat_link(
    grant: TournamentGrant,
    Path((_, participant)): Path<(TournamentUuid, ParticipantUuid)>,
) -> ApiResult<ApiJson<SeatLinkResponse>, SeatLinkErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = grant.tournament.lock_for_update(&mut tx).await? else {
        tx.rollback().await?;
        return Err(denied());
    };
    match tournament
        .issue_seat_link(&mut tx, participant, OffsetDateTime::now_utc())
        .await?
    {
        Ok(Some((secret, expires_at))) => {
            tx.commit().await?;

            Ok(ApiJson(SeatLinkResponse {
                secret: secret.into_inner(),
                expires_at: SchemaDateTime(expires_at),
            }))
        }
        Ok(None) => {
            tx.rollback().await?;
            Err(ApiError::bad_request("No such participant"))
        }
        Err(refusal) => {
            tx.rollback().await?;
            let mut errors = FormErrors::<SeatLinkErrors>::new();
            match refusal {
                SeatLinkRefusal::NotAGuest => errors.not_a_guest = true,
                SeatLinkRefusal::TournamentOver => errors.tournament_over = true,
            }
            errors.fail()
        }
    }
}

/// Redeem a Seat link: its Guest seat goes into this session, with a new Recovery code
///
/// The secret is the authorization, as a share link's is, so this works for
/// a Tournament of any Visibility; it is posted in the body, never in a path.
/// Single use: a second redeem of the same secret is refused.
#[post("/seat-links/redeem")]
pub async fn redeem_tournament_seat_link(
    session: Session,
    ApiJson(request): ApiJson<RedeemSeatLinkRequest>,
) -> ApiResult<ApiJson<RedeemSeatLinkResponse>, RedeemSeatLinkErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let redeemed =
        Tournament::redeem_seat_link(&mut tx, &request.secret, OffsetDateTime::now_utc()).await?;
    let (tournament, participant) = match redeemed {
        Ok(redeemed) => redeemed,
        Err(refusal) => {
            tx.rollback().await?;
            let mut errors = FormErrors::<RedeemSeatLinkErrors>::new();
            match refusal {
                RedeemRefusal::UnknownLink => errors.unknown_link = true,
                RedeemRefusal::Expired => errors.expired = true,
            }
            return errors.fail();
        }
    };
    let code = RecoveryCode::generate();
    tournament
        .renew_recovery_code(&mut tx, participant, &code)
        .await?;
    GuestSeats::hold(&session, &mut tx, tournament.uuid, participant).await?;
    let guest = tournament
        .guest(&mut tx, participant)
        .await?
        .ok_or_else(|| ApiError::server_error("Guest vanished while redeeming its Seat link"))?;

    tx.commit().await?;

    Ok(ApiJson(RedeemSeatLinkResponse {
        tournament: tournament.uuid,
        participant: ParticipantResponse::for_itself(guest),
        recovery_code: code.into_inner(),
    }))
}
