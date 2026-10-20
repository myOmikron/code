//! Deterministic, seeded pairing; entrants arrive in standings order and are never re-sorted

use std::collections::HashMap;
use std::collections::HashSet;

use uuid::Uuid;

/// Whoever occupies one seat — a participant today, a team later
pub type EntrantId = Uuid;

/// What the round is pairing for
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PairingKind {
    /// A scored round: opponent history matters and an odd duel field takes a bye
    Swiss,
    /// A draft pod stage: who has played whom is irrelevant, and nobody sits out
    Draft,
}

/// One entrant, as the engine needs to see them
#[derive(Debug, Clone)]
pub struct Entrant {
    /// Who this is
    pub id: EntrantId,
    /// Their match points, which form the score brackets and the pod spread
    pub match_points: i32,
    /// Whether they already had a bye (MTR: nobody gets two)
    pub had_bye: bool,
    /// How many previous rounds they spent in a short pod
    pub small_pod_rounds: u32,
    /// The table they must sit at, if they cannot move between tables
    pub fixed_table: Option<i16>,
}

/// Everything one pairing decision reads
#[derive(Debug, Clone)]
pub struct PairingSnapshot {
    /// What the round is for
    pub kind: PairingKind,
    /// How many players a full table seats
    pub pod_size: usize,
    /// The field, **in standings order**
    pub entrants: Vec<Entrant>,
    /// Who has already played whom, one entry per meeting; Swiss rounds only, never draft pods
    pub history: Vec<(EntrantId, EntrantId)>,
    /// The seed this round's layout is rolled from
    pub seed: u64,
}

/// How a field divides into pods of `pod_size` and one less (Multiplayer Addendum: no byes)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PodPlan {
    /// How many pods seat the full [`PairingSnapshot::pod_size`]
    pub full: usize,
    /// How many seat one fewer
    pub short: usize,
}

/// One table of a paired round
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Table {
    /// The number printed on it
    pub number: i16,
    /// Who sits there, in seat order
    pub seats: Vec<EntrantId>,
    /// Whether this is a bye rather than a table anybody sits at
    pub is_bye: bool,
}

/// Something an organizer should know about a layout that was still produced
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PairingWarning {
    /// Two pinned players share a table; the first pin wins and the other is dropped
    FixedTableTaken {
        /// The number both asked for
        number: i16,
        /// Who did not get it
        entrant: EntrantId,
    },
}

/// A paired round
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pairing {
    /// Its tables, in table-number order
    pub tables: Vec<Table>,
    /// What an organizer should know about it
    pub warnings: Vec<PairingWarning>,
}

/// Why a round could not be paired at all
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PairingError {
    /// Nobody is left to pair
    NoEntrants,
    /// The field divides into neither full pods nor pods one smaller
    ImpossiblePods,
}

/// What is wrong with a layout an organizer typed in by hand
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManualPairingError {
    /// Somebody was seated twice
    SeatedTwice(EntrantId),
    /// Somebody in the field was left out
    NotSeated(EntrantId),
    /// A seat holds somebody who is not in this round
    UnknownEntrant(EntrantId),
    /// A table seats neither `pod_size` players nor one fewer
    WrongPodSize {
        /// Which table
        number: i16,
        /// How many sat there
        seated: usize,
    },
}

/// How many swap attempts each restart makes, per entrant
const SWAPS_PER_ENTRANT: usize = 50;

/// How many times the hill-climb starts over from a fresh shuffle
const RESTARTS: usize = 3;

/// What one previously played pair costs, before squaring
const REMATCH_COST: i64 = 1000;

/// What sitting in a short pod again costs
const REPEAT_SMALL_POD_COST: i64 = 100;

/// Cost per point of spread, squared; one bracket down (450) beats a rematch, two (1800) don't
const SPREAD_COST: i64 = 50;

/// Split a field into the most `pod_size` pods possible, the rest one smaller
pub fn plan_pods(entrants: usize, pod_size: usize) -> Option<PodPlan> {
    if pod_size < 2 || entrants == 0 {
        return None;
    }
    let short_size = pod_size - 1;
    // Only pod size two has a one-seat short pod; Swiss duels take the bye before this.
    for full in (0..=entrants / pod_size).rev() {
        let left = entrants - full * pod_size;
        if left.is_multiple_of(short_size) {
            return Some(PodPlan {
                full,
                short: left / short_size,
            });
        }
    }
    None
}

