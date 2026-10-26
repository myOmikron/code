//! Pairing a multiplayer Swiss Round: Match sizes, Byes, who plays whom, Seats
//!
//! One procedure for every multiplayer Ruleset (research note, "Pairing",
//! "Multiplayer"); a Ruleset only brings its [`LayoutRule`]:
//!
//! 1. order the pairable Participants by standings, ties at random;
//! 2. hand out the Byes the layout asks for, lowest-ranked without one first;
//! 3. fill the Matches top table to bottom, full Matches first;
//! 4. swap Participants between Matches while the [`Cost`] drops;
//! 5. seat every Match by [`seat_order`]: whoever started least often starts.

use std::collections::HashMap;
use std::collections::HashSet;

use crate::tournament::pairing::PairedMatch;
use crate::tournament::pairing::Pairing;
use crate::tournament::pairing::PairingError;
use crate::tournament::pairing::pair_key;
use crate::tournament::record::EntrantId;
use crate::tournament::record::TournamentRecord;
use crate::tournament::rng::SplitMix64;
use crate::tournament::ruleset::TableSize;
use crate::tournament::standings::standings;

/// How many times the swap search starts over from another random fill
///
/// The first start is the plain fill by standings; the others shuffle within
/// point groups, so a local optimum of one start is escaped by another.
const STARTS: usize = 8;

/// How a Round's field splits into Matches and Byes
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Layout {
    /// The size of every Match, top table first: full Matches before smaller ones
    pub sizes: Vec<usize>,
    /// How many Participants get a Bye
    pub byes: usize,
}

/// A Ruleset's rule for splitting `players` at `table_size`
pub type LayoutRule = fn(players: usize, table_size: TableSize) -> Layout;

/// TopDeck: full Matches, then at most one Match a Seat short, otherwise Byes
///
/// With r Participants over the full Matches: none left is all full, T - 1
/// left play one smaller Match, any other remainder gets r Byes (MTRA
/// "Pairing Guidelines", written for four and taken to three and five). A
/// field smaller than one table plays one Match, a single Participant a Bye.
pub fn topdeck_layout(players: usize, table_size: TableSize) -> Layout {
    let seats = usize::from(table_size.get().unsigned_abs());
    if players < seats {
        return if players >= 2 {
            Layout {
                sizes: vec![players],
                byes: 0,
            }
        } else {
            Layout {
                sizes: Vec::new(),
                byes: players,
            }
        };
    }
    let mut sizes = vec![seats; players / seats];
    let left = players % seats;
    let mut byes = 0;
    if left == seats - 1 {
        sizes.push(left);
    } else {
        byes = left;
    }
    Layout { sizes, byes }
}

/// Multiplayer Addendum: the fewest Matches, the field split as evenly as possible
///
/// ceil(n / T) Matches whose sizes differ by at most one, larger ones on the
/// top tables, never a Bye (Addendum x.1B, 10.4A; research note, "Match
/// sizes"). Exception after canivete and Addendum App. E: T + 1 Participants
/// play one Match of T + 1 while that is at most five Seats.
pub fn addendum_layout(players: usize, table_size: TableSize) -> Layout {
    let seats = usize::from(table_size.get().unsigned_abs());
    let largest = usize::from(TableSize::RANGE.end().unsigned_abs());
    if players == seats + 1 && players <= largest {
        return Layout {
            sizes: vec![players],
            byes: 0,
        };
    }
    let matches = players.div_ceil(seats);
    let sizes = (0..matches)
        .map(|table| players / matches + usize::from(table < players % matches))
        .collect();
    Layout { sizes, byes: 0 }
}

