//! Results: what the room says, and what the desk says
//!
//! Two ways in, one state machine. A player reports from their phone and an
//! opponent agrees; an organizer types the result at the desk and that is the
//! end of it. Neither owns the stored status — it is re-derived by
//! [`crate::tournament::reporting::resolve`] on every write and never read back
//! as truth, which is what lets both exist without one of them having to win.
//!
//! The guard here deliberately inverts the one
//! [`super::participant::self_serve`] uses. That one asks "is this actor
//! staff?" first; this one asks "is this actor *sitting at this table*?" first,
//! so an organizer who is also playing reports like a player. Otherwise their
//! own table would silently self-confirm the moment they tapped it, which is
//! the most embarrassing bug this feature could have. Overriding is a different
//! call, and an audited one.

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::tournament::AuditAction;
use crate::models::tournament::MatchStatus;
use crate::models::tournament::RoundStatus;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentAccess;
use crate::models::tournament::TournamentActor;
use crate::models::tournament::TournamentMatchUuid;
use crate::models::tournament::TournamentParticipantUuid;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::db::TournamentMatchModel;
use crate::models::tournament::db::TournamentParticipantModel;
use crate::models::tournament::db::TournamentResultReportInsertPatch;
use crate::models::tournament::db::TournamentResultReportModel;
use crate::models::tournament::db::TournamentRoundModel;
use crate::models::tournament::db::TournamentSeatModel;
use crate::tournament::reporting::Claim;
use crate::tournament::reporting::MatchInput;
use crate::tournament::reporting::MatchState;
use crate::tournament::reporting::Outcome;
use crate::tournament::reporting::resolve;

/// How an actor relates to one table
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SeatedAs {
    /// They run the event and are not playing this table
    Staff,
    /// They are sitting at it
    Seat(TournamentParticipantUuid),
}

/// What a seat claims happened
#[derive(Debug, Clone)]
pub struct ReportClaim {
    /// Who they say won, `None` for a draw
    pub winner: Option<TournamentParticipantUuid>,
    /// Whether they say it was drawn
    pub draw: bool,
    /// Games the winner took
    pub winner_games: i16,
    /// Games the loser took
    pub loser_games: i16,
    /// Games inside the match that were themselves drawn
    pub games_drawn: i16,
    /// The key the client minted for this tap
    pub client_key: MaxStr<64>,
}

/// Outcome of [`report`]
#[derive(Debug, Clone)]
pub enum ReportOutcome {
    /// The claim was filed and the table re-resolved
    Recorded(MatchStatus),
    /// The actor is not sitting at this table
    NotSeated,
    /// The round is closed; nothing more goes into it
    RoundClosed,
    /// Neither a winner nor a draw, or a winner who is not at the table
    InvalidOutcome,
}

/// Outcome of [`set_result`] and [`clear_result`]
#[derive(Debug, Clone)]
pub enum ResultChange {
    /// The table was written and re-resolved
    Changed(MatchStatus),
    /// The round is closed, or the table is a bye nobody played
    NotEditable,
    /// Neither a winner nor a draw, or a winner who is not at the table
    InvalidOutcome,
}

/// How an actor relates to one table, seat before staff
///
/// @param tx the transaction to read in
/// @param actor who is asking
/// @param tournament the table belongs to
/// @param table which table
///
/// @returns how they relate to it, or `None` if they have nothing to do with it
#[instrument(name = "reporting::seated", skip(tx, actor))]
pub async fn seated(
    tx: &mut Transaction,
    actor: &TournamentActor,
    tournament: TournamentUuid,
    table: TournamentMatchUuid,
) -> Result<Option<SeatedAs>, rorm::Error> {
    let at_table = seats_at(&mut *tx, table).await?;
    let mine = own_seats(&mut *tx, actor, tournament).await?;
    if let Some(seat) = at_table.iter().find(|seat| mine.contains(seat)) {
        return Ok(Some(SeatedAs::Seat(TournamentParticipantUuid(*seat))));
    }

    match actor {
        TournamentActor::Account(account) => {
            Ok(Tournament::role_of(&mut *tx, tournament, account.uuid)
                .await?
                .map(|_| SeatedAs::Staff))
        }
        TournamentActor::Guest(_) => Ok(None),
    }
}

