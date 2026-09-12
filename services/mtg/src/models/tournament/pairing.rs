//! The tables under a round: who sits where, and which number it is printed with
//!
//! The decision itself is [`crate::tournament::pairing`], which is pure. This
//! module is the part that reads a field out of the database, hands it over,
//! and writes the answer back — the same split the rest of this model tree
//! keeps, and the reason a pairing is reproducible from its seed.
//!
//! Pairing writes directly rather than offering a preview to commit. The race
//! a preview would guard — somebody drops at the desk while the organizer is
//! looking at the projector — is better served by a button: re-pair, and get a
//! fresh round in a second. A staged preview turns that into an error at the
//! exact moment an organizer wants to print.

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use galvyn::rorm::fields::types::MaxStr;
use rand::RngExt;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::tournament::AuditAction;
use crate::models::tournament::MatchStatus;
use crate::models::tournament::ParticipantStatus;
use crate::models::tournament::RoundKind;
use crate::models::tournament::RoundStatus;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentAccess;
use crate::models::tournament::TournamentMatchUuid;
use crate::models::tournament::TournamentParticipantUuid;
use crate::models::tournament::TournamentRoundUuid;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::db::TournamentMatchInsertPatch;
use crate::models::tournament::db::TournamentMatchModel;
use crate::models::tournament::db::TournamentParticipantModel;
use crate::models::tournament::db::TournamentRoundModel;
use crate::models::tournament::db::TournamentSeatInsertPatch;
use crate::models::tournament::db::TournamentSeatModel;
use crate::models::tournament::round;
use crate::tournament::pairing::Entrant;
use crate::tournament::pairing::EntrantId;
use crate::tournament::pairing::PairingError;
use crate::tournament::pairing::PairingKind;
use crate::tournament::pairing::PairingSnapshot;
use crate::tournament::pairing::PairingWarning;

/// One seat at one table
#[derive(Debug, Clone)]
pub struct MatchSeat {
    /// Who sits here
    pub participant: TournamentParticipantUuid,
    /// The name they appear under
    pub display_name: MaxStr<64>,
    /// Turn order at the table, 1-based
    pub seat: i16,
    /// How many games this seat won
    pub games_won: i16,
    /// Whether they have since left the event
    pub dropped: bool,
    /// The table they cannot leave, if there is one
    pub fixed_table: Option<i16>,
}

/// One table of a paired round
#[derive(Debug, Clone)]
pub struct MatchTable {
    /// Primary key
    pub uuid: TournamentMatchUuid,
    /// The number printed on it
    pub table_number: i16,
    /// How far its result has got
    pub status: MatchStatus,
    /// Whether it is a bye rather than a table anybody sits at
    pub is_bye: bool,
    /// Who won, `None` for a draw or a table nobody has reported
    pub winner: Option<TournamentParticipantUuid>,
    /// Whether the table was drawn
    pub is_draw: bool,
    /// Who sits there, in seat order
    pub seats: Vec<MatchSeat>,
}

/// A pin the layout could not honour
///
/// Two players who cannot leave their table asked for the same number. The
/// lower-numbered table kept it; nothing about who plays whom changed, so the
/// round is valid either way and an organizer simply has to move somebody.
#[derive(Debug, Clone)]
pub struct FixedTablePin {
    /// The number both asked for
    pub table_number: i16,
    /// Who did not get it
    pub participant: TournamentParticipantUuid,
}

/// Outcome of [`pair`]
#[derive(Debug, Clone)]
pub enum PairOutcome {
    /// The round was paired, replacing whatever it held
    Paired {
        /// The tables, in table-number order
        tables: Vec<MatchTable>,
        /// Pins the layout could not honour
        warnings: Vec<FixedTablePin>,
    },
    /// The round is closed, or is a deckbuilding stage, which has no tables
    NotPairable,
    /// Somebody has already reported a table; re-pairing would throw it away
    ResultsReported,
    /// Nobody is checked in, so there is nobody to seat
    NoEntrants,
    /// The field divides into neither full pods nor pods one smaller
    ImpossiblePods,
}

