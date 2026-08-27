//! What a deck asks for, what is already sleeved up in it, and where the rest
//! could come from
//!
//! The three lists behind the sourcing view. They are kept apart rather than
//! stitched into one tree, and every row carries the `oracle_id` of its card:
//! matching a slot against a stack is a grouping the client does, because it is
//! the client that decides how strictly to match. A player who only accepts the
//! printed edition and a player who takes any copy they own are looking at the
//! same data through different switches, and that is not worth two endpoints.
//!
//! Raw sql for the same reason as [`super::listing`]: `printing` is deliberately
//! not a foreign key, so there is no relation for the query builder to walk.

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
use crate::models::collection::CollectionEntryUuid;
use crate::models::collection::CollectionUuid;
use crate::models::collection::listing::condition_of;
use crate::models::collection::listing::finish_of;
use crate::models::deck::DeckCardUuid;
use crate::models::deck::DeckUuid;
use crate::models::deck::DeckZone;
use crate::models::deck::listing::zone_of;

/// The zones whose cards are really in the deck collection
///
/// A maybe board is a thought, not a pile of cardboard, so nothing is ever
/// sourced for it.
const PHYSICAL_ZONES: &str = "('Main', 'Commander', 'Companion', 'Side')";

/// What the catalog knows about a card the sourcing view shows
///
/// Every row of every list carries one of these, so a slot and the stack that
/// could fill it can be told apart at a glance: same card, different print.
#[derive(Debug, Clone)]
pub struct SourcedPrinting {
    /// The printed name
    pub name: String,
    /// Groups every printing of the same card, which is what a wider match uses
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
    /// Artwork for a tile, which a row-sized scan is too small for
    pub image_normal: Option<String>,
    /// What a copy costs, in euro cents
    pub price_eur: Option<i64>,
    /// What a foil copy costs, in euro cents
    pub price_eur_foil: Option<i64>,
}

/// One slot of the deck list, as the sourcing view sees it
#[derive(Debug, Clone)]
pub struct SourcingSlot {
    /// Primary key of the slot
    pub uuid: DeckCardUuid,
    /// Scryfall's id of the printing the list asks for
    pub printing: Uuid,
    /// How many copies it asks for
    pub quantity: i32,
    /// Which zone the slot sits in
    pub zone: DeckZone,
    /// Whether the list asks for foils
    pub foil: bool,
    /// What the catalog knows, `None` for a printing it has not caught up with
    pub card: Option<SourcedPrinting>,
}

/// One stack lying in the deck's own collection
#[derive(Debug, Clone)]
pub struct SourcedStack {
    /// Primary key of the stack
    pub uuid: CollectionEntryUuid,
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies the stack holds
    pub quantity: i32,
    /// Condition of the cards
    pub condition: CardCondition,
    /// Finish of the cards
    pub finish: CardFinish,
    /// The collection they were taken out of, `None` if they were bought into it
    pub origin: Option<CollectionUuid>,
    /// What that collection is called, `None` once it is gone
    pub origin_name: Option<String>,
    /// Its marker colour
    pub origin_color: Option<String>,
    /// Its marker pictogram
    pub origin_icon: Option<String>,
    /// What the catalog knows about the printing
    pub card: Option<SourcedPrinting>,
}

/// One stack elsewhere in the account that could fill a slot
#[derive(Debug, Clone)]
pub struct SourcingCandidate {
    /// Primary key of the stack
    pub uuid: CollectionEntryUuid,
    /// The collection it lies in
    pub collection: CollectionUuid,
    /// What that collection is called
    pub collection_name: String,
    /// Its marker colour
    pub collection_color: String,
    /// Its marker pictogram
    pub collection_icon: String,
    /// The deck it stands for, so taking from another deck is visibly that
    pub collection_deck: Option<DeckUuid>,
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies the stack holds
    pub quantity: i32,
    /// Condition of the cards
    pub condition: CardCondition,
    /// Finish of the cards
    pub finish: CardFinish,
    /// What the catalog knows about the printing
    pub card: SourcedPrinting,
}

/// Everything the sourcing view is drawn from
#[derive(Debug, Clone, Default)]
pub struct DeckSourcing {
    /// What the list asks for
    pub slots: Vec<SourcingSlot>,
    /// What is filed in the deck's own collection
    pub filed: Vec<SourcedStack>,
    /// What could still be taken from elsewhere
    pub candidates: Vec<SourcingCandidate>,
}