/// File one seat's claim about their own table
///
/// The `(table, reporter)` pair is upserted rather than appended: what matters
/// is which claims disagree, not how many times somebody re-tapped. An
/// unchanged [`ReportClaim::client_key`] on an existing row is that same tap
/// arriving twice and writes nothing at all.
///
/// @param tx the transaction to write in
/// @param actor who is reporting
/// @param tournament the table belongs to
/// @param table which table
/// @param claim what they say happened
///
/// @returns where the table stands now, or why nothing was written
#[instrument(name = "reporting::report", skip(tx, actor))]
pub async fn report(
    tx: &mut Transaction,
    actor: &TournamentActor,
    tournament: TournamentUuid,
    table: TournamentMatchUuid,
    claim: ReportClaim,
) -> Result<TournamentAccess<ReportOutcome>, rorm::Error> {
    if Tournament::get_for_viewer(&mut *tx, actor, tournament)
        .await?
        .is_none()
    {
        return Ok(TournamentAccess::Denied);
    }
    let Some(SeatedAs::Seat(reporter)) = seated(&mut *tx, actor, tournament, table).await? else {
        return Ok(TournamentAccess::Granted(ReportOutcome::NotSeated));
    };
    if !round_open(&mut *tx, table).await? {
        return Ok(TournamentAccess::Granted(ReportOutcome::RoundClosed));
    }

    let at_table = seats_at(&mut *tx, table).await?;
    if !valid(&claim.winner, claim.draw, &at_table) {
        return Ok(TournamentAccess::Granted(ReportOutcome::InvalidOutcome));
    }

    let existing = rorm::query(
        &mut *tx,
        (
            TournamentResultReportModel.uuid,
            TournamentResultReportModel.client_key,
        ),
    )
    .condition(rorm::and![
        TournamentResultReportModel
            .tournament_match
            .equals(table.into_inner()),
        TournamentResultReportModel
            .reported_by
            .equals(reporter.into_inner()),
    ])
    .all()
    .await?
    .into_iter()
    .next();

    let winner = claim
        .winner
        .map(|winner| ForeignModelByField(winner.into_inner()));
    match existing {
        // The same tap arriving twice — a flaky connection, a double press —
        // writes nothing and answers where the table already stands.
        Some((_, key)) if key == claim.client_key => {}
        Some((uuid, _)) => {
            rorm::update(&mut *tx, TournamentResultReportModel)
                .set(TournamentResultReportModel.claimed_winner, winner)
                .set(TournamentResultReportModel.claimed_draw, claim.draw)
                .set(
                    TournamentResultReportModel.claimed_winner_games,
                    claim.winner_games,
                )
                .set(
                    TournamentResultReportModel.claimed_loser_games,
                    claim.loser_games,
                )
                .set(
                    TournamentResultReportModel.claimed_games_drawn,
                    claim.games_drawn,
                )
                .set(TournamentResultReportModel.client_key, claim.client_key)
                .condition(TournamentResultReportModel.uuid.equals(uuid))
                .await?;
        }
        None => {
            let account = match actor {
                TournamentActor::Account(account) => {
                    Some(ForeignModelByField(account.uuid.into_inner()))
                }
                TournamentActor::Guest(_) => None,
            };
            rorm::insert(&mut *tx, TournamentResultReportModel)
                .single(&TournamentResultReportInsertPatch {
                    uuid: Uuid::now_v7(),
                    tournament_match: ForeignModelByField(table.into_inner()),
                    tournament: ForeignModelByField(tournament.0),
                    reported_by: ForeignModelByField(reporter.into_inner()),
                    reported_by_account: account,
                    claimed_winner: winner,
                    claimed_draw: claim.draw,
                    claimed_winner_games: claim.winner_games,
                    claimed_loser_games: claim.loser_games,
                    claimed_games_drawn: claim.games_drawn,
                    client_key: claim.client_key,
                })
                .await?;
        }
    }

    // Deliberately not audited. Forty phone taps an evening would bury the one
    // row that matters — the desk overriding somebody — and the report rows are
    // already the history of who said what.
    let status = recompute(&mut *tx, table, None).await?;
    Ok(TournamentAccess::Granted(ReportOutcome::Recorded(status)))
}