/// Every table of a round, in table-number order
///
/// Unguarded on purpose, like the rest of this module's reads: the caller has
/// already resolved the tournament for its viewer, which is where the decision
/// about who may look belongs.
///
/// @param tx the transaction to read in
/// @param tournament the round belongs to
/// @param round which round
///
/// @returns its tables
#[instrument(name = "pairing::tables", skip(tx))]
pub async fn tables(
    tx: &mut Transaction,
    tournament: TournamentUuid,
    round: TournamentRoundUuid,
) -> Result<Vec<MatchTable>, rorm::Error> {
    let rows = rorm::query(
        &mut *tx,
        (
            TournamentMatchModel.uuid,
            TournamentMatchModel.table_number,
            TournamentMatchModel.status,
            TournamentMatchModel.is_bye,
            TournamentMatchModel.winner_participant,
            TournamentMatchModel.is_draw,
        ),
    )
    .condition(rorm::and![
        TournamentMatchModel.round.equals(round.into_inner()),
        TournamentMatchModel.tournament.equals(tournament.0),
    ])
    .all()
    .await?;
    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let names = roster_names(&mut *tx, tournament).await?;
    let mut seats = seats_of(
        &mut *tx,
        tournament,
        &rows.iter().map(|row| row.0).collect::<Vec<_>>(),
    )
    .await?;

    let mut tables: Vec<MatchTable> = rows
        .into_iter()
        .map(|(uuid, table_number, status, is_bye, winner, is_draw)| {
            let mut seated = seats.remove(&uuid).unwrap_or_default();
            seated.sort_by_key(|seat| seat.seat);
            MatchTable {
                uuid: TournamentMatchUuid(uuid),
                table_number,
                status,
                is_bye,
                winner: winner.map(|winner| TournamentParticipantUuid(winner.0)),
                is_draw,
                seats: seated
                    .into_iter()
                    .map(|mut seat| {
                        if let Some(entry) = names.get(&seat.participant.0) {
                            seat.display_name = entry.display_name.clone();
                            seat.dropped = entry.dropped;
                            seat.fixed_table = entry.fixed_table;
                        }
                        seat
                    })
                    .collect(),
            }
        })
        .collect();
    tables.sort_by_key(|table| (table.is_bye, table.table_number));
    Ok(tables)
}

/// One table, for the surface that just changed it
///
/// @param tx the transaction to read in
/// @param tournament the table belongs to
/// @param table which table
///
/// @returns the table, or `None` when it is not this tournament's
#[instrument(name = "pairing::one_table", skip(tx))]
pub async fn one_table(
    tx: &mut Transaction,
    tournament: TournamentUuid,
    table: TournamentMatchUuid,
) -> Result<Option<MatchTable>, rorm::Error> {
    let Some(round) = rorm::query(&mut *tx, TournamentMatchModel.round)
        .condition(rorm::and![
            TournamentMatchModel.uuid.equals(table.into_inner()),
            TournamentMatchModel.tournament.equals(tournament.0),
        ])
        .all()
        .await?
        .into_iter()
        .next()
    else {
        return Ok(None);
    };
    Ok(tables(&mut *tx, tournament, TournamentRoundUuid(round.0))
        .await?
        .into_iter()
        .find(|found| found.uuid.into_inner() == table.into_inner()))
}

