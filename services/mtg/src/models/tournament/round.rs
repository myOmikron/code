//! The Rounds of a Tournament: pairing, starting and ending them, and their Results
//!
//! The rows only; what to pair and how to rank is the engine's, see
//! [`crate::tournament`]. [`Tournament::record`] reads the rows into the
//! engine's [`TournamentRecord`], the operations here store what it answers.
//!
//! A Round is paired as a preview only Organizers see, then started, then
//! ended once every Match has a Result. The Swiss Rounds come first; a Top
//! cut, if the Tournament has one, follows with Rounds of its own that go on
//! counting. Every operation here expects the
//! Tournament taken with [`Tournament::lock_for_update`], so two Organizers
//! acting at once are served one after the other.

use std::collections::HashMap;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::ForeignModelByField;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use tracing::instrument;
use uuid::Uuid;

use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentState;
use crate::models::tournament::db::TournamentMatchInsertPatch;
use crate::models::tournament::db::TournamentMatchModel;
use crate::models::tournament::db::TournamentModel;
use crate::models::tournament::db::TournamentRoundInsertPatch;
use crate::models::tournament::db::TournamentRoundModel;
use crate::models::tournament::db::TournamentSeatInsertPatch;
use crate::models::tournament::db::TournamentSeatModel;
use crate::models::tournament::db::round_key;
use crate::models::tournament::participant::ParticipantUuid;
use crate::models::tournament::result::ResultChange;
use crate::models::tournament::result::ResultChangeKind;
use crate::models::tournament::result::store_result;
use crate::tournament::layout::Meetings;
use crate::tournament::layout::blank_layout;
use crate::tournament::pairing::PairedMatch;
use crate::tournament::pairing::Pairing;
use crate::tournament::pairing::PairingError;
use crate::tournament::pairing::pair_next_round;
use crate::tournament::record::Entrant;
use crate::tournament::record::EntrantId;
use crate::tournament::record::MatchRecord;
use crate::tournament::record::MatchResult;
use crate::tournament::record::RoundRecord;
use crate::tournament::record::TournamentRecord;
use crate::tournament::reporting::ResultState;
use crate::tournament::rounds::suggested_swiss_rounds;
use crate::tournament::ruleset::single_game_admits;
use crate::tournament::timer::RoundTimer;
use crate::tournament::top_cut::TopCutError;
use crate::tournament::top_cut::bracket_size;
use crate::tournament::top_cut::cut_over;
use crate::tournament::top_cut::cut_size;
use crate::tournament::top_cut::names_dropped_winner;
use crate::tournament::top_cut::pair_top_cut;
use crate::tournament::top_cut::top_cut_winner;

/// How far a Round got
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum RoundState {
    /// Paired, seen by Organizers only, not played yet
    Previewed,
    /// Started: its Matches are being played
    Running,
    /// Over: every Match has its Result, none disputed
    Ended,
}
custom_db_enum! {
    enum: RoundState,
    variants: [Previewed, Running, Ended],
    decoder: RoundStateDecoder,
}

/// Which part of a Tournament a Round belongs to
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum RoundStage {
    /// A Swiss Round: it counts for the standings
    #[default]
    Swiss,
    /// A Round of the Top cut: single elimination, no standings
    TopCut,
}
custom_db_enum! {
    enum: RoundStage,
    variants: [Swiss, TopCut],
    decoder: RoundStageDecoder,
}

/// One Round of a Tournament with its Matches
#[derive(Debug, Clone)]
pub struct Round {
    /// Its number, 1 for the first Round; the Top cut goes on counting
    pub number: i16,
    /// Whether it is a Swiss Round or one of the Top cut
    pub stage: RoundStage,
    /// How far it got
    pub state: RoundState,
    /// Its Matches by table number, then its Byes
    pub matches: Vec<Match>,
    /// Its round timer since it started, `None` before and for a Round without one
    pub timer: Option<RoundTimer>,
}

/// One Match of a Round, or a Bye
#[derive(Debug, Clone)]
pub struct Match {
    /// Primary key
    pub uuid: MatchUuid,
    /// The number of its table, 1 for the top table; `None` for a Bye
    pub table_number: Option<i16>,
    /// Who plays, by Seat number
    pub seats: Vec<Seat>,
    /// Games nobody won, `None` while it has no Result
    pub games_drawn: Option<i16>,
    /// Where its Result stands, `None` while it has none
    pub result_state: Option<ResultState>,
    /// The Participant who reported the Result, `None` when an Organizer set it
    pub reported_by: Option<ParticipantUuid>,
    /// The Participant who disputed the Result, `None` unless it is disputed
    pub disputed_by: Option<ParticipantUuid>,
    /// Whether some of its Participants met in an earlier Round
    pub rematch: bool,
}

