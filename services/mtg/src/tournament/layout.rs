//! A Round laid out by hand, and who met before
//!
//! An Organizer changes a previewed Round by sending its whole layout: every
//! Match in table order with its Seats, and the Byes. [`check_layout`] says
//! whether the layout fits the Tournament; [`Meetings`] says which Matches are
//! rematches, for a layout as for a paired Round.

use std::collections::HashMap;
use std::collections::HashSet;

use crate::tournament::record::EntrantId;
use crate::tournament::record::RoundRecord;
use crate::tournament::record::TournamentRecord;

/// The Matches and Byes of a Round as an Organizer lays them out
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Layout {
    /// The Matches, top table first, each in Seat order
    pub matches: Vec<Vec<EntrantId>>,
    /// Who has a Bye
    pub byes: Vec<EntrantId>,
}

/// What is wrong with a [`Layout`]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LayoutError {
    /// Seated, but not a Participant the Round pairs
    NotPairable(EntrantId),
    /// Seated more than once
    SeatedTwice(EntrantId),
    /// A Participant the Round pairs has neither a Seat nor a Bye
    NotSeated(EntrantId),
    /// The Match at this table seats a number of Participants it cannot have
    MatchSize {
        /// Its table number, 1 for the top table
        table: usize,
    },
    /// The Ruleset never gives a Bye
    NoByes,
}

/// Every mistake in `layout` for the next Round of `record`, none if it fits
///
/// Every pairable Participant sits exactly once, in a Match or in a Bye, and
/// nobody else sits at all. One-on-one a Match seats two; multiplayer a full
/// table or one Seat fewer. The Multiplayer Addendum gives no Byes.
pub fn check_layout(record: &TournamentRecord, layout: &Layout) -> Vec<LayoutError> {
    let mut errors = Vec::new();
    let pairable: HashSet<EntrantId> = record
        .entrants
        .iter()
        .filter(|entrant| entrant.pairable)
        .map(|entrant| entrant.id)
        .collect();

    let mut times: HashMap<EntrantId, usize> = HashMap::new();
    let mut order = Vec::new();
    for entrant in layout.matches.iter().flatten().chain(&layout.byes) {
        let count = times.entry(*entrant).or_default();
        if *count == 0 {
            order.push(*entrant);
        }
        *count += 1;
    }
    for entrant in &order {
        if !pairable.contains(entrant) {
            errors.push(LayoutError::NotPairable(*entrant));
        } else if times[entrant] > 1 {
            errors.push(LayoutError::SeatedTwice(*entrant));
        }
    }
    for entrant in &record.entrants {
        if entrant.pairable && !times.contains_key(&entrant.id) {
            errors.push(LayoutError::NotSeated(entrant.id));
        }
    }

    let full = usize::try_from(record.table_size.get()).unwrap_or(2);
    for (index, seats) in layout.matches.iter().enumerate() {
        let fits = seats.len() == full || (full > 2 && seats.len() + 1 == full);
        if !fits {
            errors.push(LayoutError::MatchSize { table: index + 1 });
        }
    }
    if !layout.byes.is_empty() && !record.ruleset.gives_byes() {
        errors.push(LayoutError::NoByes);
    }
    errors
}

/// Who met whom in some Rounds
#[derive(Debug, Clone, Default)]
pub struct Meetings {
    /// Every pair that shared a Match, smaller id first
    met: HashSet<(EntrantId, EntrantId)>,
}

impl Meetings {
    /// Who met whom in every Round of `record`
    pub fn of(record: &TournamentRecord) -> Self {
        let mut meetings = Self::default();
        for round in &record.rounds {
            meetings.add(round);
        }
        meetings
    }

    /// Count the Matches of `round` as met
    pub fn add(&mut self, round: &RoundRecord) {
        for played in &round.matches {
            for (index, one) in played.seats.iter().enumerate() {
                for other in &played.seats[index + 1..] {
                    self.met.insert(pair_key(*one, *other));
                }
            }
        }
    }

    /// Whether any two of `seats` met before
    pub fn rematch(&self, seats: &[EntrantId]) -> bool {
        seats.iter().enumerate().any(|(index, one)| {
            seats[index + 1..]
                .iter()
                .any(|other| self.met.contains(&pair_key(*one, *other)))
        })
    }
}

