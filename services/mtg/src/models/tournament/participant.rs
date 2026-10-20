//! Participants: the people playing in a tournament, guests included

use std::collections::HashSet;

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use rand::RngExt;
use rand::distr::Alphanumeric;
use rand::distr::SampleString;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::tournament::AuditAction;
use crate::models::tournament::DecklistPolicy;
use crate::models::tournament::ParticipantStatus;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentAccess;
use crate::models::tournament::TournamentActor;
use crate::models::tournament::TournamentParticipantUuid;
use crate::models::tournament::TournamentStatus;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::db::TournamentModel;
use crate::models::tournament::db::TournamentParticipantInsertPatch;
use crate::models::tournament::db::TournamentParticipantModel;
use crate::models::tournament::decklist;
use crate::models::tournament::decklist::SelfServe;
use crate::models::tournament::is_unique_violation;

/// Somebody playing in a tournament; deliberately never carries the claim token
#[derive(Debug, Clone)]
pub struct TournamentParticipant {
    /// Primary key
    pub uuid: TournamentParticipantUuid,
    /// The tournament being played in
    pub tournament: TournamentUuid,
    /// The account behind the player, `None` for a guest
    pub account: Option<AccountUuid>,
    /// Whether this row has no account behind it yet
    pub is_guest: bool,
    /// The name the player appears under
    pub display_name: MaxStr<64>,
    /// [`Self::display_name`] lowercased, the league resolver's lookup key
    pub name_normalized: MaxStr<64>,
    /// Where the player stands in the event
    pub status: ParticipantStatus,
    /// The first round the player was part of
    pub entered_round: i16,
    /// The last round the player was paired into, `None` while active
    pub dropped_after_round: Option<i16>,
    /// Random tiebreak seed, minted at registration
    pub seed: i32,
    /// The organizer's manual tiebreak value, zero unless touched
    pub manual_tiebreak: i32,
    /// When the player checked in, `None` until they did
    pub checked_in_at: Option<OffsetDateTime>,
    /// Organizer-only notes on the player
    pub notes: Option<MaxStr<512>>,
    /// The point in time the player registered
    pub registered_at: OffsetDateTime,
    /// The table they never leave, e.g. for a wheelchair
    pub fixed_table: Option<i16>,
}

/// Outcome of [`register_account`] and [`register_guest`]
#[derive(Debug, Clone)]
pub enum RegistrationOutcome {
    /// A row was written, with the guest's one-time claim token (`None` for an account)
    Registered(TournamentParticipant, Option<MaxStr<64>>),
    /// Registration is not open right now; nothing was written
    Closed,
    /// This account already has a row in this tournament; nothing was written
    AlreadyRegistered,
    /// Every seat the event offers is taken; nothing was written
    Full,
}

/// Outcome of [`claim`]
#[derive(Debug, Clone)]
pub enum ClaimOutcome {
    /// The row now belongs to `account`
    Claimed(TournamentParticipant),
    /// No unclaimed row carries this token
    InvalidToken,
    /// This account already has a row in that guest row's tournament
    AlreadyRegistered,
}

/// Mint a fresh guest claim token
///
/// Same minting as [`crate::models::account::RegistrationToken::create`]: 43
/// alphanumeric characters, which cannot overflow the 64-character column, so
/// the fallible constructor can never actually fail.
fn generate_claim_token() -> MaxStr<64> {
    MaxStr::new(Alphanumeric.sample_string(&mut rand::rng(), 43))
        .unwrap_or_else(|_| unreachable!("43 alphanumeric chars fit into 64"))
}

/// Lowercase, trim and collapse a name into the lookup key, word by word to stay in 64 bytes
fn normalize_name(name: &str) -> MaxStr<64> {
    let mut normalized = String::with_capacity(name.len());
    for word in name.split_whitespace() {
        let word = word.to_lowercase();
        let extra = if normalized.is_empty() { 0 } else { 1 };
        if normalized.len() + extra + word.len() > 64 {
            break;
        }
        if !normalized.is_empty() {
            normalized.push(' ');
        }
        normalized.push_str(&word);
    }
    MaxStr::new(normalized)
        .unwrap_or_else(|_| unreachable!("kept under the maximum length by construction"))
}