impl Match {
    /// Whether it is a Bye rather than a Match anybody plays
    pub fn is_bye(&self) -> bool {
        self.table_number.is_none()
    }

    /// Whether its Result is in; a Bye needs none
    pub fn settled(&self) -> bool {
        self.is_bye() || self.games_drawn.is_some()
    }

    /// Whether its Result is disputed, holding the Round open until an Organizer settles it
    pub fn disputed(&self) -> bool {
        self.result_state
            .is_some_and(|state| state.holds_round_open())
    }
}

/// A Participant's Seat in a Match
#[derive(Debug, Clone)]
pub struct Seat {
    /// Who sits there
    pub participant: ParticipantUuid,
    /// The Seat number, 1 for the first turn
    pub seat: i16,
    /// Games won, `None` while the Match has no Result
    pub games_won: Option<i16>,
}

/// Wrapper for the primary key of a [`Match`]
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct MatchUuid(Uuid);

impl MatchUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }
}

/// Why a Round could not be paired, started or ended
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoundRefusal {
    /// The Tournament is Finished or Cancelled
    TournamentOver,
    /// A Round is previewed or running, so the next one waits
    RoundOpen,
    /// Every Swiss Round was paired
    AllRoundsPaired,
    /// Fewer than two Participants are pairable
    TooFewParticipants,
    /// No Round of that number is previewed
    NotPreviewed,
    /// No Round of that number is running
    NotRunning,
    /// A Match of the Round has no Result yet
    ResultsMissing,
    /// A Result of the Round is disputed; an Organizer settles it first
    ResultsDisputed,
    /// No Round of that number ended
    NotEnded,
    /// A later Round started, so this one cannot be taken back
    LaterRoundStarted,
}

/// Why a Result could not be set
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResultRefusal {
    /// The Match is none of this Tournament's, or a Bye
    NoSuchMatch,
    /// Its Round is only previewed
    NotStarted,
    /// The game score does not fit the Match
    InvalidScore,
    /// It names a Participant who Dropped as the winner of a multiplayer final
    DroppedWinner,
}

/// The most Swiss Rounds an Organizer can set
pub const MAX_SWISS_ROUNDS: i16 = 30;

impl Tournament {
    /// The engine's seed for this Tournament
    ///
    /// The random tail of its uuid: fixed, so ties fall the same way on every read.
    pub fn seed(&self) -> u64 {
        self.uuid.into_inner().as_u64_pair().1
    }

