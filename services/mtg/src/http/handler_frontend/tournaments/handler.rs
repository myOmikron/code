//! Handlers for the tournament roster surface
//!
//! Two blocks share this module, wired separately in [`super::initialize_routes`]:
//! reads and self-service reachable through the [`TournamentActor`] extractor
//! carry no [`AuthRequiredLayer`](crate::http::middleware::auth_required::AuthRequiredLayer) —
//! that is deliberate, not an oversight, see the module docs there — while
//! every staff mutation sits behind it and additionally extracts a bare
//! [`Account`]. Every function that hands out or touches a [`Tournament`] or
//! [`TournamentParticipant`] still runs through its model-layer guard
//! regardless of which block a handler lives in; the layer only decides
//! whether an [`Account`] must exist at all, never whether it may act.

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

use crate::http::handler_frontend::tournaments::schema::AddOrganizerErrors;
use crate::http::handler_frontend::tournaments::schema::AddTournamentOrganizerRequest;
use crate::http::handler_frontend::tournaments::schema::AddTournamentParticipantRequest;
use crate::http::handler_frontend::tournaments::schema::CheckInErrors;
use crate::http::handler_frontend::tournaments::schema::ClaimErrors;
use crate::http::handler_frontend::tournaments::schema::ClaimParticipantRequest;
use crate::http::handler_frontend::tournaments::schema::ClaimParticipantResponse;
use crate::http::handler_frontend::tournaments::schema::ClaimTokenResponse;
use crate::http::handler_frontend::tournaments::schema::CreateTournamentRequest;
use crate::http::handler_frontend::tournaments::schema::DecklistErrors;
use crate::http::handler_frontend::tournaments::schema::DecklistResponse;
use crate::http::handler_frontend::tournaments::schema::GetDecklistResponse;
use crate::http::handler_frontend::tournaments::schema::GetTournamentResponse;
use crate::http::handler_frontend::tournaments::schema::ListTournamentAuditQuery;
use crate::http::handler_frontend::tournaments::schema::ListTournamentAuditResponse;
use crate::http::handler_frontend::tournaments::schema::ListTournamentOrganizersResponse;
use crate::http::handler_frontend::tournaments::schema::ListTournamentParticipantsResponse;
use crate::http::handler_frontend::tournaments::schema::ListTournamentsResponse;
use crate::http::handler_frontend::tournaments::schema::MAX_TOURNAMENT_AUDIT_LIMIT;
use crate::http::handler_frontend::tournaments::schema::SetDecklistRequest;
use crate::http::handler_frontend::tournaments::schema::SetTournamentStatusRequest;
use crate::http::handler_frontend::tournaments::schema::SetTournamentVisibilityRequest;
use crate::http::handler_frontend::tournaments::schema::TournamentJoinCodeResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentOrganizerResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentParticipantResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentSettingsErrors;
use crate::http::handler_frontend::tournaments::schema::TournamentSettingsRequest;
use crate::http::handler_frontend::tournaments::schema::UpdateTournamentParticipantRequest;
use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::format;
use crate::models::tournament::OrganizerChange;
use crate::models::tournament::SettingsChange;
use crate::models::tournament::StatusChange;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentAccess;
use crate::models::tournament::TournamentActor;
use crate::models::tournament::TournamentInsert;
use crate::models::tournament::TournamentParticipantUuid;
use crate::models::tournament::TournamentRole;
use crate::models::tournament::TournamentUpdate;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::decklist;
use crate::models::tournament::decklist::DecklistChange;
use crate::models::tournament::decklist::DecklistSource;
use crate::models::tournament::listing;
use crate::models::tournament::participant;
use crate::models::tournament::participant::CheckInOutcome;
use crate::models::tournament::participant::ClaimOutcome;
use crate::models::tournament::participant::RegistrationOutcome;
use crate::models::tournament::public;
use crate::models::visibility::Visibility;

// --- actor block: no `AuthRequiredLayer`, identity via `TournamentActor` ---

/// Every tournament the actor may see
#[get("/")]
pub async fn list_tournaments(
    actor: TournamentActor,
) -> ApiResult<ApiJson<ListTournamentsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let entries = listing::list_for_actor(&mut tx, &actor).await?;

    tx.commit().await?;

    Ok(ApiJson(ListTournamentsResponse {
        tournaments: entries.into_iter().map(Into::into).collect(),
    }))
}

