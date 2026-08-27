//! The overview a watch list is recognised by before it is opened
//!
//! The same shape a collection's tile is drawn from, read the same way: two
//! grouped statements for the whole grid rather than two per list. What differs
//! is what the numbers mean. A collection counts what is on the shelf; a watch
//! list counts what is wanted and prices what is still missing, because that is
//! the number somebody looking at a want list is actually asking about.

use std::collections::HashMap;

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;

use crate::models::account::AccountUuid;
use crate::models::watch_list::MARKET_LATERAL;
use crate::models::watch_list::STACK_LANGUAGE;
use crate::models::watch_list::WatchListUuid;
use crate::models::watch_list::bounded;

/// How many pieces of artwork a watch list hands to the overview
///
/// Two, side by side, exactly as a collection's tile and a deck's split their head.
const TILE_ARTS: i64 = 2;

/// The letters a colour identity is written with, in the order they are read
const COLOR_LETTERS: [char; 5] = ['W', 'U', 'B', 'R', 'G'];

/// Wanted copies per rarity
#[derive(Debug, Clone, Default)]
pub struct WatchedRarities {
    /// Wanted copies of common cards
    pub common: i64,
    /// Wanted copies of uncommon cards
    pub uncommon: i64,
    /// Wanted copies of rare cards
    pub rare: i64,
    /// Wanted copies of mythic rare cards
    pub mythic: i64,
    /// Wanted copies of everything else the catalog files separately
    pub other: i64,
}

/// What a watch list looks like from the outside
#[derive(Debug, Clone, Default)]
pub struct WatchListCounts {
    /// How many cards are on the list
    pub entries: i64,
    /// How many copies they ask for between them
    pub wanted: i64,
    /// How many of those copies are still missing
    pub missing: i64,
    /// What the missing copies cost, in euro cents
    ///
    /// Valued through the same expression the alarms are decided by, so the
    /// tile and the rows underneath it cannot come to two different bills.
    pub price_eur: i64,
    /// How many entries have a standing alarm
    pub alarms: i64,
    /// How many of those alarms the reader has not seen yet
    pub unread: i64,
    /// Wanted copies per rarity
    pub rarities: WatchedRarities,
    /// The colours the list asks for, as the letters `WUBRG`
    pub colors: String,
    /// Artwork of the dearest entries, at most [`TILE_ARTS`] of them
    pub arts: Vec<String>,
}

/// One watch list, with what is on it counted
#[derive(Debug, Clone)]
pub struct WatchListSummary {
    /// Primary key
    pub uuid: WatchListUuid,
    /// What the list is called
    pub name: MaxStr<255>,
    /// Description shown above the entries
    pub description: MaxStr<1024>,
    /// The colour it is drawn in
    pub color: MaxStr<16>,
    /// The pictogram drawn on it
    pub icon: MaxStr<32>,
    /// Everything counted about it
    pub counts: WatchListCounts,
    /// The point in time the list was created
    pub created_at: OffsetDateTime,
}

/// The copies of an entry that are still missing
///
/// Only the free ones count against it: a copy sleeved up in a deck is spoken
/// for, and billing the list as if it were available would send somebody
/// shopping for a card their own deck is holding.
const MISSING: &str = "GREATEST(w.wanted - a.free, 0)";

/// Whether a stack counts towards an entry, under the entry's own switches
///
/// The counting rule of [`super::availability`], spelled out again because this
/// statement joins under different aliases. Built rather than declared: it has
/// to carry [`STACK_LANGUAGE`] inside it, and a `const` holding a format
/// placeholder would reach the database with the braces still in it.
///
/// Reads `collection_stock`, the rollup the database keeps beside
/// `collection_entry` (see `migrations/0026_collection_stock.toml`), rather
/// than adding the stacks up here. Same number, different cost: the entries of
/// a large collection are tens of thousands of rows and this runs once per row
/// of the answer, while the rollup holds one row per printing and finish the
/// account owns and is reached through a key that starts with the owner.
///
/// Cast back to `bigint` at the end, for the same reason the sums in
/// [`super::availability`] are: `SUM()` over the rollup's `bigint` widens to
/// `numeric`, which the reader does not take.
///
/// Returns the scalar subquery, ready to be interpolated.
fn owned_free() -> String {
    format!(
        "COALESCE(( \
             SELECT SUM(e.free) FROM collection_stock e \
             LEFT JOIN printing ep ON ep.id = e.printing \
             WHERE e.owner = $1 \
               AND (CASE WHEN w.exact_printing THEN e.printing = w.printing \
                         ELSE CASE WHEN p.oracle_id IS NULL OR ep.oracle_id IS NULL \
                                   THEN e.printing = w.printing \
                                   ELSE ep.oracle_id = p.oracle_id END END) \
               AND (NOT (w.exact_printing AND w.match_finish) OR e.finish = w.finish) \
               AND {STACK_LANGUAGE} \
         ), 0)::bigint"
    )
}