/// Pair a round
pub fn pair(snapshot: &PairingSnapshot) -> Result<Pairing, PairingError> {
    if snapshot.entrants.is_empty() {
        return Err(PairingError::NoEntrants);
    }

    let mut rng = SplitMix64::seeded(snapshot.seed);
    let mut field: Vec<&Entrant> = snapshot.entrants.iter().collect();

    // Multiplayer Addendum: pods get short tables, never a bye.
    let bye =
        if snapshot.pod_size == 2 && snapshot.kind == PairingKind::Swiss && field.len() % 2 == 1 {
            Some(take_bye(&mut field))
        } else {
            None
        };

    let mut pods = if field.is_empty() {
        Vec::new()
    } else {
        // Duels fold score brackets; pods slice the ranked field ("pod by standing").
        let mut pods = if snapshot.pod_size == 2 && snapshot.kind == PairingKind::Swiss {
            fold_brackets(&field)
        } else {
            let plan =
                plan_pods(field.len(), snapshot.pod_size).ok_or(PairingError::ImpossiblePods)?;
            slice(&field, snapshot.pod_size, plan)
        };
        if snapshot.kind == PairingKind::Swiss {
            pods = improve(
                pods,
                &meetings(&snapshot.history),
                snapshot.pod_size,
                &mut rng,
            );
        }
        pods
    };

    // Pods shuffle seat order (turn order is worth points); duels keep standings order.
    if snapshot.pod_size > 2 {
        for pod in &mut pods {
            shuffle(pod, &mut rng);
        }
    }

    Ok(number_tables(pods, bye))
}

/// Check a hand-arranged layout: everybody seated once, tables the right size; rematches allowed
pub fn validate_manual(
    snapshot: &PairingSnapshot,
    tables: &[Vec<EntrantId>],
) -> Result<Pairing, Vec<ManualPairingError>> {
    let mut errors = Vec::new();
    let known: HashMap<EntrantId, &Entrant> = snapshot.entrants.iter().map(|e| (e.id, e)).collect();

    let mut seen: HashMap<EntrantId, usize> = HashMap::new();
    for seats in tables {
        for id in seats {
            *seen.entry(*id).or_default() += 1;
            if !known.contains_key(id) {
                errors.push(ManualPairingError::UnknownEntrant(*id));
            }
        }
    }
    for (id, count) in &seen {
        if *count > 1 {
            errors.push(ManualPairingError::SeatedTwice(*id));
        }
    }
    for entrant in &snapshot.entrants {
        if !seen.contains_key(&entrant.id) {
            errors.push(ManualPairingError::NotSeated(entrant.id));
        }
    }
    let mut byes = 0;
    for (index, seats) in tables.iter().enumerate() {
        let bye = snapshot.pod_size == 2 && seats.len() == 1;
        byes += usize::from(bye);
        let allowed = seats.len() == snapshot.pod_size
            || (snapshot.pod_size > 2 && seats.len() == snapshot.pod_size - 1)
            || (bye && byes == 1);
        if !allowed {
            errors.push(ManualPairingError::WrongPodSize {
                number: (index + 1) as i16,
                seated: seats.len(),
            });
        }
    }
    if !errors.is_empty() {
        return Err(errors);
    }

    // A single seat at a pod size of two is a bye, however it was typed in.
    let mut pods: Vec<Vec<&Entrant>> = Vec::new();
    let mut bye = None;
    for seats in tables {
        if snapshot.pod_size == 2 && seats.len() == 1 {
            bye = Some(known[&seats[0]]);
            continue;
        }
        pods.push(seats.iter().map(|id| known[id]).collect());
    }
    Ok(number_tables(pods, bye))
}

/// Take the bye: the lowest-ranked entrant without one (MTR), else the lowest-ranked
fn take_bye<'a>(field: &mut Vec<&'a Entrant>) -> &'a Entrant {
    let index = field
        .iter()
        .rposition(|entrant| !entrant.had_bye)
        .unwrap_or(field.len() - 1);
    field.remove(index)
}

