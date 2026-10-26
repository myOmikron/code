//! How many Swiss Rounds a Tournament should play

use crate::tournament::ruleset::Ruleset;

/// The number of Swiss Rounds to suggest for `participants` paired in Round 1
///
/// MTR follows its Appendix E, except that up to eight Participants play
/// ceil(log2 n) Swiss Rounds instead of a single elimination, since mtg always
/// plays Swiss (research note, "Suggested number of Swiss Rounds"). TopDeck
/// follows the MTRA's "Recommended Number of Rounds". `None` for a Ruleset
/// the engine does not pair yet.
pub fn suggested_swiss_rounds(ruleset: Ruleset, participants: usize) -> Option<u16> {
    match ruleset {
        Ruleset::Mtr => Some(mtr_rounds(participants)),
        Ruleset::TopDeck => Some(topdeck_rounds(participants)),
        Ruleset::MultiplayerAddendum => None,
    }
}

/// The MTRA's table of recommended Swiss Rounds, at every Table size
fn topdeck_rounds(participants: usize) -> u16 {
    match participants {
        0..=16 => 3,
        17..=34 => 4,
        35..=128 => 5,
        129..=208 => 6,
        209..=304 => 7,
        305..=540 => 8,
        541..=960 => 9,
        _ => 10,
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
    fn topdeck_suggests_the_rounds_of_its_recommended_table() {
        for (participants, rounds) in [
            (4, 3),
            (16, 3),
            (17, 4),
            (34, 4),
            (35, 5),
            (128, 5),
            (129, 6),
            (208, 6),
            (209, 7),
            (304, 7),
            (305, 8),
            (540, 8),
            (541, 9),
            (960, 9),
            (961, 10),
        ] {
            assert_eq!(
                suggested_swiss_rounds(Ruleset::TopDeck, participants),
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
