//! Rounds: the clock, and — from the next milestone — the tables under it
//!
//! Follows the guard discipline the rest of this module tree documents: no
//! function hands out a round without an actor to check it against, and the
//! raw reads are private to the module.
//!
//! One deviation worth stating, because it looks like a mistake: the write
//! paths here guard on [`Tournament::role_of`] holding *any* role rather than
//! on [`TournamentRole::may_manage`]. `may_manage` is false for a
//! [`OrganizerRole::Scorekeeper`], and running rounds and results is precisely
//! what a scorekeeper is for — the same call
//! [`crate::models::tournament::participant::update`] already makes.

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use rand::RngExt;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::tournament::AuditAction;
use crate::models::tournament::MatchStatus;
use crate::models::tournament::RoundKind;
use crate::models::tournament::RoundStatus;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentAccess;
use crate::models::tournament::TournamentRoundUuid;
use crate::models::tournament::TournamentStatus;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::db::TournamentMatchModel;
use crate::models::tournament::db::TournamentRoundInsertPatch;
use crate::models::tournament::db::TournamentRoundModel;
use crate::tournament::timer::Timer;
use crate::tournament::timer::TimerAction;

/// The shortest round anybody would set, in minutes
const MIN_ROUND_MINUTES: i32 = 1;

/// The longest round anybody would set, in minutes
const MAX_ROUND_MINUTES: i32 = 600;

/// One round of a tournament
#[derive(Debug, Clone)]
pub struct Round {
    /// Primary key
    pub uuid: TournamentRoundUuid,
    /// The tournament it belongs to
    pub tournament: TournamentUuid,
    /// What the round is for
    pub kind: RoundKind,
    /// Where it sits among every round of this event, 1-based
    pub sequence: i16,
    /// The number on the pairings sheet, `None` for an unscored round
    pub number: Option<i16>,
    /// Where the round stands
    pub status: RoundStatus,
    /// How many players shared a table
    pub pod_size: Option<i16>,
    /// How long the clock runs for, in seconds
    pub length_seconds: i32,
    /// When the clock runs out
    pub timer_ends_at: Option<OffsetDateTime>,
    /// When the clock was paused
    pub timer_paused_at: Option<OffsetDateTime>,
    /// When the round was handed to the room
    pub started_at: Option<OffsetDateTime>,
    /// When the round was closed
    pub completed_at: Option<OffsetDateTime>,
}

impl Round {
    /// The round's clock, as the pure engine wants it
    ///
    /// @returns the three columns
    pub fn timer(&self) -> Timer {
        Timer {
            length_seconds: self.length_seconds,
            ends_at: self.timer_ends_at,
            paused_at: self.timer_paused_at,
        }
    }
}

/// What a caller asked for when adding a round
#[derive(Debug, Clone)]
pub struct CreateRound {
    /// What the round is for
    pub kind: RoundKind,
    /// How long the clock runs for, in minutes; `None` takes the event's own
    pub minutes: Option<i16>,
}

/// Outcome of [`create`]
#[derive(Debug, Clone)]
pub enum RoundOutcome {
    /// A round was written
    Created(Round),
    /// The event is not running, so it has no rounds to add to
    TournamentNotRunning,
    /// The round before this one is still open
    PreviousRoundOpen,
    /// The requested length is outside what a round may be
    InvalidLength,
}

/// Outcome of the round lifecycle calls
#[derive(Debug, Clone)]
pub enum RoundChange {
    /// The round was written
    Changed(Round),
    /// The round is not in a state that allows this
    NotEditable,
    /// Tables are still without a result; `force` would have gone through
    Outstanding(Vec<i16>),
}

/// How far the room has got through its scoring rounds
#[derive(Debug, Clone, Copy, Default)]
pub struct ScoredProgress {
    /// How many scoring rounds are closed
    pub completed: i16,
    /// The highest scoring round number that exists at all, 0 before the first
    pub latest: i16,
}