/// How many seats the roster occupies; dropped and disqualified players free theirs
async fn seats_taken(tx: &mut Transaction, tournament: &Tournament) -> Result<i64, rorm::Error> {
    let rows = rorm::query(&mut *tx, TournamentParticipantModel.status)
        .condition(
            TournamentParticipantModel
                .tournament
                .equals(tournament.uuid.into_inner()),
        )
        .all()
        .await?;
    Ok(rows
        .into_iter()
        .filter(|status| {
            matches!(
                status,
                ParticipantStatus::Registered | ParticipantStatus::CheckedIn
            )
        })
        .count() as i64)
}

/// Whether one more self-service registration fits; the desk may seat past the limit
async fn has_room(tx: &mut Transaction, tournament: &Tournament) -> Result<bool, rorm::Error> {
    let Some(max) = tournament.max_participants else {
        return Ok(true);
    };
    Ok(seats_taken(&mut *tx, tournament).await? < i64::from(max))
}

/// Whether a player may register themselves right now
fn registration_open(tournament: &Tournament) -> bool {
    matches!(tournament.status, TournamentStatus::Registration)
        || (tournament.status == TournamentStatus::Running && tournament.allow_late_entry)
}

/// Register an account; `added_by` is the organizer when added at the desk
#[instrument(name = "register_account", skip(tx, tournament))]
pub async fn register_account(
    tx: &mut Transaction,
    tournament: &Tournament,
    account: AccountUuid,
    display_name: MaxStr<64>,
    added_by: Option<AccountUuid>,
) -> Result<RegistrationOutcome, rorm::Error> {
    let by_organizer = added_by.is_some();
    let open = registration_open(tournament)
        || (by_organizer && tournament.status == TournamentStatus::Running);
    if !open {
        return Ok(RegistrationOutcome::Closed);
    }
    if !by_organizer && !has_room(&mut *tx, tournament).await? {
        return Ok(RegistrationOutcome::Full);
    }

    // Late entries start after the last closed round; earlier ones count as losses (MTR).
    let entered_round = super::round::scored_progress(&mut *tx, tournament.uuid)
        .await?
        .completed
        + 1;

    let name_normalized = normalize_name(&display_name);
    // The desk adding somebody is their check-in, so walk-ins skip the queue.
    let (status, checked_in_at) = if added_by.is_some() {
        (
            ParticipantStatus::CheckedIn,
            Some(OffsetDateTime::now_utc()),
        )
    } else {
        (ParticipantStatus::Registered, None)
    };
    // Bound to a `let`: a `ThreadRng` temporary spanning the `.await` makes the future `!Send`.
    let seed = rand::rng().random();
    let result = rorm::insert(&mut *tx, TournamentParticipantModel)
        .single(&TournamentParticipantInsertPatch {
            uuid: Uuid::now_v7(),
            tournament: ForeignModelByField(tournament.uuid.into_inner()),
            account: Some(ForeignModelByField(account.into_inner())),
            display_name,
            name_normalized,
            status,
            entered_round,
            seed,
            checked_in_at,
            claim_token: None,
        })
        .await;

    // The partial unique index decides `AlreadyRegistered`; Postgres has aborted the tx then.
    let model = match result {
        Ok(model) => model,
        Err(error) if is_unique_violation(&error) => {
            return Ok(RegistrationOutcome::AlreadyRegistered);
        }
        Err(error) => return Err(error),
    };
    let participant = TournamentParticipant::from(model);

    Tournament::audit(
        &mut *tx,
        tournament.uuid,
        Some(added_by.unwrap_or(account)),
        AuditAction::ParticipantAdded,
        Some(participant.uuid.into_inner()),
        None,
    )
    .await?;

    Ok(RegistrationOutcome::Registered(participant, None))
}

