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

use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::hash::Hash;
use std::hash::Hasher;

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_error::FormErrors;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;

use crate::http::handler_frontend::tournaments::schema::AddOrganizerErrors;
use crate::http::handler_frontend::tournaments::schema::AddParticipantErrors;
use crate::http::handler_frontend::tournaments::schema::AddTournamentOrganizerRequest;
use crate::http::handler_frontend::tournaments::schema::AddTournamentParticipantRequest;
use crate::http::handler_frontend::tournaments::schema::CheckInErrors;
use crate::http::handler_frontend::tournaments::schema::ClaimErrors;
use crate::http::handler_frontend::tournaments::schema::ClaimParticipantRequest;
use crate::http::handler_frontend::tournaments::schema::ClaimParticipantResponse;
use crate::http::handler_frontend::tournaments::schema::ClaimTokenResponse;
use crate::http::handler_frontend::tournaments::schema::CompleteRoundErrors;
use crate::http::handler_frontend::tournaments::schema::CompleteRoundRequest;
use crate::http::handler_frontend::tournaments::schema::CreateRoundErrors;
use crate::http::handler_frontend::tournaments::schema::CreateRoundRequest;
use crate::http::handler_frontend::tournaments::schema::CreateTournamentRequest;
use crate::http::handler_frontend::tournaments::schema::DecklistErrors;
use crate::http::handler_frontend::tournaments::schema::DecklistResponse;
use crate::http::handler_frontend::tournaments::schema::FixedTableConflict;
use crate::http::handler_frontend::tournaments::schema::GetDecklistResponse;
use crate::http::handler_frontend::tournaments::schema::GetTournamentResponse;
use crate::http::handler_frontend::tournaments::schema::ListRoundsResponse;
use crate::http::handler_frontend::tournaments::schema::ListTablesResponse;
use crate::http::handler_frontend::tournaments::schema::ListTournamentAuditQuery;
use crate::http::handler_frontend::tournaments::schema::ListTournamentAuditResponse;
use crate::http::handler_frontend::tournaments::schema::ListTournamentOrganizersResponse;
use crate::http::handler_frontend::tournaments::schema::ListTournamentParticipantsResponse;
use crate::http::handler_frontend::tournaments::schema::ListTournamentVenuesResponse;
use crate::http::handler_frontend::tournaments::schema::ListTournamentsResponse;
use crate::http::handler_frontend::tournaments::schema::MAX_TOURNAMENT_AUDIT_LIMIT;
use crate::http::handler_frontend::tournaments::schema::MatchTableResponse;
use crate::http::handler_frontend::tournaments::schema::PLAYER_SEARCH_LIMIT;
use crate::http::handler_frontend::tournaments::schema::PairRoundErrors;
use crate::http::handler_frontend::tournaments::schema::PairRoundResponse;
use crate::http::handler_frontend::tournaments::schema::PlayerSearchResultResponse;
use crate::http::handler_frontend::tournaments::schema::ReportResultErrors;
use crate::http::handler_frontend::tournaments::schema::ReportResultRequest;
use crate::http::handler_frontend::tournaments::schema::RoundLifecycleErrors;
use crate::http::handler_frontend::tournaments::schema::RoundResponse;
use crate::http::handler_frontend::tournaments::schema::SearchPlayersRequest;
use crate::http::handler_frontend::tournaments::schema::SearchPlayersResponse;
use crate::http::handler_frontend::tournaments::schema::SetDecklistRequest;
use crate::http::handler_frontend::tournaments::schema::SetResultErrors;
use crate::http::handler_frontend::tournaments::schema::SetResultRequest;
use crate::http::handler_frontend::tournaments::schema::SetTimerRequest;
use crate::http::handler_frontend::tournaments::schema::SetTournamentStatusRequest;
use crate::http::handler_frontend::tournaments::schema::SetTournamentStatusResponse;
use crate::http::handler_frontend::tournaments::schema::SetTournamentVisibilityRequest;
use crate::http::handler_frontend::tournaments::schema::StandingResponse;
use crate::http::handler_frontend::tournaments::schema::StandingsResponse;
use crate::http::handler_frontend::tournaments::schema::TiebreakerResponse;
use crate::http::handler_frontend::tournaments::schema::TimerActionRequest;
use crate::http::handler_frontend::tournaments::schema::TournamentJoinCodeResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentOrganizerResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentParticipantResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentSettingsErrors;
use crate::http::handler_frontend::tournaments::schema::TournamentSettingsRequest;
use crate::http::handler_frontend::tournaments::schema::TournamentStateResponse;
use crate::http::handler_frontend::tournaments::schema::TournamentVenueResponse;
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
use crate::models::tournament::TournamentMatchUuid;
use crate::models::tournament::TournamentParticipantUuid;
use crate::models::tournament::TournamentRole;
use crate::models::tournament::TournamentRoundUuid;
use crate::models::tournament::TournamentUpdate;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::TournamentVenueUuid;
use crate::models::tournament::decklist;
use crate::models::tournament::decklist::DecklistChange;
use crate::models::tournament::decklist::DecklistSource;
use crate::models::tournament::listing;
use crate::models::tournament::pairing;
use crate::models::tournament::pairing::PairOutcome;
use crate::models::tournament::participant;
use crate::models::tournament::participant::CheckInOutcome;
use crate::models::tournament::participant::ClaimOutcome;
use crate::models::tournament::participant::RegistrationOutcome;
use crate::models::tournament::public;
use crate::models::tournament::reporting;
use crate::models::tournament::reporting::ReportClaim;
use crate::models::tournament::reporting::ReportOutcome;
use crate::models::tournament::reporting::ResultChange;
use crate::models::tournament::round;
use crate::models::tournament::round::CreateRound;
use crate::models::tournament::round::Round;
use crate::models::tournament::round::RoundChange;
use crate::models::tournament::round::RoundOutcome;
use crate::models::tournament::standings;
use crate::models::tournament::venue;
use crate::models::visibility::Visibility;
use crate::tournament::timer::TimerAction;

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
///
/// A non-blank `venue` is remembered into the caller's own venue book — see
/// [`remember_venue`]. It is written *before* the tournament, because
/// building the insert consumes the request; the two share one transaction,
/// so a tournament that fails to insert takes the remembered venue with it.
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

    let insert = insert_from_settings(settings, visibility);
    remember_venue(
        &mut tx,
        account.uuid,
        &insert.venue,
        &insert.venue_address,
        &insert.venue_instructions,
    )
    .await?;
    let tournament = Tournament::create(&mut tx, account.uuid, insert).await?;

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
/// structural. A non-blank `venue` is remembered into the caller's own venue
/// book — see [`remember_venue`] — once the write actually goes through.
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
    match Tournament::update_settings(&mut tx, account.uuid, tournament_uuid, update.clone())
        .await?
    {
        TournamentAccess::Granted(SettingsChange::Changed) => {}
        TournamentAccess::Granted(SettingsChange::Locked) => {
            let mut errors = FormErrors::<TournamentSettingsErrors>::new();
            errors.settings_locked = true;
            return errors.fail();
        }
        TournamentAccess::Denied => return Err(denied()),
    }
    remember_venue(
        &mut tx,
        account.uuid,
        &update.venue,
        &update.venue_address,
        &update.venue_instructions,
    )
    .await?;

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
) -> ApiResult<ApiJson<SetTournamentStatusResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let dropped =
        match Tournament::set_status(&mut tx, account.uuid, tournament_uuid, status).await? {
            TournamentAccess::Granted(StatusChange::Changed {
                dropped_awaiting_check_in,
            }) => dropped_awaiting_check_in,
            // Not a guard denial — the actor may manage this tournament, the
            // move itself just is not legal from where it stands. A distinct
            // message earns its keep here.
            TournamentAccess::Granted(StatusChange::InvalidTransition) => {
                return Err(ApiError::bad_request(
                    "That status transition is not allowed",
                ));
            }
            TournamentAccess::Denied => return Err(denied()),
        };

    tx.commit().await?;

    Ok(ApiJson(SetTournamentStatusResponse {
        dropped_awaiting_check_in: dropped as i64,
    }))
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
        account: seated_account,
        display_name,
        decklist_text,
    }): ApiJson<AddTournamentParticipantRequest>,
) -> ApiResult<ApiJson<TournamentParticipantResponse>, AddParticipantErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let Some((_, tournament)) =
        Tournament::get_as_organizer(&mut tx, account.uuid, tournament_uuid)
            .await?
            .granted()
    else {
        return Err(denied());
    };

    // Two doors into the same roster. With an account the row is claimed from
    // the start, so the name defaults to that account's username; without one
    // the organizer has to have typed something.
    let outcome = match seated_account {
        Some(seated_account) => {
            let Some(seated) = Account::get_by_uuid(&mut tx, seated_account).await? else {
                let mut errors = FormErrors::<AddParticipantErrors>::new();
                errors.unknown_account = true;
                return errors.fail();
            };
            // Always fits: `Username::MAX_LEN` is 32, well under `MaxStr<64>`.
            let display_name = display_name.unwrap_or_else(|| {
                MaxStr::new(seated.username.as_str().to_owned())
                    .unwrap_or_else(|_| unreachable!("a username is at most 32 characters"))
            });
            participant::register_account(
                &mut tx,
                &tournament,
                seated.uuid,
                display_name,
                Some(account.uuid),
            )
            .await?
        }
        None => {
            let Some(display_name) = display_name.filter(|name| !name.trim().is_empty()) else {
                let mut errors = FormErrors::<AddParticipantErrors>::new();
                errors.empty_name = true;
                return errors.fail();
            };
            participant::register_guest(&mut tx, &tournament, display_name, Some(account.uuid))
                .await?
        }
    };
    let participant = match outcome {
        RegistrationOutcome::Registered(participant, _claim_token) => participant,
        RegistrationOutcome::AlreadyRegistered => {
            let mut errors = FormErrors::<AddParticipantErrors>::new();
            errors.already_registered = true;
            return errors.fail();
        }
        RegistrationOutcome::Closed => {
            let mut errors = FormErrors::<AddParticipantErrors>::new();
            errors.registration_closed = true;
            return errors.fail();
        }
        // An organizer's own add never consults the capacity — see `has_room`.
        RegistrationOutcome::Full => {
            unreachable!("the desk may always seat one more")
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
                let mut errors = FormErrors::<AddParticipantErrors>::new();
                errors.invalid_decklist = true;
                return errors.fail();
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

/// What a client polls to know whether anything moved
///
/// In the actor block on purpose: a guest's phone is exactly the device that
/// needs this most, and wrapping it in an auth layer would lock the room out.
/// Deliberately cheap — a handful of indexed reads and never a standings
/// computation, because every phone hits it on a timer.
#[get("/{tournament}/state")]
pub async fn get_tournament_state(
    actor: TournamentActor,
    Path(tournament_uuid): Path<TournamentUuid>,
) -> ApiResult<ApiJson<TournamentStateResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(with_viewer) = Tournament::get_for_viewer(&mut tx, &actor, tournament_uuid).await?
    else {
        return Err(denied());
    };

    let round = round::current(&mut tx, tournament_uuid).await?;
    let outstanding = match &round {
        Some(round) => round::outstanding_tables(&mut tx, round.uuid).await?.len() as i64,
        None => 0,
    };

    tx.commit().await?;

    let now = OffsetDateTime::now_utc();
    let revision = state_revision(&with_viewer.tournament, round.as_ref(), outstanding);
    Ok(ApiJson(TournamentStateResponse {
        server_time: SchemaDateTime(now),
        revision,
        status: with_viewer.tournament.status,
        round: round.map(|round| RoundResponse::from_round(round, now)),
        planned_rounds: with_viewer.tournament.planned_rounds,
        outstanding_tables: outstanding,
    }))
}

/// Every round of a tournament
#[get("/{tournament}/rounds")]
pub async fn list_tournament_rounds(
    actor: TournamentActor,
    Path(tournament_uuid): Path<TournamentUuid>,
) -> ApiResult<ApiJson<ListRoundsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    if Tournament::get_for_viewer(&mut tx, &actor, tournament_uuid)
        .await?
        .is_none()
    {
        return Err(denied());
    }

    let rounds = round::list(&mut tx, tournament_uuid).await?;

    tx.commit().await?;

    let now = OffsetDateTime::now_utc();
    Ok(ApiJson(ListRoundsResponse {
        rounds: rounds
            .into_iter()
            .map(|round| RoundResponse::from_round(round, now))
            .collect(),
        server_time: SchemaDateTime(now),
    }))
}

