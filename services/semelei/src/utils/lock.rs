//! Freezing a pickup day, and the job that does it on time
//!
//! Freezing is idempotent on purpose: the deadline job, a restart after a
//! downtime and the admin's "freeze now" button all end up here, and a
//! customer must not get the same confirmation mail twice.

use std::time::Duration;

use galvyn::core::Module;
use galvyn::rorm::Database;
use galvyn::rorm::db::transaction::Transaction;
use time::OffsetDateTime;
use tokio::time::sleep;
use tracing::error;
use tracing::info;
use tracing::instrument;

use crate::models::Order;
use crate::models::OrderItem;
use crate::models::OrderStatus;
use crate::models::PickupDay;
use crate::utils::mail;
use crate::utils::mail::MailPosition;
use crate::utils::mail::OrderMail;
use crate::utils::schedule;

/// How often the job looks for a due pickup day
///
/// A minute is precise enough for a deadline the customer sees to the minute,
/// and cheap enough to just run — no wake-up scheduling to get wrong.
const TICK: Duration = Duration::from_secs(60);

/// Freeze a pickup day and send out the binding confirmations
///
/// Returns how many confirmation mails were queued. Does nothing if the day
/// was already frozen *and* its mails already went out.
#[instrument(name = "lock::lock_pickup_day", skip(tx, day), fields(pickup_date = %day.pickup_date))]
pub async fn lock_pickup_day(
    tx: &mut Transaction,
    day: &PickupDay,
    now: OffsetDateTime,
) -> Result<i64, galvyn::rorm::Error> {
    let newly_locked = PickupDay::lock(&mut *tx, day.uuid, now).await?;

    if day.confirmations_sent_at.is_some() {
        return Ok(0);
    }

    // Mark before sending: a crash mid-loop must not queue every mail again
    // on the next tick. Losing a mail is the better failure than spamming.
    PickupDay::set_confirmations_sent(&mut *tx, day.uuid, now).await?;

    let orders: Vec<Order> = Order::get_by_pickup_day(&mut *tx, day.uuid)
        .await?
        .into_iter()
        .filter(|order| order.status != OrderStatus::Cancelled)
        .collect();

    let mut sent = 0;
    for order in &orders {
        let positions: Vec<MailPosition> = OrderItem::get_by_order(&mut *tx, order.uuid)
            .await?
            .iter()
            .map(MailPosition::from)
            .collect();
        let mail = OrderMail {
            pickup_code: &order.pickup_code,
            customer_name: &order.customer_name,
            email: order.email.as_deref(),
            language: order.language,
            pickup_date: day.pickup_date,
            deadline: day.deadline_at,
            positions: &positions,
        };
        match mail::send_order_confirmed(&mail).await {
            Ok(()) => sent += 1,
            Err(error) => error!(
                error = %error,
                order.pickup_code = %order.pickup_code,
                "Failed to queue the confirmation mail"
            ),
        }
    }

    if newly_locked || sent > 0 {
        info!(
            pickup_date = %day.pickup_date,
            orders = orders.len(),
            mails = sent,
            "Froze pickup day"
        );
    }

    Ok(sent)
}

/// Cancel every open order of a pickup day and tell the customers
///
/// Used when an admin calls a day off. Returns how many orders were cancelled.
#[instrument(name = "lock::cancel_pickup_day", skip(tx, day), fields(pickup_date = %day.pickup_date))]
pub async fn cancel_pickup_day(
    tx: &mut Transaction,
    day: &PickupDay,
) -> Result<i64, galvyn::rorm::Error> {
    let orders: Vec<Order> = Order::get_by_pickup_day(&mut *tx, day.uuid)
        .await?
        .into_iter()
        .filter(|order| order.status != OrderStatus::Cancelled)
        .collect();

    let mut cancelled = 0;
    for order in &orders {
        Order::set_status(&mut *tx, order.uuid, OrderStatus::Cancelled).await?;
        cancelled += 1;

        let positions: Vec<MailPosition> = OrderItem::get_by_order(&mut *tx, order.uuid)
            .await?
            .iter()
            .map(MailPosition::from)
            .collect();
        let mail = OrderMail {
            pickup_code: &order.pickup_code,
            customer_name: &order.customer_name,
            email: order.email.as_deref(),
            language: order.language,
            pickup_date: day.pickup_date,
            deadline: day.deadline_at,
            positions: &positions,
        };
        if let Err(error) = mail::send_order_cancelled(&mail).await {
            error!(
                error = %error,
                order.pickup_code = %order.pickup_code,
                "Failed to queue the cancellation mail"
            );
        }
    }

    info!(
        pickup_date = %day.pickup_date,
        orders = cancelled,
        "Called off pickup day"
    );
    Ok(cancelled)
}

/// Run the deadline job until the process ends
///
/// Every tick freezes the days whose deadline has passed. Days that came due
/// while the service was down are caught by the same query, so a restart is
/// all it takes to recover.
pub async fn run_deadline_job() {
    loop {
        if let Err(error) = tick().await {
            // Never give up the loop: the next tick may well succeed, and a
            // silent stop would mean nobody ever gets a confirmation again.
            error!(error = %error, "Deadline job tick failed");
        }
        sleep(TICK).await;
    }
}

/// One pass over the days that are due to be frozen
#[instrument(name = "lock::tick", level = "debug")]
async fn tick() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let now = schedule::now();
    let mut tx = Database::global().start_transaction().await?;

    for day in PickupDay::get_due_for_lock(&mut tx, now).await? {
        lock_pickup_day(&mut tx, &day, now).await?;
    }

    tx.commit().await?;
    Ok(())
}