/// Register a guest: a walk-in typed in by an organizer, or a phone that joined by code
#[instrument(name = "register_guest", skip(tx, tournament))]
pub async fn register_guest(
    tx: &mut Transaction,
    tournament: &Tournament,
    display_name: MaxStr<64>,
    added_by: Option<AccountUuid>,
) -> Result<RegistrationOutcome, rorm::Error> {
    let open = registration_open(tournament)
        || (added_by.is_some() && tournament.status == TournamentStatus::Running);
    if !open {
        return Ok(RegistrationOutcome::Closed);
    }
    if added_by.is_none() && !has_room(&mut *tx, tournament).await? {
        return Ok(RegistrationOutcome::Full);
    }

    let claim_token = generate_claim_token();
    // Late entries start after the last closed round; earlier ones count as losses (MTR).
    let entered_round = super::round::scored_progress(&mut *tx, tournament.uuid)
        .await?
        .completed
        + 1;

    let name_normalized = normalize_name(&display_name);
    // The desk adding somebody is their check-in, so walk-ins skip the queue.
    let (status, checked_in_at) = if added_by.is_some() {
        (
            ParticipantStatus::CheckedIn,
            Some(OffsetDateTime::now_utc()),
        )
    } else {
        (ParticipantStatus::Registered, None)
    };
    // Bound to a `let`: a `ThreadRng` temporary spanning the `.await` makes the future `!Send`.
    let seed = rand::rng().random();
    let model = rorm::insert(&mut *tx, TournamentParticipantModel)
        .single(&TournamentParticipantInsertPatch {
            uuid: Uuid::now_v7(),
            tournament: ForeignModelByField(tournament.uuid.into_inner()),
            account: None,
            display_name,
            name_normalized,
            status,
            entered_round,
            seed,
            checked_in_at,
            claim_token: Some(claim_token.clone()),
        })
        .await?;
    let participant = TournamentParticipant::from(model);

    Tournament::audit(
        &mut *tx,
        tournament.uuid,
        added_by,
        AuditAction::ParticipantAdded,
        Some(participant.uuid.into_inner()),
        None,
    )
    .await?;

    Ok(RegistrationOutcome::Registered(
        participant,
        Some(claim_token),
    ))
}

/// Attach an account to a guest row using its claim token
#[instrument(name = "claim", skip(tx, claim_token))]
pub async fn claim(
    tx: &mut Transaction,
    account: AccountUuid,
    claim_token: &str,
) -> Result<ClaimOutcome, rorm::Error> {
    let Some(row) = rorm::query(&mut *tx, TournamentParticipantModel)
        .condition(
            TournamentParticipantModel
                .claim_token
                .equals(Some(claim_token)),
        )
        .optional()
        .await?
    else {
        return Ok(ClaimOutcome::InvalidToken);
    };

    let result = rorm::update(&mut *tx, TournamentParticipantModel)
        .set(
            TournamentParticipantModel.account,
            Some(ForeignModelByField(account.into_inner())),
        )
        .set(TournamentParticipantModel.claim_token, None)
        .condition(rorm::and![
            TournamentParticipantModel.uuid.equals(row.uuid),
            TournamentParticipantModel
                .claim_token
                .equals(Some(claim_token)),
        ])
        .await;

    let affected = match result {
        Ok(affected) => affected,
        Err(error) if is_unique_violation(&error) => return Ok(ClaimOutcome::AlreadyRegistered),
        Err(error) => return Err(error),
    };
    if affected == 0 {
        // Lost the race: the token was claimed between the lookup and the update.
        return Ok(ClaimOutcome::InvalidToken);
    }

    let updated = rorm::query(&mut *tx, TournamentParticipantModel)
        .condition(TournamentParticipantModel.uuid.equals(row.uuid))
        .optional()
        .await?
        .unwrap_or_else(|| unreachable!("the row this function just updated must still exist"));
    let tournament = TournamentUuid::new_from_field(updated.tournament);
    let participant = TournamentParticipant::from(updated);

    Tournament::audit(
        &mut *tx,
        tournament,
        Some(account),
        AuditAction::ParticipantClaimed,
        Some(participant.uuid.into_inner()),
        None,
    )
    .await?;

    Ok(ClaimOutcome::Claimed(participant))
}