/// One tournament, with what the viewer may do with it
#[get("/{tournament}")]
pub async fn get_tournament(
    actor: TournamentActor,
    Path(tournament_uuid): Path<TournamentUuid>,
) -> ApiResult<ApiJson<GetTournamentResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(with_viewer) = Tournament::get_for_viewer(&mut tx, &actor, tournament_uuid).await?
    else {
        return Err(denied());
    };
    // The true roster size, never redacted by `roster_view` — an event may
    // advertise "12 angemeldet" while keeping the names to itself. Counted
    // the same way `TournamentListEntryResponse::participant_count` is.
    let participant_count = participant::list(&mut tx, tournament_uuid).await?.len() as i64;

    tx.commit().await?;

    Ok(ApiJson(GetTournamentResponse::from_with_viewer(
        with_viewer,
        participant_count,
    )))
}

/// A tournament's roster, redacted through [`public::roster_view`]
///
/// This is the leak the model layer's own docs warn about: skip
/// [`public::roster_view`]/[`public::apply_roster_view`] here and a
/// [`crate::models::visibility::Visibility::Public`] tournament hands every
/// guest's real name to any logged-in stranger, using nothing but this
/// ordinary authed read — no share token needed. The share surface
/// ([`crate::http::handler_frontend::shared::handler::list_shared_tournament_participants`])
/// applies the identical decision with `is_staff`/`is_participant` both
/// `false`.
#[get("/{tournament}/participants")]
pub async fn list_tournament_participants(
    actor: TournamentActor,
    Path(tournament_uuid): Path<TournamentUuid>,
) -> ApiResult<ApiJson<ListTournamentParticipantsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(with_viewer) = Tournament::get_for_viewer(&mut tx, &actor, tournament_uuid).await?
    else {
        return Err(denied());
    };
    let is_organizer = with_viewer.role.is_some();

    let participants = participant::list(&mut tx, tournament_uuid).await?;
    let view = public::roster_view(
        &with_viewer.tournament,
        is_organizer,
        with_viewer.participant.is_some(),
    );
    let participants = public::apply_roster_view(view, with_viewer.participant, participants);
    // One extra query, not one per row: `decklist::submitted` never touches
    // decklist text, which is exactly the point of that table living apart
    // from the participant row.
    let submitted = decklist::submitted(&mut tx, tournament_uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(ListTournamentParticipantsResponse {
        participants: participants
            .into_iter()
            .map(|participant| {
                let has_decklist = submitted.contains(&participant.uuid);
                TournamentParticipantResponse::from_parts(participant, has_decklist, is_organizer)
            })
            .collect(),
    }))
}