/// Add a round to a running tournament
#[post("/{tournament}/rounds")]
pub async fn create_tournament_round(
    account: Account,
    Path(tournament_uuid): Path<TournamentUuid>,
    ApiJson(CreateRoundRequest { kind, minutes }): ApiJson<CreateRoundRequest>,
) -> ApiResult<ApiJson<RoundResponse>, CreateRoundErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let outcome = match round::create(
        &mut tx,
        account.uuid,
        tournament_uuid,
        CreateRound { kind, minutes },
    )
    .await?
    {
        TournamentAccess::Granted(outcome) => outcome,
        TournamentAccess::Denied => return Err(denied()),
    };

    let round = match outcome {
        RoundOutcome::Created(round) => round,
        RoundOutcome::TournamentNotRunning => {
            let mut errors = FormErrors::<CreateRoundErrors>::new();
            errors.tournament_not_running = true;
            return errors.fail();
        }
        RoundOutcome::PreviousRoundOpen => {
            let mut errors = FormErrors::<CreateRoundErrors>::new();
            errors.previous_round_open = true;
            return errors.fail();
        }
        RoundOutcome::InvalidLength => {
            let mut errors = FormErrors::<CreateRoundErrors>::new();
            errors.invalid_length = true;
            return errors.fail();
        }
    };

    tx.commit().await?;

    Ok(ApiJson(RoundResponse::from_round(
        round,
        OffsetDateTime::now_utc(),
    )))
}

