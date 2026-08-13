//! Pickup days — the dates orders are collected on

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::prelude::ForeignModel;
use serde::Deserialize;
use serde::Serialize;
use time::Date;
use time::OffsetDateTime;
use tracing::instrument;
use uuid::Uuid;

use crate::models::pickup_day::db::PickupDayInsertPatch;
use crate::models::pickup_day::db::PickupDayModel;

pub(in crate::models) mod db;

/// A pickup date and everything the shop decided about it
#[derive(Debug, Clone)]
pub struct PickupDay {
    /// Primary key
    pub uuid: PickupDayUuid,

    /// The date the recurring rule produced
    pub rule_date: Date,

    /// The date orders are actually picked up on
    pub pickup_date: Date,

    /// The point in time orders close — no new orders, no cancellations
    pub deadline_at: OffsetDateTime,

    /// Whether the pickup day was called off
    pub closed: bool,

    /// When the day was frozen (by the deadline job or an admin)
    pub locked_at: Option<OffsetDateTime>,

    /// When the confirmation mails for this day went out
    pub confirmations_sent_at: Option<OffsetDateTime>,
}

/// Wrapper for the primary key of the [`PickupDay`] model.
/// To have better distinguishable types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, Hash, Eq, PartialEq)]
pub struct PickupDayUuid(Uuid);

impl PickupDayUuid {
    /// Get the underlying UUID type
    pub fn into_inner(self) -> Uuid {
        self.0
    }

    /// Create a new `PickupDayUuid` from a `ForeignModel<PickupDayModel>`
    pub(in crate::models) fn new_from_field(field: ForeignModel<PickupDayModel>) -> Self {
        Self(field.0)
    }
}

/// The parts of a [`PickupDay`] an admin may change
#[derive(Debug, Clone, Copy)]
pub struct PickupDayOverride {
    /// The date orders are actually picked up on
    pub pickup_date: Date,
    /// The point in time orders close
    pub deadline_at: OffsetDateTime,
    /// Whether the pickup day was called off
    pub closed: bool,
}

impl PickupDay {
    /// Whether the day is frozen: explicitly locked or past its deadline
    pub fn is_locked(&self, now: OffsetDateTime) -> bool {
        self.locked_at.is_some() || now >= self.deadline_at
    }

    /// Fetch every stored pickup day, oldest first
    #[instrument(name = "PickupDay::get_all", skip(exe))]
    pub async fn get_all(exe: impl Executor<'_>) -> Result<Vec<PickupDay>, rorm::Error> {
        let mut days: Vec<PickupDay> = rorm::query(exe, PickupDayModel)
            .all()
            .await?
            .into_iter()
            .map(PickupDay::from)
            .collect();
        days.sort_by_key(|day| day.pickup_date);
        Ok(days)
    }

    /// Fetch all stored pickup days from `from` onwards, oldest first
    #[instrument(name = "PickupDay::get_from", skip(exe))]
    pub async fn get_from(
        exe: impl Executor<'_>,
        from: Date,
    ) -> Result<Vec<PickupDay>, rorm::Error> {
        let mut days: Vec<PickupDay> = rorm::query(exe, PickupDayModel)
            .condition(PickupDayModel.rule_date.greater_equals(from))
            .all()
            .await?
            .into_iter()
            .map(PickupDay::from)
            .collect();
        days.sort_by_key(|day| day.rule_date);
        Ok(days)
    }

    /// Fetch a pickup day by its primary key
    #[instrument(name = "PickupDay::get_by_uuid", skip(exe))]
    pub async fn get_by_uuid(
        exe: impl Executor<'_>,
        uuid: PickupDayUuid,
    ) -> Result<Option<PickupDay>, rorm::Error> {
        let day = rorm::query(exe, PickupDayModel)
            .condition(PickupDayModel.uuid.equals(uuid.0))
            .optional()
            .await?;
        Ok(day.map(PickupDay::from))
    }

    /// Fetch a pickup day by its effective pickup date
    #[instrument(name = "PickupDay::get_by_pickup_date", skip(exe))]
    pub async fn get_by_pickup_date(
        exe: impl Executor<'_>,
        pickup_date: Date,
    ) -> Result<Option<PickupDay>, rorm::Error> {
        let day = rorm::query(exe, PickupDayModel)
            .condition(PickupDayModel.pickup_date.equals(pickup_date))
            .optional()
            .await?;
        Ok(day.map(PickupDay::from))
    }