/// How far this event has got through its scoring rounds
///
/// Only [`RoundKind::Swiss`] rounds are counted: a draft pod stage and a
/// deckbuilding stage occupy the room without being rounds anybody played, and
/// a late entry must not take a loss for missing one.
///
/// @param tx the transaction to read in
/// @param tournament whose rounds
///
/// @returns what is behind the room and what it is on
#[instrument(name = "round::scored_progress", skip(tx))]
pub async fn scored_progress(
    tx: &mut Transaction,
    tournament: TournamentUuid,
) -> Result<ScoredProgress, rorm::Error> {
    let rows = rorm::query(
        &mut *tx,
        (TournamentRoundModel.number, TournamentRoundModel.status),
    )
    .condition(rorm::and![
        TournamentRoundModel
            .tournament
            .equals(tournament.into_inner()),
        TournamentRoundModel.kind.equals(RoundKind::Swiss),
    ])
    .all()
    .await?;

    Ok(ScoredProgress {
        completed: rows
            .iter()
            .filter(|(_, status)| *status == RoundStatus::Complete)
            .filter_map(|(number, _)| *number)
            .max()
            .unwrap_or(0),
        latest: rows
            .iter()
            .filter_map(|(number, _)| *number)
            .max()
            .unwrap_or(0),
    })
}

/// Every round of a tournament, oldest first
///
/// No guard: the caller has already proved it may see this tournament.
///
/// @param tx the transaction to read in
/// @param tournament whose rounds to read
///
/// @returns the rounds
#[instrument(name = "round::list", skip(tx))]
pub async fn list(
    tx: &mut Transaction,
    tournament: TournamentUuid,
) -> Result<Vec<Round>, rorm::Error> {
    let rounds = rorm::query(&mut *tx, TournamentRoundModel)
        .condition(TournamentRoundModel.tournament.equals(tournament.0))
        .order_asc(TournamentRoundModel.sequence)
        .all()
        .await?;
    Ok(rounds.into_iter().map(Round::from).collect())
}

/// The round the room is on, `None` before the first one
///
/// @param tx the transaction to read in
/// @param tournament whose round to read
///
/// @returns the latest round by sequence
#[instrument(name = "round::current", skip(tx))]
pub async fn current(
    tx: &mut Transaction,
    tournament: TournamentUuid,
) -> Result<Option<Round>, rorm::Error> {
    // Read them all and take the head rather than `limit(1)`: an event has a
    // handful of rounds, and rorm's builder cannot follow a limit with
    // `optional()`.
    let rounds = rorm::query(&mut *tx, TournamentRoundModel)
        .condition(TournamentRoundModel.tournament.equals(tournament.0))
        .order_desc(TournamentRoundModel.sequence)
        .all()
        .await?;
    Ok(rounds.into_iter().next().map(Round::from))
}

/// Read one round of this tournament
///
/// Scoped to the tournament on purpose: a round uuid from another event must
/// read as missing rather than as somebody else's round.
///
/// @param tx the transaction to read in
/// @param tournament the round must belong to
/// @param round which round
///
/// @returns the round, or `None`
#[instrument(name = "round::one", skip(tx))]
pub async fn one(
    tx: &mut Transaction,
    tournament: TournamentUuid,
    round: TournamentRoundUuid,
) -> Result<Option<Round>, rorm::Error> {
    let found = rorm::query(&mut *tx, TournamentRoundModel)
        .condition(rorm::and![
            TournamentRoundModel.uuid.equals(round.into_inner()),
            TournamentRoundModel.tournament.equals(tournament.0),
        ])
        .optional()
        .await?;
    Ok(found.map(Round::from))
}