/// Hand a round to the room and start its clock
#[post("/{tournament}/rounds/{round}/start")]
pub async fn start_tournament_round(
    account: Account,
    Path((tournament_uuid, round_uuid)): Path<(TournamentUuid, TournamentRoundUuid)>,
) -> ApiResult<ApiJson<RoundResponse>, RoundLifecycleErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let change = match round::start(&mut tx, account.uuid, tournament_uuid, round_uuid).await? {
        TournamentAccess::Granted(change) => change,
        TournamentAccess::Denied => return Err(denied()),
    };
    let round = round_or_refusal(change)?;

    tx.commit().await?;

    Ok(ApiJson(RoundResponse::from_round(
        round,
        OffsetDateTime::now_utc(),
    )))
}

/// Close a round
#[post("/{tournament}/rounds/{round}/complete")]
pub async fn complete_tournament_round(
    account: Account,
    Path((tournament_uuid, round_uuid)): Path<(TournamentUuid, TournamentRoundUuid)>,
    ApiJson(CompleteRoundRequest { force }): ApiJson<CompleteRoundRequest>,
) -> ApiResult<ApiJson<RoundResponse>, CompleteRoundErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let change =
        match round::complete(&mut tx, account.uuid, tournament_uuid, round_uuid, force).await? {
            TournamentAccess::Granted(change) => change,
            TournamentAccess::Denied => return Err(denied()),
        };

    let round = match change {
        RoundChange::Changed(round) => round,
        RoundChange::NotEditable => {
            let mut errors = FormErrors::<CompleteRoundErrors>::new();
            errors.not_editable = true;
            return errors.fail();
        }
        RoundChange::Outstanding(_) => {
            let mut errors = FormErrors::<CompleteRoundErrors>::new();
            errors.outstanding_tables = true;
            return errors.fail();
        }
    };

    tx.commit().await?;

    Ok(ApiJson(RoundResponse::from_round(
        round,
        OffsetDateTime::now_utc(),
    )))
}

