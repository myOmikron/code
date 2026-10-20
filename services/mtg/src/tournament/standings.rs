//! Standings and tiebreakers in basis points (MTR App. C for duels, Multiplayer Addendum for pods)

use std::collections::HashMap;

use uuid::Uuid;

/// Whoever occupies one seat — a participant today, a team later
pub type EntrantId = Uuid;

/// 100 %, in the fixed point everything here is carried in
pub const ONE: i64 = 10_000;

/// MTR App. C: floor of exactly 0.33 (not a third) under averaged duel percentages
const DUEL_FLOOR: i64 = 3_300;

/// Game points for winning a game (fixed by MTR App. C, unlike match points)
const GAME_POINTS_WIN: i32 = 3;

/// Game points for a drawn game
const GAME_POINTS_DRAW: i32 = 1;

/// One tiebreaker, as a thing the client can name in a column heading
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tiebreaker {
    /// Accumulated match points
    MatchPoints,
    /// Share of the match points this player could have taken
    MatchWinPercent,
    /// Mean of the opponents' match-win percentages
    OpponentMatchWinPercent,
    /// Share of the game points this player could have taken
    GameWinPercent,
    /// Mean of the opponents' game-win percentages
    OpponentGameWinPercent,
    /// Mean of the opponents' raw match points
    OpponentsAveragePoints,
}

/// One entrant, as the standings need to see them
#[derive(Debug, Clone)]
pub struct Entrant {
    /// Who this is
    pub id: EntrantId,
    /// The first round they could have played, 1 for everybody who started
    pub entered_round: i16,
    /// The last round they played, `None` while still in; `Some(0)` if they never played
    pub dropped_after_round: Option<i16>,
    /// The roster's own tiebreak seed, which breaks what nothing else does
    pub seed: i32,
}

/// One seat at one table
#[derive(Debug, Clone, Copy)]
pub struct SeatRecord {
    /// Who sat there
    pub id: EntrantId,
    /// Games they won
    pub games_won: i16,
}

/// One settled table
#[derive(Debug, Clone)]
pub struct MatchRecord {
    /// Which scoring round it belonged to
    pub round_number: i16,
    /// Whether it was a bye rather than a table anybody sat at
    pub is_bye: bool,
    /// Whether the table seated fewer than the round's own pod size
    pub short_pod: bool,
    /// Who sat there
    pub seats: Vec<SeatRecord>,
    /// Who won, `None` for a draw
    pub winner: Option<EntrantId>,
    /// Whether it was drawn
    pub draw: bool,
    /// Games inside the match that were themselves drawn
    pub games_drawn: i16,
}

/// Everything one standings computation reads
#[derive(Debug, Clone)]
pub struct StandingsSnapshot {
    /// How many players a full table seats
    pub pod_size: usize,
    /// Best of how many games a duel at this event is
    pub games_per_match: i16,
    /// Match points for a win
    pub points_win: i32,
    /// Match points for a draw
    pub points_draw: i32,
    /// Match points for a loss
    pub points_loss: i32,
    /// Match points for a bye
    pub points_bye: i32,
    /// The field
    pub entrants: Vec<Entrant>,
    /// Every **confirmed** table; nothing else is a result
    pub matches: Vec<MatchRecord>,
}

/// One row of the table
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Standing {
    /// Who this is
    pub id: EntrantId,
    /// The place printed beside them, shared with anybody they tie
    pub place: usize,
    /// Their position in the total order, which is what pairing slices
    pub order: usize,
    /// Accumulated match points
    pub match_points: i32,
    /// Matches won
    pub wins: i32,
    /// Matches lost
    pub losses: i32,
    /// Matches drawn
    pub draws: i32,
    /// Byes received
    pub byes: i32,
    /// Share of the match points they could have taken
    pub match_win: i64,
    /// Mean of their opponents' match-win percentages
    pub opponent_match_win: i64,
    /// Share of the game points they could have taken
    pub game_win: i64,
    /// Mean of their opponents' game-win percentages
    pub opponent_game_win: i64,
    /// Mean of their opponents' raw match points, in the same fixed point
    pub opponents_average_points: i64,
}