    /// Fetch a pickup day by the rule date it belongs to
    #[instrument(name = "PickupDay::get_by_rule_date", skip(exe))]
    pub async fn get_by_rule_date(
        exe: impl Executor<'_>,
        rule_date: Date,
    ) -> Result<Option<PickupDay>, rorm::Error> {
        let day = rorm::query(exe, PickupDayModel)
            .condition(PickupDayModel.rule_date.equals(rule_date))
            .optional()
            .await?;
        Ok(day.map(PickupDay::from))
    }

    /// Fetch every day that is due to be frozen: deadline passed, not locked yet
    #[instrument(name = "PickupDay::get_due_for_lock", skip(exe))]
    pub async fn get_due_for_lock(
        exe: impl Executor<'_>,
        now: OffsetDateTime,
    ) -> Result<Vec<PickupDay>, rorm::Error> {
        let days = rorm::query(exe, PickupDayModel)
            .condition(PickupDayModel.deadline_at.less_equals(now))
            .all()
            .await?;
        Ok(days
            .into_iter()
            .map(PickupDay::from)
            .filter(|day| day.locked_at.is_none() || day.confirmations_sent_at.is_none())
            .collect())
    }

    /// Fetch the pickup day for `rule_date`, creating it from the rule if needed
    ///
    /// Takes a transaction: the read and the insert have to be one step, or two
    /// customers ordering at once both create the same day.
    #[instrument(name = "PickupDay::get_or_create", skip(tx))]
    pub async fn get_or_create(
        tx: &mut Transaction,
        rule_date: Date,
        default: PickupDayOverride,
    ) -> Result<PickupDay, rorm::Error> {
        if let Some(day) = PickupDay::get_by_rule_date(&mut *tx, rule_date).await? {
            return Ok(day);
        }

        let uuid = rorm::insert(&mut *tx, PickupDayModel)
            .return_primary_key()
            .single(&PickupDayInsertPatch {
                uuid: Uuid::new_v4(),
                rule_date,
                pickup_date: default.pickup_date,
                deadline_at: default.deadline_at,
                closed: default.closed,
            })
            .await?;

        Ok(PickupDay {
            uuid: PickupDayUuid(uuid),
            rule_date,
            pickup_date: default.pickup_date,
            deadline_at: default.deadline_at,
            closed: default.closed,
            locked_at: None,
            confirmations_sent_at: None,
        })
    }

    /// Apply an admin's changes to a pickup day
    ///
    /// Returns `false` if the day does not exist.
    #[instrument(name = "PickupDay::apply_override", skip(exe))]
    pub async fn apply_override(
        exe: impl Executor<'_>,
        uuid: PickupDayUuid,
        changes: PickupDayOverride,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(exe, PickupDayModel)
            .set(PickupDayModel.pickup_date, changes.pickup_date)
            .set(PickupDayModel.deadline_at, changes.deadline_at)
            .set(PickupDayModel.closed, changes.closed)
            .condition(PickupDayModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }

    /// Mark a pickup day as frozen
    ///
    /// Returns `false` if it was already locked — the caller uses that to run
    /// the one-time side effects exactly once.
    #[instrument(name = "PickupDay::lock", skip(exe))]
    pub async fn lock(
        exe: impl Executor<'_>,
        uuid: PickupDayUuid,
        now: OffsetDateTime,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(exe, PickupDayModel)
            .set(PickupDayModel.locked_at, Some(now))
            .condition(rorm::and!(
                PickupDayModel.uuid.equals(uuid.0),
                PickupDayModel.locked_at.equals(None::<OffsetDateTime>)
            ))
            .await?;
        Ok(affected > 0)
    }

    /// Record that the confirmation mails for this day were handed to the gateway
    #[instrument(name = "PickupDay::set_confirmations_sent", skip(exe))]
    pub async fn set_confirmations_sent(
        exe: impl Executor<'_>,
        uuid: PickupDayUuid,
        now: OffsetDateTime,
    ) -> Result<bool, rorm::Error> {
        let affected = rorm::update(exe, PickupDayModel)
            .set(PickupDayModel.confirmations_sent_at, Some(now))
            .condition(PickupDayModel.uuid.equals(uuid.0))
            .await?;
        Ok(affected > 0)
    }
}

impl From<PickupDayModel> for PickupDay {
    fn from(value: PickupDayModel) -> Self {
        Self {
            uuid: PickupDayUuid(value.uuid),
            rule_date: value.rule_date,
            pickup_date: value.pickup_date,
            deadline_at: value.deadline_at,
            closed: value.closed,
            locked_at: value.locked_at,
            confirmations_sent_at: value.confirmations_sent_at,
        }
    }
}
