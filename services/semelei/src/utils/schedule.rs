//! Pickup dates and the order deadline — the single source of truth
//!
//! Dates come from the recurring rule in [`ShopSettings`]; a [`PickupDay`] row
//! exists only for dates somebody touched (first order, admin change) and
//! overrides the rule for that one date.
//!
//! Everything here works in `Europe/Berlin`. The shop's opening hours are wall
//! clock times, so "Friday 16:00" has to stay 16:00 across the DST switch —
//! computing in UTC would silently shift the deadline by an hour twice a year.

use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use time::Date;
use time::Duration;
use time::OffsetDateTime;
use time::PrimitiveDateTime;
use time::Weekday;
use time_tz::OffsetDateTimeExt;
use time_tz::PrimitiveDateTimeExt;
use time_tz::Tz;
use time_tz::timezones;
use tracing::instrument;

use crate::models::PickupDay;
use crate::models::PickupDayOverride;
use crate::models::PickupDayUuid;
use crate::models::ShopSettings;

/// How many upcoming pickup days the admin view resolves
pub const UPCOMING_DAYS: usize = 8;

/// The shop's timezone
pub fn timezone() -> &'static Tz {
    timezones::db::europe::BERLIN
}

/// The current point in time, as an offset in the shop's timezone
///
/// Comparisons against a deadline work in any offset; this only exists so
/// logged and rendered timestamps read like the shop's clock.
pub fn now() -> OffsetDateTime {
    OffsetDateTime::now_utc().to_timezone(timezone())
}

/// A pickup date with the rule and any admin override already applied
#[derive(Debug, Clone)]
pub struct ResolvedPickupDay {
    /// Primary key of the stored row, if the day was ever touched
    pub uuid: Option<PickupDayUuid>,

    /// The date the recurring rule produced — the identity of this day
    pub rule_date: Date,

    /// The date orders are actually picked up on
    pub pickup_date: Date,

    /// The point in time orders close
    pub deadline_at: OffsetDateTime,

    /// Whether the pickup day was called off
    pub closed: bool,

    /// When the day was frozen, if it already was
    pub locked_at: Option<OffsetDateTime>,
}

impl ResolvedPickupDay {
    /// Whether the day is frozen: explicitly locked or past its deadline
    ///
    /// Derived rather than stored, so a service that was down over the
    /// deadline still refuses orders the moment it comes back.
    pub fn is_locked(&self, now: OffsetDateTime) -> bool {
        self.locked_at.is_some() || now >= self.deadline_at
    }

    /// Whether customers may still place or cancel orders for this day
    pub fn is_open(&self, now: OffsetDateTime) -> bool {
        !self.closed && !self.is_locked(now)
    }

    /// The override values of this day, for storing it
    pub fn as_override(&self) -> PickupDayOverride {
        PickupDayOverride {
            pickup_date: self.pickup_date,
            deadline_at: self.deadline_at,
            closed: self.closed,
        }
    }
}

/// The next `count` dates the rule produces, starting at `from` (inclusive)
pub fn rule_dates(settings: &ShopSettings, from: Date, count: usize) -> Vec<Date> {
    let weekday = Weekday::from(settings.pickup_weekday);
    let mut date = if from.weekday() == weekday {
        from
    } else {
        from.next_occurrence(weekday)
    };

    let mut dates = Vec::with_capacity(count);
    for _ in 0..count {
        dates.push(date);
        date += Duration::days(7);
    }
    dates
}

/// The deadline the rule puts on a pickup date
///
/// Falls back to the UTC interpretation if the wall clock time does not exist
/// in the local timezone (the hour skipped by the spring DST switch) — an
/// impossible deadline must not take the shop offline.
pub fn deadline_from_rule(settings: &ShopSettings, pickup_date: Date) -> OffsetDateTime {
    let date = pickup_date - Duration::days(i64::from(settings.deadline_offset_days));
    PrimitiveDateTime::new(date, settings.deadline_time)
        .assume_timezone(timezone())
        .take_first()
        .unwrap_or_else(|| PrimitiveDateTime::new(date, settings.deadline_time).assume_utc())
}

