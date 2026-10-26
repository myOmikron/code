//! The round timer: when time is up, read against the `now` the caller passes in

use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;

/// The timer of a Round that started with a round timer length
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct RoundTimer {
    /// How long the Round runs, in seconds
    pub length_seconds: u32,
    /// When time is up
    pub ends_at: OffsetDateTime,
}

impl RoundTimer {
    /// The timer of a Round of `length_minutes` starting at `now`
    pub fn start(length_minutes: u16, now: OffsetDateTime) -> Self {
        let length_seconds = u32::from(length_minutes) * 60;
        Self {
            length_seconds,
            ends_at: now + Duration::seconds(i64::from(length_seconds)),
        }
    }

    /// Seconds left at `now`, a started second counting as a whole one; 0 exactly once time is up
    pub fn remaining_seconds(&self, now: OffsetDateTime) -> u32 {
        let left = (self.ends_at - now).whole_milliseconds().max(0);
        u32::try_from((left + 999) / 1000).unwrap_or(u32::MAX)
    }

    /// Whether time is up at `now`
    pub fn time_up(&self, now: OffsetDateTime) -> bool {
        self.ends_at <= now
    }
}

#[cfg(test)]
mod tests {
    use galvyn::core::re_exports::time::Duration;
    use galvyn::core::re_exports::time::OffsetDateTime;

    use super::RoundTimer;

    fn t0() -> OffsetDateTime {
        OffsetDateTime::from_unix_timestamp(1_700_000_000).expect("a valid timestamp")
    }

    fn after(seconds: i64) -> OffsetDateTime {
        t0() + Duration::seconds(seconds)
    }

    #[test]
    fn a_fifty_minute_round_ends_fifty_minutes_after_its_start() {
        let timer = RoundTimer::start(50, t0());
        assert_eq!(timer.length_seconds, 3000);
        assert_eq!(timer.ends_at, after(3000));
    }

    #[test]
    fn the_time_left_counts_down_from_the_full_length() {
        let timer = RoundTimer::start(50, t0());
        assert_eq!(timer.remaining_seconds(t0()), 3000);
        assert_eq!(timer.remaining_seconds(after(500)), 2500);
        assert!(!timer.time_up(after(2999)));
    }

    #[test]
    fn time_is_up_at_the_end_and_the_time_left_stays_at_zero() {
        let timer = RoundTimer::start(50, t0());
        assert!(timer.time_up(after(3000)));
        assert_eq!(timer.remaining_seconds(after(3000)), 0);
        assert!(timer.time_up(after(9000)));
        assert_eq!(timer.remaining_seconds(after(9000)), 0);
    }

    #[test]
    fn half_a_second_left_reads_as_one_second_until_time_is_up() {
        let timer = RoundTimer::start(1, t0());
        let almost = after(59) + Duration::milliseconds(500);
        assert_eq!(timer.remaining_seconds(almost), 1);
        assert!(!timer.time_up(almost));
    }
}