/// Write a table's result from the desk, beating every report
///
/// @param tx the transaction to write in
/// @param account the organizer writing it
/// @param tournament the table belongs to
/// @param table which table
/// @param claim what the desk says happened
///
/// @returns where the table stands now, or why nothing was written
#[instrument(name = "reporting::set_result", skip(tx))]
pub async fn set_result(
    tx: &mut Transaction,
    account: AccountUuid,
    tournament: TournamentUuid,
    table: TournamentMatchUuid,
    claim: ReportClaim,
) -> Result<TournamentAccess<ResultChange>, rorm::Error> {
    if Tournament::role_of(&mut *tx, tournament, account)
        .await?
        .is_none()
    {
        return Ok(TournamentAccess::Denied);
    }
    let Some(is_bye) = table_is_bye(&mut *tx, tournament, table).await? else {
        return Ok(TournamentAccess::Denied);
    };
    if is_bye || !round_open(&mut *tx, table).await? {
        return Ok(TournamentAccess::Granted(ResultChange::NotEditable));
    }

    let at_table = seats_at(&mut *tx, table).await?;
    if !valid(&claim.winner, claim.draw, &at_table) {
        return Ok(TournamentAccess::Granted(ResultChange::InvalidOutcome));
    }

    rorm::update(&mut *tx, TournamentMatchModel)
        .set(TournamentMatchModel.organizer_override, true)
        .condition(TournamentMatchModel.uuid.equals(table.into_inner()))
        .await?;

    let status = recompute(
        &mut *tx,
        table,
        Some(Outcome {
            winner: claim.winner.map(TournamentParticipantUuid::into_inner),
            draw: claim.draw,
            winner_games: claim.winner_games,
            loser_games: claim.loser_games,
            games_drawn: claim.games_drawn,
        }),
    )
    .await?;

    rorm::update(&mut *tx, TournamentMatchModel)
        .set(
            TournamentMatchModel.result_recorded_by,
            Some(ForeignModelByField(account.into_inner())),
        )
        .condition(TournamentMatchModel.uuid.equals(table.into_inner()))
        .await?;

    Tournament::audit(
        &mut *tx,
        tournament,
        Some(account),
        AuditAction::MatchResultOverridden,
        Some(table.into_inner()),
        None,
    )
    .await?;

    Ok(TournamentAccess::Granted(ResultChange::Changed(status)))
}

