//! The engine's only source of chance: a generator rolled from a seed the caller stores

use crate::tournament::record::EntrantId;

/// SplitMix64, kept in-house so pairings stay stable across `rand` upgrades
///
/// The same seed rolls the same numbers forever, so a Round paired from a
/// stored seed can be paired the same way again.
#[derive(Debug, Clone)]
pub struct SplitMix64(u64);

impl SplitMix64 {
    /// Start the generator from `seed`
    pub fn seeded(seed: u64) -> Self {
        Self(seed)
    }

    /// The next value in the stream
    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// A value below `bound`, which must not be zero
    pub fn below(&mut self, bound: usize) -> usize {
        let bound = u64::try_from(bound).unwrap_or(u64::MAX);
        usize::try_from(self.next_u64() % bound).unwrap_or(0)
    }

    /// Put `items` in a random order
    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for index in (1..items.len()).rev() {
            items.swap(index, self.below(index + 1));
        }
    }
}

/// A number standing for `entrant` under `seed`: sorting by it orders Participants at random
///
/// The same for the same seed and Participant, so ties fall the same way on every read.
pub fn draw(seed: u64, entrant: EntrantId) -> u64 {
    let (high, low) = entrant.as_u64_pair();
    let mut rng = SplitMix64::seeded(seed ^ high.rotate_left(17) ^ low);
    rng.next_u64()
}
