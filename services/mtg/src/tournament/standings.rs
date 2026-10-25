//! The standings: every Participant's Match points and place

use std::cmp::Reverse;
use std::collections::HashMap;

use crate::tournament::record::EntrantId;
use crate::tournament::record::TournamentRecord;
use crate::tournament::rng;

/// One Participant's line in the standings
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Standing {
    /// Who
    pub entrant: EntrantId,
    /// Its place, 1 for the top; Participants equal on everything share one
    pub place: u32,
    /// Its Match points, Byes included
    pub match_points: u32,
    /// Matches won, Byes not included
    pub wins: u32,
    /// Matches lost
    pub losses: u32,
    /// Matches drawn
    pub draws: u32,
    /// Byes had
    pub byes: u32,
}

/// The standings of `record`, best first
///
/// Counts every Match with a Result and every Bye. Ordered by Match points;
/// Participants equal on them share a place, and their order among each other
/// is drawn from [`TournamentRecord::seed`], the same on every call. Every
/// Participant has a line, also one that never played or Dropped.
pub fn standings(record: &TournamentRecord) -> Vec<Standing> {
    let win = record.ruleset.win_points(record.table_size);
    let draw = record.ruleset.draw_points();

    let mut lines: HashMap<EntrantId, Standing> = record
        .entrants
        .iter()
        .map(|entrant| {
            let line = Standing {
                entrant: entrant.id,
                place: 0,
                match_points: 0,
                wins: 0,
                losses: 0,
                draws: 0,
                byes: 0,
            };
            (entrant.id, line)
        })
        .collect();

    for round in &record.rounds {
        for bye in &round.byes {
            if let Some(line) = lines.get_mut(bye) {
                line.byes += 1;
                line.match_points += win;
            }
        }
        for played in &round.matches {
            let Some(result) = &played.result else {
                continue;
            };
            let winner = result.winner();
            for (seat, entrant) in played.seats.iter().enumerate() {
                let Some(line) = lines.get_mut(entrant) else {
                    continue;
                };
                match winner {
                    None => {
                        line.draws += 1;
                        line.match_points += draw;
                    }
                    Some(winner) if winner == seat => {
                        line.wins += 1;
                        line.match_points += win;
                    }
                    Some(_) => line.losses += 1,
                }
            }
        }
    }

    let mut ordered: Vec<Standing> = lines.into_values().collect();
    ordered.sort_by_key(|line| {
        (
            Reverse(line.match_points),
            rng::draw(record.seed, line.entrant),
            line.entrant,
        )
    });
    let mut place = 0;
    let mut previous = None;
    for (index, line) in ordered.iter_mut().enumerate() {
        if previous != Some(line.match_points) {
            place = u32::try_from(index).unwrap_or(u32::MAX).saturating_add(1);
            previous = Some(line.match_points);
        }
        line.place = place;
    }
    ordered
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::Standing;
    use super::standings;
    use crate::tournament::record::Entrant;
    use crate::tournament::record::EntrantId;
    use crate::tournament::record::MatchRecord;
    use crate::tournament::record::MatchResult;
    use crate::tournament::record::RoundRecord;
    use crate::tournament::record::TournamentRecord;
    use crate::tournament::ruleset::Ruleset;
    use crate::tournament::ruleset::TableSize;

    fn p(n: u128) -> EntrantId {
        Uuid::from_u128(n)
    }

    fn mtr(entrants: u128, rounds: Vec<RoundRecord>) -> TournamentRecord {
        TournamentRecord {
            ruleset: Ruleset::Mtr,
            table_size: TableSize::new(2).expect("a Table size"),
            entrants: (1..=entrants)
                .map(|n| Entrant {
                    id: p(n),
                    pairable: true,
                })
                .collect(),
            rounds,
            seed: 7,
        }
    }

    /// A one-on-one Match of `a` and `b` that ended `won_a`-`won_b`-`drawn`
    fn duel(a: u128, b: u128, won_a: u8, won_b: u8, drawn: u8) -> MatchRecord {
        MatchRecord {
            seats: vec![p(a), p(b)],
            result: Some(MatchResult {
                games_won: vec![won_a, won_b],
                games_drawn: drawn,
            }),
        }
    }

    fn line(table: &[Standing], n: u128) -> &Standing {
        table
            .iter()
            .find(|line| line.entrant == p(n))
            .expect("a line for every Participant")
    }

    #[test]
    fn a_win_scores_three_a_draw_one_and_a_loss_nothing() {
        let table = standings(&mtr(
            4,
            vec![RoundRecord {
                matches: vec![duel(1, 2, 2, 1, 0), duel(3, 4, 1, 1, 1)],
                byes: vec![],
            }],
        ));

        assert_eq!(line(&table, 1).match_points, 3);
        assert_eq!(line(&table, 2).match_points, 0);
        assert_eq!(line(&table, 3).match_points, 1);
        assert_eq!(line(&table, 4).match_points, 1);
        assert_eq!(
            (
                line(&table, 1).wins,
                line(&table, 2).losses,
                line(&table, 3).draws
            ),
            (1, 1, 1)
        );
    }

    #[test]
    fn a_bye_scores_as_a_win() {
        let table = standings(&mtr(
            3,
            vec![RoundRecord {
                matches: vec![duel(1, 2, 0, 2, 0)],
                byes: vec![p(3)],
            }],
        ));

        assert_eq!(line(&table, 3).match_points, 3);
        assert_eq!(line(&table, 3).byes, 1);
        assert_eq!(line(&table, 3).wins, 0, "a Bye is not a Match won");
    }

    #[test]
    fn a_match_without_a_result_counts_for_nobody() {
        let table = standings(&mtr(
            2,
            vec![RoundRecord {
                matches: vec![MatchRecord {
                    seats: vec![p(1), p(2)],
                    result: None,
                }],
                byes: vec![],
            }],
        ));

        for n in [1, 2] {
            let line = line(&table, n);
            assert_eq!(
                (line.match_points, line.wins, line.losses, line.draws),
                (0, 0, 0, 0)
            );
        }
    }

    #[test]
    fn the_most_match_points_lead_and_equals_share_a_place() {
        let table = standings(&mtr(
            4,
            vec![RoundRecord {
                matches: vec![duel(1, 2, 2, 0, 0), duel(4, 3, 0, 2, 0)],
                byes: vec![],
            }],
        ));

        let places: Vec<(u32, u32)> = table
            .iter()
            .map(|line| (line.place, line.match_points))
            .collect();
        assert_eq!(places, vec![(1, 3), (1, 3), (3, 0), (3, 0)]);
    }

    #[test]
    fn every_participant_has_a_line_before_anybody_played() {
        let table = standings(&mtr(5, vec![]));
        assert_eq!(table.len(), 5);
        assert!(table.iter().all(|line| line.place == 1));
    }

    #[test]
    fn ties_fall_the_same_way_on_every_call_and_differently_for_another_seed() {
        let record = mtr(12, vec![]);
        let order = |record: &TournamentRecord| -> Vec<EntrantId> {
            standings(record).iter().map(|line| line.entrant).collect()
        };
        assert_eq!(order(&record), order(&record));

        let orders: std::collections::HashSet<Vec<EntrantId>> = (0..10)
            .map(|seed| {
                order(&TournamentRecord {
                    seed,
                    ..record.clone()
                })
            })
            .collect();
        assert!(orders.len() > 1, "every seed drew the same order");
    }
}
