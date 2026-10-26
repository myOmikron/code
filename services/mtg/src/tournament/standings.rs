//! The standings: every Participant's Match points, Tiebreakers and place

use std::cmp::Ordering;
use std::cmp::Reverse;
use std::collections::HashMap;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use num_bigint::BigUint;
use serde::Deserialize;
use serde::Serialize;

use crate::tournament::record::EntrantId;
use crate::tournament::record::TournamentRecord;
use crate::tournament::rng;
use crate::tournament::ruleset::Ruleset;

/// Game points of a game won (MTR App. C)
const GAME_POINTS_WIN: u64 = 3;

/// Game points of a drawn game
const GAME_POINTS_DRAW: u64 = 1;

/// Games a Bye counts as won: a Bye is a 2-0 win at every Match length
const BYE_GAMES: u64 = 2;

/// A Tiebreaker: a number a Ruleset orders Participants with equal Match points by
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub enum Tiebreaker {
    /// OMW%: the average of the opponents' Match-win percentages, each at least the floor
    OpponentMatchWinPercentage,
    /// GW%: game points over three per game played, at least the floor
    GameWinPercentage,
    /// OGW%: the average of the opponents' game-win percentages, each at least the floor
    OpponentGameWinPercentage,
}

impl Ruleset {
    /// The Tiebreakers after Match points, the most significant first
    ///
    /// MTR: OMW%, GW%, OGW% (MTR 3.1). The multiplayer Rulesets order by
    /// Match points alone so far.
    pub fn tiebreakers(self) -> &'static [Tiebreaker] {
        match self {
            Self::Mtr => &[
                Tiebreaker::OpponentMatchWinPercentage,
                Tiebreaker::GameWinPercentage,
                Tiebreaker::OpponentGameWinPercentage,
            ],
            Self::TopDeck | Self::MultiplayerAddendum => &[],
        }
    }
}

/// A share between 0 and 1 as an exact fraction
///
/// Averages of opponents' percentages compare exactly, so Participants
/// equal on a Tiebreaker share a place however their opponents add up.
/// Round only for display, through [`Share::to_f64`].
#[derive(Debug, Clone)]
pub struct Share {
    /// Above the line
    numerator: BigUint,
    /// Below the line, never 0
    denominator: BigUint,
}

impl Share {
    /// `numerator / denominator`; a denominator of 0 counts as 1
    pub fn new(numerator: u64, denominator: u64) -> Self {
        Self {
            numerator: BigUint::from(numerator),
            denominator: BigUint::from(denominator.max(1)),
        }
    }

    /// Nothing: the value of a Tiebreaker without anything to count
    fn zero() -> Self {
        Self::new(0, 1)
    }

    /// The MTR floor, exactly 0.33 and not a third (MTR App. C)
    fn mtr_floor() -> Self {
        Self::new(33, 100)
    }

    /// The mean of `shares`, nothing for none
    fn mean(shares: impl IntoIterator<Item = Self>) -> Self {
        let mut count: u64 = 0;
        let mut sum = Self::zero();
        for share in shares {
            count += 1;
            sum = Self {
                numerator: &sum.numerator * &share.denominator
                    + &share.numerator * &sum.denominator,
                denominator: sum.denominator * share.denominator,
            };
        }
        if count == 0 {
            return sum;
        }
        Self {
            numerator: sum.numerator,
            denominator: sum.denominator * BigUint::from(count),
        }
    }

    /// Its value to nine decimals, for display
    pub fn to_f64(&self) -> f64 {
        const SCALE: u64 = 1_000_000_000;
        let scaled = &self.numerator * BigUint::from(SCALE) / &self.denominator;
        u64::try_from(&scaled).unwrap_or(u64::MAX) as f64 / SCALE as f64
    }
}

impl PartialEq for Share {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}

impl Eq for Share {}