/// An unordered pair as an ordered key
fn pair_key(one: EntrantId, other: EntrantId) -> (EntrantId, EntrantId) {
    if one <= other {
        (one, other)
    } else {
        (other, one)
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::Layout;
    use super::LayoutError;
    use super::Meetings;
    use super::check_layout;
    use crate::tournament::record::Entrant;
    use crate::tournament::record::EntrantId;
    use crate::tournament::record::MatchRecord;
    use crate::tournament::record::RoundRecord;
    use crate::tournament::record::TournamentRecord;
    use crate::tournament::ruleset::Ruleset;
    use crate::tournament::ruleset::TableSize;

    fn p(n: u128) -> EntrantId {
        Uuid::from_u128(n)
    }

    /// A Tournament of Participants 1 to `entrants`, all pairable
    fn tournament(ruleset: Ruleset, table_size: i16, entrants: u128) -> TournamentRecord {
        TournamentRecord {
            ruleset,
            table_size: TableSize::new(table_size).expect("a Table size"),
            entrants: (1..=entrants)
                .map(|n| Entrant {
                    id: p(n),
                    pairable: true,
                })
                .collect(),
            rounds: Vec::new(),
            seed: 7,
        }
    }

    fn layout(matches: &[&[u128]], byes: &[u128]) -> Layout {
        Layout {
            matches: matches
                .iter()
                .map(|seats| seats.iter().copied().map(p).collect())
                .collect(),
            byes: byes.iter().copied().map(p).collect(),
        }
    }

    #[test]
    fn a_layout_seating_everybody_once_fits() {
        let record = tournament(Ruleset::Mtr, 2, 5);
        assert_eq!(
            check_layout(&record, &layout(&[&[4, 1], &[2, 5]], &[3])),
            vec![]
        );
    }

    #[test]
    fn a_participant_left_out_or_seated_twice_is_named() {
        let record = tournament(Ruleset::Mtr, 2, 4);
        let errors = check_layout(&record, &layout(&[&[1, 2], &[2, 3]], &[]));
        assert_eq!(
            errors,
            vec![LayoutError::SeatedTwice(p(2)), LayoutError::NotSeated(p(4))]
        );
    }

    #[test]
    fn a_bye_and_a_match_seating_the_same_participant_is_seating_it_twice() {
        let record = tournament(Ruleset::Mtr, 2, 3);
        let errors = check_layout(&record, &layout(&[&[1, 2]], &[2, 3]));
        assert_eq!(errors, vec![LayoutError::SeatedTwice(p(2))]);
    }

    #[test]
    fn only_pairable_participants_may_sit() {
        let mut record = tournament(Ruleset::Mtr, 2, 4);
        record.entrants[3].pairable = false;
        let errors = check_layout(&record, &layout(&[&[1, 2], &[3, 4]], &[]));
        assert_eq!(errors, vec![LayoutError::NotPairable(p(4))]);
        let stranger = check_layout(&record, &layout(&[&[1, 2]], &[3, 9]));
        assert_eq!(stranger, vec![LayoutError::NotPairable(p(9))]);
    }

    #[test]
    fn a_one_on_one_match_seats_exactly_two() {
        let record = tournament(Ruleset::Mtr, 2, 4);
        let errors = check_layout(&record, &layout(&[&[1, 2, 3], &[4]], &[]));
        assert_eq!(
            errors,
            vec![
                LayoutError::MatchSize { table: 1 },
                LayoutError::MatchSize { table: 2 }
            ]
        );
    }

    #[test]
    fn several_byes_are_the_organizers_call() {
        let record = tournament(Ruleset::Mtr, 2, 4);
        assert_eq!(check_layout(&record, &layout(&[&[1, 2]], &[3, 4])), vec![]);
    }

    #[test]
    fn a_multiplayer_match_seats_a_full_table_or_one_fewer() {
        let record = tournament(Ruleset::TopDeck, 4, 11);
        assert_eq!(
            check_layout(
                &record,
                &layout(&[&[1, 2, 3, 4], &[5, 6, 7], &[8, 9, 10]], &[11])
            ),
            vec![]
        );
        let errors = check_layout(
            &record,
            &layout(&[&[1, 2, 3, 4, 5], &[6, 7]], &[8, 9, 10, 11]),
        );
        assert_eq!(
            errors,
            vec![
                LayoutError::MatchSize { table: 1 },
                LayoutError::MatchSize { table: 2 }
            ]
        );
    }

    #[test]
    fn the_multiplayer_addendum_gives_no_byes() {
        let record = tournament(Ruleset::MultiplayerAddendum, 4, 5);
        assert_eq!(
            check_layout(&record, &layout(&[&[1, 2, 3, 4]], &[5])),
            vec![LayoutError::NoByes]
        );
    }

    #[test]
    fn a_match_of_participants_who_met_before_is_a_rematch() {
        let mut record = tournament(Ruleset::Mtr, 2, 4);
        record.rounds.push(RoundRecord {
            matches: vec![
                MatchRecord {
                    seats: vec![p(1), p(2)],
                    result: None,
                },
                MatchRecord {
                    seats: vec![p(3), p(4)],
                    result: None,
                },
            ],
            byes: vec![],
        });
        let meetings = Meetings::of(&record);
        assert!(meetings.rematch(&[p(2), p(1)]));
        assert!(!meetings.rematch(&[p(1), p(3)]));
        assert!(meetings.rematch(&[p(5), p(3), p(4)]));
    }

    #[test]
    fn a_bye_is_no_meeting() {
        let mut record = tournament(Ruleset::Mtr, 2, 3);
        record.rounds.push(RoundRecord {
            matches: vec![MatchRecord {
                seats: vec![p(1), p(2)],
                result: None,
            }],
            byes: vec![p(3)],
        });
        let meetings = Meetings::of(&record);
        assert!(!meetings.rematch(&[p(3), p(1)]));
        assert!(!meetings.rematch(&[p(3)]));
    }
}