/// Check in, self-service or by staff
///
/// Under [`crate::models::tournament::DecklistPolicy::RequiredToCheckIn`], a
/// player with no decklist on file is refused with
/// [`CheckInErrors::decklist_missing`] instead of the generic denial — see
/// [`participant::check_in`].
#[post("/{tournament}/participants/{participant}/check-in")]
pub async fn check_in_tournament_participant(
    actor: TournamentActor,
    Path((tournament_uuid, participant_uuid)): Path<(TournamentUuid, TournamentParticipantUuid)>,
) -> ApiResult<ApiJson<()>, CheckInErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let outcome =
        match participant::check_in(&mut tx, &actor, tournament_uuid, participant_uuid).await? {
            TournamentAccess::Granted(outcome) => outcome,
            TournamentAccess::Denied => return Err(denied()),
        };
    match outcome {
        CheckInOutcome::CheckedIn => {}
        CheckInOutcome::DecklistMissing => {
            let mut errors = FormErrors::<CheckInErrors>::new();
            errors.decklist_missing = true;
            return errors.fail();
        }
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Drop, self-service or by staff
#[post("/{tournament}/participants/{participant}/drop")]
pub async fn drop_tournament_participant(
    actor: TournamentActor,
    Path((tournament_uuid, participant_uuid)): Path<(TournamentUuid, TournamentParticipantUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(participant::drop(&mut tx, &actor, tournament_uuid, participant_uuid).await?)?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Read a participant's decklist — staff, or the participant themself
///
/// Guard: [`decklist::get`]. See [`get_decklist_response`] for how
/// [`GetDecklistResponse::locked`]/[`GetDecklistResponse::may_edit`] are
/// filled in.
#[get("/{tournament}/participants/{participant}/decklist")]
pub async fn get_participant_decklist(
    actor: TournamentActor,
    Path((tournament_uuid, participant_uuid)): Path<(TournamentUuid, TournamentParticipantUuid)>,
) -> ApiResult<ApiJson<GetDecklistResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let response =
        get_decklist_response(&mut tx, &actor, tournament_uuid, participant_uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(response))
}

/// Write, replace or clear a participant's decklist — staff, or the
/// participant themself while the tournament's decklists are not locked
///
/// Guard: [`decklist::set`]. `deck` and `text` both present is refused as
/// [`DecklistErrors::invalid_decklist`] before the guard even runs — a
/// request names at most one source.
#[put("/{tournament}/participants/{participant}/decklist")]
pub async fn set_participant_decklist(
    actor: TournamentActor,
    Path((tournament_uuid, participant_uuid)): Path<(TournamentUuid, TournamentParticipantUuid)>,
    ApiJson(SetDecklistRequest { deck, text }): ApiJson<SetDecklistRequest>,
) -> ApiResult<ApiJson<GetDecklistResponse>, DecklistErrors> {
    let source = match (deck, text) {
        (Some(_), Some(_)) => {
            let mut errors = FormErrors::<DecklistErrors>::new();
            errors.invalid_decklist = true;
            return errors.fail();
        }
        (Some(deck), None) => Some(DecklistSource::Deck(deck)),
        (None, Some(text)) => Some(DecklistSource::Text(text)),
        (None, None) => None,
    };

    let mut tx = Database::global().start_transaction().await?;

    let change =
        match decklist::set(&mut tx, &actor, tournament_uuid, participant_uuid, source).await? {
            TournamentAccess::Granted(change) => change,
            TournamentAccess::Denied => return Err(denied()),
        };
    match change {
        DecklistChange::Written(_) | DecklistChange::Cleared => {}
        DecklistChange::Locked => {
            let mut errors = FormErrors::<DecklistErrors>::new();
            errors.locked = true;
            return errors.fail();
        }
        // An empty deck is not a list anybody can register either — folded
        // into the same field as an unknown/unowned one, see
        // `DecklistErrors::unknown_deck`'s doc comment.
        DecklistChange::UnknownDeck | DecklistChange::EmptyDeck => {
            let mut errors = FormErrors::<DecklistErrors>::new();
            errors.unknown_deck = true;
            return errors.fail();
        }
        DecklistChange::Invalid => {
            let mut errors = FormErrors::<DecklistErrors>::new();
            errors.invalid_decklist = true;
            return errors.fail();
        }
    }

    let response =
        get_decklist_response(&mut tx, &actor, tournament_uuid, participant_uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(response))
}

// --- management block: behind `AuthRequiredLayer`, identity via `Account` ---

/// Create a tournament; the caller becomes its owner
#[post("/")]
pub async fn create_tournament(
    account: Account,
    ApiJson(CreateTournamentRequest {
        settings,
        visibility,
    }): ApiJson<CreateTournamentRequest>,
) -> ApiResult<ApiJson<TournamentResponse>, TournamentSettingsErrors> {
    let mut errors = FormErrors::<TournamentSettingsErrors>::new();
    validate_settings(&mut errors, &settings);
    errors.check()?;

    let mut tx = Database::global().start_transaction().await?;

    let tournament = Tournament::create(
        &mut tx,
        account.uuid,
        insert_from_settings(settings, visibility),
    )
    .await?;

    tx.commit().await?;

    Ok(ApiJson(TournamentResponse::from_parts(
        tournament,
        Some(TournamentRole::Owner),
    )))
}

/// Update a tournament's settings
///
/// The always-editable fields (name, description, venue, start time, round
/// length) go through even while the event is running; a structural change
/// (format, pod size, pairing, scoring, ...) while [`SettingsChange::Locked`]
/// answers [`TournamentSettingsErrors::settings_locked`] instead — see
/// [`Tournament::update_settings`]'s doc comment for exactly what counts as
/// structural.
#[put("/{tournament}")]
pub async fn update_tournament(
    account: Account,
    Path(tournament_uuid): Path<TournamentUuid>,
    ApiJson(settings): ApiJson<TournamentSettingsRequest>,
) -> ApiResult<ApiJson<()>, TournamentSettingsErrors> {
    let mut errors = FormErrors::<TournamentSettingsErrors>::new();
    validate_settings(&mut errors, &settings);
    errors.check()?;

    let mut tx = Database::global().start_transaction().await?;

    let update = update_from_settings(settings);
    match Tournament::update_settings(&mut tx, account.uuid, tournament_uuid, update).await? {
        TournamentAccess::Granted(SettingsChange::Changed) => {}
        TournamentAccess::Granted(SettingsChange::Locked) => {
            let mut errors = FormErrors::<TournamentSettingsErrors>::new();
            errors.settings_locked = true;
            return errors.fail();
        }
        TournamentAccess::Denied => return Err(denied()),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Delete a tournament outright — owner only
#[delete("/{tournament}")]
pub async fn delete_tournament(
    account: Account,
    Path(tournament_uuid): Path<TournamentUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Tournament::delete(&mut tx, account.uuid, tournament_uuid).await?)?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Move a tournament to a new lifecycle status
#[put("/{tournament}/status")]
pub async fn set_tournament_status(
    account: Account,
    Path(tournament_uuid): Path<TournamentUuid>,
    ApiJson(SetTournamentStatusRequest { status }): ApiJson<SetTournamentStatusRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    match Tournament::set_status(&mut tx, account.uuid, tournament_uuid, status).await? {
        TournamentAccess::Granted(StatusChange::Changed) => {}
        // Not a guard denial — the actor may manage this tournament, the
        // move itself just is not legal from where it stands. A distinct
        // message earns its keep here.
        TournamentAccess::Granted(StatusChange::InvalidTransition) => {
            return Err(ApiError::bad_request(
                "That status transition is not allowed",
            ));
        }
        TournamentAccess::Denied => return Err(denied()),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Change who may see a tournament
///
/// Discards the freshly minted share token the same way
/// [`crate::http::handler_frontend::decks::handler::set_visibility_deck`]
/// does: the client re-fetches [`get_tournament`] for it.
#[put("/{tournament}/visibility")]
pub async fn set_tournament_visibility(
    account: Account,
    Path(tournament_uuid): Path<TournamentUuid>,
    ApiJson(SetTournamentVisibilityRequest { visibility }): ApiJson<SetTournamentVisibilityRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Tournament::set_visibility(&mut tx, account.uuid, tournament_uuid, visibility).await?)?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Mint a fresh join code, invalidating whatever one was live before
#[post("/{tournament}/join-code")]
pub async fn rotate_tournament_join_code(
    account: Account,
    Path(tournament_uuid): Path<TournamentUuid>,
) -> ApiResult<ApiJson<TournamentJoinCodeResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let join_code =
        granted(Tournament::rotate_join_code(&mut tx, account.uuid, tournament_uuid).await?)?;

    tx.commit().await?;

    Ok(ApiJson(TournamentJoinCodeResponse { join_code }))
}

/// Withdraw a tournament's join code without minting a new one
#[delete("/{tournament}/join-code")]
pub async fn revoke_tournament_join_code(
    account: Account,
    Path(tournament_uuid): Path<TournamentUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Tournament::revoke_join_code(&mut tx, account.uuid, tournament_uuid).await?)?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Lock every decklist in the tournament: players may no longer write their
/// own, staff still can
#[post("/{tournament}/decklists/lock")]
pub async fn lock_tournament_decklists(
    account: Account,
    Path(tournament_uuid): Path<TournamentUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Tournament::lock_decklists(&mut tx, account.uuid, tournament_uuid).await?)?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Unlock every decklist in the tournament, letting players write their own again
#[post("/{tournament}/decklists/unlock")]
pub async fn unlock_tournament_decklists(
    account: Account,
    Path(tournament_uuid): Path<TournamentUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(Tournament::unlock_decklists(&mut tx, account.uuid, tournament_uuid).await?)?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// The staff list, visible to any role holder
#[get("/{tournament}/organizers")]
pub async fn list_tournament_organizers(
    account: Account,
    Path(tournament_uuid): Path<TournamentUuid>,
) -> ApiResult<ApiJson<ListTournamentOrganizersResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let organizers =
        granted(Tournament::list_organizers(&mut tx, account.uuid, tournament_uuid).await?)?;

    tx.commit().await?;

    Ok(ApiJson(ListTournamentOrganizersResponse {
        organizers: organizers
            .into_iter()
            .map(TournamentOrganizerResponse::from)
            .collect(),
    }))
}

/// Add an account as staff — owner only
#[post("/{tournament}/organizers")]
pub async fn add_tournament_organizer(
    account: Account,
    Path(tournament_uuid): Path<TournamentUuid>,
    ApiJson(AddTournamentOrganizerRequest { username, role }): ApiJson<
        AddTournamentOrganizerRequest,
    >,
) -> ApiResult<ApiJson<()>, AddOrganizerErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let outcome =
        match Tournament::add_organizer(&mut tx, account.uuid, tournament_uuid, &username, role)
            .await?
        {
            TournamentAccess::Granted(outcome) => outcome,
            TournamentAccess::Denied => return Err(denied()),
        };
    match outcome {
        OrganizerChange::Changed => {}
        OrganizerChange::UnknownAccount => {
            let mut errors = FormErrors::<AddOrganizerErrors>::new();
            errors.unknown_account = true;
            return errors.fail();
        }
        OrganizerChange::AlreadyOrganizer => {
            let mut errors = FormErrors::<AddOrganizerErrors>::new();
            errors.already_organizer = true;
            return errors.fail();
        }
        OrganizerChange::IsOwner => {
            let mut errors = FormErrors::<AddOrganizerErrors>::new();
            errors.is_owner = true;
            return errors.fail();
        }
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Remove an account from staff — owner only
#[delete("/{tournament}/organizers/{account}")]
pub async fn remove_tournament_organizer(
    account: Account,
    Path((tournament_uuid, staff_account)): Path<(TournamentUuid, AccountUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(
        Tournament::remove_organizer(&mut tx, account.uuid, tournament_uuid, staff_account).await?,
    )?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Walk a guest into the roster by name
///
/// [`participant::register_guest`] trusts its `added_by` argument to mean the
/// caller already holds a role — this is the one place in the module tree
/// allowed to make that promise, immediately after checking it.
///
/// `decklist_text`, if given, is written in the same transaction right after
/// the row exists to hold it — no policy check here, the same as
/// `register_guest` itself: an organizer may register a walk-in with or
/// without a list regardless of [`crate::models::tournament::DecklistPolicy`],
/// since a policy governs self-service registration, not staff typing
/// somebody in by hand.
#[post("/{tournament}/participants")]
pub async fn add_tournament_participant(
    account: Account,
    Path(tournament_uuid): Path<TournamentUuid>,
    ApiJson(AddTournamentParticipantRequest {
        display_name,
        decklist_text,
    }): ApiJson<AddTournamentParticipantRequest>,
) -> ApiResult<ApiJson<TournamentParticipantResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some((_, tournament)) =
        Tournament::get_as_organizer(&mut tx, account.uuid, tournament_uuid)
            .await?
            .granted()
    else {
        return Err(denied());
    };

    let outcome =
        participant::register_guest(&mut tx, &tournament, display_name, Some(account.uuid)).await?;
    let participant = match outcome {
        RegistrationOutcome::Registered(participant, _claim_token) => participant,
        // `AlreadyRegistered` cannot actually happen for a guest row (see
        // `register_guest`'s doc comment) — folded into the same answer as
        // `Closed` rather than relied upon to stay unreachable forever.
        RegistrationOutcome::Closed | RegistrationOutcome::AlreadyRegistered => {
            return Err(ApiError::bad_request("Registration is closed"));
        }
    };

    let has_decklist = match decklist_text {
        None => false,
        Some(text) => match decklist::write(
            &mut tx,
            tournament.uuid,
            participant.uuid,
            Some(DecklistSource::Text(text)),
            None,
            Some(account.uuid),
        )
        .await?
        {
            DecklistChange::Written(_) => true,
            DecklistChange::Invalid => {
                return Err(ApiError::bad_request("A decklist must not be blank"));
            }
            DecklistChange::Cleared => {
                unreachable!("a text source is never `Cleared`")
            }
            DecklistChange::UnknownDeck | DecklistChange::EmptyDeck => {
                unreachable!("a walk-in's decklist is always pasted text, never a linked deck")
            }
            DecklistChange::Locked => {
                unreachable!("`write` never checks the lock — only `set`'s guard does")
            }
        },
    };

    tx.commit().await?;

    Ok(ApiJson(TournamentParticipantResponse::from_parts(
        participant,
        has_decklist,
        true,
    )))
}

/// Change a participant's display name and/or organizer notes
#[put("/{tournament}/participants/{participant}")]
pub async fn update_tournament_participant(
    account: Account,
    Path((tournament_uuid, participant_uuid)): Path<(TournamentUuid, TournamentParticipantUuid)>,
    ApiJson(request): ApiJson<UpdateTournamentParticipantRequest>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(
        participant::update(
            &mut tx,
            account.uuid,
            tournament_uuid,
            participant_uuid,
            request.display_name,
            request.notes,
        )
        .await?,
    )?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Remove a participant outright
#[delete("/{tournament}/participants/{participant}")]
pub async fn delete_tournament_participant(
    account: Account,
    Path((tournament_uuid, participant_uuid)): Path<(TournamentUuid, TournamentParticipantUuid)>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    granted(participant::remove(&mut tx, account.uuid, tournament_uuid, participant_uuid).await?)?;

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Hand a guest row's live claim token to staff, e.g. to render as a QR code
/// for a walk-in to scan
///
/// Guard: [`participant::claim_token`] — any role, deliberately not
/// [`TournamentRole::may_manage`], the same reasoning as
/// [`update_tournament_participant`]: walking a guest through claiming their
/// own row is exactly what a scorekeeper is for. `claim_token: None` covers
/// both "already claimed" and "this is an account row" — either way there is
/// no live token to show, and the caller has no reason to tell the two apart.
#[get("/{tournament}/participants/{participant}/claim-token")]
pub async fn get_participant_claim_token(
    account: Account,
    Path((tournament_uuid, participant_uuid)): Path<(TournamentUuid, TournamentParticipantUuid)>,
) -> ApiResult<ApiJson<ClaimTokenResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let claim_token = granted(
        participant::claim_token(&mut tx, account.uuid, tournament_uuid, participant_uuid).await?,
    )?;

    tx.commit().await?;

    Ok(ApiJson(ClaimTokenResponse { claim_token }))
}

/// Attach the caller's account to a guest row using its claim token
#[post("/participants/claim")]
pub async fn claim_tournament_participant(
    account: Account,
    ApiJson(ClaimParticipantRequest { claim_token }): ApiJson<ClaimParticipantRequest>,
) -> ApiResult<ApiJson<ClaimParticipantResponse>, ClaimErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let participant = match participant::claim(&mut tx, account.uuid, &claim_token).await? {
        ClaimOutcome::Claimed(participant) => participant,
        ClaimOutcome::InvalidToken => {
            let mut errors = FormErrors::<ClaimErrors>::new();
            errors.invalid_token = true;
            return errors.fail();
        }
        ClaimOutcome::AlreadyRegistered => {
            let mut errors = FormErrors::<ClaimErrors>::new();
            errors.already_registered = true;
            return errors.fail();
        }
    };

    tx.commit().await?;

    Ok(ApiJson(ClaimParticipantResponse {
        tournament: participant.tournament,
        participant: participant.uuid,
    }))
}

/// A tournament's audit log, newest first
#[get("/{tournament}/audit")]
pub async fn list_tournament_audit(
    account: Account,
    Path(tournament_uuid): Path<TournamentUuid>,
    Query(query): Query<ListTournamentAuditQuery>,
) -> ApiResult<ApiJson<ListTournamentAuditResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let limit = u64::from(query.limit.clamp(1, MAX_TOURNAMENT_AUDIT_LIMIT));
    let entries =
        granted(Tournament::list_audit(&mut tx, account.uuid, tournament_uuid, limit).await?)?;

    tx.commit().await?;

    Ok(ApiJson(ListTournamentAuditResponse {
        entries: entries.into_iter().map(Into::into).collect(),
    }))
}

// --- shared helpers ---

/// Turn a denied access into the one answer every refused request gets
fn granted<T, E>(access: TournamentAccess<T>) -> ApiResult<T, E> {
    access.granted().ok_or_else(denied)
}

/// The answer a request that may not happen gets
fn denied<E>() -> ApiError<E> {
    ApiError::bad_request("Request was denied")
}

/// Check a [`TournamentSettingsRequest`] against the bounds the model does
/// not itself enforce
///
/// Kept separate from the model layer on purpose: `Tournament::create`/
/// `update_settings` trust their caller, the same discipline as everywhere
/// else in this module tree — the HTTP boundary is where user input actually
/// gets checked.
fn validate_settings(
    errors: &mut FormErrors<TournamentSettingsErrors>,
    settings: &TournamentSettingsRequest,
) {
    if !(2..=5).contains(&settings.pod_size) {
        errors.invalid_pod_size = true;
    }

    let games_per_match_ok = matches!(settings.games_per_match, 1 | 3 | 5)
        && (settings.pod_size <= 2 || settings.games_per_match == 1);
    if !games_per_match_ok {
        errors.invalid_games_per_match = true;
    }

    if settings.points_win < 0
        || settings.points_draw < 0
        || settings.points_loss < 0
        || settings.points_bye < 0
    {
        errors.invalid_points = true;
    }

    if !(10..=600).contains(&settings.round_minutes) {
        errors.invalid_round_length = true;
    }

    if !format::is_tournament_format(&settings.format) {
        errors.invalid_format = true;
    }
}

/// Build a [`TournamentInsert`] from a validated [`TournamentSettingsRequest`] plus the
/// visibility [`create_tournament`] takes alongside it
fn insert_from_settings(
    settings: TournamentSettingsRequest,
    visibility: Visibility,
) -> TournamentInsert {
    TournamentInsert {
        name: settings.name,
        description: settings.description,
        format: settings.format,
        pod_size: settings.pod_size,
        games_per_match: settings.games_per_match,
        pairing_system: settings.pairing_system,
        seat_policy: settings.seat_policy,
        points_win: settings.points_win,
        points_draw: settings.points_draw,
        points_loss: settings.points_loss,
        points_bye: settings.points_bye,
        round_minutes: settings.round_minutes,
        require_check_in: settings.require_check_in,
        allow_late_entry: settings.allow_late_entry,
        late_entry_as_losses: settings.late_entry_as_losses,
        decklist_policy: settings.decklist_policy,
        participant_audience: settings.participant_audience,
        guest_names_public: settings.guest_names_public,
        visibility,
        venue: settings.venue,
        starts_at: settings.starts_at.map(|starts_at| starts_at.0),
    }
}

/// Build a [`TournamentUpdate`] from a validated [`TournamentSettingsRequest`]
fn update_from_settings(settings: TournamentSettingsRequest) -> TournamentUpdate {
    TournamentUpdate {
        name: settings.name,
        description: settings.description,
        venue: settings.venue,
        starts_at: settings.starts_at.map(|starts_at| starts_at.0),
        round_minutes: settings.round_minutes,
        format: settings.format,
        pod_size: settings.pod_size,
        games_per_match: settings.games_per_match,
        pairing_system: settings.pairing_system,
        seat_policy: settings.seat_policy,
        points_win: settings.points_win,
        points_draw: settings.points_draw,
        points_loss: settings.points_loss,
        points_bye: settings.points_bye,
        require_check_in: settings.require_check_in,
        allow_late_entry: settings.allow_late_entry,
        late_entry_as_losses: settings.late_entry_as_losses,
        decklist_policy: settings.decklist_policy,
        participant_audience: settings.participant_audience,
        guest_names_public: settings.guest_names_public,
    }
}

/// Build a [`GetDecklistResponse`] for an actor whose access to `participant`
/// [`decklist::get`] or [`decklist::set`] has already granted
///
/// Shared by [`get_participant_decklist`] and [`set_participant_decklist`]:
/// both need the freshly read row plus the same `locked`/`may_edit` facts.
/// [`Tournament::get_for_viewer`] is what supplies them — its guard is wider
/// than [`decklist::get`]'s (it also lets a `Public` tournament's stranger
/// through), but a decklist guard granting access already implies the actor
/// holds a role or is the participant themself, either of which makes
/// `get_for_viewer` succeed too, so its `None` branch here can never actually
/// fire.
async fn get_decklist_response<E>(
    tx: &mut Transaction,
    actor: &TournamentActor,
    tournament_uuid: TournamentUuid,
    participant_uuid: TournamentParticipantUuid,
) -> ApiResult<GetDecklistResponse, E> {
    let decklist =
        granted(decklist::get(&mut *tx, actor, tournament_uuid, participant_uuid).await?)?;
    let Some(with_viewer) = Tournament::get_for_viewer(&mut *tx, actor, tournament_uuid).await?
    else {
        return Err(denied());
    };

    let is_staff = with_viewer.role.is_some();
    let locked = with_viewer.tournament.decklists_locked();

    Ok(GetDecklistResponse {
        decklist: decklist.map(DecklistResponse::from),
        locked,
        may_edit: is_staff || !locked,
    })
}