/// Pair each score bracket top half against bottom half; an odd bracket's last plays down
fn fold_brackets<'a>(field: &[&'a Entrant]) -> Vec<Vec<&'a Entrant>> {
    let mut tables = Vec::with_capacity(field.len() / 2);
    let mut carry: Vec<&'a Entrant> = Vec::new();
    let mut index = 0;

    while index < field.len() {
        let points = field[index].match_points;
        let mut bracket = std::mem::take(&mut carry);
        while index < field.len() && field[index].match_points == points {
            bracket.push(field[index]);
            index += 1;
        }
        if bracket.len() % 2 == 1 {
            // The bottom of the bracket plays down, not the top.
            carry.push(bracket.remove(bracket.len() - 1));
        }
        let half = bracket.len() / 2;
        for seat in 0..half {
            tables.push(vec![bracket[seat], bracket[seat + half]]);
        }
    }

    // Unreachable for an even field; seat a leftover alone rather than drop them.
    for left in carry {
        tables.push(vec![left]);
    }
    tables
}

/// Cut a ranked field into pods, full ones first so short pods sit at the bottom
fn slice<'a>(field: &[&'a Entrant], pod_size: usize, plan: PodPlan) -> Vec<Vec<&'a Entrant>> {
    let mut pods = Vec::with_capacity(plan.full + plan.short);
    let mut rest = field;
    for _ in 0..plan.full {
        let (pod, tail) = rest.split_at(pod_size);
        pods.push(pod.to_vec());
        rest = tail;
    }
    for _ in 0..plan.short {
        let (pod, tail) = rest.split_at(pod_size - 1);
        pods.push(pod.to_vec());
        rest = tail;
    }
    pods
}

/// How often each pair has already met
fn meetings(history: &[(EntrantId, EntrantId)]) -> HashMap<(EntrantId, EntrantId), i64> {
    let mut met = HashMap::new();
    for (a, b) in history {
        *met.entry(key(*a, *b)).or_default() += 1;
    }
    met
}

/// An unordered pair as an ordered key
fn key(a: EntrantId, b: EntrantId) -> (EntrantId, EntrantId) {
    if a <= b { (a, b) } else { (b, a) }
}

/// Cost of a layout: rematches dominate, then repeat short pods, then point spread
fn cost(
    pods: &[Vec<&Entrant>],
    met: &HashMap<(EntrantId, EntrantId), i64>,
    pod_size: usize,
) -> i64 {
    let mut total = 0;
    for pod in pods {
        for (index, one) in pod.iter().enumerate() {
            for other in &pod[index + 1..] {
                let times = met.get(&key(one.id, other.id)).copied().unwrap_or(0);
                total += REMATCH_COST * times * times;
            }
        }
        if pod.len() < pod_size {
            for entrant in pod {
                total += REPEAT_SMALL_POD_COST * i64::from(entrant.small_pod_rounds);
            }
        }
        let points: Vec<i32> = pod.iter().map(|entrant| entrant.match_points).collect();
        let spread = i64::from(
            points.iter().copied().max().unwrap_or(0) - points.iter().copied().min().unwrap_or(0),
        );
        total += SPREAD_COST * spread * spread;
    }
    total
}

/// Hill-climb pod swaps from the given layout plus random restarts, keeping the cheapest
fn improve<'a>(
    pods: Vec<Vec<&'a Entrant>>,
    met: &HashMap<(EntrantId, EntrantId), i64>,
    pod_size: usize,
    rng: &mut SplitMix64,
) -> Vec<Vec<&'a Entrant>> {
    if pods.len() < 2 {
        return pods;
    }
    let seats: usize = pods.iter().map(Vec::len).sum();
    let attempts = SWAPS_PER_ENTRANT * seats;

    let mut best = pods.clone();
    let mut best_cost = cost(&best, met, pod_size);

    // Restart zero is the caller's layout; shuffled restarts must be strictly better to replace it.
    for restart in 0..RESTARTS {
        let mut current = if restart == 0 {
            pods.clone()
        } else {
            let mut shuffled = pods.clone();
            for _ in 0..seats {
                let a = rng.below(shuffled.len());
                let b = rng.below(shuffled.len());
                if a == b {
                    continue;
                }
                let i = rng.below(shuffled[a].len());
                let j = rng.below(shuffled[b].len());
                let moved = shuffled[a][i];
                shuffled[a][i] = shuffled[b][j];
                shuffled[b][j] = moved;
            }
            shuffled
        };
        let mut current_cost = cost(&current, met, pod_size);

        for _ in 0..attempts {
            if current_cost == 0 {
                break;
            }
            let a = rng.below(current.len());
            let b = rng.below(current.len());
            if a == b {
                continue;
            }
            let i = rng.below(current[a].len());
            let j = rng.below(current[b].len());
            let moved = current[a][i];
            current[a][i] = current[b][j];
            current[b][j] = moved;

            let swapped_cost = cost(&current, met, pod_size);
            // Strictly better only: equal-cost swaps would randomise the fold inside a bracket.
            if swapped_cost < current_cost {
                current_cost = swapped_cost;
            } else {
                let back = current[a][i];
                current[a][i] = current[b][j];
                current[b][j] = back;
            }
        }

        if current_cost < best_cost {
            best = current;
            best_cost = current_cost;
        }
    }
    best
}

