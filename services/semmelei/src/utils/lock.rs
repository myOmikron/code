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
/// stays as it is and the next tick tries again.
#[instrument(name = "lock::dispatch_pickup_day", skip(tx, day, settings), fields(pickup_date = %day.pickup_date))]
pub async fn dispatch_pickup_day(
    tx: &mut Transaction,
    day: &PickupDay,
    settings: &ShopSettings,
    now: OffsetDateTime,
) -> Result<(), galvyn::rorm::Error> {
    let Some(bakery_email) = &settings.bakery_email else {
        warn!(
            pickup_date = %day.pickup_date,
            "No Bakery address set, the Dispatch waits for one"
        );
        return Ok(());
    };

    let lines = bakery::bakery_order(tx, day).await?;
    if !lines.is_empty() {
        // Send first and mark only after the ack: the opposite of the customer
        // mails below. A failed hand-over leaves the day unmarked, so the next
        // tick sends again; a crash between the ack and the commit sends twice.
        // A duplicate order the Bakery can spot is the lesser failure than a
        // lost one, which means no rolls on the counter on pickup day.
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

    PickupDay::set_dispatched(&mut *tx, day.uuid, now).await?;
    let confirmed = send_confirmations(tx, day, now).await?;
    info!(
        pickup_date = %day.pickup_date,
        bakery_lines = lines.len(),
        mails = confirmed,
        "Dispatched pickup day"
    );
    Ok(())
}

/// Send the binding confirmations of a pickup day, at most once
///
/// Returns how many confirmation mails were queued; none if they already went out.
async fn send_confirmations(
    tx: &mut Transaction,
    day: &PickupDay,
    now: OffsetDateTime,
) -> Result<i64, galvyn::rorm::Error> {
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
            customer_name: &order.display_name(),
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
            customer_name: &order.display_name(),
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
    for day in PickupDay::get_awaiting_dispatch(&mut tx, now).await? {
        if schedule::dispatch_due(&settings, day.deadline_at) <= now {
            dispatch_pickup_day(&mut tx, &day, &settings, now).await?;
        }
    }

    tx.commit().await?;
    Ok(())
}
