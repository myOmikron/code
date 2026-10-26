//! Pairing the next Swiss Round

use std::collections::HashMap;
use std::collections::HashSet;

use crate::tournament::matching::max_weight_matching;
use crate::tournament::multiplayer::pair_multiplayer;
use crate::tournament::multiplayer::topdeck_layout;
use crate::tournament::record::EntrantId;
use crate::tournament::record::TournamentRecord;
use crate::tournament::rng::SplitMix64;
use crate::tournament::ruleset::Ruleset;
use crate::tournament::standings::standings;

/// The Matches and Byes of a Round, as the engine suggests them
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pairing {
    /// The Matches, top table first: table number = position + 1
    pub matches: Vec<PairedMatch>,
    /// Who has a Bye
    pub byes: Vec<EntrantId>,
}

/// One Match of a [`Pairing`]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PairedMatch {
    /// Who plays, in Seat order: Seat 1 first
    pub seats: Vec<EntrantId>,
    /// Whether some of them met before; only when no pairing without it exists
    pub rematch: bool,
}

/// Why no Round could be paired
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PairingError {
    /// Fewer than two Participants are pairable
    TooFewEntrants,
    /// The engine does not pair this Ruleset yet
    RulesetNotPaired(Ruleset),
}

/// Pair the next Swiss Round of `record`, rolling every chance from `seed`
///
/// Only Participants marked pairable are paired, each exactly once, in a
/// Match or in a Bye. The same record and seed give the same pairing.
pub fn pair_next_round(record: &TournamentRecord, seed: u64) -> Result<Pairing, PairingError> {
    match record.ruleset {
        Ruleset::Mtr => pair_one_on_one(record, seed),
        Ruleset::TopDeck => pair_multiplayer(record, seed, topdeck_layout),
        Ruleset::MultiplayerAddendum => Err(PairingError::RulesetNotPaired(record.ruleset)),
    }
}

/// MTR: the Bye first, then a maximum-weight matching of everybody else
///
/// The Bye goes to the lowest-ranked Participant without one, or the
/// lowest-ranked if all had one. The matching takes the fewest rematches
/// (none whenever possible), then the smallest sum of squared Match point
/// differences, so Matches stay within point groups and a pair-down crosses as
/// few points as it can. Among equally good pairings chance decides, which
/// makes Round 1 random. Seat 1 is drawn; the Match with the best ranked
/// Participant gets the top table.
fn pair_one_on_one(record: &TournamentRecord, seed: u64) -> Result<Pairing, PairingError> {
    let pairable: HashSet<EntrantId> = record
        .entrants
        .iter()
        .filter(|entrant| entrant.pairable)
        .map(|entrant| entrant.id)
        .collect();
    let table = standings(record);
    let mut field: Vec<(EntrantId, i64)> = table
        .iter()
        .filter(|line| pairable.contains(&line.entrant))
        .map(|line| (line.entrant, i64::from(line.match_points)))
        .collect();
    if field.len() < 2 {
        return Err(PairingError::TooFewEntrants);
    }
    let rank: HashMap<EntrantId, usize> = field
        .iter()
        .enumerate()
        .map(|(rank, (entrant, _))| (*entrant, rank))
        .collect();

    let mut had_bye = HashSet::new();
    let mut met: HashMap<(EntrantId, EntrantId), i64> = HashMap::new();
    for round in &record.rounds {
        had_bye.extend(round.byes.iter().copied());
        for played in &round.matches {
            for (index, one) in played.seats.iter().enumerate() {
                for other in &played.seats[index + 1..] {
                    *met.entry(pair_key(*one, *other)).or_default() += 1;
                }
            }
        }
    }

    let mut byes = Vec::new();
    if field.len() % 2 == 1 {
        let index = field
            .iter()
            .rposition(|(entrant, _)| !had_bye.contains(entrant))
            .unwrap_or(field.len() - 1);
        byes.push(field.remove(index).0);
    }

    let mut rng = SplitMix64::seeded(seed);
    rng.shuffle(&mut field);

    let highest = field.iter().map(|(_, points)| *points).max().unwrap_or(0);
    let lowest = field.iter().map(|(_, points)| *points).min().unwrap_or(0);
    let widest = (highest - lowest) * (highest - lowest);
    let pairs = i64::try_from(field.len() / 2).unwrap_or(i64::MAX);
    let rematch_cost = pairs.saturating_mul(widest).saturating_add(1);
    let costs: Vec<(usize, usize, i64)> = (0..field.len())
        .flat_map(|i| (i + 1..field.len()).map(move |j| (i, j)))
        .map(|(i, j)| {
            let (one, one_points) = field[i];
            let (other, other_points) = field[j];
            let rematches = met.get(&pair_key(one, other)).copied().unwrap_or(0);
            let spread = (one_points - other_points) * (one_points - other_points);
            (
                i,
                j,
                rematches
                    .saturating_mul(rematch_cost)
                    .saturating_add(spread),
            )
        })
        .collect();
    let top = costs.iter().map(|(_, _, cost)| *cost).max().unwrap_or(0) + 1;
    let edges: Vec<(usize, usize, i64)> = costs
        .into_iter()
        .map(|(i, j, cost)| (i, j, top - cost))
        .collect();
    let mate = max_weight_matching(&edges, true);

    let mut matches: Vec<PairedMatch> = Vec::with_capacity(field.len() / 2);
    for (i, partner) in mate.iter().enumerate() {
        let Some(j) = *partner else {
            continue;
        };
        if i > j {
            continue;
        }
        let (one, _) = field[i];
        let (other, _) = field[j];
        let mut seats = vec![one, other];
        if rng.below(2) == 1 {
            seats.reverse();
        }
        matches.push(PairedMatch {
            seats,
            rematch: met.contains_key(&pair_key(one, other)),
        });
    }
    matches.sort_by_key(|paired| {
        paired
            .seats
            .iter()
            .map(|entrant| rank[entrant])
            .min()
            .unwrap_or(usize::MAX)
    });
    Ok(Pairing { matches, byes })
}