/// Tiebreakers applied for a pod size, most significant first
pub fn tiebreakers(pod_size: usize) -> Vec<Tiebreaker> {
    if pod_size <= 2 {
        vec![
            Tiebreaker::MatchPoints,
            Tiebreaker::OpponentMatchWinPercent,
            Tiebreaker::GameWinPercent,
            Tiebreaker::OpponentGameWinPercent,
        ]
    } else {
        vec![
            Tiebreaker::MatchPoints,
            Tiebreaker::MatchWinPercent,
            Tiebreaker::OpponentsAveragePoints,
            Tiebreaker::OpponentMatchWinPercent,
        ]
    }
}

/// Compute the standings, one row per entrant, best first
pub fn standings(snapshot: &StandingsSnapshot) -> Vec<Standing> {
    let mut own: HashMap<EntrantId, Record> = snapshot
        .entrants
        .iter()
        .map(|entrant| (entrant.id, Record::default()))
        .collect();
    let mut public: HashMap<EntrantId, Record> = own.clone();

    // Missed rounds count as losses without opponents, so a late entry moves nobody else's OMW.
    for entrant in &snapshot.entrants {
        let missed = i32::from(entrant.entered_round.max(1) - 1);
        if missed > 0 {
            for record in [own.get_mut(&entrant.id), public.get_mut(&entrant.id)]
                .into_iter()
                .flatten()
            {
                record.match_points += snapshot.points_loss * missed;
                record.matches += missed;
                record.losses += missed;
            }
        }
    }

    for table in &snapshot.matches {
        if table.is_bye {
            let Some(seat) = table.seats.first() else {
                continue;
            };
            // MTR: byes count in the player's own record but not in the one opponents average.
            if let Some(record) = own.get_mut(&seat.id) {
                let (won, played) = bye_games(snapshot.games_per_match);
                record.match_points += snapshot.points_bye;
                record.matches += 1;
                record.byes += 1;
                record.game_points += won * GAME_POINTS_WIN;
                record.games += played;
            }
            continue;
        }

        let played: i32 = table
            .seats
            .iter()
            .map(|seat| i32::from(seat.games_won))
            .sum::<i32>()
            + i32::from(table.games_drawn);

        for seat in &table.seats {
            let points = if table.draw {
                snapshot.points_draw
            } else if table.winner == Some(seat.id) {
                snapshot.points_win
            } else {
                snapshot.points_loss
            };
            let opponents: Vec<EntrantId> = table
                .seats
                .iter()
                .filter(|other| other.id != seat.id)
                .map(|other| other.id)
                .collect();

            for record in [own.get_mut(&seat.id), public.get_mut(&seat.id)]
                .into_iter()
                .flatten()
            {
                record.match_points += points;
                record.matches += 1;
                if table.draw {
                    record.draws += 1;
                } else if table.winner == Some(seat.id) {
                    record.wins += 1;
                } else {
                    record.losses += 1;
                }
                record.game_points += i32::from(seat.games_won) * GAME_POINTS_WIN
                    + i32::from(table.games_drawn) * GAME_POINTS_DRAW;
                record.games += played;
                record.opponents.extend(opponents.iter().copied());
                if table.short_pod {
                    record.short_pods += 1;
                }
            }
        }
    }

    let floor = floor_for(snapshot);
    let opponent_match_win: HashMap<EntrantId, i64> = public
        .iter()
        .map(|(id, record)| (*id, record.match_win(snapshot.points_win).max(floor)))
        .collect();
    let opponent_game_win: HashMap<EntrantId, i64> = public
        .iter()
        .map(|(id, record)| (*id, record.game_win().max(floor)))
        .collect();
    let opponent_points: HashMap<EntrantId, i32> = public
        .iter()
        .map(|(id, record)| (*id, record.match_points))
        .collect();

    let mut rows: Vec<Standing> = snapshot
        .entrants
        .iter()
        .map(|entrant| {
            let record = &own[&entrant.id];
            // Short pods add a phantom opponent at the floor, else a three outscores a four.
            let phantoms = record.short_pods as usize;
            Standing {
                id: entrant.id,
                place: 0,
                order: 0,
                match_points: record.match_points,
                wins: record.wins,
                losses: record.losses,
                draws: record.draws,
                byes: record.byes,
                match_win: record.match_win(snapshot.points_win),
                opponent_match_win: mean(&record.opponents, &opponent_match_win, phantoms, floor),
                game_win: record.game_win(),
                opponent_game_win: mean(&record.opponents, &opponent_game_win, phantoms, floor),
                opponents_average_points: mean_points(&record.opponents, &opponent_points),
            }
        })
        .collect();

    let order = tiebreakers(snapshot.pod_size);
    let seeds: HashMap<EntrantId, i32> = snapshot
        .entrants
        .iter()
        .map(|entrant| (entrant.id, entrant.seed))
        .collect();
    rows.sort_by(|left, right| {
        compare(left, right, &order).then_with(|| seeds[&left.id].cmp(&seeds[&right.id]))
    });

    // Standard competition ranking; the seed breaks the total order but never the printed place.
    let mut place = 1;
    for index in 0..rows.len() {
        if index > 0 && compare(&rows[index - 1], &rows[index], &order) != std::cmp::Ordering::Equal
        {
            place = index + 1;
        }
        rows[index].place = place;
        rows[index].order = index + 1;
    }
    rows
}

