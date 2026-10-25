//! Freezing and Dispatching a pickup day, and the job that does both on time
//!
//! Freezing happens at the Deadline (or earlier, by an Admin) and only ends
//! ordering. The Dispatch follows at the end of the Review Window and sends
//! the Bakery order and the binding confirmations. Both are idempotent: the job, a restart after a
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
use tracing::warn;

use crate::models::Order;
use crate::models::OrderItem;
use crate::models::OrderStatus;
use crate::models::PickupDay;
use crate::models::ShopSettings;
use crate::utils::bakery;
use crate::utils::mail;
use crate::utils::mail::MailPosition;
use crate::utils::mail::OrderMail;
use crate::utils::schedule;

/// How often the job looks for a due pickup day
///
/// A minute is precise enough for a deadline the customer sees to the minute,
/// and cheap enough to just run — no wake-up scheduling to get wrong.
const TICK: Duration = Duration::from_secs(60);

/// Freeze a pickup day: customers can no longer order or cancel
///
/// Sends nothing, the confirmations go out with the Dispatch. Returns whether
/// the day was frozen just now.
#[instrument(name = "lock::lock_pickup_day", skip(tx, day), fields(pickup_date = %day.pickup_date))]
pub async fn lock_pickup_day(
    tx: &mut Transaction,
    day: &PickupDay,
    now: OffsetDateTime,
) -> Result<bool, galvyn::rorm::Error> {
    let newly_locked = PickupDay::lock(&mut *tx, day.uuid, now).await?;
    if newly_locked {
        info!(pickup_date = %day.pickup_date, "Froze pickup day");
    }
    Ok(newly_locked)
}

/// Dispatch a pickup day: send the Bakery order, mark it Dispatched, then send the binding confirmations
///
/// The caller picks days that are due; see [`schedule::dispatch_due`]. Without
/// a Bakery address, or when the Bakery mail could not be handed over, the day
/// stays as it is and the next tick tries again. Each day is its own unit: the
/// marks are committed before the first confirmation leaves.
#[instrument(name = "lock::dispatch_pickup_day", skip(day, settings), fields(pickup_date = %day.pickup_date))]
pub async fn dispatch_pickup_day(
    day: &PickupDay,
    settings: &ShopSettings,
    now: OffsetDateTime,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let Some(bakery_email) = &settings.bakery_email else {
        warn!(
            pickup_date = %day.pickup_date,
            "No Bakery address set, the Dispatch waits for one"
        );
        return Ok(());
    };

    let mut tx = Database::global().start_transaction().await?;
    let lines = bakery::bakery_order(&mut tx, day).await?;
    tx.commit().await?;

    if !lines.is_empty() {
        // Mark only after the ack: a lost Bakery order is worse than a
        // duplicate one, so a crash before the commit sends it again.
        if let Err(error) = mail::send_bakery_order(
            bakery_email,
            settings.copy_email.as_deref(),
            day.pickup_date,
            bakery::render_csv(&lines),
        )
        .await
        {
            error!(
                error = %error,
                pickup_date = %day.pickup_date,
                "Failed to hand over the Bakery order, retrying on the next tick"
            );
            return Ok(());
        }
    }

    let mut tx = Database::global().start_transaction().await?;
    PickupDay::set_dispatched(&mut tx, day.uuid, now).await?;
    PickupDay::set_confirmations_sent(&mut tx, day.uuid, now).await?;
    let confirmations = confirmations_of(&mut tx, day).await?;
    tx.commit().await?;

    let confirmed = send_confirmations(&confirmations, day).await;
    info!(
        pickup_date = %day.pickup_date,
        bakery_lines = lines.len(),
        mails = confirmed,
        "Dispatched pickup day"
    );
    Ok(())
}

/// The non-cancelled orders of a pickup day with their positions, for the confirmations
async fn confirmations_of(
    tx: &mut Transaction,
    day: &PickupDay,
) -> Result<Vec<(Order, Vec<MailPosition>)>, galvyn::rorm::Error> {
    let mut confirmations = Vec::new();
    for order in Order::get_by_pickup_day(&mut *tx, day.uuid).await? {
        if order.status == OrderStatus::Cancelled {
            continue;
        }
        let positions: Vec<MailPosition> = OrderItem::get_by_order(&mut *tx, order.uuid)
            .await?
            .iter()
            .map(MailPosition::from)
            .collect();
        confirmations.push((order, positions));
    }
    Ok(confirmations)
}

/// Send the binding confirmations of a pickup day
///
/// Runs after the day is marked, so a crash mid-loop loses mails rather than
/// sending them twice. Returns how many confirmation mails were queued.
async fn send_confirmations(confirmations: &[(Order, Vec<MailPosition>)], day: &PickupDay) -> i64 {
    let mut sent = 0;
    for (order, positions) in confirmations {
        match mail::send_order_confirmed(&OrderMail::for_order(order, day, positions)).await {
            Ok(()) => sent += 1,
            Err(error) => error!(
                error = %error,
                order.pickup_code = %order.pickup_code,
                "Failed to queue the confirmation mail"
            ),
        }
    }
    sent
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
        if let Err(error) =
            mail::send_order_cancelled(&OrderMail::for_order(order, day, &positions)).await
        {
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
/// Every tick freezes the days whose deadline has passed and Dispatches the
/// days whose Review Window is over. Days that came due while the service was
/// down are caught by the same queries, so a restart is all it takes to recover.
pub async fn run_deadline_job() {
    loop {
        if let Err(error) = tick(schedule::now()).await {
            // Never give up the loop: the next tick may well succeed, and a
            // silent stop would mean nobody ever gets a confirmation again.
            error!(error = %error, "Deadline job tick failed");
        }
        sleep(TICK).await;
    }
}

/// One pass over the days that are due to be frozen or Dispatched at `now`
///
/// The job passes the clock; tests pass the point in time they want to see.
#[instrument(name = "lock::tick", level = "debug")]
pub async fn tick(now: OffsetDateTime) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut tx = Database::global().start_transaction().await?;
    for day in PickupDay::get_due_for_lock(&mut tx, now).await? {
        lock_pickup_day(&mut tx, &day, now).await?;
    }
    let settings = ShopSettings::get(&mut tx).await?;
    let awaiting = PickupDay::get_awaiting_dispatch(&mut tx, now).await?;
    tx.commit().await?;

    for day in awaiting {
        if schedule::dispatch_due(&settings, day.deadline_at) <= now
            && let Err(error) = dispatch_pickup_day(&day, &settings, now).await
        {
            error!(
                error = %error,
                pickup_date = %day.pickup_date,
                "Failed to Dispatch pickup day, retrying on the next tick"
            );
        }
    }
    Ok(())
}