/// Hand a guest row's live claim token to staff (any role), e.g. to show as a QR code
#[instrument(name = "claim_token", skip(tx))]
pub async fn claim_token(
    tx: &mut Transaction,
    account: AccountUuid,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
) -> Result<TournamentAccess<Option<MaxStr<64>>>, rorm::Error> {
    if Tournament::role_of(&mut *tx, tournament, account)
        .await?
        .is_none()
    {
        return Ok(TournamentAccess::Denied);
    }

    let Some(claim_token) = rorm::query(&mut *tx, TournamentParticipantModel.claim_token)
        .condition(rorm::and![
            TournamentParticipantModel
                .uuid
                .equals(participant.into_inner()),
            TournamentParticipantModel
                .tournament
                .equals(tournament.into_inner()),
        ])
        .optional()
        .await?
    else {
        return Ok(TournamentAccess::Denied);
    };

    if claim_token.is_some() {
        Tournament::audit(
            &mut *tx,
            tournament,
            Some(account),
            AuditAction::ClaimTokenIssued,
            Some(participant.into_inner()),
            None,
        )
        .await?;
    }

    Ok(TournamentAccess::Granted(claim_token))
}

/// What a claim token names, for the screen a scanned QR lands on
#[derive(Debug, Clone)]
pub struct ClaimTarget {
    /// The tournament the row belongs to
    pub tournament: TournamentUuid,
    /// The participant row the token names
    pub participant: TournamentParticipantUuid,
    /// The tournament's name, to greet the player with
    pub tournament_name: MaxStr<128>,
    /// The row's current display name
    pub display_name: MaxStr<64>,
}

/// Look up a live claim token without acting on it
#[instrument(name = "look_up_claim_token", skip(tx, claim_token))]
pub async fn look_up_claim_token(
    tx: &mut Transaction,
    claim_token: &str,
) -> Result<Option<ClaimTarget>, rorm::Error> {
    resolve_claim_token(&mut *tx, claim_token).await
}

/// Re-attach a guest session to its row; unlike [`claim`], the token stays live
#[instrument(name = "reattach", skip(tx, claim_token))]
pub async fn reattach(
    tx: &mut Transaction,
    claim_token: &str,
) -> Result<Option<ClaimTarget>, rorm::Error> {
    let Some(target) = resolve_claim_token(&mut *tx, claim_token).await? else {
        return Ok(None);
    };

    Tournament::audit(
        &mut *tx,
        target.tournament,
        None,
        AuditAction::ParticipantReattached,
        Some(target.participant.into_inner()),
        None,
    )
    .await?;

    Ok(Some(target))
}

/// The lookup [`look_up_claim_token`] and [`reattach`] share
async fn resolve_claim_token(
    tx: &mut Transaction,
    claim_token: &str,
) -> Result<Option<ClaimTarget>, rorm::Error> {
    let Some((participant, tournament, display_name)) = rorm::query(
        &mut *tx,
        (
            TournamentParticipantModel.uuid,
            TournamentParticipantModel.tournament,
            TournamentParticipantModel.display_name,
        ),
    )
    .condition(
        TournamentParticipantModel
            .claim_token
            .equals(Some(claim_token)),
    )
    .optional()
    .await?
    else {
        return Ok(None);
    };
    let participant = TournamentParticipantUuid::from_uuid(participant);
    let tournament = TournamentUuid::new_from_field(tournament);

    let Some(tournament_name) = rorm::query(&mut *tx, TournamentModel.name)
        .condition(TournamentModel.uuid.equals(tournament.into_inner()))
        .optional()
        .await?
    else {
        // The cascade should prevent this; read it as "no such token" rather than panic.
        return Ok(None);
    };

    Ok(Some(ClaimTarget {
        tournament,
        participant,
        tournament_name,
        display_name,
    }))
}

