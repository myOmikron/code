//! Determines should a message be retried and how long to wait before retrying.

use std::time::Duration;

use o2o::o2o;
use rand::Rng;
use time::OffsetDateTime;

use crate::nats::listener::OwnedInfo;

/// Determines should a message be retried and how long to wait before retrying.
///
/// This means it is effectively a closure `Fn(RetryContext) -> RetryResult`.
///
/// You can specify are `RetryStrategy` for your nats route by using [`SubjectRouter::add_subject_with_config`]
/// instead of [`SubjectRouter::add_subject`].
///
/// Feel free to **add your own** `RetryStrategy` if you none match your needs or **propose a new default**.
///
/// [`SubjectRouter::add_subject_with_config`]: crate::nats::listener::SubjectRouter::add_subject_with_config
/// [`SubjectRouter::add_subject`]: crate::nats::listener::SubjectRouter::add_subject
#[derive(Debug)]
pub enum RetryStrategy {
    /// Retry up to `max_attempts` times, with a linear backoff:
    ///
    /// `wait = base + increment * delivered`
    LinearBackoff {
        /// The base wait time before the first retry.
        base: Duration,

        /// Linear increase in wait time for each additional attempt.
        increment: Duration,

        /// The maximum number of attempts to make before pushing to dlq.
        max_attempts: u32,
    },
    /// Retry up to `max_attempts` times, with a constant `wait` duration
    Constant {
        /// Time to wait between attempts
        wait: Duration,

        /// The maximum number of attempts to make before pushing to dlq.
        max_attempts: u32,
    },
    /// Retry with a constant wait, but send to DLQ once the message has been in the system
    /// for longer than `duration` since it was first published.
    ConstantWithDuration {
        /// Time to wait between attempts.
        wait: Duration,
        /// Maximum age (from publish time) before pushing to DLQ.
        max_age: Duration,
    },
    /// Retry a specific number of times with a specified intervals
    ///
    /// The hardcoded backoff strategy defines the interval size and retry limits
    /// by the `steps`. If `Some`, the jitter option will introduce
    /// up to `-jitter..jitter` additional delay, but not less than zero.
    Hardcoded {
        /// Multiple retries with the specified waiting times (number of steps equals number of retries)
        steps: Vec<Duration>,
        /// Optional additional randomness added to the waiting time
        jitter: Option<Duration>,
    },
}

impl RetryStrategy {
    /// Evaluates the `RetryStrategy` for a specific `ctx` (i.e. a concrete message)
    pub fn evaluate(&self, ctx: RetryContext) -> RetryResult {
        match self {
            RetryStrategy::LinearBackoff {
                base,
                increment,
                max_attempts,
            } => {
                if ctx.delivered > i64::from(*max_attempts) {
                    RetryResult::Dlq
                } else {
                    RetryResult::RetryIn(*base + *increment * u32::try_from(ctx.delivered).unwrap())
                }
            }
            RetryStrategy::Constant { wait, max_attempts } => {
                if ctx.delivered > i64::from(*max_attempts) {
                    RetryResult::Dlq
                } else {
                    RetryResult::RetryIn(*wait)
                }
            }
            RetryStrategy::ConstantWithDuration { wait, max_age } => {
                let age = OffsetDateTime::now_utc() - ctx.published;
                if age > *max_age {
                    RetryResult::Dlq
                } else {
                    RetryResult::RetryIn(*wait)
                }
            }
            RetryStrategy::Hardcoded { steps, jitter } => {
                if let Some(retry_in) = steps.get((ctx.delivered - 1).max(0) as usize) {
                    let offset = if let Some(jitter) = jitter {
                        let millis = jitter.as_millis() as i64;
                        rand::thread_rng().gen_range(-millis..=millis)
                    } else {
                        0
                    };
                    let result = retry_in.as_millis() as i64 + offset;
                    RetryResult::RetryIn(Duration::from_millis(result.max(0) as u64))
                } else {
                    RetryResult::Dlq
                }
            }
        }
    }
}

/// Parts of a message a [`RetryStrategy`] gets access to
#[derive(Debug, o2o)]
#[from_ref(OwnedInfo)]
pub struct RetryContext {
    /// The number of delivery attempts for this message
    pub delivered: i64,

    /// the time that this message was received by the server from its publisher
    pub published: OffsetDateTime,
}

/// Output of a [`RetryStrategy`]
pub enum RetryResult {
    /// The message should be retried
    RetryIn(Duration),

    /// The message should not be retried
    Dlq,
}

impl Default for RetryStrategy {
    fn default() -> Self {
        Self::Hardcoded {
            steps: vec![
                Duration::from_secs(2),
                Duration::from_secs(4),
                Duration::from_secs(8),
                Duration::from_secs(16),
                Duration::from_secs(32),
            ],
            jitter: Some(Duration::from_millis(500)),
        }
    }
}