/// Put a pod's seats in a random order
fn shuffle(pod: &mut [&Entrant], rng: &mut SplitMix64) {
    for index in (1..pod.len()).rev() {
        pod.swap(index, rng.below(index + 1));
    }
}

/// Number tables: pins first, the rest fill free numbers in order; a bye takes number 0
fn number_tables(pods: Vec<Vec<&Entrant>>, bye: Option<&Entrant>) -> Pairing {
    let mut warnings = Vec::new();
    let mut taken: HashSet<i16> = HashSet::new();
    let mut numbers: Vec<Option<i16>> = vec![None; pods.len()];

    for (index, pod) in pods.iter().enumerate() {
        for entrant in pod {
            let Some(number) = entrant.fixed_table else {
                continue;
            };
            if numbers[index].is_some() || taken.contains(&number) {
                warnings.push(PairingWarning::FixedTableTaken {
                    number,
                    entrant: entrant.id,
                });
                continue;
            }
            numbers[index] = Some(number);
            taken.insert(number);
        }
    }

    let mut next = 1;
    for slot in numbers.iter_mut() {
        if slot.is_some() {
            continue;
        }
        while taken.contains(&next) {
            next += 1;
        }
        taken.insert(next);
        *slot = Some(next);
    }

    let mut tables: Vec<Table> = pods
        .into_iter()
        .zip(numbers)
        .map(|(pod, number)| Table {
            number: number.unwrap_or(0),
            seats: pod.iter().map(|entrant| entrant.id).collect(),
            is_bye: false,
        })
        .collect();
    tables.sort_by_key(|table| table.number);

    if let Some(bye) = bye {
        tables.push(Table {
            number: 0,
            seats: vec![bye.id],
            is_bye: true,
        });
    }

    Pairing { tables, warnings }
}

/// SplitMix64, kept in-house so pairings stay stable across `rand` upgrades
struct SplitMix64(u64);

impl SplitMix64 {
    /// Start the generator from a round's seed
    fn seeded(seed: u64) -> Self {
        Self(seed)
    }

