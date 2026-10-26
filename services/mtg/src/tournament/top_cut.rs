//! The Top cut: single elimination of the best Participants after the Swiss Rounds
//!
//! MTR 10.4: a Top 8 pairs 1v8, 4v5, 2v7, 3v6 by the Swiss standings, the
//! winners of 1v8 and 4v5 meet next, so do those of 2v7 and 3v6; a Top 4 pairs
//! 1v4 and 2v3. The higher seed takes Seat 1. Only the Swiss Rounds rank: the
//! cut Rounds are a record of their own, see [`pair_top_cut`].

use std::collections::BTreeMap;
use std::collections::HashMap;
use std::collections::HashSet;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;

use crate::tournament::pairing::PairedMatch;
use crate::tournament::pairing::Pairing;
use crate::tournament::record::EntrantId;
use crate::tournament::record::RoundRecord;
use crate::tournament::record::TournamentRecord;
use crate::tournament::ruleset::Ruleset;
use crate::tournament::ruleset::TableSize;
use crate::tournament::standings::standings;

/// How many Participants a one-on-one Top cut takes
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub enum TopCut {
    /// The best four: two semifinals and a final
    Top4,
    /// The best eight: quarterfinals, semifinals and a final
    Top8,
}

impl TopCut {
    /// How many Participants it takes when enough are left
    pub fn size(self) -> usize {
        match self {
            Self::Top4 => 4,
            Self::Top8 => 8,
        }
    }

    /// Whether a Tournament at this Table size may end with it: one-on-one only
    pub fn fits(self, table_size: TableSize) -> bool {
        table_size.get() == 2
    }
}

/// The Top cut to suggest for `participants` paired in Round 1, `None` for none
///
/// MTR Appendix E: a Top 4 from 9 to 16 Participants, a Top 8 above.
pub fn suggested_top_cut(ruleset: Ruleset, participants: usize) -> Option<TopCut> {
    match ruleset {
        Ruleset::Mtr => match participants {
            0..=8 => None,
            9..=16 => Some(TopCut::Top4),
            _ => Some(TopCut::Top8),
        },
        Ruleset::TopDeck | Ruleset::MultiplayerAddendum => None,
    }
}

/// How many Participants `top_cut` takes with `pairable` left, `None` below two
///
/// When Drops leave fewer than its size, the cut shrinks to the next size that
/// fits: a Top 8 of seven is a Top 4, a Top 4 of three is a final of two.
pub fn cut_size(top_cut: TopCut, pairable: usize) -> Option<usize> {
    [8, 4, 2]
        .into_iter()
        .find(|size| *size <= top_cut.size() && *size <= pairable)
}

/// How many Participants the cut that started with `first` takes, `None` before it started
pub fn bracket_size(cut: &[RoundRecord]) -> Option<usize> {
    let first = cut.first()?;
    Some(2 * first.matches.len())
}

/// Whether every Round of the cut `cut` was paired
pub fn cut_over(cut: &[RoundRecord]) -> bool {
    bracket_size(cut).is_some_and(|size| cut.len() >= rounds_of(size))
}

/// Why no Top cut Round could be paired
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TopCutError {
    /// Fewer than two Participants are left to play
    TooFewEntrants,
    /// The final was paired already
    CutOver,
}