impl PartialOrd for Share {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Share {
    fn cmp(&self, other: &Self) -> Ordering {
        (&self.numerator * &other.denominator).cmp(&(&other.numerator * &self.denominator))
    }
}

/// One Participant's line in the standings
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Standing {
    /// Who
    pub entrant: EntrantId,
    /// Its place, 1 for the top; Participants equal on Match points and every Tiebreaker share one
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
    /// Its Tiebreakers, in the order of [`Ruleset::tiebreakers`]
    pub tiebreakers: Vec<Share>,
}

/// What one Participant played, as its Tiebreakers need it
#[derive(Debug, Clone, Default)]
struct Played {
    /// Match points, Byes included
    match_points: u64,
    /// Rounds played: Matches with a Result and Byes
    rounds: u64,
    /// Game points, a Bye's included
    game_points: u64,
    /// Games played, a Bye's included
    games: u64,
    /// Everyone it shared a Match with a Result with, once per Match; never a Bye
    opponents: Vec<EntrantId>,
}

impl Played {
    /// Match points over the most it could have won in its Rounds, at least `floor`
    fn match_win(&self, win_points: u32, floor: &Share) -> Share {
        if self.rounds == 0 {
            return Share::zero();
        }
        Share::new(self.match_points, u64::from(win_points) * self.rounds).max(floor.clone())
    }