/// Every participant of a tournament, oldest registration first (unguarded)
#[instrument(name = "list", skip(tx))]
pub async fn list(
    tx: &mut Transaction,
    tournament: TournamentUuid,
) -> Result<Vec<TournamentParticipant>, rorm::Error> {
    let rows = rorm::query(&mut *tx, TournamentParticipantModel)
        .condition(
            TournamentParticipantModel
                .tournament
                .equals(tournament.into_inner()),
        )
        .order_asc(TournamentParticipantModel.registered_at)
        .all()
        .await?;
    Ok(rows.into_iter().map(TournamentParticipant::from).collect())
}

/// Change a participant's display name and/or notes; any role may, scorekeepers included
#[instrument(name = "update", skip(tx, display_name, notes))]
pub async fn update(
    tx: &mut Transaction,
    organizer_account: AccountUuid,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
    display_name: Option<MaxStr<64>>,
    notes: Option<Option<MaxStr<512>>>,
) -> Result<TournamentAccess<()>, rorm::Error> {
    if Tournament::role_of(&mut *tx, tournament, organizer_account)
        .await?
        .is_none()
    {
        return Ok(TournamentAccess::Denied);
    }

    let name_normalized = display_name.as_deref().map(normalize_name);
    let builder = rorm::update(&mut *tx, TournamentParticipantModel)
        .begin_dyn_set()
        .set_if(TournamentParticipantModel.display_name, display_name)
        .set_if(TournamentParticipantModel.name_normalized, name_normalized)
        .set_if(TournamentParticipantModel.notes, notes);

    let affected = match builder.finish_dyn_set() {
        Ok(builder) => {
            builder
                .condition(rorm::and![
                    TournamentParticipantModel
                        .uuid
                        .equals(participant.into_inner()),
                    TournamentParticipantModel
                        .tournament
                        .equals(tournament.into_inner()),
                ])
                .await?
        }
        // Nothing to change: still confirm the row belongs to this tournament.
        Err(_) => u64::from(
            rorm::query(&mut *tx, TournamentParticipantModel.uuid)
                .condition(rorm::and![
                    TournamentParticipantModel
                        .uuid
                        .equals(participant.into_inner()),
                    TournamentParticipantModel
                        .tournament
                        .equals(tournament.into_inner()),
                ])
                .optional()
                .await?
                .is_some(),
        ),
    };
    if affected == 0 {
        return Ok(TournamentAccess::Denied);
    }

    Tournament::audit(
        &mut *tx,
        tournament,
        Some(organizer_account),
        AuditAction::ParticipantUpdated,
        Some(participant.into_inner()),
        None,
    )
    .await?;

    Ok(TournamentAccess::Granted(()))
}

/// Which accounts already hold a row in this tournament, for the player search
#[instrument(name = "accounts_on_roster", skip(tx))]
pub async fn accounts_on_roster(
    tx: &mut Transaction,
    tournament: TournamentUuid,
) -> Result<HashSet<AccountUuid>, rorm::Error> {
    let rows = rorm::query(&mut *tx, TournamentParticipantModel.account)
        .condition(
            TournamentParticipantModel
                .tournament
                .equals(tournament.into_inner()),
        )
        .all()
        .await?;
    Ok(rows
        .into_iter()
        .flatten()
        .map(AccountUuid::new_from_field)
        .collect())
}