/// Delete a round nobody has played
#[delete("/{tournament}/rounds/{round}")]
pub async fn delete_tournament_round(
    account: Account,
    Path((tournament_uuid, round_uuid)): Path<(TournamentUuid, TournamentRoundUuid)>,
) -> ApiResult<ApiJson<()>, RoundLifecycleErrors> {
    let mut tx = Database::global().start_transaction().await?;

    match round::delete(&mut tx, account.uuid, tournament_uuid, round_uuid).await? {
        TournamentAccess::Granted(RoundChange::Changed(_) | RoundChange::NotEditable) => {}
        TournamentAccess::Granted(RoundChange::Outstanding(_)) => {
            let mut errors = FormErrors::<RoundLifecycleErrors>::new();
            errors.not_editable = true;
            return errors.fail();
        }
        TournamentAccess::Denied => return Err(denied()),
    }

    tx.commit().await?;

    Ok(ApiJson(()))
}

/// Start, pause, adjust or reset a round's clock
#[put("/{tournament}/rounds/{round}/timer")]
pub async fn set_tournament_round_timer(
    account: Account,
    Path((tournament_uuid, round_uuid)): Path<(TournamentUuid, TournamentRoundUuid)>,
    ApiJson(SetTimerRequest { action, seconds }): ApiJson<SetTimerRequest>,
) -> ApiResult<ApiJson<RoundResponse>, RoundLifecycleErrors> {
    let action = match action {
        TimerActionRequest::Start => TimerAction::Start,
        TimerActionRequest::Pause => TimerAction::Pause,
        TimerActionRequest::Resume => TimerAction::Resume,
        TimerActionRequest::Adjust => TimerAction::Adjust {
            delta_seconds: seconds.unwrap_or_default(),
        },
        TimerActionRequest::Reset => TimerAction::Reset {
            length_seconds: seconds.unwrap_or_default(),
        },
    };

    let mut tx = Database::global().start_transaction().await?;

    let change =
        match round::set_timer(&mut tx, account.uuid, tournament_uuid, round_uuid, action).await? {
            TournamentAccess::Granted(change) => change,
            TournamentAccess::Denied => return Err(denied()),
        };
    let round = round_or_refusal(change)?;

    tx.commit().await?;

    Ok(ApiJson(RoundResponse::from_round(
        round,
        OffsetDateTime::now_utc(),
    )))
}

/// Unwrap a lifecycle outcome, turning a refusal into its typed error
///
/// @param change what the model answered
///
/// @returns the round, or the refusal to return
fn round_or_refusal(change: RoundChange) -> ApiResult<Round, RoundLifecycleErrors> {
    match change {
        RoundChange::Changed(round) => Ok(round),
        RoundChange::NotEditable | RoundChange::Outstanding(_) => {
            let mut errors = FormErrors::<RoundLifecycleErrors>::new();
            errors.not_editable = true;
            errors.fail()
        }
    }
}