    /// Every Round, oldest first; `previews` says whether a previewed one is included
    #[instrument(name = "Tournament::rounds", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn rounds(
        &self,
        tx: &mut Transaction,
        previews: bool,
    ) -> Result<Vec<Round>, rorm::Error> {
        let tournament = self.uuid.into_inner();
        let rounds = rorm::query(&mut *tx, TournamentRoundModel)
            .condition(TournamentRoundModel.tournament.equals(tournament))
            .order_asc(TournamentRoundModel.number)
            .all()
            .await?;
        if rounds.is_empty() {
            return Ok(Vec::new());
        }
        let matches = rorm::query(&mut *tx, TournamentMatchModel)
            .condition(TournamentMatchModel.round.tournament.equals(tournament))
            .order_asc(TournamentMatchModel.table_number)
            .order_asc(TournamentMatchModel.uuid)
            .all()
            .await?;
        let seats = rorm::query(&mut *tx, TournamentSeatModel)
            .condition(
                TournamentSeatModel
                    .tournament_match
                    .round
                    .tournament
                    .equals(tournament),
            )
            .order_asc(TournamentSeatModel.seat)
            .all()
            .await?;

        let mut seats_of: HashMap<Uuid, Vec<Seat>> = HashMap::new();
        for seat in seats {
            seats_of
                .entry(seat.tournament_match.0)
                .or_default()
                .push(Seat {
                    participant: ParticipantUuid::new(seat.participant.0),
                    seat: seat.seat,
                    games_won: seat.games_won,
                });
        }
        let mut matches_of: HashMap<Uuid, Vec<Match>> = HashMap::new();
        for row in matches {
            matches_of.entry(row.round.0).or_default().push(Match {
                uuid: MatchUuid(row.uuid),
                table_number: row.table_number,
                seats: seats_of.remove(&row.uuid).unwrap_or_default(),
                games_drawn: row.games_drawn,
                result_state: row.result_state,
                reported_by: row
                    .reported_by
                    .map(|participant| ParticipantUuid::new(participant.0)),
                disputed_by: row
                    .disputed_by
                    .map(|participant| ParticipantUuid::new(participant.0)),
                rematch: false,
            });
        }
        let mut meetings = Meetings::default();
        Ok(rounds
            .into_iter()
            .filter(|round| previews || round.state != RoundState::Previewed)
            .map(|round| {
                let mut matches = matches_of.remove(&round.uuid).unwrap_or_default();
                matches.sort_by_key(|played| (played.table_number.is_none(), played.table_number));
                let timer = round.timer_seconds.zip(round.timer_ends_at).map(
                    |(length_seconds, ends_at)| RoundTimer {
                        length_seconds: u32::try_from(length_seconds).unwrap_or(0),
                        ends_at,
                    },
                );
                for played in matches.iter_mut().filter(|played| !played.is_bye()) {
                    let seats: Vec<Uuid> = played
                        .seats
                        .iter()
                        .map(|seat| seat.participant.into_inner())
                        .collect();
                    played.rematch = meetings.rematch(&seats);
                }
                let round = Round {
                    number: round.number,
                    stage: round.stage,
                    state: round.state,
                    matches,
                    timer,
                };
                meetings.add(&round_record(&round));
                round
            })
            .collect())
    }

    /// This Tournament as the engine sees it: Participants and the Swiss Rounds that started
    ///
    /// The Top cut is no part of it, see [`Self::top_cut_record`].
    #[instrument(name = "Tournament::record", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn record(&self, tx: &mut Transaction) -> Result<TournamentRecord, rorm::Error> {
        let participants = self.participants(tx).await?;
        let mut rounds = self.rounds(tx, false).await?;
        rounds.retain(|round| round.stage == RoundStage::Swiss);
        Ok(TournamentRecord {
            ruleset: self.ruleset,
            table_size: self.table_size,
            entrants: participants
                .iter()
                .map(|participant| Entrant {
                    id: participant.uuid.into_inner(),
                    pairable: participant.pairable(),
                })
                .collect(),
            rounds: rounds.iter().map(round_record).collect(),
            seed: self.seed(),
        })
    }

    /// The Top cut Rounds that started, oldest first, as the engine reads them
    #[instrument(name = "Tournament::top_cut_record", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn top_cut_record(
        &self,
        tx: &mut Transaction,
    ) -> Result<Vec<RoundRecord>, rorm::Error> {
        Ok(self
            .rounds(tx, false)
            .await?
            .iter()
            .filter(|round| round.stage == RoundStage::TopCut)
            .map(round_record)
            .collect())
    }

    /// How many Participants the Top cut takes, `None` without one
    ///
    /// Once the cut started, the size it started with; before, the size the
    /// pairable Participants fill (a Top 8 of seven is a Top 4).
    pub async fn top_cut_size(&self, tx: &mut Transaction) -> Result<Option<i16>, rorm::Error> {
        let Some(top_cut) = self.top_cut else {
            return Ok(None);
        };
        let size = match bracket_size(&self.top_cut_record(tx).await?) {
            Some(size) => Some(size),
            None => cut_size(top_cut, self.table_size, self.pairable(tx).await?),
        };
        Ok(size.and_then(|size| i16::try_from(size).ok()))
    }

    /// Who won the Top cut, `None` without one or while its final has no Result
    #[instrument(name = "Tournament::top_cut_winner", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn top_cut_winner(
        &self,
        tx: &mut Transaction,
    ) -> Result<Option<ParticipantUuid>, rorm::Error> {
        if self.top_cut.is_none() {
            return Ok(None);
        }
        let cut = self.top_cut_record(tx).await?;
        let record = self.record(tx).await?;
        Ok(top_cut_winner(&record, &cut).map(ParticipantUuid::from_entrant))
    }

    /// Whether the Top cut's size and best-of can still change: until the Swiss Rounds are over
    pub fn top_cut_open(&self) -> bool {
        matches!(
            self.state,
            TournamentState::Registration | TournamentState::Swiss
        )
    }

    /// How many Participants the next Round pairs: not those who Dropped nor those who owe the entry fee
    async fn pairable(&self, tx: &mut Transaction) -> Result<usize, rorm::Error> {
        Ok(self
            .participants(tx)
            .await?
            .iter()
            .filter(|participant| participant.pairable())
            .count())
    }

    /// The number of Swiss Rounds the engine suggests for the Participants there are now
    ///
    /// Counts the Participants the next Round pairs, not those who Dropped
    /// nor those who owe the entry fee.
    pub async fn suggested_swiss_rounds(
        &self,
        tx: &mut Transaction,
    ) -> Result<Option<i16>, rorm::Error> {
        let participants = self.pairable(tx).await?;
        Ok(
            suggested_swiss_rounds(self.ruleset, self.table_size, participants)
                .map(|rounds| i16::try_from(rounds).unwrap_or(MAX_SWISS_ROUNDS)),
        )
    }

    /// How many Swiss Rounds are played: an Organizer's number, else the suggestion
    pub async fn planned_swiss_rounds(
        &self,
        tx: &mut Transaction,
    ) -> Result<Option<i16>, rorm::Error> {
        match self.swiss_rounds {
            Some(rounds) => Ok(Some(rounds)),
            None => self.suggested_swiss_rounds(tx).await,
        }
    }

    /// Pair the next Round as a preview, returning its number
    ///
    /// A Tournament entered afterwards is not paired: its Swiss preview seats
    /// the Participants in roster order (see [`blank_layout`]) for an Organizer
    /// to lay out as it was played. Its Top cut is seeded as usual.
    #[instrument(name = "Tournament::pair_round", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn pair_round(
        &self,
        tx: &mut Transaction,
    ) -> Result<Result<i16, RoundRefusal>, rorm::Error> {
        if self.over() {
            return Ok(Err(RoundRefusal::TournamentOver));
        }
        let rounds = self.rounds(tx, true).await?;
        if rounds.iter().any(|round| round.state != RoundState::Ended) {
            return Ok(Err(RoundRefusal::RoundOpen));
        }
        let number = i16::try_from(rounds.len() + 1).unwrap_or(i16::MAX);
        let record = self.record(tx).await?;
        let seed = rand::random::<u64>();
        let (stage, pairing) = if self.state == TournamentState::TopCut {
            let Some(top_cut) = self.top_cut else {
                return Ok(Err(RoundRefusal::AllRoundsPaired));
            };
            let cut = self.top_cut_record(tx).await?;
            match pair_top_cut(&record, top_cut, &cut) {
                Ok(pairing) => (RoundStage::TopCut, pairing),
                Err(TopCutError::TooFewEntrants) => {
                    return Ok(Err(RoundRefusal::TooFewParticipants));
                }
                Err(TopCutError::CutOver) => return Ok(Err(RoundRefusal::AllRoundsPaired)),
            }
        } else {
            if let Some(planned) = self.planned_swiss_rounds(tx).await?
                && number > planned
            {
                return Ok(Err(RoundRefusal::AllRoundsPaired));
            }
            if self.entered_afterwards {
                let blank = blank_layout(&record);
                if blank.matches.is_empty() {
                    return Ok(Err(RoundRefusal::TooFewParticipants));
                }
                (
                    RoundStage::Swiss,
                    Pairing {
                        matches: blank
                            .matches
                            .into_iter()
                            .map(|seats| PairedMatch {
                                seats,
                                rematch: false,
                            })
                            .collect(),
                        byes: blank.byes,
                    },
                )
            } else {
                match pair_next_round(&record, seed) {
                    Ok(pairing) => (RoundStage::Swiss, pairing),
                    Err(PairingError::TooFewEntrants) => {
                        return Ok(Err(RoundRefusal::TooFewParticipants));
                    }
                }
            }
        };

        let round = round_key(self.uuid.into_inner(), number);
        rorm::insert(&mut *tx, TournamentRoundModel)
            .return_nothing()
            .single(&TournamentRoundInsertPatch {
                uuid: round,
                tournament: ForeignModelByField(self.uuid.into_inner()),
                number,
                stage,
                state: RoundState::Previewed,
                pairing_seed: i64::from_ne_bytes(seed.to_ne_bytes()),
            })
            .await?;
        let tables: Vec<&[EntrantId]> = pairing
            .matches
            .iter()
            .map(|paired| paired.seats.as_slice())
            .collect();
        insert_matches(tx, round, &tables, &pairing.byes).await?;
        Ok(Ok(number))
    }

    /// The number of the previewed Round, `None` if there is none
    #[instrument(name = "Tournament::previewed_round", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn previewed_round(&self, tx: &mut Transaction) -> Result<Option<i16>, rorm::Error> {
        rorm::query(&mut *tx, TournamentRoundModel.number)
            .condition(rorm::and![
                TournamentRoundModel
                    .tournament
                    .equals(self.uuid.into_inner()),
                TournamentRoundModel.state.equals(RoundState::Previewed),
            ])
            .optional()
            .await
    }

    /// Throw the previewed Round away, `false` if there was none
    ///
    /// Changing the Participants does it too, since the preview no longer fits them.
    #[instrument(name = "Tournament::discard_preview", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn discard_preview(&self, tx: &mut Transaction) -> Result<bool, rorm::Error> {
        let deleted = rorm::delete(&mut *tx, TournamentRoundModel)
            .condition(rorm::and![
                TournamentRoundModel
                    .tournament
                    .equals(self.uuid.into_inner()),
                TournamentRoundModel.state.equals(RoundState::Previewed),
            ])
            .await?;
        Ok(deleted > 0)
    }

    /// Start the previewed Round `number`: from now on everybody sees it
    ///
    /// Its round timer starts with it, if the Tournament has a round timer
    /// length. The first Round also closes Registration and settles the
    /// number of Swiss Rounds, if no Organizer set one, to the suggestion,
    /// and pins every Registered deck, see [`Self::pin_registered_decks`].
    #[instrument(name = "Tournament::start_round", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn start_round(
        &self,
        tx: &mut Transaction,
        number: i16,
    ) -> Result<Result<(), RoundRefusal>, rorm::Error> {
        if self.over() {
            return Ok(Err(RoundRefusal::TournamentOver));
        }
        let now = OffsetDateTime::now_utc();
        let timer = self
            .round_minutes
            .map(|minutes| RoundTimer::start(minutes, now));
        let started = rorm::update(&mut *tx, TournamentRoundModel)
            .set(TournamentRoundModel.state, RoundState::Running)
            .set(TournamentRoundModel.started_at, Some(now))
            .set(
                TournamentRoundModel.timer_seconds,
                timer.map(|timer| i32::try_from(timer.length_seconds).unwrap_or(i32::MAX)),
            )
            .set(
                TournamentRoundModel.timer_ends_at,
                timer.map(|timer| timer.ends_at),
            )
            .condition(rorm::and![
                TournamentRoundModel
                    .uuid
                    .equals(round_key(self.uuid.into_inner(), number)),
                TournamentRoundModel.state.equals(RoundState::Previewed),
            ])
            .await?;
        if started == 0 {
            return Ok(Err(RoundRefusal::NotPreviewed));
        }
        if self.state == TournamentState::Registration {
            let swiss_rounds = self.planned_swiss_rounds(tx).await?;
            rorm::update(&mut *tx, TournamentModel)
                .set(TournamentModel.state, TournamentState::Swiss)
                .set(TournamentModel.swiss_rounds, swiss_rounds)
                .condition(TournamentModel.uuid.equals(self.uuid.into_inner()))
                .await?;
            self.pin_registered_decks(tx).await?;
        }
        Ok(Ok(()))
    }

    /// End the running Round `number` once every Match has its Result and none is disputed
    ///
    /// After the last Swiss Round the Top cut follows, or without one the
    /// Tournament is Finished; after the final of the Top cut it is Finished.
    /// Answers the state the Tournament is in afterwards.
    #[instrument(name = "Tournament::end_round", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn end_round(
        &self,
        tx: &mut Transaction,
        number: i16,
    ) -> Result<Result<TournamentState, RoundRefusal>, rorm::Error> {
        if self.over() {
            return Ok(Err(RoundRefusal::TournamentOver));
        }
        let rounds = self.rounds(tx, false).await?;
        let Some(round) = rounds
            .iter()
            .find(|round| round.number == number && round.state == RoundState::Running)
        else {
            return Ok(Err(RoundRefusal::NotRunning));
        };
        if !round.matches.iter().all(Match::settled) {
            return Ok(Err(RoundRefusal::ResultsMissing));
        }
        if round.matches.iter().any(Match::disputed) {
            return Ok(Err(RoundRefusal::ResultsDisputed));
        }
        rorm::update(&mut *tx, TournamentRoundModel)
            .set(TournamentRoundModel.state, RoundState::Ended)
            .set(
                TournamentRoundModel.ended_at,
                Some(OffsetDateTime::now_utc()),
            )
            .condition(
                TournamentRoundModel
                    .uuid
                    .equals(round_key(self.uuid.into_inner(), number)),
            )
            .await?;
        let state = self.finish_if_played(tx, number).await?;
        Ok(Ok(state))
    }

    /// Set how many Swiss Rounds are played, at least as many as were paired
    ///
    /// Setting it to the number of Rounds played once the last of them ended
    /// ends the Swiss Rounds. Answers the state the Tournament is in
    /// afterwards, `None` if the number was refused or the Swiss Rounds are over.
    #[instrument(name = "Tournament::set_swiss_rounds", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn set_swiss_rounds(
        &self,
        tx: &mut Transaction,
        swiss_rounds: i16,
    ) -> Result<Option<TournamentState>, rorm::Error> {
        if !self.top_cut_open() {
            return Ok(None);
        }
        let rounds = self.rounds(tx, true).await?;
        let paired = i16::try_from(rounds.len()).unwrap_or(i16::MAX);
        if swiss_rounds < paired.max(1) || swiss_rounds > MAX_SWISS_ROUNDS {
            return Ok(None);
        }
        rorm::update(&mut *tx, TournamentModel)
            .set(TournamentModel.swiss_rounds, Some(swiss_rounds))
            .condition(TournamentModel.uuid.equals(self.uuid.into_inner()))
            .await?;
        let all_ended = rounds.iter().all(|round| round.state == RoundState::Ended);
        if paired > 0 && all_ended {
            let tournament = Tournament {
                swiss_rounds: Some(swiss_rounds),
                ..self.clone()
            };
            return Ok(Some(tournament.finish_if_played(tx, paired).await?));
        }
        Ok(Some(self.state))
    }

    /// Set the Result of `played` to `games_won` per Seat and `games_drawn`
    ///
    /// An Organizer may set or correct a Result at any time once the Round
    /// started, also after the Tournament is over; the pairings stay as they are.
    /// It settles a disputed Result: what an Organizer sets is confirmed, and
    /// the change says [`ResultChangeKind::Settled`] then.
    #[instrument(name = "Tournament::set_result", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn set_result(
        &self,
        tx: &mut Transaction,
        played: MatchUuid,
        games_won: &[i16],
        games_drawn: i16,
    ) -> Result<Result<ResultChange, ResultRefusal>, rorm::Error> {
        let Some((stage, round_state, round_number, table_number, result_state)) = rorm::query(
            &mut *tx,
            (
                TournamentMatchModel.round.stage,
                TournamentMatchModel.round.state,
                TournamentMatchModel.round.number,
                TournamentMatchModel.table_number,
                TournamentMatchModel.result_state,
            ),
        )
        .condition(rorm::and![
            TournamentMatchModel.uuid.equals(played.0),
            TournamentMatchModel
                .round
                .tournament
                .equals(self.uuid.into_inner()),
        ])
        .optional()
        .await?
        else {
            return Ok(Err(ResultRefusal::NoSuchMatch));
        };
        if table_number.is_none() {
            return Ok(Err(ResultRefusal::NoSuchMatch));
        }
        if round_state == RoundState::Previewed {
            return Ok(Err(ResultRefusal::NotStarted));
        }
        let seated: Vec<ParticipantUuid> = rorm::query(&mut *tx, TournamentSeatModel.participant)
            .condition(TournamentSeatModel.tournament_match.equals(played.0))
            .order_asc(TournamentSeatModel.seat)
            .all()
            .await?
            .into_iter()
            .map(|participant| ParticipantUuid::new(participant.0))
            .collect();
        if games_won.len() != seated.len() || !self.admits(stage, games_won, games_drawn) {
            return Ok(Err(ResultRefusal::InvalidScore));
        }
        if self
            .names_dropped_winner(tx, stage, &seated, games_won, games_drawn)
            .await?
        {
            return Ok(Err(ResultRefusal::DroppedWinner));
        }

        let seats = store_result(
            tx,
            played,
            games_won,
            games_drawn,
            ResultState::Confirmed,
            None,
        )
        .await?;
        let kind = if result_state == Some(ResultState::Disputed) {
            ResultChangeKind::Settled
        } else {
            ResultChangeKind::Set
        };
        Ok(Ok(ResultChange {
            round: round_number,
            played,
            kind,
            by: None,
            seats,
        }))
    }

    /// Cancel the Tournament, `false` if it is over already
    ///
    /// The previewed Round goes; the Rounds that started stay as they are.
    #[instrument(name = "Tournament::cancel", skip(tx, self), fields(tournament = ?self.uuid))]
    pub async fn cancel(&self, tx: &mut Transaction) -> Result<bool, rorm::Error> {
        if self.over() {
            return Ok(false);
        }
        self.discard_preview(tx).await?;
        rorm::update(&mut *tx, TournamentModel)
            .set(TournamentModel.state, TournamentState::Cancelled)
            .condition(TournamentModel.uuid.equals(self.uuid.into_inner()))
            .await?;
        Ok(true)
    }

    /// Whether the Tournament is Finished or Cancelled, so no Round is paired, started or ended
    pub fn over(&self) -> bool {
        matches!(
            self.state,
            TournamentState::Finished | TournamentState::Cancelled
        )
    }

    /// Whether `games_won` per Seat and `games_drawn` is a Result a Match of `stage` can have
    ///
    /// Multiplayer one Game, won by one Seat or drawn by all, also in the
    /// final: a drawn final goes to its highest seed, see
    /// [`crate::tournament::top_cut::top_cut_winner`]. One-on-one a
    /// game score its best-of allows; a Top cut Match is played to its own
    /// best-of and has a winner: play goes on until somebody wins (MTR 2.4).
    /// The caller checks there is one number per Seat.
    pub(in crate::models::tournament) fn admits(
        &self,
        stage: RoundStage,
        games_won: &[i16],
        games_drawn: i16,
    ) -> bool {
        let (Ok(games_won), Ok(drawn)) = (
            games_won
                .iter()
                .map(|won| u8::try_from(*won))
                .collect::<Result<Vec<u8>, _>>(),
            u8::try_from(games_drawn),
        ) else {
            return false;
        };
        if self.table_size.get() > 2 {
            return single_game_admits(&games_won, drawn);
        }
        let [first, second] = games_won[..] else {
            return false;
        };
        let best_of = match stage {
            RoundStage::Swiss => self.best_of,
            RoundStage::TopCut => self.top_cut_best_of,
        };
        let decided = stage == RoundStage::Swiss || first != second;
        decided && best_of.is_some_and(|best_of| best_of.admits(first, second, drawn))
    }

    /// Whether `games_won` and `games_drawn` for the Match seating `seated` in a
    /// Round of `stage` name a Participant who Dropped as winner of a multiplayer final
    ///
    /// Only a multiplayer Top cut is a final; see
    /// [`crate::tournament::top_cut::names_dropped_winner`]. The caller made
    /// sure the game score [`Self::admits`] the Match.
    pub(in crate::models::tournament) async fn names_dropped_winner(
        &self,
        tx: &mut Transaction,
        stage: RoundStage,
        seated: &[ParticipantUuid],
        games_won: &[i16],
        games_drawn: i16,
    ) -> Result<bool, rorm::Error> {
        if stage != RoundStage::TopCut || self.table_size.get() <= 2 {
            return Ok(false);
        }
        let result = MatchResult {
            games_won: games_won
                .iter()
                .map(|won| u8::try_from(*won).unwrap_or(0))
                .collect(),
            games_drawn: u8::try_from(games_drawn).unwrap_or(0),
        };
        let seats: Vec<EntrantId> = seated.iter().map(|seat| seat.into_inner()).collect();
        let record = self.record(tx).await?;
        Ok(names_dropped_winner(&record, &seats, &result))
    }

    /// `participant` Dropped during the Top cut: it loses its Match of the running Round
    ///
    /// One-on-one, the other Seat wins it by the Games the Match needs, as an
    /// Organizer's Result. A multiplayer final goes on without a Result: the
    /// rest play on, and the dropped Participant cannot win it, see
    /// [`crate::tournament::top_cut::top_cut_winner`]. Nothing happens outside
    /// a running Top cut Round; a Participant who Dropped between Rounds is
    /// not paired again, see [`crate::tournament::top_cut::pair_top_cut`].
    #[instrument(name = "Tournament::forfeit_top_cut_match", skip(tx, self), fields(tournament = ?self.uuid))]
    pub(in crate::models::tournament) async fn forfeit_top_cut_match(
        &self,
        tx: &mut Transaction,
        participant: ParticipantUuid,
    ) -> Result<Option<ResultChange>, rorm::Error> {
        if self.state != TournamentState::TopCut {
            return Ok(None);
        }
        let rounds = self.rounds(tx, false).await?;
        let running = rounds
            .iter()
            .find(|round| round.stage == RoundStage::TopCut && round.state == RoundState::Running);
        let Some(round) = running else {
            return Ok(None);
        };
        let played = round.matches.iter().find(|played| {
            !played.is_bye()
                && played
                    .seats
                    .iter()
                    .any(|seat| seat.participant == participant)
        });
        let Some(played) = played else {
            return Ok(None);
        };
        if played.seats.len() > 2 {
            return Ok(None);
        }
        let games_to_win = self
            .top_cut_best_of
            .map_or(1, |best_of| i16::from(best_of.games_to_win()));
        let games_won: Vec<i16> = played
            .seats
            .iter()
            .map(|seat| {
                if seat.participant == participant {
                    0
                } else {
                    games_to_win
                }
            })
            .collect();
        let seats =
            store_result(tx, played.uuid, &games_won, 0, ResultState::Confirmed, None).await?;
        Ok(Some(ResultChange {
            round: round.number,
            played: played.uuid,
            kind: ResultChangeKind::Set,
            by: None,
            seats,
        }))
    }

    /// Move on once Round `ended` was the last of its part
    ///
    /// After the last Swiss Round the Top cut follows, if the Tournament has
    /// one and at least two Participants play on; otherwise, and after the
    /// final of the Top cut, the Tournament is Finished.
    async fn finish_if_played(
        &self,
        tx: &mut Transaction,
        ended: i16,
    ) -> Result<TournamentState, rorm::Error> {
        let next = if self.state == TournamentState::TopCut {
            cut_over(&self.top_cut_record(tx).await?).then_some(TournamentState::Finished)
        } else {
            let planned = self.planned_swiss_rounds(tx).await?;
            if planned.is_some_and(|planned| ended >= planned) {
                let pairable = self.pairable(tx).await?;
                let cut = self
                    .top_cut
                    .and_then(|top_cut| cut_size(top_cut, self.table_size, pairable));
                Some(match cut {
                    Some(_) => TournamentState::TopCut,
                    None => TournamentState::Finished,
                })
            } else {
                None
            }
        };
        let Some(next) = next else {
            return Ok(self.state);
        };
        rorm::update(&mut *tx, TournamentModel)
            .set(TournamentModel.state, next)
            .condition(TournamentModel.uuid.equals(self.uuid.into_inner()))
            .await?;
        Ok(next)
    }
}

