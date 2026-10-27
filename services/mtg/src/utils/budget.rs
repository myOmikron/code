//! In-process budgets for requests a handler counts, keyed on whoever or
//! whatever they spend: an Account naming usernames, a Tournament taking Guests
//!
//! Like [`service_bootstrap::http::rate_limit::RateLimitLayer`] a budget is a
//! fixed window held in memory and lost on restart, but keyed on what the
//! handler names and counting only what the handler says counts.

use std::collections::HashMap;
use std::hash::Hash;
use std::sync::Mutex;
use std::time::Duration;
use std::time::Instant;

/// Above this many tracked keys, expired windows are swept out of the map
const SWEEP_THRESHOLD: usize = 10_000;

/// When a key's window started and how much of the budget it used in it
#[derive(Debug, Clone, Copy)]
struct Window {
    start: Instant,
    used: u32,
}

/// How often something may happen per window for each key `K`
#[derive(Debug)]
pub struct Budget<K> {
    max: u32,
    window: Duration,
    state: Mutex<HashMap<K, Window>>,
}

impl<K: Hash + Eq> Budget<K> {
    /// A budget of `max` per `window` per key
    pub fn new(max: u32, window: Duration) -> Self {
        Self {
            max,
            window,
            state: Mutex::new(HashMap::new()),
        }
    }

    /// Whether `key` used up its budget
    pub fn exhausted(&self, key: K) -> bool {
        let now = Instant::now();
        let state = self
            .state
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        state.get(&key).is_some_and(|window| {
            now.duration_since(window.start) < self.window && window.used >= self.max
        })
    }

    /// Counts one use against `key`'s budget
    pub fn record(&self, key: K) {
        self.count(key, false);
    }

    /// Counts one use against `key`'s budget, unless it is used up
    ///
    /// Returns whether the use was granted.
    pub fn take(&self, key: K) -> bool {
        self.count(key, true)
    }

    /// Counts one use, refusing it on a used up budget when `bounded`
    fn count(&self, key: K, bounded: bool) -> bool {
        let now = Instant::now();
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        if state.len() > SWEEP_THRESHOLD {
            state.retain(|_, window| now.duration_since(window.start) < self.window);
        }
        let window = state.entry(key).or_insert(Window {
            start: now,
            used: 0,
        });
        if now.duration_since(window.start) >= self.window {
            *window = Window {
                start: now,
                used: 0,
            };
        }
        if bounded && window.used >= self.max {
            return false;
        }
        window.used += 1;
        true
    }
}