/// Pair the next multiplayer Swiss Round of `record` under `layout`, rolling every chance from `seed`
pub fn pair_multiplayer(
    record: &TournamentRecord,
    seed: u64,
    layout: LayoutRule,
) -> Result<Pairing, PairingError> {
    let pairable: HashSet<EntrantId> = record
        .entrants
        .iter()
        .filter(|entrant| entrant.pairable)
        .map(|entrant| entrant.id)
        .collect();
    let mut ranked: Vec<Ranked> = standings(record)
        .into_iter()
        .filter(|line| pairable.contains(&line.entrant))
        .map(|line| Ranked {
            entrant: line.entrant,
            place: line.place,
            match_points: line.match_points,
        })
        .collect();
    if ranked.len() < 2 {
        return Err(PairingError::TooFewEntrants);
    }
    let history = History::of(record);
    let layout = layout(ranked.len(), record.table_size);

    let mut byes = Vec::with_capacity(layout.byes);
    for _ in 0..layout.byes {
        let index = ranked
            .iter()
            .rposition(|line| !history.had_bye.contains(&line.entrant))
            .unwrap_or(ranked.len() - 1);
        byes.push(ranked.remove(index).entrant);
    }

    let mut rng = SplitMix64::seeded(seed);
    let rank: HashMap<EntrantId, usize> = ranked
        .iter()
        .enumerate()
        .map(|(rank, line)| (line.entrant, rank))
        .collect();
    rng.shuffle(&mut ranked);
    ranked.sort_by_key(|line| line.place);

    let mut groups: Vec<u32> = ranked.iter().map(|line| line.match_points).collect();
    groups.dedup();
    let search = Search {
        history: &history,
        table_size: usize::from(record.table_size.get().unsigned_abs()),
        group: ranked
            .iter()
            .map(|line| {
                let group = groups
                    .iter()
                    .position(|points| *points == line.match_points)
                    .unwrap_or(0);
                (line.entrant, u64::try_from(group).unwrap_or(u64::MAX))
            })
            .collect(),
    };

    let mut best: Option<(Cost, Vec<Vec<EntrantId>>)> = None;
    for start in 0..STARTS {
        let mut order: Vec<EntrantId> = ranked.iter().map(|line| line.entrant).collect();
        if start > 0 {
            for group in order.chunk_by_mut(|one, other| search.group[one] == search.group[other]) {
                rng.shuffle(group);
            }
        }
        let mut tables = Vec::with_capacity(layout.sizes.len());
        let mut rest = order.as_slice();
        for size in &layout.sizes {
            let (table, after) = rest.split_at(*size);
            tables.push(table.to_vec());
            rest = after;
        }
        let cost = search.improve(&mut tables);
        if best.as_ref().is_none_or(|(least, _)| cost < *least) {
            best = Some((cost, tables));
        }
    }
    let mut tables = best.map(|(_, tables)| tables).unwrap_or_default();

    let full = search.table_size;
    tables.sort_by_key(|table| {
        (
            table.len() < full,
            table.iter().map(|entrant| rank[entrant]).min(),
        )
    });
    let matches = tables
        .into_iter()
        .map(|table| {
            let rematch = table.iter().enumerate().any(|(index, one)| {
                table[index + 1..]
                    .iter()
                    .any(|other| history.met.contains_key(&pair_key(*one, *other)))
            });
            PairedMatch {
                seats: seat_order(table, &history, &rank, full, &mut rng),
                rematch,
            }
        })
        .collect();
    Ok(Pairing { matches, byes })
}

/// A pairable Participant as the pairing ranks it
#[derive(Debug, Clone, Copy)]
struct Ranked {
    /// Who
    entrant: EntrantId,
    /// Its place in the standings, shared with those equal on everything
    place: u32,
    /// Its Match points
    match_points: u32,
}

/// What the earlier Rounds say about the Participants
#[derive(Debug, Default)]
struct History {
    /// How often two Participants shared a Match
    met: HashMap<(EntrantId, EntrantId), u64>,
    /// Who had a Bye
    had_bye: HashSet<EntrantId>,
    /// Who played a smaller Match, and how often
    smaller: HashMap<EntrantId, u64>,
    /// How often each Participant sat in each Seat, Seat 1 first
    seats: HashMap<EntrantId, Vec<u64>>,
}

impl History {
    /// Everything `record`'s Rounds tell, over every Match whether it has a Result or not
    fn of(record: &TournamentRecord) -> Self {
        let full = usize::from(record.table_size.get().unsigned_abs());
        let mut history = Self::default();
        for round in &record.rounds {
            history.had_bye.extend(round.byes.iter().copied());
            for played in &round.matches {
                for (seat, one) in played.seats.iter().enumerate() {
                    for other in &played.seats[seat + 1..] {
                        *history.met.entry(pair_key(*one, *other)).or_default() += 1;
                    }
                    let seats = history.seats.entry(*one).or_insert_with(|| vec![0; full]);
                    if let Some(count) = seats.get_mut(seat) {
                        *count += 1;
                    }
                    if played.seats.len() < full {
                        *history.smaller.entry(*one).or_default() += 1;
                    }
                }
            }
        }
        history
    }
}

/// What a pairing is judged by, the most important first
///
/// Compared lexicographically, so no amount of a later part outweighs one of
/// an earlier part, whatever a win is worth in Match points.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord)]
struct Cost {
    /// Pairs of Participants in a Match who met before, once per earlier meeting
    repeats: u64,
    /// Participants in a smaller Match who already played one
    smaller_again: u64,
    /// Per Match the squared distance between its highest and lowest point
    /// group, summed: pair-ups and pair-downs, counted in point groups
    spread: u64,
}