/// Insert the Matches of the Round keyed `round`: one per entry of `tables`,
/// numbered from 1 in that order with the Seats in order within each, and a
/// Bye for each of `byes`
pub(in crate::models::tournament) async fn insert_matches(
    tx: &mut Transaction,
    round: Uuid,
    tables: &[&[EntrantId]],
    byes: &[EntrantId],
) -> Result<(), rorm::Error> {
    let tables = tables
        .iter()
        .enumerate()
        .map(|(index, seats)| (Some(i16::try_from(index + 1).unwrap_or(i16::MAX)), *seats));
    let byes = byes.iter().map(|bye| (None, std::slice::from_ref(bye)));
    let mut match_rows = Vec::new();
    let mut seat_rows = Vec::new();
    for (table_number, seats) in tables.chain(byes) {
        let uuid = Uuid::now_v7();
        match_rows.push(TournamentMatchInsertPatch {
            uuid,
            round: ForeignModelByField(round),
            table_number,
            games_drawn: None,
            result_state: None,
            reported_by: None,
            disputed_by: None,
        });
        for (index, participant) in seats.iter().enumerate() {
            seat_rows.push(TournamentSeatInsertPatch {
                uuid: Uuid::now_v7(),
                tournament_match: ForeignModelByField(uuid),
                participant: ForeignModelByField(*participant),
                seat: i16::try_from(index + 1).unwrap_or(i16::MAX),
                games_won: None,
            });
        }
    }
    if !match_rows.is_empty() {
        rorm::insert(&mut *tx, TournamentMatchModel)
            .return_nothing()
            .bulk(&match_rows)
            .await?;
    }
    if !seat_rows.is_empty() {
        rorm::insert(&mut *tx, TournamentSeatModel)
            .return_nothing()
            .bulk(&seat_rows)
            .await?;
    }
    Ok(())
}

/// A Round as the engine reads it
pub(in crate::models::tournament) fn round_record(round: &Round) -> RoundRecord {
    let mut record = RoundRecord {
        matches: Vec::new(),
        byes: Vec::new(),
    };
    for played in &round.matches {
        let seats: Vec<Uuid> = played
            .seats
            .iter()
            .map(|seat| seat.participant.into_inner())
            .collect();
        if played.is_bye() {
            record.byes.extend(seats);
            continue;
        }
        let result = played.games_drawn.and_then(|drawn| {
            let games_won = played
                .seats
                .iter()
                .map(|seat| seat.games_won.and_then(|won| u8::try_from(won).ok()))
                .collect::<Option<Vec<u8>>>()?;
            Some(MatchResult {
                games_won,
                games_drawn: u8::try_from(drawn).ok()?,
            })
        });
        record.matches.push(MatchRecord { seats, result });
    }
    record
}
