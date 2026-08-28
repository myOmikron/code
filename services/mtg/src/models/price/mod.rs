//! What Cardmarket's products cost, day by day
//!
//! The catalog carries one price per printing: what it costs now. That is
//! enough to value a collection and not enough to say anything about it — a
//! card at two euro is a bargain or a ripoff depending on where it stood last
//! month, and `printing.price_eur` has no last month.
//!
//! This is the last month. `cardmarket_price` holds one row per product per
//! day, written by `sync-price-guide` from the file Cardmarket publishes daily.
//!
//! Raw sql throughout, and no rorm model, for the same reason as
//! [`crate::models::collection::stock`]: the table has a composite key, is
//! written a hundred thousand rows at a time and read one card at a time. See
//! `migrations/0029_cardmarket_price.toml`.

use galvyn::core::re_exports::time::Date;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::AffectedRows;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::NullType;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;
use uuid::Uuid;

/// The key the single sync-state row is kept under
const PRICE_SYNC_ID: &str = "cardmarket";

/// How many days are kept at the resolution they arrived in
///
/// Beyond this the history is thinned to one row a week, which is what makes a
/// year of it fit in about a gigabyte rather than three. A price chart older
/// than a quarter is read for its shape, and a weekly point draws the same
/// shape; inside the quarter, where somebody is deciding whether to buy, every
/// day is kept.
pub const DAILY_DAYS: i64 = 90;

/// The weekday the thinned history keeps, as Postgres' `ISODOW`
const KEPT_WEEKDAY: i32 = 1;

/// How many parameters one row of the upsert binds
const COLUMNS: usize = 6;

/// How many rows go into one `INSERT`
///
/// Six parameters a row against Postgres' ceiling of 65535.
const UPSERT_CHUNK: usize = 4096;

/// What one product cost on the day the guide was written
#[derive(Debug, Clone, Copy)]
pub struct PricePoint {
    /// Cardmarket's product id
    pub cardmarket_id: i32,
    /// The cheapest offer, in euro cents
    pub low: Option<i32>,
    /// Cardmarket's trend price, in euro cents
    pub trend: Option<i32>,
    /// The cheapest foil offer, in euro cents
    pub low_foil: Option<i32>,
    /// The foil trend price, in euro cents
    pub trend_foil: Option<i32>,
}

/// The price history
pub struct CardmarketPrice;

impl CardmarketPrice {
    /// Writes a day of the guide
    ///
    /// Upserted rather than inserted so re-reading a day is harmless: the guide
    /// is one file that is replaced, and a run that died halfway has to be able
    /// to run again.
    ///
    /// Returns how many rows were written.
    #[instrument(name = "CardmarketPrice::write_day", skip(tx, points), fields(count = points.len()))]
    pub async fn write_day(
        tx: &mut Transaction,
        day: Date,
        points: &[PricePoint],
    ) -> Result<u64, rorm::Error> {
        let mut written = 0;

        for chunk in points.chunks(UPSERT_CHUNK) {
            let mut placeholders = String::new();
            let mut values: Vec<Value<'_>> = Vec::with_capacity(chunk.len() * COLUMNS);

            for (row, point) in chunk.iter().enumerate() {
                if row > 0 {
                    placeholders.push_str(", ");
                }
                placeholders.push('(');
                for column in 0..COLUMNS {
                    if column > 0 {
                        placeholders.push_str(", ");
                    }
                    placeholders.push_str(&format!("${}", values.len() + column + 1));
                }
                placeholders.push(')');

                values.push(Value::I32(point.cardmarket_id));
                values.push(Value::TimeDate(day));
                values.push(cents(point.low));
                values.push(cents(point.trend));
                values.push(cents(point.low_foil));
                values.push(cents(point.trend_foil));
            }

            let query = format!(
                "INSERT INTO cardmarket_price \
                 (cardmarket_id, day, low, trend, low_foil, trend_foil) \
                 VALUES {placeholders} \
                 ON CONFLICT (cardmarket_id, day) DO UPDATE SET \
                 low = EXCLUDED.low, trend = EXCLUDED.trend, \
                 low_foil = EXCLUDED.low_foil, trend_foil = EXCLUDED.trend_foil"
            );

            written += (&mut *tx).execute::<AffectedRows>(query, values).await?;
        }

        Ok(written)
    }

    /// Thins the history older than [`DAILY_DAYS`] to one row a week
    ///
    /// Keeps Mondays and drops the rest, which is a rule the table can be
    /// re-thinned under any number of times without losing anything twice.
    /// Runs after every applied day rather than on a clock of its own, so the
    /// table can only ever hold one day more than it should.
    ///
    /// Returns how many rows were dropped.
    #[instrument(name = "CardmarketPrice::compact", skip(tx))]
    pub async fn compact(tx: &mut Transaction) -> Result<u64, rorm::Error> {
        (&mut *tx)
            .execute::<AffectedRows>(
                format!(
                    "DELETE FROM cardmarket_price \
                     WHERE day < CURRENT_DATE - INTERVAL '{DAILY_DAYS} days' \
                       AND EXTRACT(ISODOW FROM cardmarket_price.day) <> {KEPT_WEEKDAY}"
                ),
                Vec::new(),
            )
            .await
    }