/// Take the desk's result back off a table
///
/// The undo for a mistyped result, and the reason `organizer_override` is a
/// column rather than "there is a result": clearing it drops back to whatever
/// the phones said rather than to nothing.
///
/// @param tx the transaction to write in
/// @param account the organizer clearing it
/// @param tournament the table belongs to
/// @param table which table
///
/// @returns where the table stands now
#[instrument(name = "reporting::clear_result", skip(tx))]
pub async fn clear_result(
    tx: &mut Transaction,
    account: AccountUuid,
    tournament: TournamentUuid,
    table: TournamentMatchUuid,
) -> Result<TournamentAccess<ResultChange>, rorm::Error> {
    if Tournament::role_of(&mut *tx, tournament, account)
        .await?
        .is_none()
    {
        return Ok(TournamentAccess::Denied);
    }
    let Some(is_bye) = table_is_bye(&mut *tx, tournament, table).await? else {
        return Ok(TournamentAccess::Denied);
    };
    if is_bye || !round_open(&mut *tx, table).await? {
        return Ok(TournamentAccess::Granted(ResultChange::NotEditable));
    }

    rorm::update(&mut *tx, TournamentMatchModel)
        .set(TournamentMatchModel.organizer_override, false)
        .set(TournamentMatchModel.result_recorded_by, None)
        .condition(TournamentMatchModel.uuid.equals(table.into_inner()))
        .await?;

    let status = recompute(&mut *tx, table, None).await?;

    Tournament::audit(
        &mut *tx,
        tournament,
        Some(account),
        AuditAction::MatchResultCleared,
        Some(table.into_inner()),
        None,
    )
    .await?;

    Ok(TournamentAccess::Granted(ResultChange::Changed(status)))
}

/// Re-derive a table's result from everything said about it, and store it
///
/// The stored columns are a cache of this function, written on every change and
/// never consulted to produce the next one.
///
/// @param tx the transaction to write in
/// @param table which table
/// @param organizer the desk's own outcome when it is writing one
///
/// @returns the status now stored
async fn recompute(
    tx: &mut Transaction,
    table: TournamentMatchUuid,
    organizer: Option<Outcome>,
) -> Result<MatchStatus, rorm::Error> {
    let row = rorm::query(
        &mut *tx,
        (
            TournamentMatchModel.is_bye,
            TournamentMatchModel.organizer_override,
        ),
    )
    .condition(TournamentMatchModel.uuid.equals(table.into_inner()))
    .all()
    .await?
    .into_iter()
    .next();
    let Some((is_bye, overridden)) = row else {
        return Ok(MatchStatus::Unreported);
    };

    let seats = seats_at(&mut *tx, table).await?;
    // A desk result that is not being written right now still has to survive a
    // recompute triggered by a late phone report, so it is read back off the
    // row it was stored on.
    let desk = match (organizer, overridden) {
        (Some(outcome), _) => Some(outcome),
        (None, true) => stored_outcome(&mut *tx, table).await?,
        (None, false) => None,
    };
    let claims = claims_on(&mut *tx, table).await?;

    let state = resolve(&MatchInput {
        is_bye,
        seats: &seats,
        organizer: desk,
        claims: &claims,
    });

    let (status, outcome) = match state {
        MatchState::Unreported => (MatchStatus::Unreported, None),
        MatchState::Pending(outcome) => (MatchStatus::Pending, Some(outcome)),
        MatchState::Confirmed(outcome) => (MatchStatus::Confirmed, Some(outcome)),
        MatchState::Disputed => (MatchStatus::Disputed, None),
    };
    // Only a settled table carries an outcome on the row: a pending or disputed
    // one must not look like a result to the standings engine, which reads
    // outcomes rather than statuses.
    let settled = matches!(status, MatchStatus::Confirmed);

    rorm::update(&mut *tx, TournamentMatchModel)
        .set(TournamentMatchModel.status, status)
        .set(
            TournamentMatchModel.winner_participant,
            settled
                .then(|| outcome.and_then(|outcome| outcome.winner))
                .flatten()
                .map(ForeignModelByField),
        )
        .set(
            TournamentMatchModel.is_draw,
            settled && outcome.is_some_and(|outcome| outcome.draw),
        )
        .set(
            TournamentMatchModel.games_drawn,
            if settled {
                outcome.map(|outcome| outcome.games_drawn).unwrap_or(0)
            } else {
                0
            },
        )
        .set(
            TournamentMatchModel.result_recorded_at,
            settled.then_some(OffsetDateTime::now_utc()),
        )
        .condition(TournamentMatchModel.uuid.equals(table.into_inner()))
        .await?;

    // Per-seat game wins, which is what the game-win tiebreakers read. A seat
    // that did not win the match takes the loser's count, which for a pod —
    // always best of one — is simply zero.
    for seat in &seats {
        let games = match (settled, outcome) {
            (true, Some(outcome)) if outcome.draw => outcome.winner_games,
            (true, Some(outcome)) if outcome.winner == Some(*seat) => outcome.winner_games,
            (true, Some(outcome)) => outcome.loser_games,
            _ => 0,
        };
        rorm::update(&mut *tx, TournamentSeatModel)
            .set(TournamentSeatModel.games_won, games)
            .condition(rorm::and![
                TournamentSeatModel
                    .tournament_match
                    .equals(table.into_inner()),
                TournamentSeatModel.participant.equals(*seat),
            ])
            .await?;
    }

    Ok(status)
}

