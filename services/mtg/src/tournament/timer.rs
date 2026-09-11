//! The round clock
//!
//! Three columns and no background job. An expired clock has no side effect —
//! the round stays open until the desk closes it, because "time is up" is an
//! announcement a human makes, not a state change software is entitled to.
//!
//! Every function takes `now` rather than reading it, which is what makes the
//! whole thing testable and what keeps this module inside its parent's rule
//! against clocks. The server is the only authority on the time: a phone with
//! a wrong clock is the normal case, not the exception, so responses carry
//! both the deadline and the server's own reading of now.

use galvyn::core::re_exports::time::OffsetDateTime;

/// What the desk just did to the clock
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum TimerAction {
    /// Start it running from its full length
    Start,
    /// Stop it where it stands
    Pause,
    /// Let it run again from where it was paused
    Resume,
    /// Add to or take from the time left
    Adjust {
        /// Seconds to add; negative takes away
        delta_seconds: i32,
    },
    /// Take a new length and go back to not started
    Reset {
        /// The new length, in seconds
        length_seconds: i32,
    },
}

/// The three columns a round carries for its clock
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct Timer {
    /// How long the round runs for, in seconds
    pub length_seconds: i32,
    /// When the clock runs out, `None` while it has never been started
    pub ends_at: Option<OffsetDateTime>,
    /// When it was paused, `None` while running or idle
    pub paused_at: Option<OffsetDateTime>,
}

/// Where a clock stands, as a reader sees it
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum TimerState {
    /// Never started
    Idle,
    /// Counting down
    Running,
    /// Stopped, with time left on it
    Paused,
    /// Started and run out
    Expired,
}

/// Read a clock's state
///
/// @param timer the round's three columns
/// @param now the server's own reading of the time
///
/// @returns where the clock stands
pub fn state(timer: &Timer, now: OffsetDateTime) -> TimerState {
    let Some(ends_at) = timer.ends_at else {
        return TimerState::Idle;
    };
    if timer.paused_at.is_some() {
        return TimerState::Paused;
    }
    if ends_at <= now {
        TimerState::Expired
    } else {
        TimerState::Running
    }
}

/// How many seconds are left, never below zero
///
/// A paused clock holds whatever it had when it stopped; an idle one reads as
/// its full length, which is what the desk sees before pressing start.
///
/// @param timer the round's three columns
/// @param now the server's own reading of the time
///
/// @returns the seconds left
pub fn remaining_seconds(timer: &Timer, now: OffsetDateTime) -> i32 {
    let Some(ends_at) = timer.ends_at else {
        return timer.length_seconds.max(0);
    };
    let reference = timer.paused_at.unwrap_or(now);
    let left = (ends_at - reference).whole_seconds();
    i32::try_from(left).unwrap_or(i32::MAX).max(0)
}

/// Apply what the desk did
///
/// Total by design: resuming a running clock, pausing a paused one and
/// starting one that already runs all answer the clock unchanged. A judge
/// under pressure double-taps, and a second tap that undoes the first would be
/// worse than one that does nothing.
///
/// @param timer the round's three columns
/// @param action what the desk did
/// @param now the server's own reading of the time
///
/// @returns the columns to write back
pub fn apply(timer: &Timer, action: TimerAction, now: OffsetDateTime) -> Timer {
    match action {
        TimerAction::Start => {
            if timer.ends_at.is_some() {
                return *timer;
            }
            Timer {
                length_seconds: timer.length_seconds,
                ends_at: Some(now + time_span(timer.length_seconds)),
                paused_at: None,
            }
        }
        TimerAction::Pause => {
            if timer.ends_at.is_none() || timer.paused_at.is_some() {
                return *timer;
            }
            Timer {
                paused_at: Some(now),
                ..*timer
            }
        }
        TimerAction::Resume => {
            let (Some(ends_at), Some(paused_at)) = (timer.ends_at, timer.paused_at) else {
                return *timer;
            };
            Timer {
                length_seconds: timer.length_seconds,
                // Push the deadline out by exactly as long as the clock stood
                // still, so a pause never costs or gives anybody time.
                ends_at: Some(ends_at + (now - paused_at)),
                paused_at: None,
            }
        }
        TimerAction::Adjust { delta_seconds } => {
            let Some(ends_at) = timer.ends_at else {
                return *timer;
            };
            Timer {
                ends_at: Some(ends_at + time_span(delta_seconds)),
                ..*timer
            }
        }
        TimerAction::Reset { length_seconds } => Timer {
            length_seconds: length_seconds.max(0),
            ends_at: None,
            paused_at: None,
        },
    }
}