impl DeckSourcing {
    /// Read all three lists for one deck
    ///
    /// The caller has to have established that the account may administer the
    /// deck. `collection` is the deck's own, `None` while it keeps none — then
    /// nothing is filed and nothing is excluded from the candidates.
    #[instrument(name = "DeckSourcing::read", skip(tx))]
    pub async fn read(
        tx: &mut Transaction,
        owner: AccountUuid,
        deck: DeckUuid,
        collection: Option<CollectionUuid>,
    ) -> Result<DeckSourcing, rorm::Error> {
        let slots = read_slots(&mut *tx, deck).await?;
        let filed = match collection {
            Some(collection) => read_filed(&mut *tx, collection).await?,
            None => Vec::new(),
        };
        let candidates = read_candidates(&mut *tx, owner, deck, collection).await?;

        Ok(DeckSourcing {
            slots,
            filed,
            candidates,
        })
    }
}

/// The columns every list reads out of the catalog
const PRINTING_COLUMNS: &str = "p.name, p.oracle_id, p.set_code, p.set_name, \
     p.collector_number, p.lang, p.cardmarket_id, p.image_small, p.image_normal, \
     p.price_eur, p.price_eur_foil";

/// Reads the catalog half of a row, `None` for a printing the catalog misses
fn printing_of(row: &rorm::db::row::Row) -> Result<Option<SourcedPrinting>, rorm::Error> {
    let decode = |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
    let name: Option<String> = row.get("name").map_err(decode)?;
    let Some(name) = name else {
        return Ok(None);
    };
    Ok(Some(SourcedPrinting {
        name,
        oracle_id: row.get("oracle_id").map_err(decode)?,
        set_code: row.get("set_code").map_err(decode)?,
        set_name: row.get("set_name").map_err(decode)?,
        collector_number: row.get("collector_number").map_err(decode)?,
        lang: row.get("lang").map_err(decode)?,
        cardmarket_id: row.get("cardmarket_id").map_err(decode)?,
        image_small: row.get("image_small").map_err(decode)?,
        image_normal: row.get("image_normal").map_err(decode)?,
        price_eur: row.get("price_eur").map_err(decode)?,
        price_eur_foil: row.get("price_eur_foil").map_err(decode)?,
    }))
}

/// What the deck list asks for, in the order the slots were added
pub(in crate::models) async fn read_slots(
    tx: &mut Transaction,
    deck: DeckUuid,
) -> Result<Vec<SourcingSlot>, rorm::Error> {
    let statement = format!(
        "SELECT c.uuid, c.printing, c.quantity, c.zone, c.foil, {PRINTING_COLUMNS} \
         FROM deckcard c \
         LEFT JOIN printing p ON p.id = c.printing \
         WHERE c.deck = $1 AND c.zone IN {PHYSICAL_ZONES} \
         ORDER BY c.uuid ASC"
    );

    let rows = (&mut *tx)
        .execute::<All>(statement, vec![Value::Uuid(deck.into_inner())])
        .await?;

    let mut slots = Vec::with_capacity(rows.len());
    for row in rows {
        let decode = |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
        slots.push(SourcingSlot {
            uuid: DeckCardUuid::from_uuid(row.get("uuid").map_err(decode)?),
            printing: row.get("printing").map_err(decode)?,
            quantity: row.get("quantity").map_err(decode)?,
            zone: zone_of(row.get::<String>("zone").map_err(decode)?.as_str()),
            foil: row.get("foil").map_err(decode)?,
            card: printing_of(&row)?,
        });
    }
    Ok(slots)
}