/// A short digest of everything a polling client would re-render for
///
/// Changes exactly when one of those things changes and never otherwise, so a
/// client can skip the expensive reads on an unchanged revision. Hex rather
/// than a number for the reason [`TournamentStateResponse::revision`] gives.
///
/// @param tournament the event
/// @param round the round the room is on
/// @param outstanding how many tables have no confirmed result
///
/// @returns the digest
fn state_revision(tournament: &Tournament, round: Option<&Round>, outstanding: i64) -> MaxStr<32> {
    let mut hasher = DefaultHasher::new();
    format!("{:?}", tournament.status).hash(&mut hasher);
    tournament.planned_rounds.hash(&mut hasher);
    if let Some(round) = round {
        round.uuid.into_inner().hash(&mut hasher);
        format!("{:?}", round.status).hash(&mut hasher);
        round
            .timer_ends_at
            .map(|at| at.unix_timestamp())
            .hash(&mut hasher);
        round
            .timer_paused_at
            .map(|at| at.unix_timestamp())
            .hash(&mut hasher);
    }
    outstanding.hash(&mut hasher);
    MaxStr::new(format!("{:016x}", hasher.finish()))
        .unwrap_or_else(|_| unreachable!("sixteen hex digits fit in thirty-two characters"))
}

/// Every table of one round
///
/// In the actor block beside the round list: a player's own table is the single
/// thing their phone is open for, and an auth layer here would lock out every
/// guest in the room.
#[get("/{tournament}/rounds/{round}/tables")]
pub async fn list_round_tables(
    actor: TournamentActor,
    Path((tournament_uuid, round_uuid)): Path<(TournamentUuid, TournamentRoundUuid)>,
) -> ApiResult<ApiJson<ListTablesResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    if Tournament::get_for_viewer(&mut tx, &actor, tournament_uuid)
        .await?
        .is_none()
    {
        return Err(denied());
    }

    let tables = pairing::tables(&mut tx, tournament_uuid, round_uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(ListTablesResponse {
        tables: tables.into_iter().map(MatchTableResponse::from).collect(),
    }))
}

/// Pair a round, replacing whatever it already held
///
/// One endpoint for both the first pairing and every re-pair after it. There is
/// no preview to commit: the race a staged pairing would guard is better served
/// by pressing this again, and writing straight through survives a crashed tab
/// and a locked phone, which a staged one does not.
#[post("/{tournament}/rounds/{round}/pairings")]
pub async fn pair_tournament_round(
    account: Account,
    Path((tournament_uuid, round_uuid)): Path<(TournamentUuid, TournamentRoundUuid)>,
) -> ApiResult<ApiJson<PairRoundResponse>, PairRoundErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let outcome = match pairing::pair(&mut tx, account.uuid, tournament_uuid, round_uuid).await? {
        TournamentAccess::Granted(outcome) => outcome,
        TournamentAccess::Denied => return Err(denied()),
    };
    let (tables, warnings) = match outcome {
        PairOutcome::Paired { tables, warnings } => (tables, warnings),
        PairOutcome::NotPairable => {
            let mut errors = FormErrors::<PairRoundErrors>::new();
            errors.not_pairable = true;
            return errors.fail();
        }
        PairOutcome::ResultsReported => {
            let mut errors = FormErrors::<PairRoundErrors>::new();
            errors.results_reported = true;
            return errors.fail();
        }
        PairOutcome::NoEntrants => {
            let mut errors = FormErrors::<PairRoundErrors>::new();
            errors.no_entrants = true;
            return errors.fail();
        }
        PairOutcome::ImpossiblePods => {
            let mut errors = FormErrors::<PairRoundErrors>::new();
            errors.impossible_pods = true;
            return errors.fail();
        }
    };

    tx.commit().await?;

    Ok(ApiJson(PairRoundResponse {
        tables: tables.into_iter().map(MatchTableResponse::from).collect(),
        fixed_table_conflicts: warnings
            .into_iter()
            .map(|pin| FixedTableConflict {
                table_number: pin.table_number,
                participant: pin.participant,
            })
            .collect(),
    }))
}