/// Pair the next Round of the Top cut `top_cut` after the cut Rounds `cut`
///
/// `record` holds the Swiss Rounds only; its standings seed the cut. The
/// first Round seeds the best pairable Participants in bracket order. Later
/// Rounds pair the winners as the bracket says, the higher Swiss seed in
/// Seat 1. A winner who Dropped is not replaced: the other half of its
/// pairing advances with a Bye (MTR 2.10).
pub fn pair_top_cut(
    record: &TournamentRecord,
    top_cut: TopCut,
    cut: &[RoundRecord],
) -> Result<Pairing, TopCutError> {
    let pairable: HashSet<EntrantId> = record
        .entrants
        .iter()
        .filter(|entrant| entrant.pairable)
        .map(|entrant| entrant.id)
        .collect();
    let order: Vec<EntrantId> = standings(record).iter().map(|line| line.entrant).collect();

    let Some(first) = cut.first() else {
        let seeds: Vec<EntrantId> = order
            .into_iter()
            .filter(|entrant| pairable.contains(entrant))
            .collect();
        let size = cut_size(top_cut, seeds.len()).ok_or(TopCutError::TooFewEntrants)?;
        let matches = bracket(size)
            .iter()
            .map(|(high, low)| PairedMatch {
                seats: vec![seeds[high - 1], seeds[low - 1]],
                rematch: false,
            })
            .collect();
        return Ok(Pairing {
            matches,
            byes: Vec::new(),
        });
    };
    if cut_over(cut) {
        return Err(TopCutError::CutOver);
    }

    // Where everybody stands in the bracket: two leaves per table of the first Round.
    let leaf: HashMap<EntrantId, usize> = first
        .matches
        .iter()
        .enumerate()
        .flat_map(|(table, played)| {
            played
                .seats
                .iter()
                .enumerate()
                .map(move |(seat, entrant)| (*entrant, 2 * table + seat))
        })
        .collect();
    let rank: HashMap<EntrantId, usize> = order
        .iter()
        .enumerate()
        .map(|(rank, entrant)| (*entrant, rank))
        .collect();
    let mut advancing: Vec<EntrantId> = Vec::new();
    if let Some(last) = cut.last() {
        for played in &last.matches {
            if let Some(seat) = played.result.as_ref().and_then(|result| result.winner()) {
                advancing.extend(played.seats.get(seat));
            }
        }
        advancing.extend(&last.byes);
    }

    // The k-th Round (from 0) joins the leaves equal in all but their lowest k + 1 bits.
    let mut pairs: BTreeMap<usize, Vec<EntrantId>> = BTreeMap::new();
    for entrant in advancing {
        if let Some(leaf) = leaf.get(&entrant)
            && pairable.contains(&entrant)
        {
            pairs
                .entry(leaf >> (cut.len() + 1))
                .or_default()
                .push(entrant);
        }
    }
    let mut pairing = Pairing {
        matches: Vec::new(),
        byes: Vec::new(),
    };
    for (_, mut seats) in pairs {
        seats.sort_by_key(|entrant| rank.get(entrant).copied().unwrap_or(usize::MAX));
        match seats.len() {
            0 => {}
            1 => pairing.byes.extend(seats),
            _ => pairing.matches.push(PairedMatch {
                seats,
                rematch: false,
            }),
        }
    }
    if pairing.matches.is_empty() && pairing.byes.is_empty() {
        return Err(TopCutError::TooFewEntrants);
    }
    Ok(pairing)
}

/// How many Rounds a cut of `size` Participants takes
fn rounds_of(size: usize) -> usize {
    size.max(2).ilog2() as usize
}

