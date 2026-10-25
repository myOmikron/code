//! What the engine is told about a Tournament: its Participants and the Rounds so far
//!
//! One [`TournamentRecord`] is the whole input of every question the engine
//! answers. Everything else it needs (who met whom, who had a Bye, who sat
//! where, the Match points) it derives from the Rounds, so a later rule
//! reads the same record instead of growing a new input.

use uuid::Uuid;

use crate::tournament::ruleset::Ruleset;
use crate::tournament::ruleset::TableSize;

/// Who an engine answer is about: the primary key of a Participant
pub type EntrantId = Uuid;

/// A Tournament as the engine sees it
#[derive(Debug, Clone)]
pub struct TournamentRecord {
    /// The Ruleset it follows
    pub ruleset: Ruleset,
    /// How many Participants a full Match seats
    pub table_size: TableSize,
    /// Every Participant, whether the next Round pairs it or not
    ///
    /// Their order carries no meaning; Participants equal on everything are
    /// ordered by [`Self::seed`].
    pub entrants: Vec<Entrant>,
    /// The Swiss Rounds that started, in order; a previewed Round is not one of them
    pub rounds: Vec<RoundRecord>,
    /// Fixed per Tournament: orders Participants equal on everything, the same way every time
    pub seed: u64,
}

/// One Participant
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entrant {
    /// Who it is
    pub id: EntrantId,
    /// Whether the next Round pairs it
    ///
    /// A Participant stays in the standings either way; only the caller
    /// knows why it sits out (a Drop, unpaid), the engine does not.
    pub pairable: bool,
}

/// One Round that started
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoundRecord {
    /// Its Matches
    pub matches: Vec<MatchRecord>,
    /// Who had a Bye in it
    pub byes: Vec<EntrantId>,
}

/// One Match of a Round
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MatchRecord {
    /// Who played, in Seat order: Seat 1 first
    pub seats: Vec<EntrantId>,
    /// How it ended, `None` while it has no Result
    pub result: Option<MatchResult>,
}

/// How a Match ended
///
/// One-on-one the game score; a multiplayer Match is one Game, so its winner
/// has won one game and a draw is one drawn game.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MatchResult {
    /// Games won per Seat, in the order of [`MatchRecord::seats`]
    pub games_won: Vec<u8>,
    /// Games nobody won
    pub games_drawn: u8,
}

impl MatchResult {
    /// The Seat that won the Match, `None` for a draw
    ///
    /// Whoever won the most games, if nobody else won as many.
    pub fn winner(&self) -> Option<usize> {
        let most = self.games_won.iter().copied().max()?;
        let mut leaders = self
            .games_won
            .iter()
            .enumerate()
            .filter(|(_, won)| **won == most);
        let (seat, _) = leaders.next()?;
        leaders.next().is_none().then_some(seat)
    }
}
