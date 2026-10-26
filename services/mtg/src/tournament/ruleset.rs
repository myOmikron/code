//! The Rulesets and the Table sizes they are played at

use std::ops::RangeInclusive;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;

/// The published tournament rules a Tournament follows
///
/// A closed set, chosen per Tournament and never edited: Match points, Byes,
/// smaller Matches and Tiebreakers all follow from it.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub enum Ruleset {
    /// The Magic Tournament Rules, one-on-one
    Mtr,
    /// TopDeck's multiplayer rules: smaller Matches or Byes
    TopDeck,
    /// The Multiplayer Addendum to the MTR: smaller Matches, never a Bye
    MultiplayerAddendum,
}

impl Ruleset {
    /// Whether a Tournament at this Table size may follow this Ruleset
    pub fn fits(self, table_size: TableSize) -> bool {
        let one_on_one = table_size.get() == 2;
        match self {
            Self::Mtr => one_on_one,
            Self::TopDeck | Self::MultiplayerAddendum => !one_on_one,
        }
    }

    /// The Match points of a win, at `table_size`
    ///
    /// MTR 3, TopDeck 5, the Multiplayer Addendum 2T - 1 (7 at Table size 4).
    /// A smaller Match wins as much as a full one.
    pub fn win_points(self, table_size: TableSize) -> u32 {
        match self {
            Self::Mtr => 3,
            Self::TopDeck => 5,
            Self::MultiplayerAddendum => u32::from(table_size.get().unsigned_abs()) * 2 - 1,
        }
    }

    /// The Match points of a draw, to every Participant of the Match
    pub fn draw_points(self) -> u32 {
        1
    }

    /// How many turns are played in total after the active player's turn once time is up
    ///
    /// MTR 2.4: the active player finishes the turn, then five more turns
    /// follow. TopDeck (MTRA 2.4) and the Multiplayer Addendum (2.4A) play
    /// none: the Match ends with the active player's turn.
    pub fn extra_turns(self) -> u8 {
        match self {
            Self::Mtr => 5,
            Self::TopDeck | Self::MultiplayerAddendum => 0,
        }
    }

    /// Whether a Participant can have a Bye; the Multiplayer Addendum plays smaller Matches instead
    pub fn gives_byes(self) -> bool {
        match self {
            Self::Mtr | Self::TopDeck => true,
            Self::MultiplayerAddendum => false,
        }
    }
}

/// How many Games a one-on-one Match is played to
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub enum BestOf {
    /// One Game decides the Match
    One,
    /// Whoever wins two Games first wins the Match
    Three,
}

impl BestOf {
    /// The most drawn Games a Match records
    pub const MAX_DRAWN: u8 = 3;

    /// How many Games win the Match
    pub fn games_to_win(self) -> u8 {
        match self {
            Self::One => 1,
            Self::Three => 2,
        }
    }

    /// Whether `won_first`-`won_second`-`drawn` is a game score a Match can end with
    ///
    /// Nobody wins more Games than the Match needs, not both reach that
    /// number, and drawn Games, which do not count towards it, stay at most
    /// [`Self::MAX_DRAWN`]. An unfinished Match ends with fewer Games, also 0-0.
    pub fn admits(self, won_first: u8, won_second: u8, drawn: u8) -> bool {
        let needed = self.games_to_win();
        won_first <= needed
            && won_second <= needed
            && !(won_first == needed && won_second == needed)
            && drawn <= Self::MAX_DRAWN
    }
}

/// How many Participants a full Match of a Tournament seats
///
/// 2 for one-on-one, 3 to 5 for multiplayer. Only [`TableSize::new`] makes
/// one, so a value outside that range never gets this far.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash)]
pub struct TableSize(i16);

impl TableSize {
    /// The Table sizes a Tournament can be played at
    pub const RANGE: RangeInclusive<i16> = 2..=5;

    /// The Table size seating `players`, `None` outside [`Self::RANGE`]
    pub fn new(players: i16) -> Option<Self> {
        Self::RANGE.contains(&players).then_some(Self(players))
    }

    /// How many Participants it seats
    pub fn get(self) -> i16 {
        self.0
    }
}

#[cfg(test)]
mod tests {
    use super::BestOf;
    use super::Ruleset;
    use super::TableSize;

    fn size(players: i16) -> TableSize {
        TableSize::new(players).expect("a Table size")
    }

    #[test]
    fn mtr_is_played_one_on_one_only() {
        assert!(Ruleset::Mtr.fits(size(2)));
        for players in 3..=5 {
            assert!(!Ruleset::Mtr.fits(size(players)), "{players}");
        }
    }

    #[test]
    fn the_multiplayer_rulesets_are_played_at_three_to_five() {
        for ruleset in [Ruleset::TopDeck, Ruleset::MultiplayerAddendum] {
            assert!(!ruleset.fits(size(2)), "{ruleset:?}");
            for players in 3..=5 {
                assert!(ruleset.fits(size(players)), "{ruleset:?} at {players}");
            }
        }
    }

    #[test]
    fn a_win_is_worth_what_the_ruleset_says_and_a_draw_one() {
        assert_eq!(Ruleset::Mtr.win_points(size(2)), 3);
        for players in 3..=5 {
            assert_eq!(Ruleset::TopDeck.win_points(size(players)), 5, "{players}");
        }
        assert_eq!(Ruleset::MultiplayerAddendum.win_points(size(3)), 5);
        assert_eq!(Ruleset::MultiplayerAddendum.win_points(size(4)), 7);
        assert_eq!(Ruleset::MultiplayerAddendum.win_points(size(5)), 9);
        for ruleset in [Ruleset::Mtr, Ruleset::TopDeck, Ruleset::MultiplayerAddendum] {
            assert_eq!(ruleset.draw_points(), 1, "{ruleset:?}");
        }
    }

    #[test]
    fn a_best_of_three_ends_with_the_scores_of_two_won_games_or_fewer() {
        for (score, admitted) in [
            ((2, 0, 0), true),
            ((2, 1, 0), true),
            ((1, 2, 0), true),
            ((1, 1, 1), true),
            ((1, 0, 0), true),
            ((0, 0, 0), true),
            ((0, 0, 3), true),
            ((2, 2, 0), false),
            ((3, 0, 0), false),
            ((0, 3, 1), false),
            ((1, 1, 4), false),
        ] {
            let (first, second, drawn) = score;
            assert_eq!(
                BestOf::Three.admits(first, second, drawn),
                admitted,
                "{first}-{second}-{drawn}"
            );
        }
    }

    #[test]
    fn a_best_of_one_is_won_by_a_single_game() {
        assert!(BestOf::One.admits(1, 0, 0));
        assert!(BestOf::One.admits(0, 1, 0));
        assert!(BestOf::One.admits(0, 0, 1));
        assert!(!BestOf::One.admits(1, 1, 0));
        assert!(!BestOf::One.admits(2, 0, 0));
    }

    #[test]
    fn only_mtr_plays_extra_turns_when_time_is_up() {
        assert_eq!(Ruleset::Mtr.extra_turns(), 5);
        assert_eq!(Ruleset::TopDeck.extra_turns(), 0);
        assert_eq!(Ruleset::MultiplayerAddendum.extra_turns(), 0);
    }

    #[test]
    fn a_table_seats_two_to_five() {
        for players in [-1, 0, 1, 6, 100] {
            assert_eq!(TableSize::new(players), None, "{players}");
        }
        for players in 2..=5 {
            assert_eq!(TableSize::new(players).map(TableSize::get), Some(players));
        }
    }
}