/// Seconds as a duration, for the arithmetic above
///
/// @param seconds how many seconds
///
/// @returns the duration
fn time_span(seconds: i32) -> galvyn::core::re_exports::time::Duration {
    galvyn::core::re_exports::time::Duration::seconds(i64::from(seconds))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A clock of `length` seconds that has never been started
    ///
    /// @param length how long the round runs for
    ///
    /// @returns the idle clock
    fn idle(length: i32) -> Timer {
        Timer {
            length_seconds: length,
            ends_at: None,
            paused_at: None,
        }
    }

    /// A fixed point in time to measure everything against
    ///
    /// @returns the reference instant
    fn t0() -> OffsetDateTime {
        OffsetDateTime::from_unix_timestamp(1_700_000_000).expect("a valid timestamp")
    }

    #[test]
    fn an_idle_clock_has_its_full_length_remaining() {
        let timer = idle(3000);
        assert_eq!(state(&timer, t0()), TimerState::Idle);
        assert_eq!(remaining_seconds(&timer, t0()), 3000);
    }

    #[test]
    fn starting_ends_at_now_plus_the_length() {
        let timer = apply(&idle(3000), TimerAction::Start, t0());
        assert_eq!(timer.ends_at, Some(t0() + time_span(3000)));
        assert_eq!(state(&timer, t0()), TimerState::Running);
        assert_eq!(remaining_seconds(&timer, t0() + time_span(500)), 2500);
    }

    #[test]
    fn starting_a_running_clock_changes_nothing() {
        let running = apply(&idle(3000), TimerAction::Start, t0());
        let again = apply(&running, TimerAction::Start, t0() + time_span(60));
        assert_eq!(again, running);
    }

    #[test]
    fn pausing_twice_keeps_the_same_remaining_time() {
        let running = apply(&idle(3000), TimerAction::Start, t0());
        let paused = apply(&running, TimerAction::Pause, t0() + time_span(1000));
        let again = apply(&paused, TimerAction::Pause, t0() + time_span(1500));
        assert_eq!(again, paused);
        assert_eq!(remaining_seconds(&again, t0() + time_span(2000)), 2000);
    }

    #[test]
    fn a_paused_clock_does_not_run_down() {
        let running = apply(&idle(3000), TimerAction::Start, t0());
        let paused = apply(&running, TimerAction::Pause, t0() + time_span(1000));
        assert_eq!(state(&paused, t0() + time_span(9999)), TimerState::Paused);
        assert_eq!(remaining_seconds(&paused, t0() + time_span(9999)), 2000);
    }

    #[test]
    fn resuming_gives_back_exactly_what_was_left() {
        let running = apply(&idle(3000), TimerAction::Start, t0());
        let paused = apply(&running, TimerAction::Pause, t0() + time_span(1000));
        let resumed = apply(&paused, TimerAction::Resume, t0() + time_span(1600));
        assert_eq!(remaining_seconds(&resumed, t0() + time_span(1600)), 2000);
        assert_eq!(state(&resumed, t0() + time_span(1600)), TimerState::Running);
    }

    #[test]
    fn resuming_a_running_clock_changes_nothing() {
        let running = apply(&idle(3000), TimerAction::Start, t0());
        let again = apply(&running, TimerAction::Resume, t0() + time_span(10));
        assert_eq!(again, running);
    }

    #[test]
    fn adjusting_while_paused_moves_the_end() {
        let running = apply(&idle(3000), TimerAction::Start, t0());
        let paused = apply(&running, TimerAction::Pause, t0() + time_span(1000));
        let longer = apply(&paused, TimerAction::Adjust { delta_seconds: 300 }, t0());
        assert_eq!(remaining_seconds(&longer, t0() + time_span(1000)), 2300);
    }

    #[test]
    fn adjusting_below_zero_expires_rather_than_going_negative() {
        let running = apply(&idle(600), TimerAction::Start, t0());
        let gone = apply(
            &running,
            TimerAction::Adjust {
                delta_seconds: -9000,
            },
            t0(),
        );
        assert_eq!(remaining_seconds(&gone, t0()), 0);
        assert_eq!(state(&gone, t0()), TimerState::Expired);
    }

    #[test]
    fn an_expired_clock_reads_as_expired_not_as_running() {
        let running = apply(&idle(600), TimerAction::Start, t0());
        assert_eq!(state(&running, t0() + time_span(601)), TimerState::Expired);
        assert_eq!(remaining_seconds(&running, t0() + time_span(601)), 0);
    }

    #[test]
    fn resetting_clears_the_clock_and_takes_the_new_length() {
        let running = apply(&idle(3000), TimerAction::Start, t0());
        let reset = apply(
            &running,
            TimerAction::Reset {
                length_seconds: 1800,
            },
            t0() + time_span(100),
        );
        assert_eq!(reset.ends_at, None);
        assert_eq!(reset.paused_at, None);
        assert_eq!(state(&reset, t0()), TimerState::Idle);
        assert_eq!(remaining_seconds(&reset, t0()), 1800);
    }

    #[test]
    fn nothing_but_reset_touches_a_clock_that_never_started() {
        let timer = idle(3000);
        assert_eq!(apply(&timer, TimerAction::Pause, t0()), timer);
        assert_eq!(apply(&timer, TimerAction::Resume, t0()), timer);
        assert_eq!(
            apply(&timer, TimerAction::Adjust { delta_seconds: 60 }, t0()),
            timer
        );
    }
}