/// Add a round to a running tournament
///
/// The numbering is the whole trick: `sequence` counts every round and
/// `number` counts only the scored ones, so a draft pod stage and a
/// deckbuilding stage sit in the room's history without ever consuming a round
/// number. Everything downstream — the standings, `entered_round`, "round 2 of
/// 4" — reads `number`.
///
/// @param tx the transaction to write in
/// @param account who is asking
/// @param tournament to add a round to
/// @param request what kind of round, and how long
///
/// @returns the round, or why not
#[instrument(name = "round::create", skip(tx))]
pub async fn create(
    tx: &mut Transaction,
    account: AccountUuid,
    tournament: TournamentUuid,
    request: CreateRound,
) -> Result<TournamentAccess<RoundOutcome>, rorm::Error> {
    let Some(event) = staff_event(&mut *tx, account, tournament).await? else {
        return Ok(TournamentAccess::Denied);
    };
    if event.status != TournamentStatus::Running {
        return Ok(TournamentAccess::Granted(
            RoundOutcome::TournamentNotRunning,
        ));
    }

    let minutes = i32::from(request.minutes.unwrap_or(event.round_minutes));
    if !(MIN_ROUND_MINUTES..=MAX_ROUND_MINUTES).contains(&minutes) {
        return Ok(TournamentAccess::Granted(RoundOutcome::InvalidLength));
    }

    let rounds = list(&mut *tx, tournament).await?;
    if rounds
        .last()
        .is_some_and(|round| round.status != RoundStatus::Complete)
    {
        return Ok(TournamentAccess::Granted(RoundOutcome::PreviousRoundOpen));
    }

    let sequence = rounds.last().map_or(1, |round| round.sequence + 1);
    let number = match request.kind {
        RoundKind::Swiss => Some(
            rounds
                .iter()
                .filter_map(|round| round.number)
                .max()
                .unwrap_or(0)
                + 1,
        ),
        RoundKind::Draft | RoundKind::Deckbuilding => None,
    };
    let pod_size = match request.kind {
        RoundKind::Swiss => Some(event.pod_size),
        // A draft pod is eight seats by convention, not by the event's table
        // size — a pod of four drafting together would be a different event.
        RoundKind::Draft => Some(DRAFT_POD_SIZE),
        RoundKind::Deckbuilding => None,
    };
    // Bound to a `let` before the insert's `.await`: a `ThreadRng` temporary
    // living across an await makes the whole handler future `!Send`, the same
    // trap `participant::register_account` documents.
    let pairing_seed: i64 = rand::rng().random();

    let model = rorm::insert(&mut *tx, TournamentRoundModel)
        .single(&TournamentRoundInsertPatch {
            uuid: Uuid::now_v7(),
            tournament: ForeignModelByField(tournament.0),
            kind: request.kind,
            sequence,
            number,
            status: RoundStatus::Pairing,
            pod_size,
            pairing_seed,
            length_seconds: minutes * 60,
        })
        .await?;
    let round = Round::from(model);

    Tournament::audit(
        &mut *tx,
        tournament,
        Some(account),
        AuditAction::RoundPaired,
        Some(round.uuid.into_inner()),
        Some(format!("{:?} round {}", round.kind, round.sequence)),
    )
    .await?;

    Ok(TournamentAccess::Granted(RoundOutcome::Created(round)))
}

/// How many seats a draft pod holds
const DRAFT_POD_SIZE: i16 = 8;

/// Hand a paired round to the room and start its clock
///
/// @param tx the transaction to write in
/// @param account who is asking
/// @param tournament the round belongs to
/// @param round which round
///
/// @returns the round, or why not
#[instrument(name = "round::start", skip(tx))]
pub async fn start(
    tx: &mut Transaction,
    account: AccountUuid,
    tournament: TournamentUuid,
    round: TournamentRoundUuid,
) -> Result<TournamentAccess<RoundChange>, rorm::Error> {
    let Some(_) = staff_event(&mut *tx, account, tournament).await? else {
        return Ok(TournamentAccess::Denied);
    };
    let Some(found) = one(&mut *tx, tournament, round).await? else {
        return Ok(TournamentAccess::Denied);
    };
    if found.status != RoundStatus::Pairing {
        return Ok(TournamentAccess::Granted(RoundChange::NotEditable));
    }

    let now = OffsetDateTime::now_utc();
    let started = crate::tournament::timer::apply(&found.timer(), TimerAction::Start, now);

    rorm::update(&mut *tx, TournamentRoundModel)
        .set(TournamentRoundModel.status, RoundStatus::Running)
        .set(TournamentRoundModel.started_at, Some(now))
        .set(TournamentRoundModel.timer_ends_at, started.ends_at)
        .set(TournamentRoundModel.timer_paused_at, None)
        .condition(TournamentRoundModel.uuid.equals(round.into_inner()))
        .await?;

    Tournament::audit(
        &mut *tx,
        tournament,
        Some(account),
        AuditAction::RoundStarted,
        Some(round.into_inner()),
        None,
    )
    .await?;

    reread(&mut *tx, tournament, round).await
}