    /// The next value in the stream
    fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// A value below `bound`, which must not be zero
    fn below(&mut self, bound: usize) -> usize {
        (self.next_u64() % bound as u64) as usize
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One of the players, by rank
    fn p(n: u128) -> EntrantId {
        Uuid::from_u128(n)
    }

    /// An entrant with nothing remarkable about them
    fn entrant(n: u128, points: i32) -> Entrant {
        Entrant {
            id: Uuid::from_u128(n),
            match_points: points,
            had_bye: false,
            small_pod_rounds: 0,
            fixed_table: None,
        }
    }

    /// A field of `count` entrants, all level on points
    fn field(count: u128) -> Vec<Entrant> {
        (1..=count).map(|n| entrant(n, 0)).collect()
    }

    /// A snapshot with no history and a fixed seed
    fn snapshot(kind: PairingKind, pod_size: usize, entrants: Vec<Entrant>) -> PairingSnapshot {
        PairingSnapshot {
            kind,
            pod_size,
            entrants,
            history: Vec::new(),
            seed: 42,
        }
    }

    /// Everybody seated, byes included
    fn seated(pairing: &Pairing) -> Vec<EntrantId> {
        pairing
            .tables
            .iter()
            .flat_map(|table| table.seats.iter().copied())
            .collect()
    }

    #[test]
    fn plan_pods_matches_the_addendums_own_examples() {
        assert_eq!(plan_pods(13, 4), Some(PodPlan { full: 1, short: 3 }));
        assert_eq!(plan_pods(21, 4), Some(PodPlan { full: 3, short: 3 }));
        assert_eq!(plan_pods(22, 4), Some(PodPlan { full: 4, short: 2 }));
        assert_eq!(plan_pods(23, 4), Some(PodPlan { full: 5, short: 1 }));
    }

    #[test]
    fn every_plan_seats_exactly_the_field() {
        for entrants in 1..=200 {
            for pod_size in 2..=8 {
                let Some(plan) = plan_pods(entrants, pod_size) else {
                    continue;
                };
                assert_eq!(
                    plan.full * pod_size + plan.short * (pod_size - 1),
                    entrants,
                    "{entrants} at {pod_size}"
                );
            }
        }
    }

    #[test]
    fn prefers_as_many_full_pods_as_the_field_allows() {
        assert_eq!(plan_pods(16, 4), Some(PodPlan { full: 4, short: 0 }));
        assert_eq!(plan_pods(12, 4), Some(PodPlan { full: 3, short: 0 }));
    }

    #[test]
    fn refuses_a_field_that_divides_into_neither_size() {
        assert_eq!(plan_pods(5, 4), None);
        assert_eq!(plan_pods(2, 4), None);
        assert_eq!(
            pair(&snapshot(PairingKind::Swiss, 4, field(5))),
            Err(PairingError::ImpossiblePods)
        );
    }

    #[test]
    fn refuses_an_empty_field() {
        assert_eq!(
            pair(&snapshot(PairingKind::Swiss, 2, Vec::new())),
            Err(PairingError::NoEntrants)
        );
    }

    #[test]
    fn gives_the_bye_to_the_lowest_ranked_player_without_one() {
        let mut people = field(5);
        people[4].had_bye = true;
        let pairing = pair(&snapshot(PairingKind::Swiss, 2, people)).expect("pairs");

        let bye = pairing
            .tables
            .iter()
            .find(|table| table.is_bye)
            .expect("a bye");
        assert_eq!(bye.seats, vec![Uuid::from_u128(4)]);
    }

    #[test]
    fn falls_back_to_the_lowest_ranked_once_everybody_has_had_a_bye() {
        let mut people = field(3);
        for person in &mut people {
            person.had_bye = true;
        }
        let pairing = pair(&snapshot(PairingKind::Swiss, 2, people)).expect("pairs");

        let bye = pairing
            .tables
            .iter()
            .find(|table| table.is_bye)
            .expect("a bye");
        assert_eq!(bye.seats, vec![Uuid::from_u128(3)]);
    }

    #[test]
    fn seats_a_pod_round_without_ever_handing_out_a_bye() {
        let pairing = pair(&snapshot(PairingKind::Swiss, 4, field(13))).expect("pairs");
        assert!(pairing.tables.iter().all(|table| !table.is_bye));
        assert_eq!(seated(&pairing).len(), 13);
    }

    #[test]
    fn puts_the_full_pod_at_the_first_table_and_the_short_ones_after_it() {
        let pairing = pair(&snapshot(PairingKind::Swiss, 4, field(13))).expect("pairs");
        let sizes: Vec<usize> = pairing
            .tables
            .iter()
            .map(|table| table.seats.len())
            .collect();
        assert_eq!(sizes, vec![4, 3, 3, 3]);
    }

    #[test]
    fn keeps_a_rematch_out_of_a_pod_when_one_is_avoidable() {
        let people = field(4);
        let history = vec![
            (Uuid::from_u128(1), Uuid::from_u128(2)),
            (Uuid::from_u128(3), Uuid::from_u128(4)),
        ];
        let pairing = pair(&PairingSnapshot {
            history,
            ..snapshot(PairingKind::Swiss, 2, people)
        })
        .expect("pairs");

        for table in &pairing.tables {
            let played_before = (table.seats[0] == Uuid::from_u128(1)
                && table.seats[1] == Uuid::from_u128(2))
                || (table.seats[0] == Uuid::from_u128(2) && table.seats[1] == Uuid::from_u128(1))
                || (table.seats[0] == Uuid::from_u128(3) && table.seats[1] == Uuid::from_u128(4))
                || (table.seats[0] == Uuid::from_u128(4) && table.seats[1] == Uuid::from_u128(3));
            assert!(!played_before, "{:?} have already met", table.seats);
        }
    }

    #[test]
    fn pairs_a_draft_pod_without_looking_at_who_has_played_whom() {
        // Everybody has met everybody; a draft round does not care.
        let mut history = Vec::new();
        for a in 1..=8u128 {
            for b in (a + 1)..=8 {
                history.push((Uuid::from_u128(a), Uuid::from_u128(b)));
            }
        }
        let pairing = pair(&PairingSnapshot {
            history,
            ..snapshot(PairingKind::Draft, 4, field(8))
        })
        .expect("pairs");

        assert_eq!(pairing.tables.len(), 2);
        let first: HashSet<EntrantId> = pairing.tables[0].seats.iter().copied().collect();
        assert_eq!(
            first,
            (1..=4u128).map(Uuid::from_u128).collect::<HashSet<_>>(),
            "a draft pod is the ranked slice, untouched"
        );
    }

    #[test]
    fn seats_the_same_field_the_same_way_twice() {
        let snap = snapshot(PairingKind::Swiss, 4, field(13));
        assert_eq!(pair(&snap), pair(&snap));
    }

    #[test]
    fn rolls_a_different_layout_for_a_different_seed() {
        let layouts: HashSet<Vec<EntrantId>> = (1..=20u64)
            .map(|seed| {
                let snap = PairingSnapshot {
                    seed,
                    ..snapshot(PairingKind::Swiss, 4, field(12))
                };
                seated(&pair(&snap).expect("pairs"))
            })
            .collect();
        assert!(layouts.len() > 1, "every seed produced the same seating");
    }

    #[test]
    fn folds_a_score_bracket_top_half_against_bottom_half() {
        let pairing = pair(&snapshot(PairingKind::Swiss, 2, field(8))).expect("pairs");
        let tables: Vec<Vec<EntrantId>> = pairing
            .tables
            .iter()
            .map(|table| table.seats.clone())
            .collect();

        assert_eq!(
            tables,
            vec![
                vec![p(1), p(5)],
                vec![p(2), p(6)],
                vec![p(3), p(7)],
                vec![p(4), p(8)],
            ]
        );
    }

    #[test]
    fn sends_the_bottom_of_an_odd_bracket_down_to_the_next_one() {
        let mut people = field(6);
        for person in people.iter_mut().take(3) {
            person.match_points = 3;
        }
        let pairing = pair(&snapshot(PairingKind::Swiss, 2, people)).expect("pairs");

        let paired_down = pairing
            .tables
            .iter()
            .find(|table| table.seats.contains(&p(3)))
            .expect("their table");
        assert!(
            paired_down.seats.iter().any(|seat| *seat == p(5)),
            "the lowest of the three-point bracket plays the top of the one below"
        );
        assert!(
            pairing
                .tables
                .iter()
                .any(|table| table.seats == vec![p(1), p(2)]),
            "the two left on three points play each other"
        );
    }

    #[test]
    fn pairs_one_bracket_down_to_avoid_a_rematch() {
        // Two on three points who have already met, two on nothing.
        let mut people = field(4);
        people[0].match_points = 3;
        people[1].match_points = 3;
        let pairing = pair(&PairingSnapshot {
            history: vec![(p(1), p(2))],
            ..snapshot(PairingKind::Swiss, 2, people)
        })
        .expect("pairs");

        assert!(
            !pairing
                .tables
                .iter()
                .any(|table| table.seats.contains(&p(1)) && table.seats.contains(&p(2))),
            "one bracket down costs less than sitting them down together again"
        );
    }

    #[test]
    fn keeps_a_rematch_rather_than_pairing_across_two_brackets() {
        let mut people = field(4);
        people[0].match_points = 6;
        people[1].match_points = 6;
        let pairing = pair(&PairingSnapshot {
            history: vec![(p(1), p(2))],
            ..snapshot(PairingKind::Swiss, 2, people)
        })
        .expect("pairs");

        assert!(
            pairing
                .tables
                .iter()
                .any(|table| table.seats.contains(&p(1)) && table.seats.contains(&p(2))),
            "the rematch stands rather than a six-point pair-down"
        );
    }

    #[test]
    fn pairs_the_same_field_the_same_way_however_often_it_is_asked() {
        let snap = snapshot(PairingKind::Swiss, 2, field(8));
        let once = pair(&snap).expect("pairs");
        let twice = pair(&snap).expect("pairs");
        assert_eq!(once, twice);
    }

    #[test]
    fn a_thirty_two_player_event_runs_five_rounds_without_a_single_repeat() {
        // Plays a full event out, feeding each round's results back in.
        let field: Vec<EntrantId> = (1..=32u128).map(p).collect();
        let mut points: HashMap<EntrantId, i32> = field.iter().map(|id| (*id, 0)).collect();
        let seeds: HashMap<EntrantId, i32> = field
            .iter()
            .enumerate()
            .map(|(rank, id)| (*id, rank as i32))
            .collect();
        let mut history: Vec<(EntrantId, EntrantId)> = Vec::new();
        let (mut repeats, mut crossed, mut tables) = (0, 0, 0);

        for round in 1..=5u64 {
            let mut order = field.clone();
            order.sort_by(|left, right| {
                points[right]
                    .cmp(&points[left])
                    .then(seeds[left].cmp(&seeds[right]))
            });
            let entrants: Vec<Entrant> = order
                .iter()
                .map(|id| Entrant {
                    id: *id,
                    match_points: points[id],
                    had_bye: false,
                    small_pod_rounds: 0,
                    fixed_table: None,
                })
                .collect();

            let pairing = pair(&PairingSnapshot {
                kind: PairingKind::Swiss,
                pod_size: 2,
                entrants,
                history: history.clone(),
                seed: round,
            })
            .expect("pairs");

            for table in &pairing.tables {
                if table.is_bye || table.seats.len() < 2 {
                    continue;
                }
                let (one, other) = (table.seats[0], table.seats[1]);
                tables += 1;
                if history
                    .iter()
                    .any(|met| *met == (one, other) || *met == (other, one))
                {
                    repeats += 1;
                }
                if points[&one] != points[&other] {
                    crossed += 1;
                }
                history.push((one, other));

                // The higher-ranked player always wins, which maximises rematch pressure.
                let winner = if order.iter().position(|id| *id == one)
                    < order.iter().position(|id| *id == other)
                {
                    one
                } else {
                    other
                };
                *points.get_mut(&winner).expect("a known player") += 3;
            }
        }

        assert_eq!(
            repeats, 0,
            "{repeats} repeat(s) across {tables} tables in five rounds"
        );
        assert!(
            crossed * 5 <= tables,
            "{crossed} of {tables} tables crossed a score bracket, which is more \
             pairing down than a clean field should ever need"
        );
    }

    #[test]
    fn hands_a_pinned_player_the_table_they_cannot_leave() {
        let mut people = field(4);
        people[2].fixed_table = Some(1);
        let pairing = pair(&snapshot(PairingKind::Swiss, 2, people)).expect("pairs");

        let table = pairing
            .tables
            .iter()
            .find(|table| table.seats.contains(&Uuid::from_u128(3)))
            .expect("their table");
        assert_eq!(table.number, 1);
        assert!(pairing.warnings.is_empty());
    }

    #[test]
    fn numbers_every_other_table_around_a_pinned_one() {
        let mut people = field(6);
        people[5].fixed_table = Some(2);
        let pairing = pair(&snapshot(PairingKind::Swiss, 2, people)).expect("pairs");

        let numbers: Vec<i16> = pairing.tables.iter().map(|table| table.number).collect();
        assert_eq!(numbers, vec![1, 2, 3], "the numbers are still 1..=3");
        assert!(pairing.tables[1].seats.contains(&Uuid::from_u128(6)));
    }

    #[test]
    fn warns_when_two_pinned_players_want_one_table() {
        let mut people = field(4);
        people[0].fixed_table = Some(1);
        people[2].fixed_table = Some(1);
        let pairing = pair(&snapshot(PairingKind::Swiss, 2, people)).expect("pairs");

        assert_eq!(pairing.warnings.len(), 1);
        assert!(matches!(
            pairing.warnings[0],
            PairingWarning::FixedTableTaken { number: 1, .. }
        ));
    }

    #[test]
    fn keeps_one_pin_when_two_pinned_players_meet() {
        // Round one folds 1v3 and 2v4, so the two pinned players meet.
        let mut people = field(4);
        people[0].fixed_table = Some(3);
        people[2].fixed_table = Some(5);
        let pairing = pair(&snapshot(PairingKind::Swiss, 2, people)).expect("pairs");

        let shared = pairing
            .tables
            .iter()
            .find(|table| table.seats.contains(&Uuid::from_u128(1)))
            .expect("their table");
        assert!(shared.seats.contains(&Uuid::from_u128(3)));
        assert_eq!(shared.number, 3);
        assert_eq!(
            pairing.warnings,
            vec![PairingWarning::FixedTableTaken {
                number: 5,
                entrant: Uuid::from_u128(3)
            }]
        );
        assert!(pairing.tables.iter().all(|table| table.number != 5));
    }

    #[test]
    fn does_not_let_a_bye_burn_a_table_number() {
        let mut people = field(5);
        people[4].fixed_table = Some(1);
        let pairing = pair(&snapshot(PairingKind::Swiss, 2, people)).expect("pairs");

        let played: Vec<i16> = pairing
            .tables
            .iter()
            .filter(|table| !table.is_bye)
            .map(|table| table.number)
            .collect();
        assert_eq!(played, vec![1, 2]);
        assert!(pairing.warnings.is_empty());
    }

    #[test]
    fn accepts_a_hand_arranged_layout_that_seats_everybody_once() {
        let snap = snapshot(PairingKind::Swiss, 2, field(4));
        let tables = vec![
            vec![Uuid::from_u128(1), Uuid::from_u128(4)],
            vec![Uuid::from_u128(2), Uuid::from_u128(3)],
        ];
        let pairing = validate_manual(&snap, &tables).expect("valid");

        assert_eq!(pairing.tables.len(), 2);
        assert_eq!(pairing.tables[0].number, 1);
        assert_eq!(pairing.tables[0].seats, tables[0]);
    }

    #[test]
    fn names_everybody_a_hand_arranged_layout_left_out_or_sat_down_twice() {
        let snap = snapshot(PairingKind::Swiss, 2, field(4));
        let tables = vec![
            vec![Uuid::from_u128(1), Uuid::from_u128(2)],
            vec![Uuid::from_u128(2), Uuid::from_u128(3)],
        ];
        let errors = validate_manual(&snap, &tables).expect_err("invalid");

        assert!(errors.contains(&ManualPairingError::SeatedTwice(Uuid::from_u128(2))));
        assert!(errors.contains(&ManualPairingError::NotSeated(Uuid::from_u128(4))));
    }

    #[test]
    fn refuses_a_hand_arranged_table_of_the_wrong_size() {
        let snap = snapshot(PairingKind::Swiss, 4, field(4));
        let tables = vec![vec![
            Uuid::from_u128(1),
            Uuid::from_u128(2),
            Uuid::from_u128(3),
            Uuid::from_u128(4),
        ]];
        assert!(validate_manual(&snap, &tables).is_ok());

        let split = vec![
            vec![Uuid::from_u128(1), Uuid::from_u128(2)],
            vec![Uuid::from_u128(3), Uuid::from_u128(4)],
        ];
        let errors = validate_manual(&snap, &split).expect_err("invalid");
        assert_eq!(errors.len(), 2);
        assert!(
            errors
                .iter()
                .all(|error| matches!(error, ManualPairingError::WrongPodSize { seated: 2, .. }))
        );
    }

    #[test]
    fn refuses_a_second_bye_in_a_hand_arranged_duel_round() {
        let snap = snapshot(PairingKind::Swiss, 2, field(4));
        let tables = vec![
            vec![Uuid::from_u128(1), Uuid::from_u128(2)],
            vec![Uuid::from_u128(3)],
            vec![Uuid::from_u128(4)],
        ];
        let errors = validate_manual(&snap, &tables).expect_err("invalid");

        assert_eq!(
            errors,
            vec![ManualPairingError::WrongPodSize {
                number: 3,
                seated: 1
            }]
        );
    }

    #[test]
    fn reads_a_hand_arranged_single_seat_at_a_duel_as_a_bye() {
        let snap = snapshot(PairingKind::Swiss, 2, field(3));
        let tables = vec![
            vec![Uuid::from_u128(1), Uuid::from_u128(2)],
            vec![Uuid::from_u128(3)],
        ];
        let pairing = validate_manual(&snap, &tables).expect("valid");

        assert_eq!(pairing.tables.len(), 2);
        assert!(pairing.tables[1].is_bye);
        assert_eq!(pairing.tables[1].seats, vec![Uuid::from_u128(3)]);
    }
}