/// Report what happened at your own table
///
/// In the actor block, because the people this exists for are the ones playing
/// — a guest's phone included. The guard behind it asks whether the caller is
/// *sitting at this table* before it asks whether they run the event, so an
/// organizer who is also playing reports like everybody else rather than
/// silently confirming their own match.
#[post("/{tournament}/matches/{match}/report")]
pub async fn report_match_result(
    actor: TournamentActor,
    Path((tournament_uuid, match_uuid)): Path<(TournamentUuid, TournamentMatchUuid)>,
    ApiJson(request): ApiJson<ReportResultRequest>,
) -> ApiResult<ApiJson<MatchTableResponse>, ReportResultErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let claim = ReportClaim {
        winner: request.winner,
        draw: request.draw,
        winner_games: request.winner_games,
        loser_games: request.loser_games,
        games_drawn: request.games_drawn,
        client_key: request.client_key,
    };
    let outcome =
        match reporting::report(&mut tx, &actor, tournament_uuid, match_uuid, claim).await? {
            TournamentAccess::Granted(outcome) => outcome,
            TournamentAccess::Denied => return Err(denied()),
        };
    match outcome {
        ReportOutcome::Recorded(_) => {}
        ReportOutcome::NotSeated => {
            let mut errors = FormErrors::<ReportResultErrors>::new();
            errors.not_seated = true;
            return errors.fail();
        }
        ReportOutcome::RoundClosed => {
            let mut errors = FormErrors::<ReportResultErrors>::new();
            errors.round_closed = true;
            return errors.fail();
        }
        ReportOutcome::InvalidOutcome => {
            let mut errors = FormErrors::<ReportResultErrors>::new();
            errors.invalid_outcome = true;
            return errors.fail();
        }
    }

    let Some(table) = pairing::one_table(&mut tx, tournament_uuid, match_uuid).await? else {
        return Err(denied());
    };

    tx.commit().await?;

    Ok(ApiJson(MatchTableResponse::from(table)))
}

/// Write a table's result from the desk
///
/// Beats every player report on that table and skips the confirmation dance
/// entirely: the desk is authoritative, and the two-sided flow exists to save an
/// organizer walking to the table, not to constrain them once they have.
#[put("/{tournament}/matches/{match}/result")]
pub async fn set_match_result(
    account: Account,
    Path((tournament_uuid, match_uuid)): Path<(TournamentUuid, TournamentMatchUuid)>,
    ApiJson(request): ApiJson<SetResultRequest>,
) -> ApiResult<ApiJson<MatchTableResponse>, SetResultErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let claim = ReportClaim {
        winner: request.winner,
        draw: request.draw,
        winner_games: request.winner_games,
        loser_games: request.loser_games,
        games_drawn: request.games_drawn,
        // The desk's own write is not a report and never lands in a report row,
        // so it has no tap to be idempotent about.
        client_key: MaxStr::new(String::new())
            .unwrap_or_else(|_| unreachable!("the empty string fits in sixty-four characters")),
    };
    let change =
        match reporting::set_result(&mut tx, account.uuid, tournament_uuid, match_uuid, claim)
            .await?
        {
            TournamentAccess::Granted(change) => change,
            TournamentAccess::Denied => return Err(denied()),
        };
    result_or_refusal(change)?;

    let Some(table) = pairing::one_table(&mut tx, tournament_uuid, match_uuid).await? else {
        return Err(denied());
    };

    tx.commit().await?;

    Ok(ApiJson(MatchTableResponse::from(table)))
}

/// Take the desk's result back off a table
///
/// Drops to whatever the players had agreed rather than to nothing, which is the
/// undo for a mistyped result.
#[delete("/{tournament}/matches/{match}/result")]
pub async fn clear_match_result(
    account: Account,
    Path((tournament_uuid, match_uuid)): Path<(TournamentUuid, TournamentMatchUuid)>,
) -> ApiResult<ApiJson<MatchTableResponse>, SetResultErrors> {
    let mut tx = Database::global().start_transaction().await?;

    let change =
        match reporting::clear_result(&mut tx, account.uuid, tournament_uuid, match_uuid).await? {
            TournamentAccess::Granted(change) => change,
            TournamentAccess::Denied => return Err(denied()),
        };
    result_or_refusal(change)?;

    let Some(table) = pairing::one_table(&mut tx, tournament_uuid, match_uuid).await? else {
        return Err(denied());
    };

    tx.commit().await?;

    Ok(ApiJson(MatchTableResponse::from(table)))
}

/// Turn a refusal from the desk's own result calls into its typed error
///
/// @param change what the model layer answered
///
/// @returns nothing when the write went through
fn result_or_refusal(change: ResultChange) -> ApiResult<(), SetResultErrors> {
    match change {
        ResultChange::Changed(_) => Ok(()),
        ResultChange::NotEditable => {
            let mut errors = FormErrors::<SetResultErrors>::new();
            errors.not_editable = true;
            errors.fail()
        }
        ResultChange::InvalidOutcome => {
            let mut errors = FormErrors::<SetResultErrors>::new();
            errors.invalid_outcome = true;
            errors.fail()
        }
    }
}