/// Whether `actor` may act on `participant` as staff or as that participant themself
pub(super) async fn self_serve(
    tx: &mut Transaction,
    actor: &TournamentActor,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
) -> Result<Option<SelfServe>, rorm::Error> {
    match actor {
        TournamentActor::Account(account) => {
            if Tournament::role_of(&mut *tx, tournament, account.uuid)
                .await?
                .is_some()
            {
                return Ok(Some(SelfServe::Staff));
            }
            let is_self = rorm::query(&mut *tx, TournamentParticipantModel.uuid)
                .condition(rorm::and![
                    TournamentParticipantModel
                        .uuid
                        .equals(participant.into_inner()),
                    TournamentParticipantModel
                        .tournament
                        .equals(tournament.into_inner()),
                    TournamentParticipantModel
                        .account
                        .equals(Some(account.uuid.into_inner())),
                ])
                .optional()
                .await?
                .is_some();
            Ok(is_self.then_some(SelfServe::Own))
        }
        TournamentActor::Guest(participants) => {
            if !participants.contains(&participant) {
                return Ok(None);
            }
            let belongs = rorm::query(&mut *tx, TournamentParticipantModel.uuid)
                .condition(rorm::and![
                    TournamentParticipantModel
                        .uuid
                        .equals(participant.into_inner()),
                    TournamentParticipantModel
                        .tournament
                        .equals(tournament.into_inner()),
                ])
                .optional()
                .await?
                .is_some();
            Ok(belongs.then_some(SelfServe::Own))
        }
    }
}

/// Whether `actor` may drop or otherwise self-serve `participant`
async fn may_self_serve(
    tx: &mut Transaction,
    actor: &TournamentActor,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
) -> Result<bool, rorm::Error> {
    Ok(self_serve(tx, actor, tournament, participant)
        .await?
        .is_some())
}

/// The account behind `actor` for the audit log, `None` for a guest
fn audit_actor(actor: &TournamentActor) -> Option<AccountUuid> {
    match actor {
        TournamentActor::Account(account) => Some(account.uuid),
        TournamentActor::Guest(_) => None,
    }
}

/// Outcome of [`check_in`]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CheckInOutcome {
    /// The player is checked in
    CheckedIn,
    /// [`DecklistPolicy::RequiredToCheckIn`] is set and no decklist is on file
    DecklistMissing,
}

/// Check a participant in; staff only, since presence is observed at the desk
#[instrument(name = "check_in", skip(tx, actor))]
pub async fn check_in(
    tx: &mut Transaction,
    actor: &TournamentActor,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
) -> Result<TournamentAccess<CheckInOutcome>, rorm::Error> {
    if self_serve(&mut *tx, actor, tournament, participant).await? != Some(SelfServe::Staff) {
        return Ok(TournamentAccess::Denied);
    }

    let policy = rorm::query(&mut *tx, TournamentModel.decklist_policy)
        .condition(TournamentModel.uuid.equals(tournament.into_inner()))
        .optional()
        .await?
        .unwrap_or_else(|| unreachable!("self_serve already confirmed this tournament exists"));
    if policy == DecklistPolicy::RequiredToCheckIn
        && !decklist::exists(&mut *tx, participant).await?
    {
        return Ok(TournamentAccess::Granted(CheckInOutcome::DecklistMissing));
    }

    let affected = rorm::update(&mut *tx, TournamentParticipantModel)
        .set(
            TournamentParticipantModel.status,
            ParticipantStatus::CheckedIn,
        )
        .set(
            TournamentParticipantModel.checked_in_at,
            Some(OffsetDateTime::now_utc()),
        )
        .condition(rorm::and![
            TournamentParticipantModel
                .uuid
                .equals(participant.into_inner()),
            TournamentParticipantModel
                .tournament
                .equals(tournament.into_inner()),
            TournamentParticipantModel
                .status
                .equals(ParticipantStatus::Registered),
        ])
        .await?;
    if affected == 0 {
        return Ok(TournamentAccess::Denied);
    }

    Tournament::audit(
        &mut *tx,
        tournament,
        audit_actor(actor),
        AuditAction::ParticipantCheckedIn,
        Some(participant.into_inner()),
        None,
    )
    .await?;

    Ok(TournamentAccess::Granted(CheckInOutcome::CheckedIn))
}