/// Compare two rows on the applied tiebreakers alone
fn compare(left: &Standing, right: &Standing, order: &[Tiebreaker]) -> std::cmp::Ordering {
    for tiebreaker in order {
        let ordering = match tiebreaker {
            Tiebreaker::MatchPoints => right.match_points.cmp(&left.match_points),
            Tiebreaker::MatchWinPercent => right.match_win.cmp(&left.match_win),
            Tiebreaker::OpponentMatchWinPercent => {
                right.opponent_match_win.cmp(&left.opponent_match_win)
            }
            Tiebreaker::GameWinPercent => right.game_win.cmp(&left.game_win),
            Tiebreaker::OpponentGameWinPercent => {
                right.opponent_game_win.cmp(&left.opponent_game_win)
            }
            Tiebreaker::OpponentsAveragePoints => right
                .opponents_average_points
                .cmp(&left.opponents_average_points),
        };
        if ordering != std::cmp::Ordering::Equal {
            return ordering;
        }
    }
    std::cmp::Ordering::Equal
}

/// The floor under averaged percentages (pods: one match point out of a win, per the addendum)
fn floor_for(snapshot: &StandingsSnapshot) -> i64 {
    if snapshot.pod_size <= 2 {
        DUEL_FLOOR
    } else {
        ONE / i64::from(snapshot.points_win.max(1))
    }
}

/// A bye's games won and played: a clean win at this event's match length
fn bye_games(games_per_match: i16) -> (i32, i32) {
    let wins = (i32::from(games_per_match.max(1)) / 2) + 1;
    (wins, wins)
}

/// The mean of a lookup over a list of opponents, with phantoms at the floor
fn mean(
    opponents: &[EntrantId],
    lookup: &HashMap<EntrantId, i64>,
    phantoms: usize,
    floor: i64,
) -> i64 {
    let count = opponents.len() + phantoms;
    if count == 0 {
        return floor;
    }
    let total: i64 = opponents
        .iter()
        .map(|id| lookup.get(id).copied().unwrap_or(floor))
        .sum::<i64>()
        + floor * phantoms as i64;
    total / count as i64
}