/// Pair a round, replacing whatever it already held
///
/// Guarded on holding any role rather than on managing the event, for the
/// reason [`round`]'s own module docs give: a scorekeeper is exactly who runs
/// rounds.
///
/// @param tx the transaction to write in
/// @param account who is asking
/// @param tournament the round belongs to
/// @param round which round
///
/// @returns the tables, or why there are none
#[instrument(name = "pairing::pair", skip(tx))]
pub async fn pair(
    tx: &mut Transaction,
    account: AccountUuid,
    tournament: TournamentUuid,
    round: TournamentRoundUuid,
) -> Result<TournamentAccess<PairOutcome>, rorm::Error> {
    let Some((_, event)) = Tournament::get_as_organizer(&mut *tx, account, tournament)
        .await?
        .granted()
    else {
        return Ok(TournamentAccess::Denied);
    };
    let Some(found) = round::one(&mut *tx, tournament, round).await? else {
        return Ok(TournamentAccess::Denied);
    };

    // A deckbuilding stage is a clock and nothing else, and a closed round is
    // history somebody would be rewriting.
    if found.status == RoundStatus::Complete || found.kind == RoundKind::Deckbuilding {
        return Ok(TournamentAccess::Granted(PairOutcome::NotPairable));
    }

    // Byes are `Confirmed` the moment they are written, so a guard that simply
    // looked for a non-`Unreported` table could never re-pair an odd field.
    let reported = rorm::query(
        &mut *tx,
        (TournamentMatchModel.status, TournamentMatchModel.is_bye),
    )
    .condition(TournamentMatchModel.round.equals(round.into_inner()))
    .all()
    .await?
    .into_iter()
    .any(|(status, is_bye)| !is_bye && status != MatchStatus::Unreported);
    if reported {
        return Ok(TournamentAccess::Granted(PairOutcome::ResultsReported));
    }

    let pod_size = usize::try_from(found.pod_size.unwrap_or(event.pod_size)).unwrap_or(2);
    let kind = match found.kind {
        RoundKind::Draft => PairingKind::Draft,
        _ => PairingKind::Swiss,
    };
    let repairing = !rorm::query(&mut *tx, TournamentMatchModel.uuid)
        .condition(TournamentMatchModel.round.equals(round.into_inner()))
        .all()
        .await?
        .is_empty();

    let snapshot = snapshot(&mut *tx, &event, tournament, round, kind, pod_size).await?;
    if snapshot.entrants.is_empty() {
        return Ok(TournamentAccess::Granted(PairOutcome::NoEntrants));
    }
    let layout = match crate::tournament::pairing::pair(&snapshot) {
        Ok(layout) => layout,
        Err(PairingError::NoEntrants) => {
            return Ok(TournamentAccess::Granted(PairOutcome::NoEntrants));
        }
        Err(PairingError::ImpossiblePods) => {
            return Ok(TournamentAccess::Granted(PairOutcome::ImpossiblePods));
        }
    };

    // Seats first: the foreign key cascades, but relying on a cascade for a
    // delete this module issues itself reads as an accident waiting to happen.
    let held: Vec<Uuid> = rorm::query(&mut *tx, TournamentMatchModel.uuid)
        .condition(TournamentMatchModel.round.equals(round.into_inner()))
        .all()
        .await?;
    for held in held {
        rorm::delete(&mut *tx, TournamentSeatModel)
            .condition(TournamentSeatModel.tournament_match.equals(held))
            .await?;
    }
    rorm::delete(&mut *tx, TournamentMatchModel)
        .condition(TournamentMatchModel.round.equals(round.into_inner()))
        .await?;

    let now = OffsetDateTime::now_utc();
    for table in &layout.tables {
        let uuid = Uuid::now_v7();
        // A bye is decided the moment it is dealt: nobody plays it, so there is
        // nothing for anyone to report and no reason to leave it open.
        let winner = table
            .is_bye
            .then(|| table.seats.first().copied())
            .flatten()
            .map(ForeignModelByField);
        rorm::insert(&mut *tx, TournamentMatchModel)
            .single(&TournamentMatchInsertPatch {
                uuid,
                round: ForeignModelByField(round.into_inner()),
                tournament: ForeignModelByField(tournament.0),
                table_number: table.number,
                status: if table.is_bye {
                    MatchStatus::Confirmed
                } else {
                    MatchStatus::Unreported
                },
                is_bye: table.is_bye,
                winner_participant: winner,
                result_recorded_at: table.is_bye.then_some(now),
            })
            .await?;

        for (index, participant) in table.seats.iter().enumerate() {
            rorm::insert(&mut *tx, TournamentSeatModel)
                .single(&TournamentSeatInsertPatch {
                    uuid: Uuid::now_v7(),
                    tournament_match: ForeignModelByField(uuid),
                    tournament: ForeignModelByField(tournament.0),
                    participant: ForeignModelByField(*participant),
                    seat: i16::try_from(index + 1).unwrap_or(i16::MAX),
                })
                .await?;
        }
    }

    // A fresh seed every time, so the button an organizer presses when a layout
    // looks wrong actually produces a different one. Bound to a `let` rather
    // than called inline: a `ThreadRng` temporary lives to the end of its
    // statement, and one spanning the `.await` below makes this whole future
    // `!Send` — the same trap `participant::register_account` documents.
    let next_seed = rand::rng().random::<i64>();
    rorm::update(&mut *tx, TournamentRoundModel)
        .set(TournamentRoundModel.pairing_seed, next_seed)
        .set(
            TournamentRoundModel.pod_size,
            Some(i16::try_from(pod_size).unwrap_or(2)),
        )
        .condition(TournamentRoundModel.uuid.equals(round.into_inner()))
        .await?;

    Tournament::audit(
        &mut *tx,
        tournament,
        Some(account),
        if repairing {
            AuditAction::RoundRepaired
        } else {
            AuditAction::RoundPaired
        },
        Some(round.into_inner()),
        None,
    )
    .await?;

    Ok(TournamentAccess::Granted(PairOutcome::Paired {
        tables: tables(&mut *tx, tournament, round).await?,
        warnings: layout
            .warnings
            .into_iter()
            .map(|warning| match warning {
                PairingWarning::FixedTableTaken { number, entrant } => FixedTablePin {
                    table_number: number,
                    participant: TournamentParticipantUuid(entrant),
                },
            })
            .collect(),
    }))
}

