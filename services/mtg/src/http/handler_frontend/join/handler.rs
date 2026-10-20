//! Handlers for joining a tournament

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

use crate::http::handler_frontend::join::schema::ClaimTargetResponse;
use crate::http::handler_frontend::join::schema::GuestJoinRequest;
use crate::http::handler_frontend::join::schema::GuestJoinResponse;
use crate::http::handler_frontend::join::schema::JoinErrors;
use crate::http::handler_frontend::join::schema::JoinLookupResponse;
use crate::http::handler_frontend::join::schema::JoinTournamentRequest;
use crate::http::handler_frontend::join::schema::JoinTournamentResponse;
use crate::http::handler_frontend::tournaments::schema::ClaimErrors;
use crate::models::account::Account;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentActor;
use crate::models::tournament::TournamentStatus;
use crate::models::tournament::decklist;
use crate::models::tournament::decklist::DecklistChange;
use crate::models::tournament::decklist::DecklistSource;
use crate::models::tournament::participant;
use crate::models::tournament::participant::RegistrationOutcome;
use crate::tournament::code::normalize_join_code;

/// Resolve a join code into the tournament it names, before anybody joins
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
        join_code: tournament.join_code.clone().unwrap_or_else(|| {
            unreachable!("`get_by_join_code` only answers a tournament holding one")
        }),
        format: tournament.format,
        pod_size: tournament.pod_size,
        status: tournament.status,
        starts_at: tournament.starts_at.map(SchemaDateTime),
        venue: tournament.venue,
        venue_address: tournament.venue_address,
        venue_instructions: tournament.venue_instructions,
        decklist_policy: tournament.decklist_policy,
        participant_count,
        max_participants: tournament.max_participants,
        registration_open: is_registration_open,
        already_registered: false,
    }))
}

/// Join a tournament as a guest
///
/// A decklist failure returns without committing, which rolls back the new participant row.
#[post("/{code}/guest")]
pub async fn join_tournament_as_guest(
    session: Session,
    Path(code): Path<String>,
    ApiJson(GuestJoinRequest {
        display_name,
        decklist_text,
    }): ApiJson<GuestJoinRequest>,
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

    if tournament.needs_decklist_to_register() && decklist_text.is_none() {
        let mut errors = FormErrors::<JoinErrors>::new();
        errors.decklist_missing = true;
        return errors.fail();
    }

    let outcome = participant::register_guest(&mut tx, &tournament, display_name, None).await?;
    let (participant, claim_token) = match outcome {
        RegistrationOutcome::Registered(participant, Some(claim_token)) => {
            (participant, claim_token)
        }
        RegistrationOutcome::Registered(_, None) => {
            unreachable!("register_guest always mints a claim token for a guest row")
        }
        // `AlreadyRegistered` cannot happen for a guest; folded into `Closed` to stay safe.
        RegistrationOutcome::Full => {
            let mut errors = FormErrors::<JoinErrors>::new();
            errors.tournament_full = true;
            return errors.fail();
        }
        RegistrationOutcome::Closed | RegistrationOutcome::AlreadyRegistered => {
            let mut errors = FormErrors::<JoinErrors>::new();
            errors.registration_closed = true;
            return errors.fail();
        }
    };

    if let Some(text) = decklist_text {
        match decklist::write(
            &mut tx,
            tournament.uuid,
            participant.uuid,
            Some(DecklistSource::Text(text)),
            None,
            None,
        )
        .await?
        {
            DecklistChange::Written(_) | DecklistChange::Cleared => {}
            DecklistChange::Invalid => {
                let mut errors = FormErrors::<JoinErrors>::new();
                errors.invalid_decklist = true;
                return errors.fail();
            }
            DecklistChange::UnknownDeck | DecklistChange::EmptyDeck | DecklistChange::TooLong => {
                unreachable!("a guest join never sources a deck")
            }
            DecklistChange::Locked => {
                unreachable!("`write` never checks the lock — only `set`'s guard does")
            }
        }
    }

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

/// Look up what a claim token names, without consuming it
#[get("/claim/{token}")]
pub async fn look_up_claim_token(
    Path(token): Path<String>,
) -> ApiResult<ApiJson<ClaimTargetResponse>, ClaimErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(target) = participant::look_up_claim_token(&mut tx, &token).await? else {
        let mut errors = FormErrors::<ClaimErrors>::new();
        errors.invalid_token = true;
        return errors.fail();
    };

    tx.commit().await?;

    Ok(ApiJson(ClaimTargetResponse::from(target)))
}

