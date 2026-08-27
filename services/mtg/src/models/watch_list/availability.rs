//! What a watch list is watching, and how much of it is already on the shelf
//!
//! The one read behind the watch list page. Unlike the sourcing view, which
//! hands the client three flat lists and lets it decide how strictly to match,
//! the matching rule here is *stored on the entry*: the two switches are the
//! account's answer for that card, not a setting over the view. So the counting
//! happens in the statement, and the client is handed numbers rather than the
//! whole shelf to count itself.
//!
//! Raw sql for the same reason as [`crate::models::deck::sourcing`]: `printing`
//! is deliberately not a foreign key, so there is no relation to walk.

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::collection::listing::finish_of;
use crate::models::watch_list::ANY_PRINTING;
use crate::models::watch_list::MARKET_LATERAL;
use crate::models::watch_list::SAME_CARD;
use crate::models::watch_list::SAME_FINISH;
use crate::models::watch_list::STACK_LANGUAGE;
use crate::models::watch_list::WatchListEntry;
use crate::models::watch_list::WatchListEntryUuid;
use crate::models::watch_list::WatchListUuid;
use crate::models::watch_list::bounded;

/// What the catalog knows about a watched card
#[derive(Debug, Clone)]
pub struct WatchedPrinting {
    /// The printed name
    pub name: String,
    /// Groups every printing of the same card, which is what a wide entry uses
    pub oracle_id: Option<Uuid>,
    /// Set code, upper case
    pub set_code: String,
    /// Full set name
    pub set_name: String,
    /// Collector number as printed
    pub collector_number: String,
    /// Language of the printing
    pub lang: String,
    /// Cardmarket's id of the product this printing is sold as
    pub cardmarket_id: Option<i32>,
    /// Artwork for a list row
    pub image_small: Option<String>,
    /// Artwork for a closer look
    pub image_normal: Option<String>,
    /// Scryfall's finishes, comma separated
    pub finishes: String,
    /// Market price in euro cents
    pub price_eur: Option<i64>,
    /// Foil market price in euro cents
    pub price_eur_foil: Option<i64>,
    /// When this row last came out of a catalog sync
    ///
    /// What the page dates its prices by: they are exactly as old as this.
    pub updated_at: OffsetDateTime,
}

/// How many copies of what an entry watches the account already holds
///
/// The two `any_*` numbers are what the hints are drawn from: they say how many
/// copies the entry's own switches are turning away, so the row can offer to
/// loosen one instead of sending somebody shopping for a card they own.
#[derive(Debug, Clone, Default)]
pub struct WatchedStock {
    /// Copies lying in a collection that is not a deck's
    pub free: i64,
    /// Copies sleeved up in a deck
    pub sleeved: i64,
    /// Free copies a wider printing match would count
    pub free_any_printing: i64,
    /// Free copies a looser finish match would count
    pub free_any_finish: i64,
}

/// The printing an entry's price and alarm actually refer to
///
/// For an entry that watches one printing this is that printing. For a wide one
/// it is the cheapest print of the card the switches accept, which is a
/// different card than the row is named after — and the one a shop link has to
/// open, or somebody follows a price to a product that does not carry it.
#[derive(Debug, Clone)]
pub struct WatchedMarket {
    /// Scryfall's id of the printing being priced
    pub printing: Uuid,
    /// What one copy of it costs, in euro cents
    pub price_cents: i64,
    /// Cardmarket's id of the product it is sold as
    pub cardmarket_id: Option<i32>,
    /// The printed name
    pub name: String,
    /// Set code, upper case
    pub set_code: String,
    /// Collector number as printed
    pub collector_number: String,
    /// Language of the printing, as Scryfall's code
    pub lang: String,
}

/// One row of the watch list page
#[derive(Debug, Clone)]
pub struct WatchedEntry {
    /// The entry itself
    pub entry: WatchListEntry,
    /// What the catalog knows, `None` for a printing it has not caught up with
    pub card: Option<WatchedPrinting>,
    /// What the account already holds
    pub stock: WatchedStock,
    /// The printing the price and the alarm refer to, `None` when unpriced
    pub market: Option<WatchedMarket>,
}

