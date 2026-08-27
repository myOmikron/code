//! The rollup of what an account owns, and the check that it still adds up
//!
//! `collection_stock` holds one row per (owner, printing, finish) carrying two
//! numbers: how many copies lie on a shelf, and how many are sleeved up in a
//! deck. It is what every "do I already own this" answer is counted from —
//! adding the stacks up per read meant walking the whole of `collection_entry`
//! once for each row of the answer, which costs a collection-sized amount of
//! work for a list-sized reply.
//!
//! Nothing here writes it. The table is maintained by triggers on
//! `collection_entry` and `collection`, declared in
//! `migrations/0026_collection_stock.toml`, because cards leave a collection in
//! ways no handler sees: a deleted collection cascades to its entries, a deleted
//! deck cascades to its collection, and a printing merge rewrites the column
//! from a migration.
//!
//! What is here is the other half of taking a denormalisation seriously: a way
//! to ask whether it is still true. [`StockDrift::read`] counts the entries the
//! long way round and reports every key the rollup disagrees with — nothing in
//! the service calls it, it is what the `check-stock` command runs.

use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;
use uuid::Uuid;

/// One key the rollup and the entries disagree about
#[derive(Debug, Clone)]
pub struct StockDrift {
    /// The account whose stock is wrong
    pub owner: Uuid,
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// The finish, as the column spells it
    pub finish: String,
    /// Free copies the rollup claims
    pub rolled_free: i64,
    /// Free copies the entries actually add up to
    pub actual_free: i64,
    /// Sleeved copies the rollup claims
    pub rolled_sleeved: i64,
    /// Sleeved copies the entries actually add up to
    pub actual_sleeved: i64,
    /// Whether the copied card data disagrees with the catalog
    pub stale_card: bool,
}

impl StockDrift {
    /// Every key where the rollup and the entries disagree
    ///
    /// A full outer join of the two: a key the rollup invented shows up with
    /// zeroes on the right, one it missed with zeroes on the left. An empty
    /// answer means the triggers have kept up with every write since the table
    /// was filled.
    ///
    /// Expensive by design — it is the query the rollup exists to avoid — so
    /// this belongs in a command, not in a request.
    #[instrument(name = "StockDrift::read", skip(tx))]
    pub async fn read(tx: &mut Transaction) -> Result<Vec<StockDrift>, rorm::Error> {
        let statement = "\
            WITH counted AS ( \
                SELECT c.owner, e.printing, e.finish, \
                       COALESCE(SUM(e.quantity) FILTER (WHERE c.deck IS NULL), 0) AS free, \
                       COALESCE(SUM(e.quantity) FILTER (WHERE c.deck IS NOT NULL), 0) AS sleeved \
                FROM collection_entry e \
                JOIN collection c ON c.uuid = e.collection \
                GROUP BY c.owner, e.printing, e.finish \
            ) \
            SELECT COALESCE(s.owner, t.owner) AS owner, \
                   COALESCE(s.printing, t.printing) AS printing, \
                   COALESCE(s.finish, t.finish) AS finish, \
                   COALESCE(s.free, 0)::bigint AS rolled_free, \
                   COALESCE(t.free, 0)::bigint AS actual_free, \
                   COALESCE(s.sleeved, 0)::bigint AS rolled_sleeved, \
                   COALESCE(t.sleeved, 0)::bigint AS actual_sleeved, \
                   (s.printing IS NOT NULL \
                    AND EXISTS (SELECT 1 FROM printing p WHERE p.id = s.printing \
                                AND (p.oracle_id IS DISTINCT FROM s.oracle_id \
                                     OR p.lang IS DISTINCT FROM s.lang))) AS stale_card \
            FROM collection_stock s \
            FULL OUTER JOIN counted t \
              ON t.owner = s.owner AND t.printing = s.printing AND t.finish = s.finish \
            WHERE COALESCE(s.free, 0) <> COALESCE(t.free, 0) \
               OR COALESCE(s.sleeved, 0) <> COALESCE(t.sleeved, 0) \
               OR EXISTS (SELECT 1 FROM printing p WHERE p.id = s.printing \
                          AND (p.oracle_id IS DISTINCT FROM s.oracle_id \
                               OR p.lang IS DISTINCT FROM s.lang)) \
            ORDER BY owner, printing, finish";

        let rows = (&mut *tx)
            .execute::<All>(statement.to_string(), Vec::new())
            .await?;

        let mut drift = Vec::with_capacity(rows.len());
        for row in rows {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
            drift.push(StockDrift {
                owner: row.get("owner").map_err(decode)?,
                printing: row.get("printing").map_err(decode)?,
                finish: row.get("finish").map_err(decode)?,
                rolled_free: row.get("rolled_free").map_err(decode)?,
                actual_free: row.get("actual_free").map_err(decode)?,
                rolled_sleeved: row.get("rolled_sleeved").map_err(decode)?,
                actual_sleeved: row.get("actual_sleeved").map_err(decode)?,
                stale_card: row.get("stale_card").map_err(decode)?,
            });
        }
        Ok(drift)
    }
}