/// Where everybody stands
///
/// In the actor block: the standings are the thing a player refreshes between
/// rounds, and a guest's phone is exactly the device doing it. Whose rows come
/// back is the same decision the roster goes through, so a guest who appears as
/// "Gast 7" on one screen is "Gast 7" on the other.
#[get("/{tournament}/standings")]
pub async fn get_tournament_standings(
    actor: TournamentActor,
    Path(tournament_uuid): Path<TournamentUuid>,
) -> ApiResult<ApiJson<StandingsResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(with_viewer) = Tournament::get_for_viewer(&mut tx, &actor, tournament_uuid).await?
    else {
        return Err(denied());
    };

    let roster = participant::list(&mut tx, tournament_uuid).await?;
    let view = public::roster_view(
        &with_viewer.tournament,
        with_viewer.role.is_some(),
        with_viewer.participant.is_some(),
    );
    // The names the viewer may see, pseudonymised by the one decision that owns
    // it. Rows the view drops are dropped here too, but every row was *computed*
    // over the whole field — an opponent percentage built from a redacted roster
    // would simply be wrong.
    let visible: HashMap<_, _> = public::apply_roster_view(view, with_viewer.participant, roster)
        .into_iter()
        .map(|participant| (participant.uuid, participant.display_name))
        .collect();

    let rows = standings::table(&mut tx, &with_viewer.tournament).await?;
    let round = round::current(&mut tx, tournament_uuid).await?;
    let outstanding = match &round {
        Some(round) => round::outstanding_tables(&mut tx, round.uuid).await?.len() as i64,
        None => 0,
    };

    tx.commit().await?;

    Ok(ApiJson(StandingsResponse {
        standings: rows
            .into_iter()
            .filter_map(|row| {
                let display_name = visible.get(&row.participant)?.clone();
                Some(StandingResponse {
                    participant: row.participant,
                    display_name,
                    place: row.standing.place as i64,
                    order: row.standing.order as i64,
                    dropped: row.dropped,
                    match_points: row.standing.match_points,
                    wins: row.standing.wins,
                    losses: row.standing.losses,
                    draws: row.standing.draws,
                    byes: row.standing.byes,
                    match_win: row.standing.match_win,
                    opponent_match_win: row.standing.opponent_match_win,
                    game_win: row.standing.game_win,
                    opponent_game_win: row.standing.opponent_game_win,
                    opponents_average_points: row.standing.opponents_average_points,
                })
            })
            .collect(),
        tiebreakers: crate::tournament::standings::tiebreakers(
            usize::try_from(with_viewer.tournament.pod_size).unwrap_or(2),
        )
        .into_iter()
        .map(TiebreakerResponse::from)
        .collect(),
        outstanding_tables: outstanding,
    }))
}

/// Look accounts up by username, to seat a player whose phone is dead
///
/// Organizer-only and tournament-scoped: the guard is the role on this event,
/// and the answer says which hits are already on this roster so the dialog can
/// grey them out. A blank needle answers nothing rather than the whole table.
#[get("/{tournament}/player-search")]
pub async fn search_tournament_players(
    account: Account,
    Path(tournament_uuid): Path<TournamentUuid>,
    Query(SearchPlayersRequest { q }): Query<SearchPlayersRequest>,
) -> ApiResult<ApiJson<SearchPlayersResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(_) = Tournament::get_as_organizer(&mut tx, account.uuid, tournament_uuid)
        .await?
        .granted()
    else {
        return Err(denied());
    };

    let found = Account::search_by_username(&mut tx, &q, PLAYER_SEARCH_LIMIT).await?;
    let seated = participant::accounts_on_roster(&mut tx, tournament_uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(SearchPlayersResponse {
        accounts: found
            .into_iter()
            .map(|found| PlayerSearchResultResponse {
                on_roster: seated.contains(&found.uuid),
                uuid: found.uuid,
                username: MaxStr::new(found.username.as_str().to_owned())
                    .unwrap_or_else(|_| unreachable!("a username is at most 32 characters")),
            })
            .collect(),
    }))
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

/// The caller's own venue book, most recently used first
///
/// Note: `/venues` is a static path segment while `/{tournament}` is a
/// dynamic one, so axum's router already prefers the static match here —
/// nothing to arrange, just worth being aware of on a route table shaped
/// like this one.
#[get("/venues")]
pub async fn list_tournament_venues(
    account: Account,
) -> ApiResult<ApiJson<ListTournamentVenuesResponse>> {
    let mut tx = Database::global().start_transaction().await?;

    let venues = venue::list_for_account(&mut tx, account.uuid).await?;

    tx.commit().await?;

    Ok(ApiJson(ListTournamentVenuesResponse {
        venues: venues
            .into_iter()
            .map(TournamentVenueResponse::from)
            .collect(),
    }))
}

/// Drop one entry from the caller's own venue book
#[delete("/venues/{venue}")]
pub async fn delete_tournament_venue(
    account: Account,
    Path(venue_uuid): Path<TournamentVenueUuid>,
) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;

    if !venue::forget(&mut tx, account.uuid, venue_uuid).await? {
        return Err(denied());
    }

    tx.commit().await?;

    Ok(ApiJson(()))
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

    if settings.max_participants.is_some_and(|max| max < 1) {
        errors.invalid_max_participants = true;
    }

    if settings.planned_rounds.is_some_and(|rounds| rounds < 1) {
        errors.invalid_planned_rounds = true;
    }

    if !format::is_tournament_format(&settings.format) {
        errors.invalid_format = true;
    }
}