/// The columns the page reads out of the catalog
const PRINTING_COLUMNS: &str = "p.name, p.oracle_id, p.set_code, p.set_name, \
     p.collector_number, p.lang, p.cardmarket_id, p.image_small, p.image_normal, \
     p.finishes, p.price_eur, p.price_eur_foil, p.updated_at";

/// The columns an entry is rebuilt from
const ENTRY_COLUMNS: &str = "w.uuid, w.watch_list, w.printing, w.finish, \
     w.exact_printing, w.match_finish, w.languages, w.wanted, w.note, w.alarm_price_cents, \
     w.triggered_at, w.triggered_price_cents, w.triggered_printing, \
     w.acknowledged, w.created_at";

impl WatchedEntry {
    /// Every entry of one watch list, oldest first
    ///
    /// The caller has to have established that the account may administer the
    /// list; `owner` is only what the shelf is counted over.
    #[instrument(name = "WatchedEntry::read_for_list", skip(tx))]
    pub async fn read_for_list(
        tx: &mut Transaction,
        owner: AccountUuid,
        watch_list: WatchListUuid,
    ) -> Result<Vec<WatchedEntry>, rorm::Error> {
        // The stock is counted in a lateral rather than a grouped join: four
        // sums over four different readings of the same stack cannot be phrased
        // as one GROUP BY, and the pre-filter in its WHERE keeps each entry to
        // an index lookup instead of a walk over the whole account's shelf.
        //
        // What it reads is `collection_stock`, the rollup the database keeps
        // beside `collection_entry` (see `migrations/0026_collection_stock.toml`)
        // — one row per printing and finish the account owns, already split
        // into what lies on a shelf and what is sleeved up, instead of every
        // stack in every collection. Aliased `e` because the four predicates
        // are shared with the overview and name their columns.
        //
        // Each sum is cast back to `bigint`: the rollup counts in `bigint`, and
        // `SUM()` over one of those widens to `numeric`, which is not what the
        // row is read as. Adding `quantity` columns up did not need it — those
        // are `int4` and sum to `bigint` on their own.
        let statement = format!(
            "SELECT {ENTRY_COLUMNS}, {PRINTING_COLUMNS}, \
                    a.free, a.sleeved, a.free_any_printing, a.free_any_finish, \
                    m.market_price_cents, m.market_printing, m.market_cardmarket_id, \
                    m.market_name, m.market_set_code, m.market_collector_number, \
                    m.market_lang \
             FROM watch_list_entry w \
             LEFT JOIN printing p ON p.id = w.printing \
             LEFT JOIN LATERAL ( \
                 SELECT \
                   COALESCE(SUM(CASE WHEN {SAME_CARD} AND {SAME_FINISH} \
                                     AND {STACK_LANGUAGE} \
                                     THEN e.free ELSE 0 END), 0)::bigint AS free, \
                   COALESCE(SUM(CASE WHEN {SAME_CARD} AND {SAME_FINISH} \
                                     AND {STACK_LANGUAGE} \
                                     THEN e.sleeved ELSE 0 END), 0)::bigint AS sleeved, \
                   COALESCE(SUM(CASE WHEN {ANY_PRINTING} AND {SAME_FINISH} \
                                     AND {STACK_LANGUAGE} \
                                     THEN e.free ELSE 0 END), 0)::bigint AS free_any_printing, \
                   COALESCE(SUM(CASE WHEN {SAME_CARD} AND {STACK_LANGUAGE} \
                                     THEN e.free ELSE 0 END), 0)::bigint AS free_any_finish \
                 FROM collection_stock e \
                 LEFT JOIN printing ep ON ep.id = e.printing \
                 WHERE e.owner = $1 AND (e.printing = w.printing OR {ANY_PRINTING}) \
             ) a ON TRUE \
             {MARKET_LATERAL} \
             WHERE w.watch_list = $2 \
             ORDER BY w.uuid ASC"
        );

        let rows = (&mut *tx)
            .execute::<All>(
                statement,
                vec![
                    Value::Uuid(owner.into_inner()),
                    Value::Uuid(watch_list.into_inner()),
                ],
            )
            .await?;

        let mut entries = Vec::with_capacity(rows.len());
        for row in rows {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
            entries.push(WatchedEntry {
                entry: WatchListEntry {
                    uuid: WatchListEntryUuid::from_uuid(row.get("uuid").map_err(decode)?),
                    watch_list: WatchListUuid::from_uuid(row.get("watch_list").map_err(decode)?),
                    printing: row.get("printing").map_err(decode)?,
                    finish: finish_of(row.get::<String>("finish").map_err(decode)?.as_str()),
                    exact_printing: row.get("exact_printing").map_err(decode)?,
                    match_finish: row.get("match_finish").map_err(decode)?,
                    languages: languages_of(
                        row.get::<String>("languages").map_err(decode)?.as_str(),
                    ),
                    wanted: row.get("wanted").map_err(decode)?,
                    note: bounded(row.get::<String>("note").map_err(decode)?),
                    alarm_price_cents: row.get("alarm_price_cents").map_err(decode)?,
                    triggered_at: row.get("triggered_at").map_err(decode)?,
                    triggered_price_cents: row.get("triggered_price_cents").map_err(decode)?,
                    triggered_printing: row.get("triggered_printing").map_err(decode)?,
                    acknowledged: row.get("acknowledged").map_err(decode)?,
                    created_at: row.get("created_at").map_err(decode)?,
                },
                card: printing_of(&row)?,
                stock: WatchedStock {
                    free: row.get("free").map_err(decode)?,
                    sleeved: row.get("sleeved").map_err(decode)?,
                    free_any_printing: row.get("free_any_printing").map_err(decode)?,
                    free_any_finish: row.get("free_any_finish").map_err(decode)?,
                },
                market: market_of(&row)?,
            });
        }
        Ok(entries)
    }
}