/// Close a round
///
/// Refuses while a scored round still has tables without a confirmed result,
/// naming them, unless the desk insists. A round with no tables at all — a
/// deckbuilding stage — always closes.
///
/// @param tx the transaction to write in
/// @param account who is asking
/// @param tournament the round belongs to
/// @param round which round
/// @param force whether to close it despite outstanding tables
///
/// @returns the round, or which tables are missing
#[instrument(name = "round::complete", skip(tx))]
pub async fn complete(
    tx: &mut Transaction,
    account: AccountUuid,
    tournament: TournamentUuid,
    round: TournamentRoundUuid,
    force: bool,
) -> Result<TournamentAccess<RoundChange>, rorm::Error> {
    let Some(_) = staff_event(&mut *tx, account, tournament).await? else {
        return Ok(TournamentAccess::Denied);
    };
    let Some(found) = one(&mut *tx, tournament, round).await? else {
        return Ok(TournamentAccess::Denied);
    };
    if found.status == RoundStatus::Complete {
        return Ok(TournamentAccess::Granted(RoundChange::NotEditable));
    }

    if !force {
        let outstanding = outstanding_tables(&mut *tx, round).await?;
        if !outstanding.is_empty() {
            return Ok(TournamentAccess::Granted(RoundChange::Outstanding(
                outstanding,
            )));
        }
    }

    rorm::update(&mut *tx, TournamentRoundModel)
        .set(TournamentRoundModel.status, RoundStatus::Complete)
        .set(
            TournamentRoundModel.completed_at,
            Some(OffsetDateTime::now_utc()),
        )
        .condition(TournamentRoundModel.uuid.equals(round.into_inner()))
        .await?;

    Tournament::audit(
        &mut *tx,
        tournament,
        Some(account),
        AuditAction::RoundCompleted,
        Some(round.into_inner()),
        force.then(|| "Forced".to_owned()),
    )
    .await?;

    reread(&mut *tx, tournament, round).await
}

/// Delete a round nobody has played
///
/// @param tx the transaction to write in
/// @param account who is asking
/// @param tournament the round belongs to
/// @param round which round
///
/// @returns whether it went
#[instrument(name = "round::delete", skip(tx))]
pub async fn delete(
    tx: &mut Transaction,
    account: AccountUuid,
    tournament: TournamentUuid,
    round: TournamentRoundUuid,
) -> Result<TournamentAccess<RoundChange>, rorm::Error> {
    let Some(_) = staff_event(&mut *tx, account, tournament).await? else {
        return Ok(TournamentAccess::Denied);
    };
    let Some(found) = one(&mut *tx, tournament, round).await? else {
        return Ok(TournamentAccess::Denied);
    };
    if found.status == RoundStatus::Complete {
        return Ok(TournamentAccess::Granted(RoundChange::NotEditable));
    }
    let reported = reported_tables(&mut *tx, round).await?;
    if reported > 0 {
        return Ok(TournamentAccess::Granted(RoundChange::NotEditable));
    }

    rorm::delete(&mut *tx, TournamentRoundModel)
        .condition(TournamentRoundModel.uuid.equals(round.into_inner()))
        .await?;

    Tournament::audit(
        &mut *tx,
        tournament,
        Some(account),
        AuditAction::RoundDeleted,
        Some(round.into_inner()),
        None,
    )
    .await?;

    Ok(TournamentAccess::Granted(RoundChange::NotEditable))
}