/// Re-attach a guest session to its row using a still-live claim token, without consuming it
#[post("/claim/{token}/reattach")]
pub async fn reattach_claim_token(
    session: Session,
    Path(token): Path<String>,
) -> ApiResult<ApiJson<ClaimTargetResponse>, ClaimErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(target) = participant::reattach(&mut tx, &token).await? else {
        let mut errors = FormErrors::<ClaimErrors>::new();
        errors.invalid_token = true;
        return errors.fail();
    };
    let participant_uuid = target.participant;

    tx.commit().await?;

    // Only after the commit, so the session never points at a row that was not written.
    TournamentActor::remember_guest(&session, participant_uuid).await?;

    Ok(ApiJson(ClaimTargetResponse::from(target)))
}

/// Join a tournament as the logged-in account
///
/// A decklist failure returns without committing, which rolls back the new participant row.
#[post("/{code}")]
pub async fn join_tournament_by_code(
    account: Account,
    Path(code): Path<String>,
    ApiJson(JoinTournamentRequest {
        display_name,
        deck,
        decklist_text,
    }): ApiJson<JoinTournamentRequest>,
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
    if deck.is_some() && decklist_text.is_some() {
        errors.invalid_decklist = true;
    }
    errors.check()?;

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

    if tournament.needs_decklist_to_register() && deck.is_none() && decklist_text.is_none() {
        let mut errors = FormErrors::<JoinErrors>::new();
        errors.decklist_missing = true;
        return errors.fail();
    }

    let outcome =
        participant::register_account(&mut tx, &tournament, account.uuid, display_name, None)
            .await?;
    let participant = match outcome {
        RegistrationOutcome::Registered(participant, _) => participant,
        RegistrationOutcome::Full => {
            let mut errors = FormErrors::<JoinErrors>::new();
            errors.tournament_full = true;
            return errors.fail();
        }
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

    let source = match (deck, decklist_text) {
        (Some(deck), None) => Some(DecklistSource::Deck(deck)),
        (None, Some(text)) => Some(DecklistSource::Text(text)),
        (None, None) => None,
        (Some(_), Some(_)) => unreachable!("checked above, before the transaction opened"),
    };
    if let Some(source) = source {
        match decklist::write(
            &mut tx,
            tournament.uuid,
            participant.uuid,
            Some(source),
            Some(account.uuid),
            Some(account.uuid),
        )
        .await?
        {
            DecklistChange::Written(_) | DecklistChange::Cleared => {}
            DecklistChange::UnknownDeck | DecklistChange::EmptyDeck => {
                let mut errors = FormErrors::<JoinErrors>::new();
                errors.unknown_deck = true;
                return errors.fail();
            }
            DecklistChange::TooLong => {
                let mut errors = FormErrors::<JoinErrors>::new();
                errors.deck_too_long = true;
                return errors.fail();
            }
            DecklistChange::Invalid => {
                let mut errors = FormErrors::<JoinErrors>::new();
                errors.invalid_decklist = true;
                return errors.fail();
            }
            DecklistChange::Locked => {
                unreachable!("`write` never checks the lock — only `set`'s guard does")
            }
        }
    }

    tx.commit().await?;

    Ok(ApiJson(JoinTournamentResponse {
        tournament: tournament.uuid,
        participant: participant.uuid,
    }))
}

/// Whether joining `tournament` right now would register a player (no organizer exception)
fn registration_open(tournament: &Tournament) -> bool {
    matches!(tournament.status, TournamentStatus::Registration)
        || (tournament.status == TournamentStatus::Running && tournament.allow_late_entry)
}