/// Build the field this round pairs from
///
/// @param tx the transaction to read in
/// @param event the tournament, for its scoring table
/// @param tournament which tournament
/// @param round the round being paired, so it is left out of its own history
/// @param kind what the round is for
/// @param pod_size how many a full table seats
///
/// @returns the snapshot, entrants in standings order
async fn snapshot(
    tx: &mut Transaction,
    event: &Tournament,
    tournament: TournamentUuid,
    round: TournamentRoundUuid,
    kind: PairingKind,
    pod_size: usize,
) -> Result<PairingSnapshot, rorm::Error> {
    // Checked in, and only checked in: starting the event drops everybody who
    // never was, and an organizer's late entry is written checked in already.
    let roster = rorm::query(
        &mut *tx,
        (
            TournamentParticipantModel.uuid,
            TournamentParticipantModel.status,
            TournamentParticipantModel.seed,
            TournamentParticipantModel.fixed_table,
        ),
    )
    .condition(TournamentParticipantModel.tournament.equals(tournament.0))
    .all()
    .await?;

    let played = history(&mut *tx, tournament, round).await?;
    let seed = rorm::query(&mut *tx, TournamentRoundModel.pairing_seed)
        .condition(TournamentRoundModel.uuid.equals(round.into_inner()))
        .all()
        .await?
        .into_iter()
        .next()
        .unwrap_or_default();

    let mut entrants: Vec<(i32, Entrant)> = roster
        .into_iter()
        .filter(|(_, status, _, _)| *status == ParticipantStatus::CheckedIn)
        .map(|(uuid, _, tiebreak, fixed_table)| {
            let record = played.records.get(&uuid);
            (
                tiebreak,
                Entrant {
                    id: uuid,
                    match_points: record.map(|record| record.points(event)).unwrap_or(0),
                    had_bye: record.is_some_and(|record| record.byes > 0),
                    small_pod_rounds: record.map(|record| record.small_pods).unwrap_or(0),
                    fixed_table,
                },
            )
        })
        .collect();

    // Points, then the roster's own tiebreak seed. The full ordering — opponent
    // match win and the rest of Appendix C — belongs to the standings engine,
    // which does not exist yet; until it does this is the whole of "who is
    // ahead of whom", and it is exactly right for a first round.
    entrants.sort_by(|(left_seed, left), (right_seed, right)| {
        right
            .match_points
            .cmp(&left.match_points)
            .then(left_seed.cmp(right_seed))
    });

    Ok(PairingSnapshot {
        kind,
        pod_size,
        entrants: entrants.into_iter().map(|(_, entrant)| entrant).collect(),
        history: played.met,
        seed: seed as u64,
    })
}