impl Cost {
    /// Both costs together
    fn add(self, other: Self) -> Self {
        Self {
            repeats: self.repeats + other.repeats,
            smaller_again: self.smaller_again + other.smaller_again,
            spread: self.spread + other.spread,
        }
    }
}

/// The swap search over one Round's Matches
struct Search<'a> {
    /// The earlier Rounds
    history: &'a History,
    /// The size of a full Match
    table_size: usize,
    /// Every pairable Participant's point group, 0 for the most Match points
    group: HashMap<EntrantId, u64>,
}

impl Search<'_> {
    /// The cost of one Match
    fn cost(&self, table: &[EntrantId]) -> Cost {
        let mut cost = Cost::default();
        for (index, one) in table.iter().enumerate() {
            for other in &table[index + 1..] {
                cost.repeats += self
                    .history
                    .met
                    .get(&pair_key(*one, *other))
                    .copied()
                    .unwrap_or(0);
            }
        }
        if table.len() < self.table_size {
            cost.smaller_again = table
                .iter()
                .filter(|entrant| self.history.smaller.contains_key(entrant))
                .count() as u64;
        }
        let groups = table.iter().map(|entrant| self.group[entrant]);
        let spread = groups.clone().max().unwrap_or(0) - groups.min().unwrap_or(0);
        cost.spread = spread * spread;
        cost
    }

    /// Swap Participants between Matches while that lowers the cost; answers the cost reached
    ///
    /// Takes every swap that helps, in table and Seat order, so the same start
    /// always ends the same way. When no swap of one for one helps any more,
    /// tries two for two between the same two Matches: who plays a smaller
    /// Match is often only settled that way without a repeat opponent, since
    /// each half of the exchange alone adds one.
    fn improve(&self, tables: &mut [Vec<EntrantId>]) -> Cost {
        let mut costs: Vec<Cost> = tables.iter().map(|table| self.cost(table)).collect();
        loop {
            self.swap_pairs(tables, &mut costs);
            if !self.swap_twos(tables, &mut costs) {
                break;
            }
        }
        costs.into_iter().fold(Cost::default(), Cost::add)
    }

    /// Exchange two Participants of one Match for two of another; answers whether that helped
    ///
    /// Only the first exchange that lowers the cost is taken; the swaps of one
    /// for one go on from there.
    fn swap_twos(&self, tables: &mut [Vec<EntrantId>], costs: &mut [Cost]) -> bool {
        for a in 0..tables.len() {
            for b in a + 1..tables.len() {
                for i in 0..tables[a].len() {
                    for k in i + 1..tables[a].len() {
                        for j in 0..tables[b].len() {
                            for l in j + 1..tables[b].len() {
                                let (one, two) = (tables[a][i], tables[a][k]);
                                let (three, four) = (tables[b][j], tables[b][l]);
                                tables[a][i] = three;
                                tables[a][k] = four;
                                tables[b][j] = one;
                                tables[b][l] = two;
                                let (cost_a, cost_b) =
                                    (self.cost(&tables[a]), self.cost(&tables[b]));
                                if cost_a.add(cost_b) < costs[a].add(costs[b]) {
                                    costs[a] = cost_a;
                                    costs[b] = cost_b;
                                    return true;
                                }
                                tables[a][i] = one;
                                tables[a][k] = two;
                                tables[b][j] = three;
                                tables[b][l] = four;
                            }
                        }
                    }
                }
            }
        }
        false
    }

    /// Swap two Participants of different Matches while that lowers the cost
    fn swap_pairs(&self, tables: &mut [Vec<EntrantId>], costs: &mut [Cost]) {
        let mut improved = true;
        while improved {
            improved = false;
            for a in 0..tables.len() {
                for b in a + 1..tables.len() {
                    for i in 0..tables[a].len() {
                        for j in 0..tables[b].len() {
                            let (one, other) = (tables[a][i], tables[b][j]);
                            tables[a][i] = other;
                            tables[b][j] = one;
                            let (cost_a, cost_b) = (self.cost(&tables[a]), self.cost(&tables[b]));
                            if cost_a.add(cost_b) < costs[a].add(costs[b]) {
                                costs[a] = cost_a;
                                costs[b] = cost_b;
                                improved = true;
                            } else {
                                tables[a][i] = one;
                                tables[b][j] = other;
                            }
                        }
                    }
                }
            }
        }
    }
}

