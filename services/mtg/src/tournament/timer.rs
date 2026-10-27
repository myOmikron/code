//! The round timer: when time is up, read against the `now` the caller passes in

use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;

/// The timer of a Round that started with a round timer length
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct RoundTimer {
    /// How long the Round runs, in seconds
    pub length_seconds: u32,
    /// When time is up, or would be once a paused timer runs again for as long as it was paused
    pub ends_at: OffsetDateTime,
    /// When an Organizer paused it, `None` while it runs
    pub paused_at: Option<OffsetDateTime>,
}

/// What an Organizer does to a running Round's timer
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum TimerAction {
    /// Stop it where it stands
    Pause,
    /// Let it run again from where it was paused
    Resume,
    /// Add to or take from the time left, never below none; after time up, added time counts from now
    Adjust {
        /// Seconds to add; negative takes away
        delta_seconds: i32,
    },
    /// Run it again from its full length, starting now
    Reset,
}

impl RoundTimer {
    /// The timer of a Round of `length_minutes` starting at `now`
    pub fn start(length_minutes: u16, now: OffsetDateTime) -> Self {
        let length_seconds = u32::from(length_minutes) * 60;
        Self {
            length_seconds,
            ends_at: now + Duration::seconds(i64::from(length_seconds)),
            paused_at: None,
        }
    }

    /// Whether an Organizer paused it
    pub fn paused(&self) -> bool {
        self.paused_at.is_some()
    }

    /// Seconds left at `now`, a started second counting as a whole one; 0 exactly once time is up
    ///
    /// A paused timer reads what it had left when it was paused.
    pub fn remaining_seconds(&self, now: OffsetDateTime) -> u32 {
        let left = (self.ends_at - self.reading_at(now))
            .whole_milliseconds()
            .max(0);
        u32::try_from((left + 999) / 1000).unwrap_or(u32::MAX)
    }

    /// Whether time is up at `now`; a paused timer only if time was up when it was paused
    pub fn time_up(&self, now: OffsetDateTime) -> bool {
        self.ends_at <= self.reading_at(now)
    }

    /// The timer after `action` at `now`; an action that does not apply leaves it as it is
    pub fn apply(self, action: TimerAction, now: OffsetDateTime) -> Self {
        match action {
            TimerAction::Pause => Self {
                paused_at: Some(self.paused_at.unwrap_or(now)),
                ..self
            },
            TimerAction::Resume => match self.paused_at {
                Some(paused_at) => Self {
                    ends_at: self.ends_at + (now - paused_at),
                    paused_at: None,
                    ..self
                },
                None => self,
            },
            TimerAction::Adjust { delta_seconds } => {
                let reading_at = self.reading_at(now);
                let ends_at =
                    self.ends_at.max(reading_at) + Duration::seconds(i64::from(delta_seconds));
                Self {
                    ends_at: ends_at.max(reading_at),
                    ..self
                }
            }
            TimerAction::Reset => Self {
                ends_at: now + Duration::seconds(i64::from(self.length_seconds)),
                paused_at: None,
                ..self
            },
        }
    }

    /// The moment the timer is read at: when it was paused, else `now`
    fn reading_at(&self, now: OffsetDateTime) -> OffsetDateTime {
        self.paused_at.unwrap_or(now)
    }
}

#[cfg(test)]
mod tests {
    use galvyn::core::re_exports::time::Duration;
    use galvyn::core::re_exports::time::OffsetDateTime;

    use super::RoundTimer;
    use super::TimerAction;

    fn t0() -> OffsetDateTime {
        OffsetDateTime::from_unix_timestamp(1_700_000_000).expect("a valid timestamp")
    }

    fn after(seconds: i64) -> OffsetDateTime {
        t0() + Duration::seconds(seconds)
    }

    fn adjust(delta_seconds: i32) -> TimerAction {
        TimerAction::Adjust { delta_seconds }
    }