/// The mean of the opponents' raw match points
fn mean_points(opponents: &[EntrantId], lookup: &HashMap<EntrantId, i32>) -> i64 {
    if opponents.is_empty() {
        return 0;
    }
    let total: i64 = opponents
        .iter()
        .map(|id| i64::from(lookup.get(id).copied().unwrap_or(0)))
        .sum();
    total * ONE / opponents.len() as i64
}

/// One entrant's accumulated record
#[derive(Debug, Clone, Default)]
struct Record {
    /// Accumulated match points
    match_points: i32,
    /// Rounds counted in the match-win denominator
    matches: i32,
    /// Accumulated game points
    game_points: i32,
    /// Games counted in the game-win denominator
    games: i32,
    /// Matches won
    wins: i32,
    /// Matches lost
    losses: i32,
    /// Matches drawn
    draws: i32,
    /// Byes received
    byes: i32,
    /// Who they played, with multiplicity
    opponents: Vec<EntrantId>,
    /// How many short pods they sat in
    short_pods: i32,
}

impl Record {
    /// Share of the match points they could have taken
    fn match_win(&self, points_win: i32) -> i64 {
        let possible = i64::from(self.matches) * i64::from(points_win.max(1));
        if possible <= 0 {
            return 0;
        }
        i64::from(self.match_points) * ONE / possible
    }

