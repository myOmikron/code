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
    fn a_table_seats_two_to_five() {
        for players in [-1, 0, 1, 6, 100] {
            assert_eq!(TableSize::new(players), None, "{players}");
        }
        for players in 2..=5 {
            assert_eq!(TableSize::new(players).map(TableSize::get), Some(players));
        }
    }
}
