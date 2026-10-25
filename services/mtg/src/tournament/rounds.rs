//! How many Swiss Rounds a Tournament should play

use crate::tournament::ruleset::Ruleset;

/// The number of Swiss Rounds to suggest for `participants` paired in Round 1
///
/// MTR follows its Appendix E, except that up to eight Participants play
/// ceil(log2 n) Swiss Rounds instead of a single elimination, since mtg always
/// plays Swiss (research note, "Suggested number of Swiss Rounds"). `None`
/// for a Ruleset the engine does not pair yet.
pub fn suggested_swiss_rounds(ruleset: Ruleset, participants: usize) -> Option<u16> {
    match ruleset {
        Ruleset::Mtr => Some(mtr_rounds(participants)),
        Ruleset::TopDeck | Ruleset::MultiplayerAddendum => None,
    }
}

/// MTR Appendix E, with Swiss Rounds instead of single elimination up to eight
fn mtr_rounds(participants: usize) -> u16 {
    match participants {
        0..=2 => 1,
        3..=4 => 2,
        5..=8 => 3,
        9..=32 => 5,
        33..=64 => 6,
        65..=128 => 7,
        129..=226 => 8,
        227..=409 => 9,
        _ => 10,
    }
}

#[cfg(test)]
mod tests {
    use super::suggested_swiss_rounds;
    use crate::tournament::ruleset::Ruleset;

    #[test]
    fn mtr_suggests_the_rounds_of_appendix_e() {
        for (participants, rounds) in [
            (2, 1),
            (3, 2),
            (4, 2),
            (5, 3),
            (8, 3),
            (9, 5),
            (16, 5),
            (17, 5),
            (32, 5),
            (33, 6),
            (64, 6),
            (65, 7),
            (128, 7),
            (129, 8),
            (226, 8),
            (227, 9),
            (409, 9),
            (410, 10),
            (2000, 10),
        ] {
            assert_eq!(
                suggested_swiss_rounds(Ruleset::Mtr, participants),
                Some(rounds),
                "{participants} Participants"
            );
        }
    }

    #[test]
    fn a_field_too_small_to_pair_still_gets_one_round() {
        assert_eq!(suggested_swiss_rounds(Ruleset::Mtr, 0), Some(1));
        assert_eq!(suggested_swiss_rounds(Ruleset::Mtr, 1), Some(1));
    }
}
