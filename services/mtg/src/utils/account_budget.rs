//! In-process per-Account budgets for requests that reveal which usernames exist
//!
//! Like [`service_bootstrap::http::rate_limit::RateLimitLayer`] a budget is a
//! fixed window held in memory and lost on restart, but keyed on the Account
//! and counting only what the handler says counts.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use std::time::Instant;

use crate::models::account::AccountUuid;

/// Above this many tracked Accounts, expired windows are swept out of the map
const SWEEP_THRESHOLD: usize = 10_000;

/// When an Account's window started and how much of the budget it used in it
#[derive(Debug, Clone, Copy)]
struct Window {
    start: Instant,
    used: u32,
}

/// How often each Account may do something per window
#[derive(Debug)]
pub struct AccountBudget {
    max: u32,
    window: Duration,
    state: Mutex<HashMap<AccountUuid, Window>>,
}

impl AccountBudget {
    /// A budget of `max` per `window` per Account
    pub fn new(max: u32, window: Duration) -> Self {
        Self {
            max,
            window,
            state: Mutex::new(HashMap::new()),
        }
    }

    /// Whether `account` used up its budget
    pub fn exhausted(&self, account: AccountUuid) -> bool {
        let now = Instant::now();
        let state = self
            .state
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        state.get(&account).is_some_and(|window| {
            now.duration_since(window.start) < self.window && window.used >= self.max
        })
    }

    /// Counts one use against `account`'s budget
    pub fn record(&self, account: AccountUuid) {
        self.count(account, false);
    }

    /// Counts one use against `account`'s budget, unless it is used up
    ///
    /// Returns whether the use was granted.
    pub fn take(&self, account: AccountUuid) -> bool {
        self.count(account, true)
    }

    /// Counts one use, refusing it on a used up budget when `bounded`
    fn count(&self, account: AccountUuid, bounded: bool) -> bool {
        let now = Instant::now();
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        if state.len() > SWEEP_THRESHOLD {
            state.retain(|_, window| now.duration_since(window.start) < self.window);
        }
        let window = state.entry(account).or_insert(Window {
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
