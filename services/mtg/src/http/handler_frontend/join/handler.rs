//! Handlers for joining a tournament by its typed code
//!
//! [`crate::tournament::code::normalize_join_code`] runs first in every one
//! of these — a code that does not even parse into the alphabet is exactly
//! as unknown as one the database has never minted, and folding the two into
//! one [`JoinErrors::unknown_code`] answer tells a scanner nothing about
//! which case it hit.

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::get;
use galvyn::post;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;

use crate::http::handler_frontend::join::schema::GuestJoinRequest;
use crate::http::handler_frontend::join::schema::GuestJoinResponse;
use crate::http::handler_frontend::join::schema::JoinErrors;
use crate::http::handler_frontend::join::schema::JoinLookupResponse;
use crate::http::handler_frontend::join::schema::JoinTournamentRequest;
use crate::http::handler_frontend::join::schema::JoinTournamentResponse;
use crate::models::account::Account;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentActor;
use crate::models::tournament::TournamentStatus;
use crate::models::tournament::participant;
use crate::models::tournament::participant::RegistrationOutcome;
use crate::tournament::code::normalize_join_code;

/// Resolve a typed code into the tournament it names, before anybody joins
///
/// Unauthenticated and rate limited (see [`super::initialize_routes`]) — a
/// phone reading a whiteboard has no session yet. [`JoinLookupResponse::already_registered`]
/// is always `false` here; there is no account to check it against.
#[get("/{code}")]
pub async fn look_up_join_code(
    Path(code): Path<String>,
) -> ApiResult<ApiJson<JoinLookupResponse>, JoinErrors> {
    let Some(code) = normalize_join_code(&code) else {
        let mut errors = FormErrors::<JoinErrors>::new();
        errors.unknown_code = true;
        return errors.fail();
    };

    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_by_join_code(&mut tx, &code).await? else {
        let mut errors = FormErrors::<JoinErrors>::new();
        errors.unknown_code = true;
        return errors.fail();
    };
    let participant_count = participant::list(&mut tx, tournament.uuid).await?.len() as i64;
    let is_registration_open = registration_open(&tournament);

    tx.commit().await?;

    Ok(ApiJson(JoinLookupResponse {
        tournament: tournament.uuid,
        name: tournament.name,
        format: tournament.format,
        pod_size: tournament.pod_size,
        status: tournament.status,
        starts_at: tournament.starts_at.map(SchemaDateTime),
        venue: tournament.venue,
        participant_count,
        registration_open: is_registration_open,
        already_registered: false,
    }))
}

/// Join a tournament as a guest — no account, just a name for the pairings list
///
/// Unauthenticated and rate limited, same reasoning as [`look_up_join_code`].
/// The session is only told about the new participant *after* the
/// transaction commits: a session entry naming a row that turned out not to
/// exist would be worse than losing this one join to a crash in between.
#[post("/{code}/guest")]
pub async fn join_tournament_as_guest(
    session: Session,
    Path(code): Path<String>,
    ApiJson(GuestJoinRequest { display_name }): ApiJson<GuestJoinRequest>,
) -> ApiResult<ApiJson<GuestJoinResponse>, JoinErrors> {
    let mut errors = FormErrors::<JoinErrors>::new();
    let Some(code) = normalize_join_code(&code) else {
        errors.unknown_code = true;
        return errors.fail();
    };
    if display_name.trim().is_empty() {
        errors.empty_name = true;
    }
    errors.check()?;

    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_by_join_code(&mut tx, &code).await? else {
        let mut errors = FormErrors::<JoinErrors>::new();
        errors.unknown_code = true;
        return errors.fail();
    };

    let outcome = participant::register_guest(&mut tx, &tournament, display_name, None).await?;
    let (participant, claim_token) = match outcome {
        RegistrationOutcome::Registered(participant, Some(claim_token)) => {
            (participant, claim_token)
        }
        RegistrationOutcome::Registered(_, None) => {
            unreachable!("register_guest always mints a claim token for a guest row")
        }
        // `AlreadyRegistered` cannot happen for a guest row (see
        // `register_guest`'s doc comment) — folded into `Closed`'s answer
        // rather than relied upon to stay unreachable forever.
        RegistrationOutcome::Closed | RegistrationOutcome::AlreadyRegistered => {
            let mut errors = FormErrors::<JoinErrors>::new();
            errors.registration_closed = true;
            return errors.fail();
        }
    };
    let tournament_uuid = tournament.uuid;
    let participant_uuid = participant.uuid;

    tx.commit().await?;

    TournamentActor::remember_guest(&session, participant_uuid).await?;

    Ok(ApiJson(GuestJoinResponse {
        tournament: tournament_uuid,
        participant: participant_uuid,
        claim_token,
    }))
}

/// Join a tournament as the logged-in account
#[post("/{code}")]
pub async fn join_tournament_by_code(
    account: Account,
    Path(code): Path<String>,
    ApiJson(JoinTournamentRequest { display_name }): ApiJson<JoinTournamentRequest>,
) -> ApiResult<ApiJson<JoinTournamentResponse>, JoinErrors> {
    let mut errors = FormErrors::<JoinErrors>::new();
    let Some(code) = normalize_join_code(&code) else {
        errors.unknown_code = true;
        return errors.fail();
    };
    if display_name
        .as_deref()
        .is_some_and(|name| name.trim().is_empty())
    {
        errors.empty_name = true;
    }
    errors.check()?;

    // Always fits: `Username::MAX_LEN` is 32, well under `MaxStr<64>`.
    let display_name = display_name.unwrap_or_else(|| {
        MaxStr::new(account.username.as_str().to_owned())
            .unwrap_or_else(|_| unreachable!("a username is at most 32 characters"))
    });

    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_by_join_code(&mut tx, &code).await? else {
        let mut errors = FormErrors::<JoinErrors>::new();
        errors.unknown_code = true;
        return errors.fail();
    };

    let outcome =
        participant::register_account(&mut tx, &tournament, account.uuid, display_name).await?;
    let participant = match outcome {
        RegistrationOutcome::Registered(participant, _) => participant,
        RegistrationOutcome::Closed => {
            let mut errors = FormErrors::<JoinErrors>::new();
            errors.registration_closed = true;
            return errors.fail();
        }
        RegistrationOutcome::AlreadyRegistered => {
            let mut errors = FormErrors::<JoinErrors>::new();
            errors.already_registered = true;
            return errors.fail();
        }
    };

    tx.commit().await?;

    Ok(ApiJson(JoinTournamentResponse {
        tournament: tournament.uuid,
        participant: participant.uuid,
    }))
}

/// Whether joining `tournament` right now would actually register a player
///
/// Duplicates [`participant`]'s own private `registration_open` rather than
/// exporting it: the HTTP layer only ever needs the plain, unwidened rule
/// (the `added_by` organizer exception belongs to a walk-in, which never
/// goes through this file), and re-deriving two lines from
/// [`TournamentStatus`]/[`Tournament::allow_late_entry`] here is cheaper to
/// keep in sync than a cross-module export would be to keep aligned with
/// `participant`'s own widened caller.
fn registration_open(tournament: &Tournament) -> bool {
    matches!(tournament.status, TournamentStatus::Registration)
        || (tournament.status == TournamentStatus::Running && tournament.allow_late_entry)
}
