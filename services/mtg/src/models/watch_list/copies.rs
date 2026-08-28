//! Where the copies of a watched card actually are
//!
//! The meter on a row says how many copies are free and how many are sleeved
//! up. This is the question that follows: *which* ones, and where. A stack in a
//! binder and a stack inside a deck are two very different answers to "do I
//! have it", and only the second one comes with an errand attached.
//!
//! Only the stacks the entry's own switches accept are listed. A row that says
//! two copies and then lists five would be arguing with itself; what the
//! switches turn away is already reported as a hint on the row.

use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::card_attributes::CardCondition;
use crate::models::card_attributes::CardFinish;
use crate::models::collection::CollectionUuid;
use crate::models::collection::listing::condition_of;
use crate::models::collection::listing::finish_of;
use crate::models::deck::DeckUuid;
use crate::models::watch_list::SAME_CARD;
use crate::models::watch_list::SAME_FINISH;
use crate::models::watch_list::STACK_LANGUAGE;
use crate::models::watch_list::WatchListEntryUuid;
use crate::models::watch_list::WatchListUuid;

/// One stack of a watched card, and where it lies
#[derive(Debug, Clone)]
pub struct WatchedCopy {
    /// Scryfall's id of the printing this stack holds
    pub printing: Uuid,
    /// How many copies the stack holds
    pub quantity: i32,
    /// Condition of the cards
    pub condition: CardCondition,
    /// Finish of the cards
    pub finish: CardFinish,
    /// The collection the stack lies in
    pub collection: CollectionUuid,
    /// What that collection is called
    pub collection_name: String,
    /// Its marker colour
    pub collection_color: String,
    /// Its marker pictogram
    pub collection_icon: String,
    /// The deck the collection stands for, `None` for a collection on a shelf
    ///
    /// What tells a copy that can be picked up today from one that is sleeved
    /// into something, which is the whole reason this list is worth opening.
    pub deck: Option<DeckUuid>,
    /// What that deck is called
    pub deck_name: Option<String>,
    /// The printed name, `None` while the catalog misses the printing
    pub name: Option<String>,
    /// Set code, upper case
    pub set_code: Option<String>,
    /// Full set name
    pub set_name: Option<String>,
    /// Collector number as printed
    pub collector_number: Option<String>,
    /// Language of the printing, as Scryfall's code
    pub lang: Option<String>,
    /// Artwork for a list row
    pub image_small: Option<String>,
}

impl WatchedCopy {
    /// Every stack one entry counts, the free ones first
    ///
    /// Ordered the way the question is asked: what can be picked up today, then
    /// what would mean taking a deck apart.
    #[instrument(name = "WatchedCopy::read_for_entry", skip(tx))]
    pub async fn read_for_entry(
        tx: &mut Transaction,
        owner: AccountUuid,
        watch_list: WatchListUuid,
        entry: WatchListEntryUuid,
    ) -> Result<Vec<WatchedCopy>, rorm::Error> {
        let statement = format!(
            "SELECT e.printing, e.quantity, e.condition, e.finish, \
                    c.uuid AS collection, c.name AS collection_name, \
                    c.color AS collection_color, c.icon AS collection_icon, \
                    c.deck AS deck, d.name AS deck_name, \
                    ep.name, ep.set_code, ep.set_name, ep.collector_number, \
                    ep.lang, ep.image_small \
             FROM watch_list_entry w \
             JOIN watch_list l ON l.uuid = w.watch_list AND l.owner = $1 \
             LEFT JOIN printing p ON p.id = w.printing \
             JOIN collection c ON c.owner = $1 \
             JOIN collection_entry e ON e.collection = c.uuid \
             LEFT JOIN printing ep ON ep.id = e.printing \
             LEFT JOIN deck d ON d.uuid = c.deck \
             WHERE w.uuid = $2 AND w.watch_list = $3 \
               AND {SAME_CARD} AND {SAME_FINISH} AND {STACK_LANGUAGE} \
             ORDER BY (c.deck IS NOT NULL), c.name ASC, ep.set_code ASC, \
                      ep.collector_number_sort ASC, e.uuid ASC"
        );

        let rows = (&mut *tx)
            .execute::<All>(
                statement,
                vec![
                    Value::Uuid(owner.into_inner()),
                    Value::Uuid(entry.into_inner()),
                    Value::Uuid(watch_list.into_inner()),
                ],
            )
            .await?;

        let mut copies = Vec::with_capacity(rows.len());
        for row in rows {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
            let deck: Option<Uuid> = row.get("deck").map_err(decode)?;
            copies.push(WatchedCopy {
                printing: row.get("printing").map_err(decode)?,
                quantity: row.get("quantity").map_err(decode)?,
                condition: condition_of(row.get::<String>("condition").map_err(decode)?.as_str()),
                finish: finish_of(row.get::<String>("finish").map_err(decode)?.as_str()),
                collection: CollectionUuid::from_uuid(row.get("collection").map_err(decode)?),
                collection_name: row.get("collection_name").map_err(decode)?,
                collection_color: row.get("collection_color").map_err(decode)?,
                collection_icon: row.get("collection_icon").map_err(decode)?,
                deck: deck.map(DeckUuid::from_uuid),
                deck_name: row.get("deck_name").map_err(decode)?,
                name: row.get("name").map_err(decode)?,
                set_code: row.get("set_code").map_err(decode)?,
                set_name: row.get("set_name").map_err(decode)?,
                collector_number: row.get("collector_number").map_err(decode)?,
                lang: row.get("lang").map_err(decode)?,
                image_small: row.get("image_small").map_err(decode)?,
            });
        }
        Ok(copies)
    }
}