    /// Share of the game points they could have taken
    fn game_win(&self) -> i64 {
        let possible = i64::from(self.games) * i64::from(GAME_POINTS_WIN);
        if possible <= 0 {
            return 0;
        }
        i64::from(self.game_points) * ONE / possible
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One of the players
    fn p(n: u128) -> EntrantId {
        Uuid::from_u128(n)
    }

    /// An entrant present from round one, seeded `n`
    fn entrant(n: u128) -> Entrant {
        Entrant {
            id: p(n),
            entered_round: 1,
            dropped_after_round: None,
            seed: n as i32,
        }
    }

    /// A decided duel
    fn duel(
        round: i16,
        winner: u128,
        loser: u128,
        winner_games: i16,
        loser_games: i16,
    ) -> MatchRecord {
        MatchRecord {
            round_number: round,
            is_bye: false,
            short_pod: false,
            seats: vec![
                SeatRecord {
                    id: p(winner),
                    games_won: winner_games,
                },
                SeatRecord {
                    id: p(loser),
                    games_won: loser_games,
                },
            ],
            winner: Some(p(winner)),
            draw: false,
            games_drawn: 0,
        }
    }

    /// A bye
    fn bye(round: i16, who: u128) -> MatchRecord {
        MatchRecord {
            round_number: round,
            is_bye: true,
            short_pod: false,
            seats: vec![SeatRecord {
                id: p(who),
                games_won: 0,
            }],
            winner: Some(p(who)),
            draw: false,
            games_drawn: 0,
        }
    }

    /// A decided pod
    fn pod(round: i16, winner: u128, rest: &[u128], short: bool) -> MatchRecord {
        let mut seats = vec![SeatRecord {
            id: p(winner),
            games_won: 1,
        }];
        seats.extend(rest.iter().map(|id| SeatRecord {
            id: p(*id),
            games_won: 0,
        }));
        MatchRecord {
            round_number: round,
            is_bye: false,
            short_pod: short,
            seats,
            winner: Some(p(winner)),
            draw: false,
            games_drawn: 0,
        }
    }

    /// A duel event's snapshot
    fn duels(entrants: u128, matches: Vec<MatchRecord>) -> StandingsSnapshot {
        StandingsSnapshot {
            pod_size: 2,
            games_per_match: 3,
            points_win: 3,
            points_draw: 1,
            points_loss: 0,
            points_bye: 3,
            entrants: (1..=entrants).map(entrant).collect(),
            matches,
        }
    }

    /// The row for one player
    fn row(rows: &[Standing], who: u128) -> &Standing {
        rows.iter().find(|row| row.id == p(who)).expect("a row")
    }

    #[test]
    fn fixture_four_duels_over_two_rounds_to_the_basis_point() {
        // R1: 1 beats 2 (2-0), 3 beats 4 (2-1); R2: 1 beats 3 (2-1), 2 beats 4 (2-0).
        let rows = standings(&duels(
            4,
            vec![
                duel(1, 1, 2, 2, 0),
                duel(1, 3, 4, 2, 1),
                duel(2, 1, 3, 2, 1),
                duel(2, 2, 4, 2, 0),
            ],
        ));

        let one = row(&rows, 1);
        assert_eq!(one.match_points, 6);
        assert_eq!(one.match_win, 10_000, "two wins from two");
        assert_eq!(one.game_win, 8_000, "twelve game points from fifteen");
        assert_eq!(one.opponent_match_win, 5_000, "both opponents on 3 of 6");
        assert_eq!(one.opponent_game_win, 5_000);

        let four = row(&rows, 4);
        assert_eq!(four.match_points, 0);
        assert_eq!(four.match_win, 0);
        assert_eq!(four.game_win, 2_000, "three game points from fifteen");

        let two = row(&rows, 2);
        let three = row(&rows, 3);
        assert_eq!(two.opponent_match_win, 6_650, "(10000 + floored 3300) / 2");
        assert_eq!(two.opponent_game_win, 5_650, "(8000 + floored 3300) / 2");
        assert_eq!(three.opponent_match_win, 6_650);
        assert_eq!(three.opponent_game_win, 5_650);

        assert_eq!(
            (one.place, two.place, three.place, four.place),
            (1, 2, 2, 4)
        );
        assert_eq!(
            (one.order, two.order, three.order, four.order),
            (1, 2, 3, 4),
            "the seed breaks the order it does not break the place"
        );
    }

    #[test]
    fn fixture_seven_in_pods_with_a_short_table_to_the_basis_point() {
        let snapshot = StandingsSnapshot {
            pod_size: 4,
            games_per_match: 1,
            points_win: 7,
            points_draw: 1,
            points_loss: 0,
            points_bye: 7,
            entrants: (1..=7).map(entrant).collect(),
            matches: vec![pod(1, 1, &[2, 3, 4], false), pod(1, 5, &[6, 7], true)],
        };
        let rows = standings(&snapshot);
        let floor = ONE / 7;
        assert_eq!(floor, 1_428);

        let one = row(&rows, 1);
        let five = row(&rows, 5);
        assert_eq!(one.match_points, 7);
        assert_eq!(one.match_win, 10_000);
        assert_eq!(one.opponent_match_win, floor, "three opponents on nothing");
        assert_eq!(
            five.opponent_match_win, floor,
            "two opponents and a phantom, all at the floor"
        );
        assert_eq!(one.opponents_average_points, 0);
        assert_eq!(five.opponents_average_points, 0);
        assert_eq!((one.place, five.place), (1, 1), "nothing separates them");

        let two = row(&rows, 2);
        let six = row(&rows, 6);
        assert_eq!(two.opponents_average_points, 23_333, "(7 + 0 + 0) / 3");
        assert_eq!(six.opponents_average_points, 35_000, "(7 + 0) / 2");
        assert_eq!(two.opponent_match_win, 4_285, "(10000 + 1428 + 1428) / 3");
        assert_eq!(
            six.opponent_match_win, 4_285,
            "(10000 + 1428 + phantom 1428) / 3"
        );
        assert_eq!(
            (six.place, two.place),
            (3, 5),
            "a stronger field ranks first"
        );
    }

    #[test]
    fn a_bye_counts_in_your_own_record_and_not_in_the_one_others_average() {
        // R1: one sits out, two beats three. R2: three sits out, two beats one.
        let rows = standings(&duels(
            3,
            vec![
                bye(1, 1),
                duel(1, 2, 3, 2, 0),
                bye(2, 3),
                duel(2, 2, 1, 2, 0),
            ],
        ));

        let one = row(&rows, 1);
        assert_eq!(one.byes, 1);
        assert_eq!(one.match_points, 3, "the bye is worth a win");
        assert_eq!(one.match_win, 5_000, "and counts as a round they played");

        let two = row(&rows, 2);
        assert_eq!(
            two.opponent_match_win, DUEL_FLOOR,
            "both opponents' byes are out of the record two averages, so both floor"
        );
    }

    #[test]
    fn a_late_entry_takes_the_rounds_it_missed_as_losses() {
        let mut snapshot = duels(4, vec![duel(2, 1, 3, 2, 0), duel(2, 2, 4, 2, 0)]);
        snapshot.entrants[2].entered_round = 2;
        snapshot.entrants[3].entered_round = 2;
        let rows = standings(&snapshot);

        let three = row(&rows, 3);
        assert_eq!(
            three.losses, 2,
            "the round they missed and the one they lost"
        );
        assert_eq!(three.match_points, 0);
        assert_eq!(three.match_win, 0, "nothing from two rounds");
    }

    #[test]
    fn a_late_entrys_missed_rounds_move_nobodys_opponent_percentage() {
        let played = vec![duel(1, 1, 2, 2, 0), duel(2, 1, 3, 2, 0)];
        let early = standings(&duels(3, played.clone()));

        let mut late = duels(3, played);
        late.entrants[2].entered_round = 2;
        let late = standings(&late);

        assert_eq!(
            row(&early, 1).opponent_match_win,
            row(&late, 1).opponent_match_win,
            "arriving late is the late player's problem and nobody else's"
        );
    }

    #[test]
    fn a_player_who_dropped_still_counts_for_the_people_who_played_them() {
        let mut snapshot = duels(3, vec![duel(1, 1, 2, 2, 0), duel(2, 3, 2, 2, 0)]);
        snapshot.entrants[1].dropped_after_round = Some(2);
        let rows = standings(&snapshot);

        assert_eq!(rows.len(), 3, "a drop stays in the table");
        assert_eq!(
            row(&rows, 1).opponent_match_win,
            DUEL_FLOOR,
            "their final record is what one's opponent percentage is built from"
        );
    }

    #[test]
    fn nobody_has_played_so_everybody_shares_first() {
        let rows = standings(&duels(4, Vec::new()));
        assert!(rows.iter().all(|row| row.place == 1));
        assert_eq!(
            rows.iter().map(|row| row.order).collect::<Vec<_>>(),
            vec![1, 2, 3, 4],
            "the seed still gives pairing a total order to slice"
        );
    }

    #[test]
    fn a_draw_is_worth_a_point_to_both_seats() {
        let mut drawn = duel(1, 1, 2, 1, 1);
        drawn.winner = None;
        drawn.draw = true;
        drawn.games_drawn = 1;
        let rows = standings(&duels(2, vec![drawn]));

        assert_eq!(row(&rows, 1).match_points, 1);
        assert_eq!(row(&rows, 2).match_points, 1);
        assert_eq!(row(&rows, 1).draws, 1);
        assert_eq!(
            row(&rows, 1).game_win,
            4_444,
            "one game won and one drawn is four game points from nine"
        );
    }

    #[test]
    fn duels_and_pods_are_scored_on_different_tiebreakers() {
        assert_eq!(tiebreakers(2)[1], Tiebreaker::OpponentMatchWinPercent);
        assert_eq!(tiebreakers(4)[1], Tiebreaker::MatchWinPercent);
    }

    #[test]
    fn reads_the_same_field_the_same_way_twice() {
        let snapshot = duels(4, vec![duel(1, 1, 2, 2, 0), duel(1, 3, 4, 2, 1)]);
        assert_eq!(standings(&snapshot), standings(&snapshot));
    }
}
