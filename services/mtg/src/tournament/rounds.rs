//! How many Swiss Rounds a Tournament should play

use crate::tournament::multiplayer::addendum_layout;
use crate::tournament::ruleset::Ruleset;
use crate::tournament::ruleset::TableSize;

/// The number of Swiss Rounds to suggest for `participants` paired in Round 1
///
/// MTR follows its Appendix E, except that up to eight Participants play
/// ceil(log2 n) Swiss Rounds instead of a single elimination, since mtg always
/// plays Swiss (research note, "Suggested number of Swiss Rounds"). TopDeck
/// follows the MTRA's "Recommended Number of Rounds", the Multiplayer
/// Addendum its Appendix E at every Table size.
pub fn suggested_swiss_rounds(
    ruleset: Ruleset,
    table_size: TableSize,
    participants: usize,
) -> Option<u16> {
    match ruleset {
        Ruleset::Mtr => Some(mtr_rounds(participants)),
        Ruleset::TopDeck => Some(topdeck_rounds(participants)),
        Ruleset::MultiplayerAddendum => Some(addendum_rounds(table_size, participants)),
    }
}

/// The Addendum's Appendix E, counting an invisible Participant per empty Seat
///
/// The empty Seats are those of Round 1's smaller Matches ("for each smaller
/// size pod, it's as if an extra invisible Player is added"). Below four
/// Participants one Round, like four and five (research note).
fn addendum_rounds(table_size: TableSize, participants: usize) -> u16 {
    let seats = usize::from(table_size.get().unsigned_abs());
    let invisible: usize = addendum_layout(participants, table_size)
        .sizes
        .iter()
        .map(|size| seats.saturating_sub(*size))
        .sum();
    match participants + invisible {
        0..=5 => 1,
        6..=16 => 2,
        17..=24 => 3,
        25..=32 => 4,
        33..=64 => 5,
        65..=128 => 6,
        129..=256 => 7,
        257..=512 => 8,
        _ => 9,
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
    use crate::tournament::ruleset::TableSize;

    fn size(players: i16) -> TableSize {
        TableSize::new(players).expect("a Table size")
    }

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
                suggested_swiss_rounds(Ruleset::Mtr, size(2), participants),
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
                suggested_swiss_rounds(Ruleset::TopDeck, size(4), participants),
                Some(rounds),
                "{participants} Participants"
            );
        }
    }

    #[test]
    fn a_field_too_small_to_pair_still_gets_one_round() {
        assert_eq!(suggested_swiss_rounds(Ruleset::Mtr, size(2), 0), Some(1));
        assert_eq!(suggested_swiss_rounds(Ruleset::Mtr, size(2), 1), Some(1));
    }

    #[test]
    fn the_addendum_suggests_the_rounds_of_its_appendix_e() {
        for (participants, rounds) in [
            (4, 1),
            (5, 1),
            (6, 2),
            (16, 2),
            (17, 3),
            (24, 3),
            (25, 4),
            (32, 4),
            (33, 5),
            (64, 5),
            (65, 6),
            (128, 6),
            (129, 7),
            (256, 7),
            (257, 8),
            (512, 8),
            (513, 9),
            (2000, 9),
        ] {
            assert_eq!(
                suggested_swiss_rounds(Ruleset::MultiplayerAddendum, size(4), participants),
                Some(rounds),
                "{participants} Participants"
            );
        }
    }

    #[test]
    fn the_addendum_counts_an_invisible_participant_per_empty_seat() {
        let rounds = |participants| {
            suggested_swiss_rounds(Ruleset::MultiplayerAddendum, size(4), participants)
        };
        assert_eq!(rounds(30), Some(4), "two Matches of three count as 32");
        assert_eq!(rounds(22), Some(3), "two Matches of three count as 24");
        assert_eq!(rounds(23), Some(3), "one Match of three counts as 24");
        assert_eq!(rounds(15), Some(2));
        assert_eq!(rounds(39), Some(5), "one Match of three counts as 40");
        let at_three = |participants| {
            suggested_swiss_rounds(Ruleset::MultiplayerAddendum, size(3), participants)
        };
        assert_eq!(at_three(16), Some(3), "two Matches of two count as 18");
    }

    #[test]
    fn the_addendum_plays_one_round_below_four() {
        for participants in 0..4 {
            assert_eq!(
                suggested_swiss_rounds(Ruleset::MultiplayerAddendum, size(4), participants),
                Some(1)
            );
        }
    }
}