/// What is lying in the deck's own collection, oldest first
pub(in crate::models) async fn read_filed(
    tx: &mut Transaction,
    collection: CollectionUuid,
) -> Result<Vec<SourcedStack>, rorm::Error> {
    let statement = format!(
        "SELECT e.uuid, e.printing, e.quantity, e.condition, e.finish, e.origin, \
                o.name AS origin_name, o.color AS origin_color, o.icon AS origin_icon, \
                {PRINTING_COLUMNS} \
         FROM collection_entry e \
         LEFT JOIN collection o ON o.uuid = e.origin \
         LEFT JOIN printing p ON p.id = e.printing \
         WHERE e.collection = $1 \
         ORDER BY e.uuid ASC"
    );

    let rows = (&mut *tx)
        .execute::<All>(statement, vec![Value::Uuid(collection.into_inner())])
        .await?;

    let mut filed = Vec::with_capacity(rows.len());
    for row in rows {
        let decode = |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
        let origin: Option<Uuid> = row.get("origin").map_err(decode)?;
        filed.push(SourcedStack {
            uuid: CollectionEntryUuid::from_uuid(row.get("uuid").map_err(decode)?),
            printing: row.get("printing").map_err(decode)?,
            quantity: row.get("quantity").map_err(decode)?,
            condition: condition_of(row.get::<String>("condition").map_err(decode)?.as_str()),
            finish: finish_of(row.get::<String>("finish").map_err(decode)?.as_str()),
            origin: origin.map(CollectionUuid::from_uuid),
            origin_name: row.get("origin_name").map_err(decode)?,
            origin_color: row.get("origin_color").map_err(decode)?,
            origin_icon: row.get("origin_icon").map_err(decode)?,
            card: printing_of(&row)?,
        });
    }
    Ok(filed)
}

/// Every stack of the account that holds one of the cards the deck asks for
///
/// Matched over `oracle_id`, which is as wide as it gets: any printing of the
/// card counts here, and the client narrows it down. Only collections are asked,
/// never another deck's collection: a card that is sleeved up somewhere else is
/// spoken for, and offering it here would mean taking somebody's deck apart by
/// accident.
async fn read_candidates(
    tx: &mut Transaction,
    owner: AccountUuid,
    deck: DeckUuid,
    collection: Option<CollectionUuid>,
) -> Result<Vec<SourcingCandidate>, rorm::Error> {
    let statement = format!(
        "SELECT e.uuid, e.collection, e.printing, e.quantity, e.condition, e.finish, \
                c.name AS collection_name, c.color AS collection_color, \
                c.icon AS collection_icon, c.deck AS collection_deck, \
                {PRINTING_COLUMNS} \
         FROM collection_entry e \
         JOIN collection c ON c.uuid = e.collection \
         JOIN printing p ON p.id = e.printing \
         WHERE c.owner = $1 \
           AND c.deck IS NULL \
           AND c.uuid <> $2 \
           AND p.oracle_id IN ( \
                SELECT d.oracle_id FROM deckcard s \
                JOIN printing d ON d.id = s.printing \
                WHERE s.deck = $3 AND s.zone IN {PHYSICAL_ZONES} \
                  AND d.oracle_id IS NOT NULL \
           ) \
         ORDER BY c.name ASC, e.uuid ASC"
    );

    // A deck without a collection of its own excludes nothing; the nil uuid
    // matches no row and keeps the statement a single shape.
    let own = collection.map_or_else(Uuid::nil, CollectionUuid::into_inner);
    let rows = (&mut *tx)
        .execute::<All>(
            statement,
            vec![
                Value::Uuid(owner.into_inner()),
                Value::Uuid(own),
                Value::Uuid(deck.into_inner()),
            ],
        )
        .await?;

    let mut candidates = Vec::with_capacity(rows.len());
    for row in rows {
        let decode = |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
        let Some(card) = printing_of(&row)? else {
            continue;
        };
        let collection_deck: Option<Uuid> = row.get("collection_deck").map_err(decode)?;
        candidates.push(SourcingCandidate {
            uuid: CollectionEntryUuid::from_uuid(row.get("uuid").map_err(decode)?),
            collection: CollectionUuid::from_uuid(row.get("collection").map_err(decode)?),
            collection_name: row.get("collection_name").map_err(decode)?,
            collection_color: row.get("collection_color").map_err(decode)?,
            collection_icon: row.get("collection_icon").map_err(decode)?,
            collection_deck: collection_deck.map(DeckUuid::from_uuid),
            printing: row.get("printing").map_err(decode)?,
            quantity: row.get("quantity").map_err(decode)?,
            condition: condition_of(row.get::<String>("condition").map_err(decode)?.as_str()),
            finish: finish_of(row.get::<String>("finish").map_err(decode)?.as_str()),
            card,
        });
    }
    Ok(candidates)
}