/// An unordered pair as an ordered key
pub(super) fn pair_key(one: EntrantId, other: EntrantId) -> (EntrantId, EntrantId) {
    if one <= other {
        (one, other)
    } else {
        (other, one)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::collections::HashSet;

    use uuid::Uuid;

    use super::PairingError;
    use super::pair_next_round;
    use crate::tournament::record::Entrant;
    use crate::tournament::record::EntrantId;
    use crate::tournament::record::MatchRecord;
    use crate::tournament::record::MatchResult;
    use crate::tournament::record::RoundRecord;
    use crate::tournament::record::TournamentRecord;
    use crate::tournament::rng::SplitMix64;
    use crate::tournament::ruleset::Ruleset;
    use crate::tournament::ruleset::TableSize;
    use crate::tournament::standings::standings;

    fn p(n: u128) -> EntrantId {
        Uuid::from_u128(n)
    }

    /// An MTR Tournament of `entrants` Participants 1 to n, all pairable
    fn mtr(entrants: u128) -> TournamentRecord {
        TournamentRecord {
            ruleset: Ruleset::Mtr,
            table_size: TableSize::new(2).expect("a Table size"),
            entrants: (1..=entrants)
                .map(|n| Entrant {
                    id: p(n),
                    pairable: true,
                })
                .collect(),
            rounds: Vec::new(),
            seed: 11,
        }
    }

    /// A Match `winner` won 2-0 against `loser`
    fn won(winner: u128, loser: u128) -> MatchRecord {
        MatchRecord {
            seats: vec![p(winner), p(loser)],
            result: Some(MatchResult {
                games_won: vec![2, 0],
                games_drawn: 0,
            }),
        }
    }

    fn round(matches: Vec<MatchRecord>, byes: Vec<u128>) -> RoundRecord {
        RoundRecord {
            matches,
            byes: byes.into_iter().map(p).collect(),
        }
    }

    /// Everybody the pairing seats, in Matches and Byes
    fn seated(record: &TournamentRecord, seed: u64) -> Vec<EntrantId> {
        let pairing = pair_next_round(record, seed).expect("pairs");
        let mut seated: Vec<EntrantId> = pairing
            .matches
            .iter()
            .flat_map(|paired| paired.seats.iter().copied())
            .collect();
        seated.extend(pairing.byes);
        seated
    }

    /// Who meets whom, as unordered pairs
    fn meetings(record: &TournamentRecord, seed: u64) -> HashSet<(EntrantId, EntrantId)> {
        pair_next_round(record, seed)
            .expect("pairs")
            .matches
            .iter()
            .map(|paired| {
                let (a, b) = (paired.seats[0], paired.seats[1]);
                if a < b { (a, b) } else { (b, a) }
            })
            .collect()
    }

    /// The Match points of every Participant
    fn points(record: &TournamentRecord) -> HashMap<EntrantId, i64> {
        standings(record)
            .into_iter()
            .map(|line| (line.entrant, i64::from(line.match_points)))
            .collect()
    }

    #[test]
    fn every_pairable_participant_is_seated_exactly_once() {
        for entrants in 2..=21 {
            for seed in 0..5 {
                let record = mtr(entrants);
                let mut seated = seated(&record, seed);
                seated.sort();
                let everybody: Vec<EntrantId> = (1..=entrants).map(p).collect();
                assert_eq!(seated, everybody, "{entrants} Participants, seed {seed}");
            }
        }
    }

    #[test]
    fn an_odd_field_has_exactly_one_bye_and_an_even_one_none() {
        for entrants in 2..=15 {
            let pairing = pair_next_round(&mtr(entrants), 3).expect("pairs");
            assert_eq!(
                pairing.byes.len(),
                usize::from(entrants % 2 == 1),
                "{entrants}"
            );
            assert!(pairing.matches.iter().all(|paired| paired.seats.len() == 2));
        }
    }

    #[test]
    fn round_one_is_drawn_at_random_but_the_same_for_the_same_seed() {
        let record = mtr(12);
        assert_eq!(
            pair_next_round(&record, 5),
            pair_next_round(&record, 5),
            "the same seed pairs the same way"
        );
        let pairings: HashSet<Vec<(EntrantId, EntrantId)>> = (0..20)
            .map(|seed| {
                let mut met: Vec<_> = meetings(&record, seed).into_iter().collect();
                met.sort();
                met
            })
            .collect();
        assert!(
            pairings.len() > 10,
            "only {} different pairings",
            pairings.len()
        );
    }

    #[test]
    fn a_participant_left_unpairable_sits_out() {
        let mut record = mtr(6);
        record.entrants[1].pairable = false;
        record.entrants[4].pairable = false;
        let mut seated = seated(&record, 1);
        seated.sort();
        assert_eq!(seated, vec![p(1), p(3), p(4), p(6)]);
    }

    #[test]
    fn fewer_than_two_pairable_participants_cannot_be_paired() {
        assert_eq!(
            pair_next_round(&mtr(1), 0),
            Err(PairingError::TooFewEntrants)
        );
        let mut record = mtr(3);
        record.entrants[0].pairable = false;
        record.entrants[1].pairable = false;
        assert_eq!(
            pair_next_round(&record, 0),
            Err(PairingError::TooFewEntrants)
        );
    }

    #[test]
    fn a_dropped_participant_is_not_paired_again() {
        let mut record = mtr(5);
        record.rounds = vec![round(vec![won(1, 2), won(3, 4)], vec![5])];
        record.entrants[0].pairable = false;
        for seed in 0..5 {
            let mut seated = seated(&record, seed);
            seated.sort();
            assert_eq!(seated, vec![p(2), p(3), p(4), p(5)], "seed {seed}");
        }
    }

    #[test]
    fn a_late_participant_starts_with_no_match_points_at_the_bottom() {
        let mut record = mtr(7);
        record.rounds = vec![
            round(vec![won(1, 2), won(3, 4), won(5, 6)], vec![]),
            round(vec![won(1, 5), won(3, 2), won(4, 6)], vec![]),
        ];
        let points = points(&record);
        assert_eq!(points[&p(7)], 0, "missed Rounds bring no Match points");
        for seed in 0..10 {
            let pairing = pair_next_round(&record, seed).expect("pairs");
            let seated = seated(&record, seed);
            assert_eq!(
                seated.iter().filter(|entrant| **entrant == p(7)).count(),
                1,
                "seed {seed}"
            );
            for paired in &pairing.matches {
                if paired.seats.contains(&p(7)) {
                    assert!(
                        paired.seats.iter().all(|entrant| points[entrant] == 0),
                        "seed {seed}: the latecomer plays down in its own point group"
                    );
                }
            }
        }
    }

    #[test]
    fn the_multiplayer_addendum_is_not_paired_yet() {
        let record = TournamentRecord {
            ruleset: Ruleset::MultiplayerAddendum,
            table_size: TableSize::new(4).expect("a Table size"),
            ..mtr(8)
        };
        assert_eq!(
            pair_next_round(&record, 0),
            Err(PairingError::RulesetNotPaired(Ruleset::MultiplayerAddendum))
        );
    }

    #[test]
    fn winners_meet_winners_and_losers_meet_losers() {
        let mut record = mtr(8);
        record.rounds = vec![round(
            vec![won(1, 2), won(3, 4), won(5, 6), won(7, 8)],
            vec![],
        )];
        let points = points(&record);
        for seed in 0..10 {
            for (a, b) in meetings(&record, seed) {
                assert_eq!(points[&a], points[&b], "seed {seed}: {a} against {b}");
            }
        }
    }

    #[test]
    fn an_odd_point_group_pairs_exactly_one_participant_down() {
        let mut record = mtr(6);
        record.rounds = vec![round(vec![won(1, 4), won(2, 5), won(3, 6)], vec![])];
        let points = points(&record);
        for seed in 0..10 {
            let crossing = meetings(&record, seed)
                .into_iter()
                .filter(|(a, b)| points[a] != points[b])
                .count();
            assert_eq!(crossing, 1, "seed {seed}: one of three winners plays down");
        }
    }

    #[test]
    fn the_bye_goes_to_the_lowest_ranked_participant_without_one() {
        let mut record = mtr(5);
        record.rounds = vec![round(vec![won(1, 2), won(3, 4)], vec![5])];
        let table = standings(&record);
        let lowest = table.last().expect("a line").entrant;
        assert!(lowest == p(2) || lowest == p(4), "a loser ranks last");
        for seed in 0..5 {
            let pairing = pair_next_round(&record, seed).expect("pairs");
            assert_eq!(pairing.byes, vec![lowest], "seed {seed}");
        }

        record
            .rounds
            .push(round(vec![won(1, 3), won(5, 4)], vec![2]));
        record
            .rounds
            .push(round(vec![won(1, 5), won(3, 2)], vec![4]));
        let byes: HashSet<EntrantId> = [p(5), p(2), p(4)].into();
        let without: Vec<EntrantId> = standings(&record)
            .into_iter()
            .map(|line| line.entrant)
            .filter(|entrant| !byes.contains(entrant))
            .collect();
        let pairing = pair_next_round(&record, 0).expect("pairs");
        assert_eq!(
            pairing.byes,
            vec![*without.last().expect("one without a Bye")]
        );
    }

    #[test]
    fn once_everybody_had_a_bye_the_lowest_ranked_gets_another() {
        let mut record = mtr(3);
        record.rounds = vec![
            round(vec![won(1, 2)], vec![3]),
            round(vec![won(1, 3)], vec![2]),
            round(vec![won(2, 3)], vec![1]),
        ];
        let lowest = standings(&record).last().expect("a line").entrant;
        let pairing = pair_next_round(&record, 0).expect("pairs");
        assert_eq!(pairing.byes, vec![lowest]);
    }

    #[test]
    fn the_best_ranked_participant_plays_at_the_top_table() {
        let mut record = mtr(8);
        record.rounds = vec![round(
            vec![won(1, 2), won(3, 4), won(5, 6), won(7, 8)],
            vec![],
        )];
        let leader = standings(&record)[0].entrant;
        let pairing = pair_next_round(&record, 4).expect("pairs");
        assert!(pairing.matches[0].seats.contains(&leader));
    }

    #[test]
    fn seat_one_is_drawn() {
        let mut first = HashSet::new();
        for seed in 0..20 {
            let pairing = pair_next_round(&mtr(2), seed).expect("pairs");
            first.insert(pairing.matches[0].seats[0]);
        }
        assert_eq!(first, [p(1), p(2)].into());
    }

    #[test]
    fn a_rematch_is_paired_only_when_nothing_else_is_left() {
        let mut record = mtr(4);
        record.rounds = vec![
            round(vec![won(1, 2), won(3, 4)], vec![]),
            round(vec![won(1, 3), won(2, 4)], vec![]),
            round(vec![won(1, 4), won(2, 3)], vec![]),
        ];
        let pairing = pair_next_round(&record, 0).expect("still pairs");
        assert_eq!(pairing.matches.len(), 2);
        assert!(pairing.matches.iter().all(|paired| paired.rematch));

        record.rounds.pop();
        let pairing = pair_next_round(&record, 0).expect("pairs");
        assert!(pairing.matches.iter().all(|paired| !paired.rematch));
        assert_eq!(meetings(&record, 0), [(p(1), p(4)), (p(2), p(3))].into());
    }

    /// The fewest rematches and then the smallest squared point spread of any
    /// pairing of `field`, by trying them all
    fn best_by_brute_force(
        field: &[EntrantId],
        points: &HashMap<EntrantId, i64>,
        met: &HashSet<(EntrantId, EntrantId)>,
    ) -> (usize, i64) {
        if field.is_empty() {
            return (0, 0);
        }
        let first = field[0];
        let mut best = (usize::MAX, i64::MAX);
        for index in 1..field.len() {
            let other = field[index];
            let rest: Vec<EntrantId> = field[1..]
                .iter()
                .copied()
                .filter(|entrant| *entrant != other)
                .collect();
            let (rematches, spread) = best_by_brute_force(&rest, points, met);
            let key = if first < other {
                (first, other)
            } else {
                (other, first)
            };
            let difference = points[&first] - points[&other];
            let candidate = (
                rematches + usize::from(met.contains(&key)),
                spread + difference * difference,
            );
            best = best.min(candidate);
        }
        best
    }

    #[test]
    fn no_pairing_has_fewer_rematches_or_pair_downs_than_the_one_chosen() {
        let mut rng = SplitMix64::seeded(305);
        for case in 0..400 {
            let entrants = 4 + u128::try_from(rng.below(6)).expect("small");
            let mut record = mtr(entrants);
            for _ in 0..rng.below(4) {
                let mut order: Vec<u128> = (1..=entrants).collect();
                rng.shuffle(&mut order);
                let byes = if order.len() % 2 == 1 {
                    vec![order.pop().expect("odd")]
                } else {
                    vec![]
                };
                let matches = order
                    .chunks(2)
                    .map(|pair| {
                        if rng.below(2) == 0 {
                            won(pair[0], pair[1])
                        } else {
                            won(pair[1], pair[0])
                        }
                    })
                    .collect();
                record.rounds.push(round(matches, byes));
            }

            let seed = rng.next_u64();
            let pairing = pair_next_round(&record, seed).expect("pairs");
            let points = points(&record);
            let mut met = HashSet::new();
            for played in record.rounds.iter().flat_map(|round| &round.matches) {
                let (a, b) = (played.seats[0], played.seats[1]);
                met.insert(if a < b { (a, b) } else { (b, a) });
            }
            let chosen = pairing
                .matches
                .iter()
                .fold((0, 0), |(rematches, spread), paired| {
                    let (a, b) = (paired.seats[0], paired.seats[1]);
                    let key = if a < b { (a, b) } else { (b, a) };
                    let difference = points[&a] - points[&b];
                    (
                        rematches + usize::from(met.contains(&key)),
                        spread + difference * difference,
                    )
                });
            let field: Vec<EntrantId> = (1..=entrants)
                .map(p)
                .filter(|entrant| !pairing.byes.contains(entrant))
                .collect();
            assert_eq!(
                chosen,
                best_by_brute_force(&field, &points, &met),
                "case {case}"
            );
        }
    }

    #[test]
    fn thirty_two_participants_play_five_rounds_without_a_single_rematch() {
        let mut record = mtr(32);
        let mut met: HashSet<(EntrantId, EntrantId)> = HashSet::new();
        for number in 1..=5u64 {
            let pairing = pair_next_round(&record, number).expect("pairs");
            assert!(pairing.byes.is_empty());
            let order: Vec<EntrantId> = standings(&record)
                .into_iter()
                .map(|line| line.entrant)
                .collect();
            let rank = |entrant: &EntrantId| order.iter().position(|other| other == entrant);
            let mut matches = Vec::new();
            for paired in &pairing.matches {
                let (a, b) = (paired.seats[0], paired.seats[1]);
                let key = if a < b { (a, b) } else { (b, a) };
                assert!(met.insert(key), "Round {number}: {a} and {b} met before");
                assert!(!paired.rematch);
                let (winner, loser) = if rank(&a) < rank(&b) { (a, b) } else { (b, a) };
                matches.push(MatchRecord {
                    seats: vec![winner, loser],
                    result: Some(MatchResult {
                        games_won: vec![2, 1],
                        games_drawn: 0,
                    }),
                });
            }
            record.rounds.push(RoundRecord {
                matches,
                byes: vec![],
            });
        }
    }
}