    /// One card's history, oldest first
    ///
    /// Joined through the printing rather than taken by product id: the client
    /// holds Scryfall ids, and after [`crate::models::printing::Printing::inherit_from_english`]
    /// every language of a card carries the product id that addresses it.
    ///
    /// Empty for a printing Cardmarket does not stock and for one whose first
    /// day has not been read yet, which the caller cannot tell apart and does
    /// not need to: both mean "no chart".
    #[instrument(name = "CardmarketPrice::history", skip(tx))]
    pub async fn history(
        tx: &mut Transaction,
        printing: Uuid,
    ) -> Result<Vec<PriceDay>, rorm::Error> {
        let rows = (&mut *tx)
            .execute::<All>(
                "SELECT h.day, h.low, h.trend, h.low_foil, h.trend_foil \
                 FROM printing p \
                 JOIN cardmarket_price h ON h.cardmarket_id = p.cardmarket_id \
                 WHERE p.id = $1 \
                 ORDER BY h.day ASC"
                    .to_string(),
                vec![Value::Uuid(printing)],
            )
            .await?;

        let mut days = Vec::with_capacity(rows.len());
        for row in rows {
            days.push(PriceDay {
                day: row.get("day").map_err(decode)?,
                low: row.get("low").map_err(decode)?,
                trend: row.get("trend").map_err(decode)?,
                low_foil: row.get("low_foil").map_err(decode)?,
                trend_foil: row.get("trend_foil").map_err(decode)?,
            });
        }
        Ok(days)
    }

    /// How many rows the history holds
    #[instrument(name = "CardmarketPrice::count", skip(tx))]
    pub async fn count(tx: &mut Transaction) -> Result<i64, rorm::Error> {
        let rows = (&mut *tx)
            .execute::<All>(
                "SELECT COUNT(*)::bigint AS count FROM cardmarket_price".to_string(),
                Vec::new(),
            )
            .await?;
        match rows.first() {
            Some(row) => row.get("count").map_err(decode),
            None => Ok(0),
        }
    }
}

/// One day of one card's history
#[derive(Debug, Clone, Copy)]
pub struct PriceDay {
    /// The day the guide quoted these prices for
    pub day: Date,
    /// The cheapest offer, in euro cents
    pub low: Option<i32>,
    /// Cardmarket's trend price, in euro cents
    pub trend: Option<i32>,
    /// The cheapest foil offer, in euro cents
    pub low_foil: Option<i32>,
    /// The foil trend price, in euro cents
    pub trend_foil: Option<i32>,
}

/// What the last price sync read
#[derive(Debug, Clone)]
pub struct PriceGuideSync {
    /// The etag the CDN served the applied file under
    pub etag: String,
    /// The day that file quoted prices for
    pub day: Date,
}

impl PriceGuideSync {
    /// What the last successful sync recorded, `None` before the first one
    #[instrument(name = "PriceGuideSync::read", skip(tx))]
    pub async fn read(tx: &mut Transaction) -> Result<Option<PriceGuideSync>, rorm::Error> {
        let rows = (&mut *tx)
            .execute::<All>(
                "SELECT etag, day FROM cardmarket_price_sync WHERE id = $1".to_string(),
                vec![Value::String(PRICE_SYNC_ID)],
            )
            .await?;

        let Some(row) = rows.first() else {
            return Ok(None);
        };
        Ok(Some(PriceGuideSync {
            etag: row.get("etag").map_err(decode)?,
            day: row.get("day").map_err(decode)?,
        }))
    }

    /// Records the file this run applied
    ///
    /// Written only once the day is in the table, so an interrupted sync is
    /// retried rather than skipped.
    #[instrument(name = "PriceGuideSync::record", skip(tx))]
    pub async fn record(tx: &mut Transaction, etag: &str, day: Date) -> Result<(), rorm::Error> {
        (&mut *tx)
            .execute::<AffectedRows>(
                "INSERT INTO cardmarket_price_sync (id, etag, day, synced_at) \
                 VALUES ($1, $2, $3, $4) \
                 ON CONFLICT (id) DO UPDATE SET \
                 etag = EXCLUDED.etag, day = EXCLUDED.day, synced_at = EXCLUDED.synced_at"
                    .to_string(),
                vec![
                    Value::String(PRICE_SYNC_ID),
                    Value::String(etag),
                    Value::TimeDate(day),
                    Value::TimeOffsetDateTime(OffsetDateTime::now_utc()),
                ],
            )
            .await?;
        Ok(())
    }
}

/// Turns a row error into the crate's error, as every raw read here does
fn decode(error: rorm::db::row::RowError<'_>) -> rorm::Error {
    rorm::Error::RowError(error.into_owned())
}

/// Binds an optional price, since `Value` has no option of its own
fn cents(value: Option<i32>) -> Value<'static> {
    match value {
        Some(value) => Value::I32(value),
        None => Value::Null(NullType::I32),
    }
}