    /// Game points over three per game played, at least `floor`
    fn game_win(&self, floor: &Share) -> Share {
        if self.rounds == 0 {
            return Share::zero();
        }
        Share::new(self.game_points, GAME_POINTS_WIN * self.games).max(floor.clone())
    }
}

/// The standings of `record`, best first
///
/// Counts every Match with a Result and every Bye. Ordered by Match points,
/// then by the Ruleset's Tiebreakers; Participants equal on all of them
/// share a place, and their order among each other is drawn from
/// [`TournamentRecord::seed`], the same on every call. Every Participant has
/// a line, also one that never played or Dropped; a Dropped one counts for
/// its opponents with what it played.
pub fn standings(record: &TournamentRecord) -> Vec<Standing> {
    let win = record.ruleset.win_points(record.table_size);
    let draw = record.ruleset.draw_points();

    let mut lines: HashMap<EntrantId, Standing> = HashMap::new();
    let mut played: HashMap<EntrantId, Played> = HashMap::new();
    for entrant in &record.entrants {
        let line = Standing {
            entrant: entrant.id,
            place: 0,
            match_points: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            byes: 0,
            tiebreakers: Vec::new(),
        };
        lines.insert(entrant.id, line);
        played.insert(entrant.id, Played::default());
    }

    for round in &record.rounds {
        for bye in &round.byes {
            if let (Some(line), Some(played)) = (lines.get_mut(bye), played.get_mut(bye)) {
                line.byes += 1;
                line.match_points += win;
                played.match_points += u64::from(win);
                played.rounds += 1;
                played.game_points += BYE_GAMES * GAME_POINTS_WIN;
                played.games += BYE_GAMES;
            }
        }
        for paired in &round.matches {
            let Some(result) = &paired.result else {
                continue;
            };
            let winner = result.winner();
            let drawn = u64::from(result.games_drawn);
            let games = result.games_won.iter().copied().map(u64::from).sum::<u64>() + drawn;
            for (seat, entrant) in paired.seats.iter().enumerate() {
                let (Some(line), Some(played)) = (lines.get_mut(entrant), played.get_mut(entrant))
                else {
                    continue;
                };
                let points = match winner {
                    None => {
                        line.draws += 1;
                        draw
                    }
                    Some(winner) if winner == seat => {
                        line.wins += 1;
                        win
                    }
                    Some(_) => {
                        line.losses += 1;
                        0
                    }
                };
                line.match_points += points;
                played.match_points += u64::from(points);
                played.rounds += 1;
                let won = u64::from(result.games_won.get(seat).copied().unwrap_or(0));
                played.game_points += won * GAME_POINTS_WIN + drawn * GAME_POINTS_DRAW;
                played.games += games;
                played.opponents.extend(
                    paired
                        .seats
                        .iter()
                        .enumerate()
                        .filter(|(other, _)| *other != seat)
                        .map(|(_, opponent)| *opponent),
                );
            }
        }
    }

    let chain = record.ruleset.tiebreakers();
    let floor = Share::mtr_floor();
    let match_win: HashMap<EntrantId, Share> = played
        .iter()
        .map(|(entrant, played)| (*entrant, played.match_win(win, &floor)))
        .collect();
    let game_win: HashMap<EntrantId, Share> = played
        .iter()
        .map(|(entrant, played)| (*entrant, played.game_win(&floor)))
        .collect();
    let average = |opponents: &[EntrantId], of: &HashMap<EntrantId, Share>| {
        Share::mean(
            opponents
                .iter()
                .map(|opponent| of.get(opponent).cloned().unwrap_or_else(|| floor.clone())),
        )
    };
    for (entrant, line) in &mut lines {
        let Some(played) = played.get(entrant) else {
            continue;
        };
        line.tiebreakers = chain
            .iter()
            .map(|tiebreaker| match tiebreaker {
                Tiebreaker::OpponentMatchWinPercentage => average(&played.opponents, &match_win),
                Tiebreaker::GameWinPercentage => played.game_win(&floor),
                Tiebreaker::OpponentGameWinPercentage => average(&played.opponents, &game_win),
            })
            .collect();
    }

    let mut ordered: Vec<Standing> = lines.into_values().collect();
    ordered.sort_by_cached_key(|line| {
        (
            Reverse(line.match_points),
            Reverse(line.tiebreakers.clone()),
            rng::draw(record.seed, line.entrant),
            line.entrant,
        )
    });
    let mut place = 0;
    for index in 0..ordered.len() {
        let tied = index > 0
            && ordered[index - 1].match_points == ordered[index].match_points
            && ordered[index - 1].tiebreakers == ordered[index].tiebreakers;
        if !tied {
            place = u32::try_from(index).unwrap_or(u32::MAX).saturating_add(1);
        }
        ordered[index].place = place;
    }
    ordered
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::Share;
    use super::Standing;
    use super::Tiebreaker;
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

    /// Builds a record Match by Match, one Round each, against fresh opponents where asked
    ///
    /// The engine does not need a Round to seat everybody, so every Match
    /// here is a Round of its own.
    struct Event {
        rounds: Vec<RoundRecord>,
        entrants: Vec<u128>,
        next_stranger: u128,
    }

    impl Event {
        fn new() -> Self {
            Self {
                rounds: Vec::new(),
                entrants: Vec::new(),
                next_stranger: 1_000,
            }
        }

        fn seen(&mut self, n: u128) {
            if !self.entrants.contains(&n) {
                self.entrants.push(n);
            }
        }

        fn play(&mut self, a: u128, b: u128, won_a: u8, won_b: u8, drawn: u8) -> &mut Self {
            self.seen(a);
            self.seen(b);
            self.rounds.push(RoundRecord {
                matches: vec![duel(a, b, won_a, won_b, drawn)],
                byes: vec![],
            });
            self
        }

        fn bye(&mut self, a: u128) -> &mut Self {
            self.seen(a);
            self.rounds.push(RoundRecord {
                matches: vec![],
                byes: vec![p(a)],
            });
            self
        }

        fn stranger(&mut self) -> u128 {
            self.next_stranger += 1;
            self.next_stranger
        }

        /// `a` wins, loses and draws that many Matches against fresh opponents
        fn record(&mut self, a: u128, wins: u8, losses: u8, draws: u8) -> &mut Self {
            for _ in 0..wins {
                let other = self.stranger();
                self.play(a, other, 2, 0, 0);
            }
            for _ in 0..losses {
                let other = self.stranger();
                self.play(a, other, 0, 2, 0);
            }
            for _ in 0..draws {
                let other = self.stranger();
                self.play(a, other, 1, 1, 0);
            }
            self
        }

        fn standings(&self) -> Vec<Standing> {
            let mut record = mtr(0, self.rounds.clone());
            record.entrants = self
                .entrants
                .iter()
                .map(|n| Entrant {
                    id: p(*n),
                    pairable: true,
                })
                .collect();
            standings(&record)
        }
    }

    fn share(numerator: u64, denominator: u64) -> Share {
        Share::new(numerator, denominator)
    }

    fn tiebreakers(table: &[Standing], n: u128) -> (Share, Share, Share) {
        let values = &line(table, n).tiebreakers;
        assert_eq!(values.len(), 3, "MTR breaks ties three times");
        (values[0].clone(), values[1].clone(), values[2].clone())
    }

    fn omw(table: &[Standing], n: u128) -> Share {
        tiebreakers(table, n).0
    }

    fn gw(table: &[Standing], n: u128) -> Share {
        tiebreakers(table, n).1
    }

    fn ogw(table: &[Standing], n: u128) -> Share {
        tiebreakers(table, n).2
    }

    #[test]
    fn mtr_breaks_ties_by_omw_then_gw_then_ogw() {
        assert_eq!(
            Ruleset::Mtr.tiebreakers(),
            &[
                Tiebreaker::OpponentMatchWinPercentage,
                Tiebreaker::GameWinPercentage,
                Tiebreaker::OpponentGameWinPercentage,
            ]
        );
    }

    #[test]
    fn an_opponents_match_win_percentage_is_its_match_points_over_three_per_round() {
        let mut event = Event::new();
        event.play(1, 10, 0, 2, 0).record(10, 4, 2, 1);
        event.play(2, 20, 0, 2, 0).record(20, 0, 3, 0);
        event.bye(30).play(3, 30, 0, 2, 0).record(30, 1, 2, 0);
        let table = event.standings();

        assert_eq!(omw(&table, 1), share(16, 24), "5-2-1 is 16/(8*3)");
        assert_eq!(
            omw(&table, 2),
            share(33, 100),
            "1-3-0 is 0.25, below the floor"
        );
        assert_eq!(omw(&table, 3), share(9, 15), "3-2-0 with a Bye is 9/(5*3)");
    }

    #[test]
    fn the_game_win_percentage_follows_the_mtr_examples() {
        let mut event = Event::new();
        event
            .play(1, 11, 2, 0, 0)
            .play(1, 12, 2, 1, 0)
            .play(1, 13, 1, 2, 0)
            .play(1, 14, 2, 0, 0);
        event
            .play(2, 21, 1, 2, 0)
            .play(2, 22, 1, 2, 0)
            .play(2, 23, 0, 2, 0)
            .play(2, 24, 1, 2, 0);
        let table = event.standings();

        assert_eq!(gw(&table, 1), share(21, 30));
        assert_eq!(gw(&table, 2), share(33, 100), "9/33 is below the floor");
    }

    #[test]
    fn a_drawn_game_scores_one_game_point() {
        let mut event = Event::new();
        event.play(1, 2, 2, 0, 1);
        let table = event.standings();

        assert_eq!(gw(&table, 1), share(7, 9));
        assert_eq!(gw(&table, 2), share(33, 100), "1/9 is below the floor");
    }

    #[test]
    fn the_opponents_match_win_percentage_follows_the_mtr_examples() {
        let opponents: [(u8, u8, u8); 8] = [
            (4, 4, 0),
            (7, 1, 0),
            (1, 3, 1),
            (3, 3, 1),
            (6, 2, 0),
            (5, 2, 1),
            (4, 3, 1),
            (6, 1, 1),
        ];
        let mut event = Event::new();
        for (index, (wins, losses, draws)) in opponents.into_iter().enumerate() {
            let her = 100 + index as u128;
            let his = 200 + index as u128;
            let first = index < 6;
            event.play(1, her, u8::from(first) * 2, u8::from(!first) * 2, 0);
            if index == 0 {
                event.bye(2);
            } else {
                event.play(2, his, u8::from(first) * 2, u8::from(!first) * 2, 0);
            }
            let (wins, losses) = if first {
                (wins, losses - 1)
            } else {
                (wins - 1, losses)
            };
            event.record(her, wins, losses, draws);
            if index != 0 {
                let (his_wins, his_losses) = (wins, losses);
                event.record(his, his_wins, his_losses, draws);
            }
        }
        let table = event.standings();

        assert_eq!(omw(&table, 1), share(20_711, 33_600), "about 0.62");
        assert_eq!(
            omw(&table, 2),
            share(18_611, 29_400),
            "the Bye is no opponent: about 0.63"
        );
    }

    #[test]
    fn the_opponents_game_win_percentage_averages_floored_opponents() {
        let mut event = Event::new();
        event.play(1, 2, 2, 0, 0).play(1, 3, 0, 2, 0);
        event.play(3, 4, 2, 1, 0);
        let table = event.standings();

        assert_eq!(
            ogw(&table, 1),
            share(113, 200),
            "0/6 floored to 0.33 and 12/15"
        );
    }

    #[test]
    fn a_bye_is_a_two_nil_win_also_in_best_of_one() {
        let mut event = Event::new();
        event.bye(1).play(1, 2, 0, 1, 0);
        let table = event.standings();

        assert_eq!(line(&table, 1).match_points, 3);
        assert_eq!(
            gw(&table, 1),
            share(6, 9),
            "six game points of nine, not three of six"
        );
    }

    #[test]
    fn a_participant_without_a_match_has_no_tiebreakers() {
        let mut event = Event::new();
        event.bye(1);
        event.seen(2);
        let table = event.standings();

        assert_eq!(omw(&table, 1), share(0, 1));
        assert_eq!(ogw(&table, 1), share(0, 1));
        assert_eq!(
            tiebreakers(&table, 2),
            (share(0, 1), share(0, 1), share(0, 1))
        );
    }

    #[test]
    fn equal_match_points_are_ordered_by_the_tiebreakers_and_only_full_equals_share_a_place() {
        let mut event = Event::new();
        event.play(1, 3, 2, 0, 0).play(3, 5, 2, 0, 0);
        event.play(2, 4, 2, 0, 0).play(4, 6, 0, 2, 0);
        event.play(7, 8, 2, 1, 0);
        event.play(9, 10, 2, 1, 0);
        let table = event.standings();

        let one = line(&table, 1);
        let two = line(&table, 2);
        assert!(one.place < two.place, "the stronger opponent wins the tie");
        assert_eq!(
            line(&table, 9).place,
            line(&table, 7).place,
            "equal on everything"
        );
    }

    #[test]
    fn the_game_win_percentage_breaks_a_tie_the_opponents_do_not() {
        let mut event = Event::new();
        event.play(1, 3, 2, 0, 0);
        event.play(2, 4, 2, 1, 0);
        let table = event.standings();

        assert_eq!(omw(&table, 1), omw(&table, 2));
        assert!(line(&table, 1).place < line(&table, 2).place);
    }

    #[test]
    fn the_order_compares_exact_fractions() {
        assert_eq!(share(1, 3), share(2, 6));
        assert!(share(33, 100) < share(1, 3));
        assert!(share(2, 3) > share(666_666, 1_000_000));
        assert!((share(2, 3).to_f64() - 0.666_666).abs() < 1e-5);
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
    fn a_dropped_participant_keeps_its_line_and_its_match_points() {
        let mut record = mtr(
            4,
            vec![
                RoundRecord {
                    matches: vec![duel(1, 2, 2, 0, 0), duel(3, 4, 2, 1, 0)],
                    byes: vec![],
                },
                RoundRecord {
                    matches: vec![duel(3, 2, 2, 0, 0)],
                    byes: vec![p(4)],
                },
            ],
        );
        record.entrants[0].pairable = false;
        let table = standings(&record);

        assert_eq!(table.len(), 4);
        let dropped = line(&table, 1);
        assert_eq!((dropped.match_points, dropped.wins), (3, 1));
        assert_eq!(line(&table, 2).losses, 2);
    }

    #[test]
    fn a_late_participant_has_no_losses_for_the_rounds_it_missed() {
        let table = standings(&mtr(
            5,
            vec![
                RoundRecord {
                    matches: vec![duel(1, 2, 2, 0, 0), duel(3, 4, 2, 0, 0)],
                    byes: vec![],
                },
                RoundRecord {
                    matches: vec![duel(5, 1, 2, 1, 0), duel(2, 3, 2, 0, 0)],
                    byes: vec![p(4)],
                },
            ],
        ));

        let late = line(&table, 5);
        assert_eq!(
            (late.match_points, late.wins, late.losses, late.draws),
            (3, 1, 0, 0)
        );
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