    #[test]
    fn a_fifty_minute_round_ends_fifty_minutes_after_its_start() {
        let timer = RoundTimer::start(50, t0());
        assert_eq!(timer.length_seconds, 3000);
        assert_eq!(timer.ends_at, after(3000));
        assert!(!timer.paused());
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

    #[test]
    fn a_paused_timer_does_not_run_down() {
        let paused = RoundTimer::start(50, t0()).apply(TimerAction::Pause, after(1000));
        assert!(paused.paused());
        assert_eq!(paused.remaining_seconds(after(9999)), 2000);
        assert!(!paused.time_up(after(9999)));
    }

    #[test]
    fn pausing_twice_keeps_the_first_pause() {
        let paused = RoundTimer::start(50, t0()).apply(TimerAction::Pause, after(1000));
        let again = paused.apply(TimerAction::Pause, after(1500));
        assert_eq!(again, paused);
    }

    #[test]
    fn resuming_gives_back_exactly_what_was_left() {
        let paused = RoundTimer::start(50, t0()).apply(TimerAction::Pause, after(1000));
        let resumed = paused.apply(TimerAction::Resume, after(1600));
        assert!(!resumed.paused());
        assert_eq!(resumed.ends_at, after(3600));
        assert_eq!(resumed.remaining_seconds(after(1600)), 2000);
    }

    #[test]
    fn resuming_a_running_timer_changes_nothing() {
        let running = RoundTimer::start(50, t0());
        assert_eq!(running.apply(TimerAction::Resume, after(10)), running);
    }

    #[test]
    fn a_timer_paused_after_time_up_stays_up() {
        let paused = RoundTimer::start(1, t0()).apply(TimerAction::Pause, after(90));
        assert!(paused.time_up(after(100)));
        assert_eq!(paused.remaining_seconds(after(100)), 0);
    }

    #[test]
    fn adjusting_adds_and_takes_away_time() {
        let running = RoundTimer::start(50, t0());
        assert_eq!(
            running
                .apply(adjust(300), after(100))
                .remaining_seconds(after(100)),
            3200
        );
        assert_eq!(
            running
                .apply(adjust(-60), after(100))
                .remaining_seconds(after(100)),
            2840
        );
    }

    #[test]
    fn adjusting_a_paused_timer_moves_what_it_has_left() {
        let paused = RoundTimer::start(50, t0()).apply(TimerAction::Pause, after(1000));
        let longer = paused.apply(adjust(300), after(5000));
        assert!(longer.paused());
        assert_eq!(longer.remaining_seconds(after(6000)), 2300);
    }

    #[test]
    fn taking_away_more_than_is_left_stops_at_time_up() {
        let running = RoundTimer::start(10, t0());
        let gone = running.apply(adjust(-9000), after(100));
        assert_eq!(gone.ends_at, after(100));
        assert!(gone.time_up(after(100)));
        assert_eq!(gone.remaining_seconds(after(100)), 0);
    }

    #[test]
    fn time_added_after_time_up_counts_from_now() {
        let running = RoundTimer::start(10, t0());
        let gone = running.apply(adjust(-9000), after(100));
        let more = gone.apply(adjust(60), after(200));
        assert_eq!(more.remaining_seconds(after(200)), 60);
    }

    #[test]
    fn taking_away_from_a_paused_timer_stops_at_none_left() {
        let paused = RoundTimer::start(10, t0()).apply(TimerAction::Pause, after(100));
        let gone = paused.apply(adjust(-9000), after(200));
        assert_eq!(gone.remaining_seconds(after(300)), 0);
        assert!(gone.time_up(after(300)));
        let resumed = gone.apply(TimerAction::Resume, after(400));
        assert_eq!(resumed.remaining_seconds(after(400)), 0);
    }

    #[test]
    fn resetting_runs_the_full_length_again_from_now() {
        let paused = RoundTimer::start(50, t0()).apply(TimerAction::Pause, after(1000));
        let reset = paused.apply(TimerAction::Reset, after(2000));
        assert!(!reset.paused());
        assert_eq!(reset.length_seconds, 3000);
        assert_eq!(reset.ends_at, after(5000));
        assert_eq!(reset.remaining_seconds(after(2000)), 3000);
    }
}