/// Whether `venue` names an actual place — blank or `None` both read as "no venue"
fn has_venue(venue: &Option<MaxStr<255>>) -> bool {
    venue
        .as_deref()
        .is_some_and(|venue| !venue.trim().is_empty())
}

/// Blank `address`/`instructions` when `venue` does not name an actual place
///
/// An address with no place attached is not something any surface can
/// render — shared by [`insert_from_settings`] and [`update_from_settings`]
/// so the rule cannot drift between create and update.
fn venue_pair(
    venue: &Option<MaxStr<255>>,
    address: Option<MaxStr<512>>,
    instructions: Option<MaxStr<1024>>,
) -> (Option<MaxStr<512>>, Option<MaxStr<1024>>) {
    if has_venue(venue) {
        (address, instructions)
    } else {
        (None, None)
    }
}

/// Trim a venue line, and read a blank one as no venue at all
///
/// Every surface tests a venue for emptiness rather than for `None`, so a
/// stored `"   "` would draw a venue heading with nothing under it — and
/// [`venue_pair`] has already thrown its address away by then.
fn venue_name(venue: Option<MaxStr<255>>) -> Option<MaxStr<255>> {
    let venue = venue?;
    let trimmed = venue.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.len() == venue.len() {
        return Some(venue);
    }
    Some(
        MaxStr::new(trimmed.to_owned())
            .unwrap_or_else(|_| unreachable!("trimming a MaxStr<255> keeps it under the bound")),
    )
}

/// Write a non-blank venue into the caller's own venue book, once the
/// tournament write that named it has gone through
///
/// A no-op for a blank/`None` venue. The book's name column carries the same
/// [`MaxStr<255>`] bound as a tournament's own venue line, so a name that got
/// this far always fits and nothing is truncated.
async fn remember_venue(
    tx: &mut Transaction,
    account: AccountUuid,
    venue: &Option<MaxStr<255>>,
    address: &Option<MaxStr<512>>,
    instructions: &Option<MaxStr<1024>>,
) -> Result<(), rorm::Error> {
    let Some(name) = venue
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
    else {
        return Ok(());
    };
    let name = MaxStr::new(name.to_owned())
        .unwrap_or_else(|_| unreachable!("trimming a MaxStr<255> keeps it under the bound"));
    venue::remember(tx, account, &name, address.as_ref(), instructions.as_ref()).await
}

/// Build a [`TournamentInsert`] from a validated [`TournamentSettingsRequest`] plus the
/// visibility [`create_tournament`] takes alongside it
fn insert_from_settings(
    settings: TournamentSettingsRequest,
    visibility: Visibility,
) -> TournamentInsert {
    let (venue_address, venue_instructions) = venue_pair(
        &settings.venue,
        settings.venue_address,
        settings.venue_instructions,
    );
    TournamentInsert {
        name: settings.name,
        description: settings.description,
        format: settings.format,
        pod_size: settings.pod_size,
        games_per_match: settings.games_per_match,
        pairing_system: settings.pairing_system,
        points_win: settings.points_win,
        points_draw: settings.points_draw,
        points_loss: settings.points_loss,
        points_bye: settings.points_bye,
        round_minutes: settings.round_minutes,
        max_participants: settings.max_participants,
        planned_rounds: settings.planned_rounds,
        allow_late_entry: settings.allow_late_entry,
        late_entry_as_losses: settings.late_entry_as_losses,
        decklist_policy: settings.decklist_policy,
        participant_audience: settings.participant_audience,
        guest_names_public: settings.guest_names_public,
        visibility,
        venue: venue_name(settings.venue),
        venue_address,
        venue_instructions,
        starts_at: settings.starts_at.map(|starts_at| starts_at.0),
    }
}

/// Build a [`TournamentUpdate`] from a validated [`TournamentSettingsRequest`]
fn update_from_settings(settings: TournamentSettingsRequest) -> TournamentUpdate {
    let (venue_address, venue_instructions) = venue_pair(
        &settings.venue,
        settings.venue_address,
        settings.venue_instructions,
    );
    TournamentUpdate {
        name: settings.name,
        description: settings.description,
        venue: venue_name(settings.venue),
        venue_address,
        venue_instructions,
        starts_at: settings.starts_at.map(|starts_at| starts_at.0),
        round_minutes: settings.round_minutes,
        max_participants: settings.max_participants,
        format: settings.format,
        pod_size: settings.pod_size,
        games_per_match: settings.games_per_match,
        pairing_system: settings.pairing_system,
        points_win: settings.points_win,
        points_draw: settings.points_draw,
        points_loss: settings.points_loss,
        points_bye: settings.points_bye,
        planned_rounds: settings.planned_rounds,
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