impl WatchListSummary {
    /// Every watch list an account keeps, oldest first
    #[instrument(name = "WatchListSummary::read_for_account", skip(tx))]
    pub async fn read_for_account(
        tx: &mut Transaction,
        owner: AccountUuid,
    ) -> Result<Vec<WatchListSummary>, rorm::Error> {
        let owned = owned_free();
        let counted = format!(
            "SELECT w.watch_list AS watch_list, \
                    COUNT(*)::bigint AS entries, \
                    COALESCE(SUM(w.wanted), 0)::bigint AS wanted, \
                    COALESCE(SUM({MISSING}), 0)::bigint AS missing, \
                    COALESCE(SUM({MISSING} * COALESCE(m.market_price_cents, 0)), 0)::bigint AS price, \
                    COUNT(*) FILTER (WHERE w.triggered_at IS NOT NULL)::bigint AS alarms, \
                    COUNT(*) FILTER ( \
                        WHERE w.triggered_at IS NOT NULL AND NOT w.acknowledged \
                    )::bigint AS unread, \
                    COALESCE(SUM(CASE WHEN p.rarity = 'Common' THEN w.wanted ELSE 0 END), 0)::bigint AS common, \
                    COALESCE(SUM(CASE WHEN p.rarity = 'Uncommon' THEN w.wanted ELSE 0 END), 0)::bigint AS uncommon, \
                    COALESCE(SUM(CASE WHEN p.rarity = 'Rare' THEN w.wanted ELSE 0 END), 0)::bigint AS rare, \
                    COALESCE(SUM(CASE WHEN p.rarity = 'Mythic' THEN w.wanted ELSE 0 END), 0)::bigint AS mythic, \
                    COALESCE(SUM(CASE WHEN p.rarity IN ('Special', 'Bonus') THEN w.wanted ELSE 0 END), 0)::bigint \
                        AS other, \
                    COALESCE(STRING_AGG(DISTINCT p.color_identity, ''), '') AS colors \
             FROM watch_list_entry w \
             JOIN watch_list l ON l.uuid = w.watch_list \
             LEFT JOIN printing p ON p.id = w.printing \
             LEFT JOIN LATERAL (SELECT {owned} AS free) a ON TRUE \
             {MARKET_LATERAL} \
             WHERE l.owner = $1 \
             GROUP BY w.watch_list"
        );

        let rows = (&mut *tx)
            .execute::<All>(counted, vec![Value::Uuid(owner.into_inner())])
            .await?;

        let mut counts: HashMap<WatchListUuid, WatchListCounts> = HashMap::new();
        for row in rows {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
            let list = WatchListUuid::from_uuid(row.get("watch_list").map_err(decode)?);
            let colors: String = row.get("colors").map_err(decode)?;
            counts.insert(
                list,
                WatchListCounts {
                    entries: row.get("entries").map_err(decode)?,
                    wanted: row.get("wanted").map_err(decode)?,
                    missing: row.get("missing").map_err(decode)?,
                    price_eur: row.get("price").map_err(decode)?,
                    alarms: row.get("alarms").map_err(decode)?,
                    unread: row.get("unread").map_err(decode)?,
                    rarities: WatchedRarities {
                        common: row.get("common").map_err(decode)?,
                        uncommon: row.get("uncommon").map_err(decode)?,
                        rare: row.get("rare").map_err(decode)?,
                        mythic: row.get("mythic").map_err(decode)?,
                        other: row.get("other").map_err(decode)?,
                    },
                    colors: fold_colors(&colors),
                    arts: Vec::new(),
                },
            );
        }

        // The dearest entries of every list in one pass, ranked inside the
        // statement so only the two that reach a tile ever come back.
        let artwork = format!(
            "SELECT watch_list, image FROM ( \
                    SELECT w.watch_list AS watch_list, \
                           COALESCE(p.image_normal, p.image_small) AS image, \
                           ROW_NUMBER() OVER ( \
                               PARTITION BY w.watch_list \
                               ORDER BY COALESCE(m.market_price_cents, 0) DESC, \
                                        p.name ASC, w.uuid ASC \
                           ) AS rank \
                    FROM watch_list_entry w \
                    JOIN watch_list l ON l.uuid = w.watch_list \
                    JOIN printing p ON p.id = w.printing \
                    {MARKET_LATERAL} \
                    WHERE l.owner = $1 \
                      AND COALESCE(p.image_normal, p.image_small) IS NOT NULL \
                 ) ranked \
                 WHERE rank <= $2 \
                 ORDER BY watch_list, rank"
        );

        let rows = (&mut *tx)
            .execute::<All>(
                artwork,
                vec![Value::Uuid(owner.into_inner()), Value::I64(TILE_ARTS)],
            )
            .await?;

        for row in rows {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
            let list = WatchListUuid::from_uuid(row.get("watch_list").map_err(decode)?);
            let image: String = row.get("image").map_err(decode)?;
            counts.entry(list).or_default().arts.push(image);
        }

        // The lists themselves last, so one that holds nothing still gets a
        // tile: a want list is started before anything is on it, and a grid
        // that hides it until then is a grid somebody cannot find it in.
        let lists = "SELECT l.uuid, l.name, l.description, l.color, l.icon, l.created_at \
             FROM watch_list l WHERE l.owner = $1 ORDER BY l.uuid ASC";

        let rows = (&mut *tx)
            .execute::<All>(lists.to_owned(), vec![Value::Uuid(owner.into_inner())])
            .await?;

        let mut summaries = Vec::with_capacity(rows.len());
        for row in rows {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
            let uuid = WatchListUuid::from_uuid(row.get("uuid").map_err(decode)?);
            summaries.push(WatchListSummary {
                uuid,
                name: bounded(row.get::<String>("name").map_err(decode)?),
                description: bounded(row.get::<String>("description").map_err(decode)?),
                color: bounded(row.get::<String>("color").map_err(decode)?),
                icon: bounded(row.get::<String>("icon").map_err(decode)?),
                counts: counts.remove(&uuid).unwrap_or_default(),
                created_at: row.get("created_at").map_err(decode)?,
            });
        }
        Ok(summaries)
    }
}

/// The colours a heap of identities adds up to
///
/// The database hands over every identity on the list glued together, which is
/// unordered and full of repeats. What a tile shows is the five letters in the
/// order they are read, so that is what comes back.
fn fold_colors(glued: &str) -> String {
    COLOR_LETTERS
        .into_iter()
        .filter(|letter| glued.contains(*letter))
        .collect()
}