/// The Participants of one Match in Seat order: Seat 1 first
///
/// Ordered by how often each sat in Seat 1, then Seat 2, and so on to Seat
/// `table_size` (a smaller Match counts all of them too), then by rank, the
/// higher-ranked first, then by chance (research note, "Seats", after
/// canivete's weighted seating). So whoever started least often starts.
fn seat_order(
    mut table: Vec<EntrantId>,
    history: &History,
    rank: &HashMap<EntrantId, usize>,
    table_size: usize,
    rng: &mut SplitMix64,
) -> Vec<EntrantId> {
    let never = vec![0; table_size];
    let mut keys: HashMap<EntrantId, (Vec<u64>, usize, u64)> = HashMap::new();
    for entrant in &table {
        let seats = history.seats.get(entrant).unwrap_or(&never).clone();
        keys.insert(*entrant, (seats, rank[entrant], rng.next_u64()));
    }
    table.sort_by(|one, other| keys[one].cmp(&keys[other]));
    table
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::collections::HashSet;

    use uuid::Uuid;

    use super::Layout;
    use super::addendum_layout;
    use super::topdeck_layout;
    use crate::tournament::pairing::Pairing;
    use crate::tournament::pairing::pair_next_round;
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

    /// A TopDeck Tournament at Table size 4 of Participants 1 to `entrants`, all pairable
    fn topdeck(entrants: u128) -> TournamentRecord {
        TournamentRecord {
            ruleset: Ruleset::TopDeck,
            table_size: size(4),
            entrants: (1..=entrants)
                .map(|n| Entrant {
                    id: p(n),
                    pairable: true,
                })
                .collect(),
            rounds: Vec::new(),
            seed: 13,
        }
    }

    /// A Match `seats` played, won by the Seat `winner` or drawn
    fn played(seats: &[EntrantId], winner: Option<usize>) -> MatchRecord {
        let mut games_won = vec![0; seats.len()];
        if let Some(winner) = winner {
            games_won[winner] = 1;
        }
        MatchRecord {
            seats: seats.to_vec(),
            result: Some(MatchResult {
                games_won,
                games_drawn: u8::from(winner.is_none()),
            }),
        }
    }

    /// Play `pairing` out: Seat `winner(table)` wins at every table, `None` draws
    fn play(
        record: &mut TournamentRecord,
        pairing: &Pairing,
        winner: impl Fn(usize) -> Option<usize>,
    ) {
        record.rounds.push(RoundRecord {
            matches: pairing
                .matches
                .iter()
                .enumerate()
                .map(|(table, paired)| played(&paired.seats, winner(table)))
                .collect(),
            byes: pairing.byes.clone(),
        });
    }

    /// A Multiplayer Addendum Tournament at Table size 4 of Participants 1 to `entrants`, all pairable
    fn addendum(entrants: u128) -> TournamentRecord {
        TournamentRecord {
            ruleset: Ruleset::MultiplayerAddendum,
            ..topdeck(entrants)
        }
    }

    fn sizes(pairing: &Pairing) -> Vec<usize> {
        pairing
            .matches
            .iter()
            .map(|paired| paired.seats.len())
            .collect()
    }

    /// Everybody the pairing seats, in Matches and Byes, sorted
    fn seated(pairing: &Pairing) -> Vec<EntrantId> {
        let mut seated: Vec<EntrantId> = pairing
            .matches
            .iter()
            .flat_map(|paired| paired.seats.iter().copied())
            .chain(pairing.byes.iter().copied())
            .collect();
        seated.sort();
        seated
    }

    fn size(players: i16) -> TableSize {
        TableSize::new(players).expect("a Table size")
    }

    fn layout(sizes: &[usize], byes: usize) -> Layout {
        Layout {
            sizes: sizes.to_vec(),
            byes,
        }
    }

    #[test]
    fn topdeck_seats_nine_ten_and_eleven_at_four_as_its_pairing_guidelines_say() {
        assert_eq!(topdeck_layout(9, size(4)), layout(&[4, 4], 1));
        assert_eq!(topdeck_layout(10, size(4)), layout(&[4, 4], 2));
        assert_eq!(topdeck_layout(11, size(4)), layout(&[4, 4, 3], 0));
        assert_eq!(topdeck_layout(12, size(4)), layout(&[4, 4, 4], 0));
    }

    #[test]
    fn topdeck_takes_the_same_rule_to_three_and_five() {
        assert_eq!(topdeck_layout(7, size(3)), layout(&[3, 3], 1));
        assert_eq!(topdeck_layout(8, size(3)), layout(&[3, 3, 2], 0));
        assert_eq!(topdeck_layout(11, size(5)), layout(&[5, 5], 1));
        assert_eq!(topdeck_layout(13, size(5)), layout(&[5, 5], 3));
        assert_eq!(topdeck_layout(14, size(5)), layout(&[5, 5, 4], 0));
    }

    #[test]
    fn a_field_smaller_than_a_table_plays_one_match() {
        assert_eq!(topdeck_layout(3, size(4)), layout(&[3], 0));
        assert_eq!(topdeck_layout(2, size(5)), layout(&[2], 0));
        assert_eq!(topdeck_layout(1, size(4)), layout(&[], 1));
    }

    #[test]
    fn the_addendum_splits_the_field_evenly_over_the_fewest_matches() {
        for (players, sizes) in [
            (6, vec![3, 3]),
            (7, vec![4, 3]),
            (8, vec![4, 4]),
            (9, vec![3, 3, 3]),
            (10, vec![4, 3, 3]),
            (11, vec![4, 4, 3]),
            (12, vec![4, 4, 4]),
            (21, vec![4, 4, 4, 3, 3, 3]),
            (22, vec![4, 4, 4, 4, 3, 3]),
            (23, vec![4, 4, 4, 4, 4, 3]),
        ] {
            assert_eq!(
                addendum_layout(players, size(4)),
                layout(&sizes, 0),
                "{players}"
            );
        }
    }

    #[test]
    fn the_addendum_seats_one_more_than_a_table_at_one_match_up_to_five() {
        assert_eq!(addendum_layout(5, size(4)), layout(&[5], 0));
        assert_eq!(addendum_layout(4, size(3)), layout(&[4], 0));
        assert_eq!(addendum_layout(6, size(5)), layout(&[3, 3], 0));
    }

    #[test]
    fn the_addendum_takes_the_even_split_to_three_and_five() {
        assert_eq!(addendum_layout(7, size(3)), layout(&[3, 2, 2], 0));
        assert_eq!(addendum_layout(8, size(3)), layout(&[3, 3, 2], 0));
        assert_eq!(addendum_layout(7, size(5)), layout(&[4, 3], 0));
        assert_eq!(addendum_layout(11, size(5)), layout(&[4, 4, 3], 0));
        assert_eq!(addendum_layout(14, size(5)), layout(&[5, 5, 4], 0));
    }

    #[test]
    fn the_addendum_never_gives_a_bye() {
        assert_eq!(addendum_layout(3, size(4)), layout(&[3], 0));
        assert_eq!(addendum_layout(2, size(5)), layout(&[2], 0));
        for players in 2..=40 {
            for table in 3..=5 {
                let split = addendum_layout(players, size(table));
                assert_eq!(split.byes, 0, "{players} at {table}");
                assert_eq!(split.sizes.iter().sum::<usize>(), players);
            }
        }
    }

    #[test]
    fn under_the_addendum_nine_ten_and_eleven_participants_play_smaller_matches_and_no_bye() {
        for (entrants, expected) in [(9, vec![3, 3, 3]), (10, vec![4, 3, 3]), (11, vec![4, 4, 3])] {
            for seed in 0..5 {
                let mut record = addendum(entrants);
                for number in 0..3 {
                    let pairing = pair_next_round(&record, seed * 10 + number).expect("pairs");
                    assert_eq!(sizes(&pairing), expected, "{entrants}, seed {seed}");
                    assert!(pairing.byes.is_empty(), "{entrants}, seed {seed}");
                    let everybody: Vec<EntrantId> = (1..=entrants).map(p).collect();
                    assert_eq!(seated(&pairing), everybody, "{entrants}, seed {seed}");
                    play(&mut record, &pairing, |table| Some(table % 3));
                }
            }
        }
    }

    #[test]
    fn under_the_addendum_five_at_four_play_one_match_of_five() {
        let mut record = addendum(5);
        for number in 0..2 {
            let pairing = pair_next_round(&record, number).expect("pairs");
            assert_eq!(sizes(&pairing), vec![5]);
            assert!(pairing.byes.is_empty());
            play(&mut record, &pairing, |_| Some(4));
        }
    }

    /// Who played a smaller Match in `record`, and how often
    fn smaller_matches(record: &TournamentRecord) -> HashMap<EntrantId, u32> {
        let mut smaller = HashMap::new();
        for played in record.rounds.iter().flat_map(|round| &round.matches) {
            if played.seats.len() < 4 {
                for entrant in &played.seats {
                    *smaller.entry(*entrant).or_default() += 1;
                }
            }
        }
        smaller
    }

    /// Participants in a smaller Match of `tables` who already played one
    fn smaller_again(tables: &[Vec<EntrantId>], before: &HashMap<EntrantId, u32>) -> usize {
        tables
            .iter()
            .filter(|table| table.len() < 4)
            .flatten()
            .filter(|entrant| before.contains_key(entrant))
            .count()
    }

    #[test]
    fn under_the_addendum_nobody_plays_a_smaller_match_twice_while_avoidable() {
        let mut rng = SplitMix64::seeded(313);
        for case in 0..60 {
            let entrants = [10, 11][case % 2];
            let mut record = addendum(entrants);
            for _ in 0..1 + rng.below(2) {
                let pairing = pair_next_round(&record, rng.next_u64()).expect("pairs");
                let winners: Vec<usize> =
                    (0..pairing.matches.len()).map(|_| rng.below(3)).collect();
                play(&mut record, &pairing, |table| Some(winners[table]));
            }
            let before = smaller_matches(&record);
            let met = meetings(&record);
            let pairing = pair_next_round(&record, rng.next_u64()).expect("pairs");
            let tables: Vec<Vec<EntrantId>> = pairing
                .matches
                .iter()
                .map(|paired| paired.seats.clone())
                .collect();
            let field: Vec<EntrantId> = tables.iter().flatten().copied().collect();
            let best = splits(&field, &sizes(&pairing))
                .iter()
                .map(|split| (repeats(split, &met), smaller_again(split, &before)))
                .min()
                .expect("a split");
            assert_eq!(
                (repeats(&tables, &met), smaller_again(&tables, &before)),
                best,
                "case {case}"
            );
        }
    }

    #[test]
    fn under_the_addendum_a_second_smaller_match_waits_until_everyone_had_one() {
        for seed in 0..8 {
            let mut record = addendum(15);
            let mut smaller = HashSet::new();
            for number in 0..3 {
                let pairing = pair_next_round(&record, seed * 10 + number).expect("pairs");
                let short = pairing.matches.last().expect("four Matches");
                assert_eq!(short.seats.len(), 3);
                for entrant in &short.seats {
                    assert!(
                        smaller.insert(*entrant),
                        "seed {seed}, Round {}: {entrant} again",
                        number + 1
                    );
                }
                play(&mut record, &pairing, |table| Some(table % 3));
            }
        }
    }

    #[test]
    fn nine_ten_and_eleven_participants_play_full_matches_and_byes_or_one_of_three() {
        for (entrants, expected, byes) in [
            (9, vec![4, 4], 1),
            (10, vec![4, 4], 2),
            (11, vec![4, 4, 3], 0),
        ] {
            for seed in 0..5 {
                let record = topdeck(entrants);
                let pairing = pair_next_round(&record, seed).expect("pairs");
                assert_eq!(sizes(&pairing), expected, "{entrants}, seed {seed}");
                assert_eq!(pairing.byes.len(), byes, "{entrants}, seed {seed}");
                let everybody: Vec<EntrantId> = (1..=entrants).map(p).collect();
                assert_eq!(seated(&pairing), everybody, "{entrants}, seed {seed}");
            }
        }
    }

    #[test]
    fn every_pairable_participant_is_seated_exactly_once() {
        for entrants in 2..=30 {
            let mut record = topdeck(entrants);
            record.entrants[0].pairable = false;
            let pairing = pair_next_round(&record, 7);
            if entrants < 3 {
                assert!(pairing.is_err(), "{entrants}");
                continue;
            }
            let pairing = pairing.expect("pairs");
            let everybody: Vec<EntrantId> = (2..=entrants).map(p).collect();
            assert_eq!(seated(&pairing), everybody, "{entrants}");
        }
    }

    #[test]
    fn the_byes_go_to_the_lowest_ranked_participants_without_one() {
        let mut record = topdeck(10);
        let first = pair_next_round(&record, 1).expect("pairs");
        play(&mut record, &first, |_| Some(0));
        let had: HashSet<EntrantId> = first.byes.iter().copied().collect();
        let without: Vec<EntrantId> = standings(&record)
            .into_iter()
            .map(|line| line.entrant)
            .filter(|entrant| !had.contains(entrant))
            .collect();
        let second = pair_next_round(&record, 2).expect("pairs");
        let mut byes = second.byes.clone();
        byes.sort();
        let mut lowest = without[without.len() - 2..].to_vec();
        lowest.sort();
        assert_eq!(byes, lowest);
    }

    #[test]
    fn the_smaller_match_is_the_lowest_table_and_the_leader_plays_at_the_top() {
        let mut record = topdeck(11);
        let first = pair_next_round(&record, 3).expect("pairs");
        play(&mut record, &first, |_| Some(1));
        let leader = standings(&record)[0].entrant;
        let second = pair_next_round(&record, 4).expect("pairs");
        assert_eq!(sizes(&second), vec![4, 4, 3]);
        assert!(second.matches[0].seats.contains(&leader));
    }

    /// How often two Participants shared a Match in `record`
    fn meetings(record: &TournamentRecord) -> HashMap<(EntrantId, EntrantId), u64> {
        let mut met = HashMap::new();
        for played in record.rounds.iter().flat_map(|round| &round.matches) {
            for one in &played.seats {
                for other in &played.seats {
                    if one < other {
                        *met.entry((*one, *other)).or_default() += 1;
                    }
                }
            }
        }
        met
    }

    /// Repeat-opponent pairs in `tables`, once per earlier meeting
    fn repeats(tables: &[Vec<EntrantId>], met: &HashMap<(EntrantId, EntrantId), u64>) -> u64 {
        let mut repeats = 0;
        for table in tables {
            for one in table {
                for other in table {
                    if one < other {
                        repeats += met.get(&(*one, *other)).copied().unwrap_or(0);
                    }
                }
            }
        }
        repeats
    }

    /// Every way to split `field` into Matches of `sizes`
    fn splits(field: &[EntrantId], sizes: &[usize]) -> Vec<Vec<Vec<EntrantId>>> {
        let Some((size, rest)) = sizes.split_first() else {
            return vec![Vec::new()];
        };
        let mut all = Vec::new();
        let mut chosen = Vec::new();
        choose(field, *size, 0, &mut chosen, &mut |table| {
            let left: Vec<EntrantId> = field
                .iter()
                .copied()
                .filter(|entrant| !table.contains(entrant))
                .collect();
            for mut split in splits(&left, rest) {
                split.insert(0, table.to_vec());
                all.push(split);
            }
        });
        all
    }

    fn choose(
        field: &[EntrantId],
        size: usize,
        from: usize,
        chosen: &mut Vec<EntrantId>,
        each: &mut dyn FnMut(&[EntrantId]),
    ) {
        if chosen.len() == size {
            each(chosen);
            return;
        }
        for index in from..field.len() {
            chosen.push(field[index]);
            choose(field, size, index + 1, chosen, each);
            chosen.pop();
        }
    }

    #[test]
    fn no_split_of_the_field_repeats_fewer_opponents_than_the_one_chosen() {
        let mut rng = SplitMix64::seeded(312);
        for case in 0..60 {
            let entrants = [8, 9, 11][case % 3];
            let mut record = topdeck(entrants);
            for _ in 0..1 + rng.below(3) {
                let pairing = pair_next_round(&record, rng.next_u64()).expect("pairs");
                let winners: Vec<usize> =
                    (0..pairing.matches.len()).map(|_| rng.below(4)).collect();
                play(&mut record, &pairing, |table| Some(winners[table].min(2)));
            }
            let pairing = pair_next_round(&record, rng.next_u64()).expect("pairs");
            let met = meetings(&record);
            let tables: Vec<Vec<EntrantId>> = pairing
                .matches
                .iter()
                .map(|paired| paired.seats.clone())
                .collect();
            let field: Vec<EntrantId> = tables.iter().flatten().copied().collect();
            let fewest = splits(&field, &sizes(&pairing))
                .iter()
                .map(|split| repeats(split, &met))
                .min()
                .expect("a split");
            assert_eq!(repeats(&tables, &met), fewest, "case {case}");
            for (paired, table) in pairing.matches.iter().zip(&tables) {
                assert_eq!(
                    paired.rematch,
                    repeats(std::slice::from_ref(table), &met) > 0
                );
            }
        }
    }

    #[test]
    fn thirty_two_participants_play_five_rounds_without_meeting_anyone_twice() {
        for seed in 0..5 {
            let mut record = topdeck(32);
            for number in 0..5 {
                let pairing = pair_next_round(&record, seed * 10 + number).expect("pairs");
                assert!(
                    pairing.matches.iter().all(|paired| !paired.rematch),
                    "seed {seed}, Round {}",
                    number + 1
                );
                play(&mut record, &pairing, |table| Some(table % 4));
            }
            assert!(
                meetings(&record).values().all(|times| *times == 1),
                "seed {seed}"
            );
        }
    }

    #[test]
    fn a_repeat_opponent_is_paired_when_nothing_else_is_left() {
        let mut record = topdeck(4);
        let first = pair_next_round(&record, 0).expect("pairs");
        play(&mut record, &first, |_| Some(0));
        let second = pair_next_round(&record, 1).expect("still pairs");
        assert_eq!(sizes(&second), vec![4]);
        assert!(second.matches[0].rematch);
    }

    #[test]
    fn nobody_plays_a_smaller_match_twice_while_others_have_not() {
        let mut record = topdeck(15);
        let mut smaller = HashSet::new();
        for number in 0..3 {
            let pairing = pair_next_round(&record, number).expect("pairs");
            let short = pairing.matches.last().expect("three Matches");
            assert_eq!(short.seats.len(), 3);
            for entrant in &short.seats {
                assert!(
                    smaller.insert(*entrant),
                    "Round {}: {entrant} again",
                    number + 1
                );
            }
            play(&mut record, &pairing, |_| None);
        }
    }

    #[test]
    fn the_same_record_and_seed_pair_the_same_way() {
        let mut record = topdeck(13);
        let first = pair_next_round(&record, 8).expect("pairs");
        play(&mut record, &first, |table| Some(table % 3));
        assert_eq!(pair_next_round(&record, 9), pair_next_round(&record, 9));
        let rounds: HashSet<Vec<Vec<EntrantId>>> = (0..10)
            .map(|seed| {
                pair_next_round(&topdeck(13), seed)
                    .expect("pairs")
                    .matches
                    .into_iter()
                    .map(|paired| {
                        let mut seats = paired.seats;
                        seats.sort();
                        seats
                    })
                    .collect()
            })
            .collect();
        assert!(rounds.len() > 5, "Round 1 is drawn: only {}", rounds.len());
    }

    /// How often each Participant sat in each Seat over `record`'s Rounds
    fn seat_counts(record: &TournamentRecord) -> HashMap<EntrantId, [u32; 4]> {
        let mut counts: HashMap<EntrantId, [u32; 4]> = HashMap::new();
        for played in record.rounds.iter().flat_map(|round| &round.matches) {
            for (seat, entrant) in played.seats.iter().enumerate() {
                counts.entry(*entrant).or_default()[seat] += 1;
            }
        }
        counts
    }

    #[test]
    fn whoever_started_least_often_in_a_match_starts() {
        for seed in 0..5 {
            let mut record = topdeck(13);
            for number in 0..6 {
                let before = seat_counts(&record);
                let pairing = pair_next_round(&record, seed * 10 + number).expect("pairs");
                for paired in &pairing.matches {
                    let started =
                        |entrant: &EntrantId| before.get(entrant).map_or(0, |seats| seats[0]);
                    let least = paired.seats.iter().map(started).min().expect("seated");
                    assert_eq!(
                        started(&paired.seats[0]),
                        least,
                        "seed {seed}, Round {}",
                        number + 1
                    );
                }
                play(&mut record, &pairing, |table| Some(table % 2));
            }
        }
    }

    #[test]
    fn over_four_rounds_at_four_the_start_goes_round() {
        for seed in 0..10 {
            let mut record = topdeck(16);
            for number in 0..4 {
                let pairing = pair_next_round(&record, seed * 10 + number).expect("pairs");
                play(&mut record, &pairing, |table| Some(table % 4));
            }
            let counts = seat_counts(&record);
            let most = counts
                .values()
                .map(|seats| seats[0])
                .max()
                .expect("counted");
            assert!(most <= 2, "seed {seed}: someone started {most} times");
            let starters = counts.values().filter(|seats| seats[0] > 0).count();
            assert!(
                starters >= 14,
                "seed {seed}: only {starters} of 16 ever started"
            );
            assert!(
                counts
                    .values()
                    .all(|seats| seats.iter().all(|times| *times < 4)),
                "seed {seed}: someone sat in the same Seat every Round"
            );
        }
    }

    #[test]
    fn the_first_round_seats_the_higher_ranked_or_at_random_and_a_smaller_match_counts_every_seat()
    {
        let mut record = topdeck(7);
        let first = pair_next_round(&record, 1).expect("pairs");
        assert_eq!(sizes(&first), vec![4, 3]);
        play(&mut record, &first, |_| Some(0));
        let before = seat_counts(&record);
        let second = pair_next_round(&record, 2).expect("pairs");
        for paired in &second.matches {
            let keys: Vec<[u32; 4]> = paired
                .seats
                .iter()
                .map(|entrant| before.get(entrant).copied().unwrap_or_default())
                .collect();
            let mut sorted = keys.clone();
            sorted.sort();
            assert_eq!(keys, sorted, "Seats follow the seat history");
        }
    }
}