/// What one entrant has done in the rounds behind them
#[derive(Debug, Default)]
struct Record {
    /// Match points won
    wins: i32,
    /// Matches drawn
    draws: i32,
    /// Matches lost
    losses: i32,
    /// Byes taken
    byes: u32,
    /// Rounds spent in a pod smaller than the round's own size
    small_pods: u32,
}

impl Record {
    /// The entrant's match points under this event's scoring table
    ///
    /// @param event the tournament, for its point values
    ///
    /// @returns the points
    fn points(&self, event: &Tournament) -> i32 {
        self.wins * i32::from(event.points_win)
            + self.draws * i32::from(event.points_draw)
            + self.losses * i32::from(event.points_loss)
            + self.byes as i32 * i32::from(event.points_bye)
    }
}

/// Everything the rounds behind this one say about the field
#[derive(Debug, Default)]
struct History {
    /// Who has sat down against whom, one entry per meeting
    met: Vec<(EntrantId, EntrantId)>,
    /// What each entrant has done
    records: std::collections::HashMap<Uuid, Record>,
}

/// Read the scored rounds behind this one
///
/// **Only [`RoundKind::Swiss`] rounds.** Without that filter seven draft
/// pod-mates count as previous opponents, and round one then pairs around
/// people who have never played a game against each other.
///
/// @param tx the transaction to read in
/// @param tournament whose history
/// @param round the round being paired, which is left out of its own history
///
/// @returns the history
async fn history(
    tx: &mut Transaction,
    tournament: TournamentUuid,
    round: TournamentRoundUuid,
) -> Result<History, rorm::Error> {
    let scored: Vec<(Uuid, Option<i16>)> = rorm::query(
        &mut *tx,
        (TournamentRoundModel.uuid, TournamentRoundModel.pod_size),
    )
    .condition(rorm::and![
        TournamentRoundModel.tournament.equals(tournament.0),
        TournamentRoundModel.kind.equals(RoundKind::Swiss),
    ])
    .all()
    .await?
    .into_iter()
    .filter(|(uuid, _)| *uuid != round.into_inner())
    .collect();
    if scored.is_empty() {
        return Ok(History::default());
    }

    let matches = rorm::query(
        &mut *tx,
        (
            TournamentMatchModel.uuid,
            TournamentMatchModel.round,
            TournamentMatchModel.is_bye,
            TournamentMatchModel.status,
            TournamentMatchModel.winner_participant,
            TournamentMatchModel.is_draw,
        ),
    )
    .condition(TournamentMatchModel.tournament.equals(tournament.0))
    .all()
    .await?;
    let seats = rorm::query(
        &mut *tx,
        (
            TournamentSeatModel.tournament_match,
            TournamentSeatModel.participant,
        ),
    )
    .condition(TournamentSeatModel.tournament.equals(tournament.0))
    .all()
    .await?;

    let mut at_table: std::collections::HashMap<Uuid, Vec<Uuid>> = std::collections::HashMap::new();
    for (table, participant) in seats {
        at_table.entry(table.0).or_default().push(participant.0);
    }

    let mut history = History::default();
    for (uuid, round_of, is_bye, status, winner, is_draw) in matches {
        let Some((_, pod_size)) = scored.iter().find(|(scored, _)| *scored == round_of.0) else {
            continue;
        };
        let seated = at_table.remove(&uuid).unwrap_or_default();

        if is_bye {
            for participant in &seated {
                history.records.entry(*participant).or_default().byes += 1;
            }
            continue;
        }

        for (index, one) in seated.iter().enumerate() {
            for other in &seated[index + 1..] {
                history.met.push((*one, *other));
            }
        }
        if pod_size.is_some_and(|size| seated.len() < usize::try_from(size).unwrap_or(0)) {
            for participant in &seated {
                history.records.entry(*participant).or_default().small_pods += 1;
            }
        }

        // Only a settled table moves anybody's points.
        if status != MatchStatus::Confirmed {
            continue;
        }
        for participant in &seated {
            let record = history.records.entry(*participant).or_default();
            if is_draw {
                record.draws += 1;
            } else if winner
                .as_ref()
                .is_some_and(|winner| winner.0 == *participant)
            {
                record.wins += 1;
            } else {
                record.losses += 1;
            }
        }
    }
    Ok(history)
}