/// Resolve the upcoming pickup days: rule dates with their overrides applied
///
/// Days whose deadline already passed are dropped — they are history, and the
/// staff views query them by date instead.
#[instrument(name = "schedule::upcoming", skip(tx))]
pub async fn upcoming(
    tx: &mut Transaction,
    now: OffsetDateTime,
    count: usize,
) -> Result<Vec<ResolvedPickupDay>, rorm::Error> {
    let settings = ShopSettings::get(&mut *tx).await?;
    // A rule date can be moved forward, so look a week back to still catch a
    // day that was pushed into the future.
    let stored = PickupDay::get_from(&mut *tx, now.date() - Duration::days(7)).await?;

    // One more than asked for: closed days are dropped below and would
    // otherwise shorten the list.
    let dates = rule_dates(&settings, now.date() - Duration::days(7), count + 2);

    let mut resolved = Vec::new();
    for rule_date in dates {
        let day = match stored.iter().find(|day| day.rule_date == rule_date) {
            Some(day) => ResolvedPickupDay {
                uuid: Some(day.uuid),
                rule_date: day.rule_date,
                pickup_date: day.pickup_date,
                deadline_at: day.deadline_at,
                closed: day.closed,
                locked_at: day.locked_at,
            },
            None => ResolvedPickupDay {
                uuid: None,
                rule_date,
                pickup_date: rule_date,
                deadline_at: deadline_from_rule(&settings, rule_date),
                closed: false,
                locked_at: None,
            },
        };

        // Past days are not upcoming — but a day whose deadline passed while
        // its pickup date is still ahead stays visible, that is exactly the
        // frozen state the staff works in.
        if day.pickup_date < now.date() {
            continue;
        }
        resolved.push(day);
    }

    resolved.sort_by_key(|day| day.pickup_date);
    resolved.truncate(count);
    Ok(resolved)
}

/// The pickup day customers can currently order for
///
/// The first upcoming day that is neither called off nor frozen.
#[instrument(name = "schedule::current", skip(tx))]
pub async fn current(
    tx: &mut Transaction,
    now: OffsetDateTime,
) -> Result<Option<ResolvedPickupDay>, rorm::Error> {
    let days = upcoming(tx, now, UPCOMING_DAYS).await?;
    Ok(days.into_iter().find(|day| day.is_open(now)))
}

/// Store a resolved day if it is not stored yet
///
/// Called from every write path (an order, an admin change) so the rest of the
/// system can rely on a row existing.
#[instrument(name = "schedule::materialize", skip(tx))]
pub async fn materialize(
    tx: &mut Transaction,
    day: &ResolvedPickupDay,
) -> Result<PickupDay, rorm::Error> {
    PickupDay::get_or_create(tx, day.rule_date, day.as_override()).await
}

#[cfg(test)]
mod test {
    use time::Date;
    use time::Month;
    use time::OffsetDateTime;
    use time::Time;
    use time::UtcOffset;

    use super::*;
    use crate::models::ScheduleWeekday;

    /// A date, spelled out
    fn date(year: i32, month: Month, day: u8) -> Date {
        Date::from_calendar_date(year, month, day).expect("test date is valid")
    }

    /// A point in time in the shop's timezone
    fn local(year: i32, month: Month, day: u8, hour: u8, minute: u8) -> OffsetDateTime {
        let naive = PrimitiveDateTime::new(
            date(year, month, day),
            Time::from_hms(hour, minute, 0).expect("test time is valid"),
        );
        naive
            .assume_timezone(timezone())
            .take_first()
            .expect("test time exists in Europe/Berlin")
    }

    /// The default rule: pickup Saturday, orders close Friday 16:00
    fn settings() -> ShopSettings {
        ShopSettings::default()
    }