/// Drop a participant, self-service or by staff
#[instrument(name = "drop", skip(tx, actor))]
pub async fn drop(
    tx: &mut Transaction,
    actor: &TournamentActor,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
) -> Result<TournamentAccess<()>, rorm::Error> {
    if !may_self_serve(&mut *tx, actor, tournament, participant).await? {
        return Ok(TournamentAccess::Denied);
    }

    // The last scored round; 0 still means "never played a round".
    let dropped_after = super::round::scored_progress(&mut *tx, tournament)
        .await?
        .latest;

    let affected = rorm::update(&mut *tx, TournamentParticipantModel)
        .set(
            TournamentParticipantModel.status,
            ParticipantStatus::Dropped,
        )
        .set(
            TournamentParticipantModel.dropped_after_round,
            Some(dropped_after),
        )
        .condition(rorm::and![
            TournamentParticipantModel
                .uuid
                .equals(participant.into_inner()),
            TournamentParticipantModel
                .tournament
                .equals(tournament.into_inner()),
            rorm::or![
                TournamentParticipantModel
                    .status
                    .equals(ParticipantStatus::Registered),
                TournamentParticipantModel
                    .status
                    .equals(ParticipantStatus::CheckedIn),
            ],
        ])
        .await?;
    if affected == 0 {
        return Ok(TournamentAccess::Denied);
    }

    Tournament::audit(
        &mut *tx,
        tournament,
        audit_actor(actor),
        AuditAction::ParticipantDropped,
        Some(participant.into_inner()),
        None,
    )
    .await?;

    Ok(TournamentAccess::Granted(()))
}

/// Remove a participant outright, keeping their name in the audit entry
#[instrument(name = "remove", skip(tx))]
pub async fn remove(
    tx: &mut Transaction,
    organizer_account: AccountUuid,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
) -> Result<TournamentAccess<()>, rorm::Error> {
    if Tournament::role_of(&mut *tx, tournament, organizer_account)
        .await?
        .is_none()
    {
        return Ok(TournamentAccess::Denied);
    }

    let Some(row) = rorm::query(&mut *tx, TournamentParticipantModel)
        .condition(rorm::and![
            TournamentParticipantModel
                .uuid
                .equals(participant.into_inner()),
            TournamentParticipantModel
                .tournament
                .equals(tournament.into_inner()),
        ])
        .optional()
        .await?
    else {
        return Ok(TournamentAccess::Denied);
    };
    let display_name = row.display_name.into_inner();

    let affected = rorm::delete(&mut *tx, TournamentParticipantModel)
        .condition(rorm::and![
            TournamentParticipantModel
                .uuid
                .equals(participant.into_inner()),
            TournamentParticipantModel
                .tournament
                .equals(tournament.into_inner()),
        ])
        .await?;
    if affected == 0 {
        return Ok(TournamentAccess::Denied);
    }

    Tournament::audit(
        &mut *tx,
        tournament,
        Some(organizer_account),
        AuditAction::ParticipantRemoved,
        Some(participant.into_inner()),
        Some(display_name),
    )
    .await?;

    Ok(TournamentAccess::Granted(()))
}

impl From<TournamentParticipantModel> for TournamentParticipant {
    fn from(value: TournamentParticipantModel) -> Self {
        let account = value.account.map(AccountUuid::new_from_field);
        Self {
            uuid: TournamentParticipantUuid::from_uuid(value.uuid),
            tournament: TournamentUuid::new_from_field(value.tournament),
            is_guest: account.is_none(),
            account,
            display_name: value.display_name,
            name_normalized: value.name_normalized,
            status: value.status,
            entered_round: value.entered_round,
            dropped_after_round: value.dropped_after_round,
            seed: value.seed,
            manual_tiebreak: value.manual_tiebreak,
            checked_in_at: value.checked_in_at,
            notes: value.notes,
            registered_at: value.registered_at,
            fixed_table: value.fixed_table,
        }
    }
}