/// Reads the stored language codes back out of a row
fn languages_of(packed: &str) -> Vec<String> {
    packed
        .split(',')
        .filter(|code| !code.is_empty())
        .map(str::to_owned)
        .collect()
}

/// Reads the priced printing off a row, `None` where nothing is priced
fn market_of(row: &rorm::db::row::Row) -> Result<Option<WatchedMarket>, rorm::Error> {
    let decode = |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
    let price: Option<i64> = row.get("market_price_cents").map_err(decode)?;
    let Some(price_cents) = price else {
        return Ok(None);
    };
    Ok(Some(WatchedMarket {
        printing: row.get("market_printing").map_err(decode)?,
        price_cents,
        cardmarket_id: row.get("market_cardmarket_id").map_err(decode)?,
        name: row.get("market_name").map_err(decode)?,
        set_code: row.get("market_set_code").map_err(decode)?,
        collector_number: row.get("market_collector_number").map_err(decode)?,
        lang: row.get("market_lang").map_err(decode)?,
    }))
}

/// Reads the catalog half of a row, `None` for a printing the catalog misses
fn printing_of(row: &rorm::db::row::Row) -> Result<Option<WatchedPrinting>, rorm::Error> {
    let decode = |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
    let name: Option<String> = row.get("name").map_err(decode)?;
    let Some(name) = name else {
        return Ok(None);
    };
    Ok(Some(WatchedPrinting {
        name,
        oracle_id: row.get("oracle_id").map_err(decode)?,
        set_code: row.get("set_code").map_err(decode)?,
        set_name: row.get("set_name").map_err(decode)?,
        collector_number: row.get("collector_number").map_err(decode)?,
        lang: row.get("lang").map_err(decode)?,
        cardmarket_id: row.get("cardmarket_id").map_err(decode)?,
        image_small: row.get("image_small").map_err(decode)?,
        image_normal: row.get("image_normal").map_err(decode)?,
        finishes: row.get("finishes").map_err(decode)?,
        price_eur: row.get("price_eur").map_err(decode)?,
        price_eur_foil: row.get("price_eur_foil").map_err(decode)?,
        updated_at: row.get("updated_at").map_err(decode)?,
    }))
}