/// The seeds that meet in the first Round of a cut of `size`, top table first
fn bracket(size: usize) -> &'static [(usize, usize)] {
    match size {
        8 => &[(1, 8), (4, 5), (2, 7), (3, 6)],
        4 => &[(1, 4), (2, 3)],
        _ => &[(1, 2)],
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use uuid::Uuid;

    use super::TopCut;
    use super::TopCutError;
    use super::cut_over;
    use super::cut_size;
    use super::pair_top_cut;
    use super::suggested_top_cut;
    use crate::tournament::pairing::Pairing;
    use crate::tournament::record::Entrant;
    use crate::tournament::record::EntrantId;
    use crate::tournament::record::MatchRecord;
    use crate::tournament::record::MatchResult;
    use crate::tournament::record::RoundRecord;
    use crate::tournament::record::TournamentRecord;
    use crate::tournament::ruleset::Ruleset;
    use crate::tournament::ruleset::TableSize;
    use crate::tournament::standings::standings;

    fn p(n: u128) -> EntrantId {
        Uuid::from_u128(n)
    }

    /// `entrants` Participants who played one Swiss Round: 1 beat 2, 3 beat 4, ...
    fn swiss(entrants: u128) -> TournamentRecord {
        let matches = (1..=entrants)
            .step_by(2)
            .map(|n| MatchRecord {
                seats: vec![p(n), p(n + 1)],
                result: Some(MatchResult {
                    games_won: vec![2, 0],
                    games_drawn: 0,
                }),
            })
            .collect();
        TournamentRecord {
            ruleset: Ruleset::Mtr,
            table_size: TableSize::new(2).expect("a Table size"),
            entrants: (1..=entrants)
                .map(|n| Entrant {
                    id: p(n),
                    pairable: true,
                })
                .collect(),
            rounds: vec![RoundRecord {
                matches,
                byes: vec![],
            }],
            seed: 7,
        }
    }

    /// Who stands where in the Swiss standings: the seed of every Participant, 1 for the best
    fn seeds(record: &TournamentRecord) -> HashMap<EntrantId, usize> {
        standings(record)
            .iter()
            .enumerate()
            .map(|(index, line)| (line.entrant, index + 1))
            .collect()
    }

    /// The Participant at `seed` in the Swiss standings
    fn seeded(record: &TournamentRecord, seed: usize) -> EntrantId {
        standings(record)[seed - 1].entrant
    }

    /// The Matches of a Top cut Round as Seat lists of Swiss seeds
    fn tables(record: &TournamentRecord, top_cut: TopCut, cut: &[RoundRecord]) -> Vec<Vec<usize>> {
        let seeds = seeds(record);
        pair_top_cut(record, top_cut, cut)
            .expect("a Top cut Round")
            .matches
            .iter()
            .map(|paired| paired.seats.iter().map(|seat| seeds[seat]).collect())
            .collect()
    }

    #[test]
    fn a_top_8_pairs_1v8_4v5_2v7_3v6_with_the_higher_seed_in_seat_1() {
        let record = swiss(8);
        assert_eq!(
            tables(&record, TopCut::Top8, &[]),
            vec![vec![1, 8], vec![4, 5], vec![2, 7], vec![3, 6]]
        );
    }
    /// The Round a Top cut Round turns into once every Match was won by the Seat `winners` names
    fn played(pairing: &Pairing, winners: &[usize]) -> RoundRecord {
        RoundRecord {
            matches: pairing
                .matches
                .iter()
                .zip(winners)
                .map(|(paired, winner)| MatchRecord {
                    seats: paired.seats.clone(),
                    result: Some(MatchResult {
                        games_won: (0..paired.seats.len())
                            .map(|seat| if seat == *winner { 2 } else { 0 })
                            .collect(),
                        games_drawn: 0,
                    }),
                })
                .collect(),
            byes: pairing.byes.clone(),
        }
    }

    fn drop_out(record: &mut TournamentRecord, entrant: EntrantId) {
        for listed in &mut record.entrants {
            if listed.id == entrant {
                listed.pairable = false;
            }
        }
    }

    #[test]
    fn a_top_4_pairs_1v4_and_2v3() {
        let record = swiss(10);
        assert_eq!(
            tables(&record, TopCut::Top4, &[]),
            vec![vec![1, 4], vec![2, 3]]
        );
    }

    #[test]
    fn the_winners_meet_as_the_bracket_says_with_the_higher_seed_in_seat_1() {
        let record = swiss(8);
        let quarterfinals = pair_top_cut(&record, TopCut::Top8, &[]).expect("quarterfinals");
        // 8 beats 1, 4 beats 5, 7 beats 2, 3 beats 6
        let cut = vec![played(&quarterfinals, &[1, 0, 1, 0])];
        assert_eq!(
            tables(&record, TopCut::Top8, &cut),
            vec![vec![4, 8], vec![3, 7]]
        );

        let semifinals = pair_top_cut(&record, TopCut::Top8, &cut).expect("semifinals");
        let cut = vec![cut[0].clone(), played(&semifinals, &[1, 1])];
        assert_eq!(tables(&record, TopCut::Top8, &cut), vec![vec![7, 8]]);

        let fin = pair_top_cut(&record, TopCut::Top8, &cut).expect("the final");
        let cut = vec![cut[0].clone(), cut[1].clone(), played(&fin, &[0])];
        assert!(cut_over(&cut));
        assert_eq!(
            pair_top_cut(&record, TopCut::Top8, &cut),
            Err(TopCutError::CutOver)
        );
    }

    #[test]
    fn a_participant_who_dropped_before_the_cut_is_replaced_by_the_next_in_the_standings() {
        let mut record = swiss(10);
        let third = seeded(&record, 3);
        drop_out(&mut record, third);
        let seeds = seeds(&record);
        let pairing = pair_top_cut(&record, TopCut::Top4, &[]).expect("semifinals");
        let seated: Vec<Vec<usize>> = pairing
            .matches
            .iter()
            .map(|paired| paired.seats.iter().map(|seat| seeds[seat]).collect())
            .collect();
        // Seed 5 moves up to fourth: 1v5, 2v4.
        assert_eq!(seated, vec![vec![1, 5], vec![2, 4]]);
    }

    #[test]
    fn a_winner_who_dropped_during_the_cut_is_not_replaced_and_the_other_side_advances() {
        let mut record = swiss(8);
        let quarterfinals = pair_top_cut(&record, TopCut::Top8, &[]).expect("quarterfinals");
        // The higher seed wins everywhere, then seed 4 drops.
        let cut = vec![played(&quarterfinals, &[0, 0, 0, 0])];
        let fourth = seeded(&record, 4);
        drop_out(&mut record, fourth);
        let semifinals = pair_top_cut(&record, TopCut::Top8, &cut).expect("semifinals");
        assert_eq!(semifinals.byes, vec![seeded(&record, 1)]);
        assert_eq!(tables(&record, TopCut::Top8, &cut), vec![vec![2, 3]]);
    }

    #[test]
    fn the_cut_shrinks_to_the_next_size_the_participants_left_fill() {
        for (top_cut, pairable, size) in [
            (TopCut::Top8, 20, Some(8)),
            (TopCut::Top8, 8, Some(8)),
            (TopCut::Top8, 7, Some(4)),
            (TopCut::Top8, 4, Some(4)),
            (TopCut::Top8, 3, Some(2)),
            (TopCut::Top4, 8, Some(4)),
            (TopCut::Top4, 3, Some(2)),
            (TopCut::Top4, 2, Some(2)),
            (TopCut::Top4, 1, None),
            (TopCut::Top8, 0, None),
        ] {
            assert_eq!(
                cut_size(top_cut, pairable),
                size,
                "{top_cut:?} of {pairable}"
            );
        }
    }

    #[test]
    fn seven_left_for_a_top_8_play_a_top_4() {
        let mut record = swiss(8);
        let eighth = seeded(&record, 8);
        drop_out(&mut record, eighth);
        assert_eq!(
            tables(&record, TopCut::Top8, &[]),
            vec![vec![1, 4], vec![2, 3]]
        );
    }

    #[test]
    fn a_cut_needs_two_participants() {
        let mut record = swiss(2);
        drop_out(&mut record, p(1));
        assert_eq!(
            pair_top_cut(&record, TopCut::Top4, &[]),
            Err(TopCutError::TooFewEntrants)
        );
    }

    #[test]
    fn mtr_suggests_a_top_4_from_9_and_a_top_8_from_17_participants() {
        for (participants, top_cut) in [
            (2, None),
            (8, None),
            (9, Some(TopCut::Top4)),
            (16, Some(TopCut::Top4)),
            (17, Some(TopCut::Top8)),
            (400, Some(TopCut::Top8)),
        ] {
            assert_eq!(
                suggested_top_cut(Ruleset::Mtr, participants),
                top_cut,
                "{participants}"
            );
        }
        assert_eq!(suggested_top_cut(Ruleset::TopDeck, 40), None);
    }
}