    #[test]
    fn rule_dates_start_on_the_pickup_weekday() {
        // Wednesday 2026-08-12 -> the next Saturdays
        let dates = rule_dates(&settings(), date(2026, Month::August, 12), 3);
        assert_eq!(
            dates,
            vec![
                date(2026, Month::August, 15),
                date(2026, Month::August, 22),
                date(2026, Month::August, 29),
            ]
        );
    }

    #[test]
    fn rule_dates_include_the_pickup_day_itself() {
        // Saturday stays Saturday — dropping it is the deadline's job
        let dates = rule_dates(&settings(), date(2026, Month::August, 15), 1);
        assert_eq!(dates, vec![date(2026, Month::August, 15)]);
    }

    #[test]
    fn deadline_is_the_local_friday_afternoon() {
        let deadline = deadline_from_rule(&settings(), date(2026, Month::August, 15));
        assert_eq!(deadline, local(2026, Month::August, 14, 16, 0));
        // Summer time: 16:00 local is 14:00 UTC
        assert_eq!(deadline.to_offset(UtcOffset::UTC).hour(), 14);
    }

    #[test]
    fn deadline_keeps_wall_clock_time_in_winter() {
        // Same rule in January: 16:00 local is 15:00 UTC
        let deadline = deadline_from_rule(&settings(), date(2027, Month::January, 16));
        assert_eq!(deadline, local(2027, Month::January, 15, 16, 0));
        assert_eq!(deadline.to_offset(UtcOffset::UTC).hour(), 15);
    }

    #[test]
    fn locked_flips_exactly_at_the_deadline() {
        let day = resolved(date(2026, Month::August, 15));
        assert!(!day.is_locked(local(2026, Month::August, 14, 15, 59)));
        assert!(day.is_locked(local(2026, Month::August, 14, 16, 0)));
        assert!(day.is_locked(local(2026, Month::August, 14, 16, 1)));
    }

    #[test]
    fn saturday_after_midnight_belongs_to_the_frozen_day() {
        // The bug this replaces: 00:30 local is still Friday in UTC, so the
        // old code offered the Saturday that starts in a few hours.
        let day = resolved(date(2026, Month::August, 15));
        assert!(day.is_locked(local(2026, Month::August, 15, 0, 30)));
    }

    #[test]
    fn closed_days_are_never_open() {
        let mut day = resolved(date(2026, Month::August, 15));
        day.closed = true;
        assert!(!day.is_open(local(2026, Month::August, 10, 12, 0)));
    }

    #[test]
    fn an_early_lock_closes_orders_before_the_deadline() {
        let mut day = resolved(date(2026, Month::August, 15));
        day.locked_at = Some(local(2026, Month::August, 12, 9, 0));
        assert!(!day.is_open(local(2026, Month::August, 12, 10, 0)));
    }

    #[test]
    fn a_shifted_weekday_moves_the_whole_rule() {
        let settings = ShopSettings {
            pickup_weekday: ScheduleWeekday::Wednesday,
            deadline_offset_days: 2,
            deadline_time: Time::from_hms(12, 0, 0).expect("test time is valid"),
            ..ShopSettings::default()
        };
        let dates = rule_dates(&settings, date(2026, Month::August, 12), 2);
        assert_eq!(
            dates,
            vec![date(2026, Month::August, 12), date(2026, Month::August, 19),]
        );
        // Two days before Wednesday, at noon
        assert_eq!(
            deadline_from_rule(&settings, date(2026, Month::August, 19)),
            local(2026, Month::August, 17, 12, 0)
        );
    }

    /// A resolved day straight from the default rule
    fn resolved(pickup_date: Date) -> ResolvedPickupDay {
        ResolvedPickupDay {
            uuid: None,
            rule_date: pickup_date,
            pickup_date,
            deadline_at: deadline_from_rule(&settings(), pickup_date),
            closed: false,
            locked_at: None,
        }
    }
}