/// Start, pause, adjust or reset a round's clock
///
/// @param tx the transaction to write in
/// @param account who is asking
/// @param tournament the round belongs to
/// @param round which round
/// @param action what the desk did
///
/// @returns the round with its new clock
#[instrument(name = "round::set_timer", skip(tx))]
pub async fn set_timer(
    tx: &mut Transaction,
    account: AccountUuid,
    tournament: TournamentUuid,
    round: TournamentRoundUuid,
    action: TimerAction,
) -> Result<TournamentAccess<RoundChange>, rorm::Error> {
    let Some(_) = staff_event(&mut *tx, account, tournament).await? else {
        return Ok(TournamentAccess::Denied);
    };
    let Some(found) = one(&mut *tx, tournament, round).await? else {
        return Ok(TournamentAccess::Denied);
    };
    if found.status == RoundStatus::Complete {
        return Ok(TournamentAccess::Granted(RoundChange::NotEditable));
    }

    let next = crate::tournament::timer::apply(&found.timer(), action, OffsetDateTime::now_utc());

    rorm::update(&mut *tx, TournamentRoundModel)
        .set(TournamentRoundModel.length_seconds, next.length_seconds)
        .set(TournamentRoundModel.timer_ends_at, next.ends_at)
        .set(TournamentRoundModel.timer_paused_at, next.paused_at)
        .condition(TournamentRoundModel.uuid.equals(round.into_inner()))
        .await?;

    Tournament::audit(
        &mut *tx,
        tournament,
        Some(account),
        AuditAction::RoundTimerChanged,
        Some(round.into_inner()),
        Some(format!("{action:?}")),
    )
    .await?;

    reread(&mut *tx, tournament, round).await
}

/// The table numbers of a round that have no confirmed result
///
/// @param tx the transaction to read in
/// @param round whose tables to check
///
/// @returns the numbers, ascending
#[instrument(name = "round::outstanding_tables", skip(tx))]
pub async fn outstanding_tables(
    tx: &mut Transaction,
    round: TournamentRoundUuid,
) -> Result<Vec<i16>, rorm::Error> {
    let mut open: Vec<i16> = rorm::query(
        &mut *tx,
        (
            TournamentMatchModel.table_number,
            TournamentMatchModel.status,
        ),
    )
    .condition(TournamentMatchModel.round.equals(round.into_inner()))
    .all()
    .await?
    .into_iter()
    .filter(|(_, status)| *status != MatchStatus::Confirmed)
    .map(|(table, _)| table)
    .collect();
    open.sort_unstable();
    Ok(open)
}

/// How many of a round's tables anybody has said anything about
///
/// @param tx the transaction to read in
/// @param round whose tables to count
///
/// @returns the count
async fn reported_tables(
    tx: &mut Transaction,
    round: TournamentRoundUuid,
) -> Result<usize, rorm::Error> {
    let statuses = rorm::query(&mut *tx, TournamentMatchModel.status)
        .condition(TournamentMatchModel.round.equals(round.into_inner()))
        .all()
        .await?;
    Ok(statuses
        .into_iter()
        // A bye is confirmed the moment it is written, so it says nothing
        // about whether anybody has played — counting it would make a round
        // with an odd field impossible to re-pair.
        .filter(|status| *status != MatchStatus::Unreported)
        .count())
}

/// The tournament behind a staff actor, or `None` when they hold no role
///
/// Any role will do — see the module docs on why this is not `may_manage`.
///
/// @param tx the transaction to read in
/// @param account who is asking
/// @param tournament which event
///
/// @returns the tournament, or `None`
async fn staff_event(
    tx: &mut Transaction,
    account: AccountUuid,
    tournament: TournamentUuid,
) -> Result<Option<Tournament>, rorm::Error> {
    Ok(Tournament::get_as_organizer(&mut *tx, account, tournament)
        .await?
        .granted()
        .map(|(_, event)| event))
}

/// Read a round back after writing it, for the caller's response
///
/// @param tx the transaction to read in
/// @param tournament the round belongs to
/// @param round which round
///
/// @returns the round
async fn reread(
    tx: &mut Transaction,
    tournament: TournamentUuid,
    round: TournamentRoundUuid,
) -> Result<TournamentAccess<RoundChange>, rorm::Error> {
    let Some(found) = one(&mut *tx, tournament, round).await? else {
        return Ok(TournamentAccess::Denied);
    };
    Ok(TournamentAccess::Granted(RoundChange::Changed(found)))
}

impl From<TournamentRoundModel> for Round {
    fn from(value: TournamentRoundModel) -> Self {
        Self {
            uuid: TournamentRoundUuid(value.uuid),
            tournament: TournamentUuid(value.tournament.0),
            kind: value.kind,
            sequence: value.sequence,
            number: value.number,
            status: value.status,
            pod_size: value.pod_size,
            length_seconds: value.length_seconds,
            timer_ends_at: value.timer_ends_at,
            timer_paused_at: value.timer_paused_at,
            started_at: value.started_at,
            completed_at: value.completed_at,
        }
    }
}