/// Who is sitting at a table, in seat order
///
/// @param tx the transaction to read in
/// @param table which table
///
/// @returns their participant uuids
async fn seats_at(
    tx: &mut Transaction,
    table: TournamentMatchUuid,
) -> Result<Vec<Uuid>, rorm::Error> {
    let mut rows = rorm::query(
        &mut *tx,
        (TournamentSeatModel.participant, TournamentSeatModel.seat),
    )
    .condition(
        TournamentSeatModel
            .tournament_match
            .equals(table.into_inner()),
    )
    .all()
    .await?;
    rows.sort_by_key(|(_, seat)| *seat);
    Ok(rows
        .into_iter()
        .map(|(participant, _)| participant.0)
        .collect())
}

/// Which participant rows this actor speaks for in this tournament
///
/// @param tx the transaction to read in
/// @param actor who is asking
/// @param tournament which tournament
///
/// @returns their participant uuids
async fn own_seats(
    tx: &mut Transaction,
    actor: &TournamentActor,
    tournament: TournamentUuid,
) -> Result<Vec<Uuid>, rorm::Error> {
    match actor {
        TournamentActor::Account(account) => {
            Ok(rorm::query(&mut *tx, TournamentParticipantModel.uuid)
                .condition(rorm::and![
                    TournamentParticipantModel.tournament.equals(tournament.0),
                    TournamentParticipantModel
                        .account
                        .equals(Some(account.uuid.into_inner())),
                ])
                .all()
                .await?)
        }
        // A guest's session carries uuids it cannot prove belong here, so they
        // are re-checked against the tournament rather than trusted.
        TournamentActor::Guest(participants) => {
            let claimed: Vec<Uuid> = participants.iter().map(|p| p.into_inner()).collect();
            if claimed.is_empty() {
                return Ok(Vec::new());
            }
            Ok(rorm::query(&mut *tx, TournamentParticipantModel.uuid)
                .condition(TournamentParticipantModel.tournament.equals(tournament.0))
                .all()
                .await?
                .into_iter()
                .filter(|uuid| claimed.contains(uuid))
                .collect())
        }
    }
}

/// Every claim filed on a table
///
/// @param tx the transaction to read in
/// @param table which table
///
/// @returns the claims
async fn claims_on(
    tx: &mut Transaction,
    table: TournamentMatchUuid,
) -> Result<Vec<Claim>, rorm::Error> {
    Ok(rorm::query(
        &mut *tx,
        (
            TournamentResultReportModel.reported_by,
            TournamentResultReportModel.claimed_winner,
            TournamentResultReportModel.claimed_draw,
            TournamentResultReportModel.claimed_winner_games,
            TournamentResultReportModel.claimed_loser_games,
            TournamentResultReportModel.claimed_games_drawn,
        ),
    )
    .condition(
        TournamentResultReportModel
            .tournament_match
            .equals(table.into_inner()),
    )
    .all()
    .await?
    .into_iter()
    .map(
        |(by, winner, draw, winner_games, loser_games, games_drawn)| Claim {
            by: by.0,
            outcome: Outcome {
                winner: winner.map(|winner| winner.0),
                draw,
                winner_games,
                loser_games,
                games_drawn,
            },
        },
    )
    .collect())
}