/// Highest table number a pin may name
pub const MAX_FIXED_TABLE: i16 = 999;

/// Outcome of [`set_fixed_table`]
#[derive(Debug, Clone)]
pub enum FixedTableChange {
    /// The pin was written
    Changed,
    /// Somebody else already holds that table
    Taken(MaxStr<64>),
    /// Not a table number
    Invalid,
}

/// Pin a player to one table, or release them
#[instrument(name = "participant::set_fixed_table", skip(tx))]
pub async fn set_fixed_table(
    tx: &mut Transaction,
    organizer_account: AccountUuid,
    tournament: TournamentUuid,
    participant: TournamentParticipantUuid,
    table: Option<i16>,
) -> Result<TournamentAccess<FixedTableChange>, rorm::Error> {
    if Tournament::role_of(&mut *tx, tournament, organizer_account)
        .await?
        .is_none()
    {
        return Ok(TournamentAccess::Denied);
    }
    let roster = rorm::query(
        &mut *tx,
        (
            TournamentParticipantModel.uuid,
            TournamentParticipantModel.display_name,
            TournamentParticipantModel.fixed_table,
        ),
    )
    .condition(
        TournamentParticipantModel
            .tournament
            .equals(tournament.into_inner()),
    )
    .all()
    .await?;
    if !roster
        .iter()
        .any(|(uuid, _, _)| *uuid == participant.into_inner())
    {
        return Ok(TournamentAccess::Denied);
    }
    if table.is_some_and(|table| !(1..=MAX_FIXED_TABLE).contains(&table)) {
        return Ok(TournamentAccess::Granted(FixedTableChange::Invalid));
    }
    // Probed rather than caught: a unique violation aborts the transaction.
    if let Some((_, holder, _)) = roster.iter().find(|(uuid, _, pin)| {
        *uuid != participant.into_inner() && table.is_some() && *pin == table
    }) {
        return Ok(TournamentAccess::Granted(FixedTableChange::Taken(
            holder.clone(),
        )));
    }

    rorm::update(&mut *tx, TournamentParticipantModel)
        .set(TournamentParticipantModel.fixed_table, table)
        .condition(
            TournamentParticipantModel
                .uuid
                .equals(participant.into_inner()),
        )
        .await?;

    Tournament::audit(
        &mut *tx,
        tournament,
        Some(organizer_account),
        AuditAction::ParticipantFixedTableChanged,
        Some(participant.into_inner()),
        None,
    )
    .await?;

    Ok(TournamentAccess::Granted(FixedTableChange::Changed))
}

#[cfg(test)]
mod tests {
    use super::normalize_name;

    #[test]
    fn trims_and_lowercases() {
        assert_eq!(&*normalize_name("  Alice Smith  "), "alice smith");
    }

    #[test]
    fn collapses_inner_whitespace() {
        assert_eq!(&*normalize_name("Alice   \t Smith"), "alice smith");
    }

    #[test]
    fn reads_an_empty_name_as_empty() {
        assert_eq!(&*normalize_name(""), "");
        assert_eq!(&*normalize_name("   "), "");
    }

    #[test]
    fn lowercases_beyond_ascii() {
        assert_eq!(&*normalize_name("MÜLLER Ångström"), "müller ångström");
    }

    #[test]
    fn a_name_at_the_boundary_survives() {
        let name = "a".repeat(64);
        assert_eq!(normalize_name(&name).len(), 64);
    }

    #[test]
    fn is_idempotent() {
        let once = normalize_name("Jane   Doe");
        let twice = normalize_name(&once);
        assert_eq!(&*once, &*twice);
    }
}