/// Point the copied card data at what the catalog says now
///
/// Cheap and idempotent: it writes only the rows that disagree, which after a
/// sync that moved no card is none of them. Called at the end of every catalog
/// sync, because that is the only thing that can make the copies wrong.
///
/// Returns how many rows were put right.
#[instrument(name = "refresh_stock_cards", skip(tx))]
pub async fn refresh_cards(tx: &mut Transaction) -> Result<u64, rorm::Error> {
    let rows = (&mut *tx)
        .execute::<All>(
            "UPDATE collection_stock s \
             SET oracle_id = p.oracle_id, lang = p.lang \
             FROM printing p \
             WHERE p.id = s.printing \
               AND (p.oracle_id IS DISTINCT FROM s.oracle_id \
                    OR p.lang IS DISTINCT FROM s.lang) \
             RETURNING s.printing"
                .to_string(),
            Vec::new(),
        )
        .await?;
    Ok(rows.len() as u64)
}

/// Throw the rollup away and count it again
///
/// The card data is joined onto the sums rather than carried through them:
/// `oracle_id` follows from the printing, and a `uuid` cannot be aggregated —
/// Postgres has no `min` for one, which is exactly how the same shortcut broke
/// the trigger helper (see `migrations/0028_collection_stock_apply.toml`).
///
/// The repair for whatever [`StockDrift::read`] found. Runs in one transaction,
/// so the table is never half a truth, and takes the same lock a write would —
/// which is why it is a command somebody runs rather than something that
/// happens on a timer.
#[instrument(name = "rebuild_stock", skip(tx))]
pub async fn rebuild(tx: &mut Transaction) -> Result<u64, rorm::Error> {
    (&mut *tx)
        .execute::<All>("DELETE FROM collection_stock".to_string(), Vec::new())
        .await?;
    let rows = (&mut *tx)
        .execute::<All>(
            "INSERT INTO collection_stock (owner, printing, finish, oracle_id, lang, free, sleeved) \
             SELECT g.owner, g.printing, g.finish, p.oracle_id, p.lang, g.free, g.sleeved \
             FROM ( \
                 SELECT c.owner, e.printing, e.finish, \
                        COALESCE(SUM(e.quantity) FILTER (WHERE c.deck IS NULL), 0) AS free, \
                        COALESCE(SUM(e.quantity) FILTER (WHERE c.deck IS NOT NULL), 0) AS sleeved \
                 FROM collection_entry e \
                 JOIN collection c ON c.uuid = e.collection \
                 GROUP BY c.owner, e.printing, e.finish \
             ) g \
             LEFT JOIN printing p ON p.id = g.printing \
             RETURNING owner"
                .to_string(),
            Vec::new(),
        )
        .await?;
    Ok(rows.len() as u64)
}