/// The outcome already stored on a table
///
/// @param tx the transaction to read in
/// @param table which table
///
/// @returns the outcome, or `None` for a table with no result on it
async fn stored_outcome(
    tx: &mut Transaction,
    table: TournamentMatchUuid,
) -> Result<Option<Outcome>, rorm::Error> {
    let row = rorm::query(
        &mut *tx,
        (
            TournamentMatchModel.winner_participant,
            TournamentMatchModel.is_draw,
            TournamentMatchModel.games_drawn,
        ),
    )
    .condition(TournamentMatchModel.uuid.equals(table.into_inner()))
    .all()
    .await?
    .into_iter()
    .next();
    let Some((winner, draw, games_drawn)) = row else {
        return Ok(None);
    };
    if winner.is_none() && !draw {
        return Ok(None);
    }

    let seats = rorm::query(
        &mut *tx,
        (
            TournamentSeatModel.participant,
            TournamentSeatModel.games_won,
        ),
    )
    .condition(
        TournamentSeatModel
            .tournament_match
            .equals(table.into_inner()),
    )
    .all()
    .await?;
    let winner_uuid = winner.map(|winner| winner.0);
    let winner_games = seats
        .iter()
        .find(|(participant, _)| Some(participant.0) == winner_uuid)
        .map(|(_, games)| *games)
        .unwrap_or_else(|| seats.first().map(|(_, games)| *games).unwrap_or(0));
    let loser_games = seats
        .iter()
        .find(|(participant, _)| Some(participant.0) != winner_uuid)
        .map(|(_, games)| *games)
        .unwrap_or(0);

    Ok(Some(Outcome {
        winner: winner_uuid,
        draw,
        winner_games,
        loser_games,
        games_drawn,
    }))
}

/// Whether the round a table belongs to is still open
///
/// @param tx the transaction to read in
/// @param table which table
///
/// @returns whether anything may still be written to it
async fn round_open(tx: &mut Transaction, table: TournamentMatchUuid) -> Result<bool, rorm::Error> {
    let Some(round) = rorm::query(&mut *tx, TournamentMatchModel.round)
        .condition(TournamentMatchModel.uuid.equals(table.into_inner()))
        .all()
        .await?
        .into_iter()
        .next()
    else {
        return Ok(false);
    };
    Ok(rorm::query(&mut *tx, TournamentRoundModel.status)
        .condition(TournamentRoundModel.uuid.equals(round.0))
        .all()
        .await?
        .into_iter()
        .next()
        .is_some_and(|status| status != RoundStatus::Complete))
}

/// Whether a table belongs to this tournament, and whether it is a bye
///
/// @param tx the transaction to read in
/// @param tournament the table should belong to
/// @param table which table
///
/// @returns whether it is a bye, or `None` when it is not this tournament's
async fn table_is_bye(
    tx: &mut Transaction,
    tournament: TournamentUuid,
    table: TournamentMatchUuid,
) -> Result<Option<bool>, rorm::Error> {
    Ok(rorm::query(&mut *tx, TournamentMatchModel.is_bye)
        .condition(rorm::and![
            TournamentMatchModel.uuid.equals(table.into_inner()),
            TournamentMatchModel.tournament.equals(tournament.0),
        ])
        .all()
        .await?
        .into_iter()
        .next())
}

/// Whether an outcome says something a table could actually have produced
///
/// @param winner who is claimed to have won
/// @param draw whether a draw is claimed
/// @param seats who is at the table
///
/// @returns whether it is worth storing
fn valid(winner: &Option<TournamentParticipantUuid>, draw: bool, seats: &[Uuid]) -> bool {
    match (winner, draw) {
        (Some(winner), false) => seats.contains(&winner.into_inner()),
        (None, true) => true,
        // A winner *and* a draw, or neither, is not an outcome.
        _ => false,
    }
}