/// What a table needs to know about somebody beyond their seat
struct RosterEntry {
    /// The name they appear under
    display_name: MaxStr<64>,
    /// Whether they have since left the event
    dropped: bool,
    /// The table they cannot leave, if there is one
    fixed_table: Option<i16>,
}

/// The roster, for rendering a table
///
/// @param tx the transaction to read in
/// @param tournament whose roster
///
/// @returns each participant's name, whether they have left, and their pin
async fn roster_names(
    tx: &mut Transaction,
    tournament: TournamentUuid,
) -> Result<std::collections::HashMap<Uuid, RosterEntry>, rorm::Error> {
    Ok(rorm::query(
        &mut *tx,
        (
            TournamentParticipantModel.uuid,
            TournamentParticipantModel.display_name,
            TournamentParticipantModel.status,
            TournamentParticipantModel.fixed_table,
        ),
    )
    .condition(TournamentParticipantModel.tournament.equals(tournament.0))
    .all()
    .await?
    .into_iter()
    .map(|(uuid, display_name, status, fixed_table)| {
        (
            uuid,
            RosterEntry {
                display_name,
                dropped: matches!(
                    status,
                    ParticipantStatus::Dropped | ParticipantStatus::Disqualified
                ),
                fixed_table,
            },
        )
    })
    .collect())
}

/// The seats of a set of tables, keyed by table
///
/// @param tx the transaction to read in
/// @param tournament the tables belong to
/// @param wanted which tables
///
/// @returns their seats, unsorted
async fn seats_of(
    tx: &mut Transaction,
    tournament: TournamentUuid,
    wanted: &[Uuid],
) -> Result<std::collections::HashMap<Uuid, Vec<MatchSeat>>, rorm::Error> {
    let rows = rorm::query(
        &mut *tx,
        (
            TournamentSeatModel.tournament_match,
            TournamentSeatModel.participant,
            TournamentSeatModel.seat,
            TournamentSeatModel.games_won,
        ),
    )
    .condition(TournamentSeatModel.tournament.equals(tournament.0))
    .all()
    .await?;

    let mut seats: std::collections::HashMap<Uuid, Vec<MatchSeat>> =
        std::collections::HashMap::new();
    for (table, participant, seat, games_won) in rows {
        if !wanted.contains(&table.0) {
            continue;
        }
        seats.entry(table.0).or_default().push(MatchSeat {
            participant: TournamentParticipantUuid(participant.0),
            display_name: MaxStr::new(String::new())
                .unwrap_or_else(|_| unreachable!("the empty string fits in sixty-four characters")),
            seat,
            games_won,
            dropped: false,
            fixed_table: None,
        });
    }
    Ok(seats)
}
