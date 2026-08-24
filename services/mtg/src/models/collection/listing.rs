//! Reading a collection a page at a time, joined against the catalog
//!
//! The whole point of the catalog is here: sorting by card name, filtering by
//! rarity and paging are all things the database can do in one indexed query,
//! and all things the client used to do by fetching every row and asking
//! Scryfall about each one.
//!
//! Written as raw sql because rorm cannot express this join — `printing` is
//! deliberately not a foreign key of `collection_entry`, so there is no
//! relation for the query builder to walk. The statement is still prepared with
//! bound parameters; every piece of it that is spliced in as text is chosen
//! from a fixed set here, never taken from a request.

use std::collections::HashMap;

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::time::Date;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::executor::One;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use serde::Deserialize;
use serde::Serialize;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::card_attributes::CardCondition;
use crate::models::card_attributes::CardFinish;
use crate::models::card_attributes::CardRarity;
use crate::models::collection::CollectionEntryUuid;
use crate::models::collection::CollectionUuid;
use crate::models::deck::DeckUuid;
use crate::models::deck::tag::DeckTagUuid;
use crate::models::printing::fold_name;

/// A stack out of this collection that is sleeved up in a deck right now
///
/// Not a row of the collection any more: the cards moved, and the collection is lighter for
/// it. What is left behind is the memory of where they came from, and this is
/// that memory read back the other way round, so a shelf can answer "where is
/// my second Sol Ring" without opening every deck.
#[derive(Debug, Clone)]
pub struct OnLoan {
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies of it are in that deck
    pub quantity: i32,
    /// The deck they are in
    pub deck: DeckUuid,
    /// What that deck is called
    pub deck_name: String,
    /// The card's name, `None` for a printing the catalog has not caught up with
    pub name: Option<String>,
    /// Full set name
    pub set_name: Option<String>,
    /// Set code, upper case
    pub set_code: Option<String>,
    /// Collector number as printed
    pub collector_number: Option<String>,
    /// Artwork for a list row
    pub image_small: Option<String>,
}

impl OnLoan {
    /// Everything that came out of one collection and is in a deck right now
    ///
    /// The caller has to have established that the account may administer the
    /// collection; this only takes its id.
    #[instrument(name = "OnLoan::read_for_collection", skip(tx))]
    pub async fn read_for_collection(
        tx: &mut Transaction,
        collection: CollectionUuid,
    ) -> Result<Vec<OnLoan>, rorm::Error> {
        let statement = "SELECT e.printing, e.quantity, d.uuid AS deck, d.name AS deck_name, \
                    p.name, p.set_name, p.set_code, p.collector_number, p.image_small \
             FROM collection_entry e \
             JOIN collection c ON c.uuid = e.collection \
             JOIN deck d ON d.uuid = c.deck \
             LEFT JOIN printing p ON p.id = e.printing \
             WHERE e.origin = $1 \
             ORDER BY d.name ASC, p.name ASC"
            .to_string();

        let rows = (&mut *tx)
            .execute::<All>(statement, vec![Value::Uuid(collection.into_inner())])
            .await?;

        let mut loans = Vec::with_capacity(rows.len());
        for row in rows {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
            loans.push(OnLoan {
                printing: row.get("printing").map_err(decode)?,
                quantity: row.get("quantity").map_err(decode)?,
                deck: DeckUuid::from_uuid(row.get("deck").map_err(decode)?),
                deck_name: row.get("deck_name").map_err(decode)?,
                name: row.get("name").map_err(decode)?,
                set_name: row.get("set_name").map_err(decode)?,
                set_code: row.get("set_code").map_err(decode)?,
                collector_number: row.get("collector_number").map_err(decode)?,
                image_small: row.get("image_small").map_err(decode)?,
            });
        }
        Ok(loans)
    }
}

/// Copies per rarity in a collection
///
/// The five buckets the bar under a collection is drawn from. `other` holds
/// the timeshifted and bonus-sheet rarities, which are too rare to earn their
/// own segment and too odd to fold into a real one.
#[derive(Debug, Clone, Default)]
pub struct RarityCounts {
    /// Copies of common cards
    pub common: i64,
    /// Copies of uncommon cards
    pub uncommon: i64,
    /// Copies of rare cards
    pub rare: i64,
    /// Copies of mythic rare cards
    pub mythic: i64,
    /// Copies of everything else the catalog files separately
    pub other: i64,
}

/// What a collection looks like from the outside
///
/// Everything the overview shows for a collection without opening it: how much is in
/// it, what that is worth, what it plays, and the artwork of the best cards in
/// it. Stacks whose printing the catalog does not know still count as cards,
/// they just carry no value, which is the same rule the statistics page
/// follows.
#[derive(Debug, Clone, Default)]
pub struct CollectionSummary {
    /// How many copies are filed in the collection
    pub cards: i64,
    /// What those copies are worth in euro cents
    pub price_eur: i64,
    /// Copies per rarity
    pub rarities: RarityCounts,
    /// The colours the collection holds, as the letters `WUBRG`
    pub colors: String,
    /// Artwork of the most valuable stacks, at most [`TILE_ARTS`] of them
    pub arts: Vec<String>,
}

/// How many pieces of artwork a collection hands to the overview
///
/// Two, because that is what a tile can show side by side; the deck list splits
/// its head between two commanders the same way.
const TILE_ARTS: i64 = 2;

/// The letters a colour identity is written with, in the order they are read
const COLOR_LETTERS: [char; 5] = ['W', 'U', 'B', 'R', 'G'];

impl CollectionSummary {
    /// Read the summary of every collection of an account, keyed by collection
    ///
    /// Two grouped statements for the whole list rather than two per collection: the
    /// numbers are one read, and the artwork is a second one because a collection
    /// contributes several rows to it. Foils are valued with the foil price
    /// where the catalog has one, the same way [`super::statistics`] values
    /// them.
    #[instrument(name = "CollectionSummary::read_for_account", skip(tx))]
    pub async fn read_for_account(
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<HashMap<CollectionUuid, CollectionSummary>, rorm::Error> {
        let statement = "SELECT e.collection AS collection, \
                    COALESCE(SUM(e.quantity), 0)::bigint AS cards, \
                    COALESCE(SUM(e.quantity * COALESCE(CASE WHEN e.finish = 'Foil' \
                        THEN COALESCE(p.price_eur_foil, p.price_eur) \
                        ELSE p.price_eur END, 0)), 0)::bigint AS price, \
                    COALESCE(SUM(CASE WHEN p.rarity = 'Common' THEN e.quantity ELSE 0 END), 0)::bigint AS common, \
                    COALESCE(SUM(CASE WHEN p.rarity = 'Uncommon' THEN e.quantity ELSE 0 END), 0)::bigint AS uncommon, \
                    COALESCE(SUM(CASE WHEN p.rarity = 'Rare' THEN e.quantity ELSE 0 END), 0)::bigint AS rare, \
                    COALESCE(SUM(CASE WHEN p.rarity = 'Mythic' THEN e.quantity ELSE 0 END), 0)::bigint AS mythic, \
                    COALESCE(SUM(CASE WHEN p.rarity IN ('Special', 'Bonus') THEN e.quantity ELSE 0 END), 0)::bigint \
                        AS other, \
                    COALESCE(STRING_AGG(DISTINCT p.color_identity, ''), '') AS colors \
             FROM collection_entry e \
             JOIN collection c ON c.uuid = e.collection \
             LEFT JOIN printing p ON p.id = e.printing \
             WHERE c.owner = $1 \
             GROUP BY e.collection"
            .to_string();

        let rows = (&mut *tx)
            .execute::<All>(statement, vec![Value::Uuid(account.into_inner())])
            .await?;

        let mut summaries: HashMap<CollectionUuid, CollectionSummary> = HashMap::new();
        for row in rows {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
            let collection = CollectionUuid::from_uuid(row.get("collection").map_err(decode)?);
            let colors: String = row.get("colors").map_err(decode)?;
            summaries.insert(
                collection,
                CollectionSummary {
                    cards: row.get("cards").map_err(decode)?,
                    price_eur: row.get("price").map_err(decode)?,
                    rarities: RarityCounts {
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

        // The most valuable stacks of every collection in one pass. Ranking inside the
        // statement rather than reading every row and sorting here: a shelf of
        // full collections is hundreds of thousands of stacks, and only two of each
        // ever reach a tile.
        let artwork = "SELECT collection, image FROM ( \
                    SELECT e.collection AS collection, \
                           COALESCE(p.image_normal, p.image_small) AS image, \
                           ROW_NUMBER() OVER ( \
                               PARTITION BY e.collection \
                               ORDER BY e.quantity * COALESCE(CASE WHEN e.finish = 'Foil' \
                                   THEN COALESCE(p.price_eur_foil, p.price_eur) \
                                   ELSE p.price_eur END, 0) DESC, p.name ASC, e.uuid ASC \
                           ) AS rank \
                    FROM collection_entry e \
                    JOIN collection c ON c.uuid = e.collection \
                    JOIN printing p ON p.id = e.printing \
                    WHERE c.owner = $1 \
                      AND COALESCE(p.image_normal, p.image_small) IS NOT NULL \
                 ) ranked \
                 WHERE rank <= $2 \
                 ORDER BY collection, rank"
            .to_string();

        let rows = (&mut *tx)
            .execute::<All>(
                artwork,
                vec![Value::Uuid(account.into_inner()), Value::I64(TILE_ARTS)],
            )
            .await?;

        for row in rows {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
            let collection = CollectionUuid::from_uuid(row.get("collection").map_err(decode)?);
            let image: String = row.get("image").map_err(decode)?;
            summaries.entry(collection).or_default().arts.push(image);
        }

        Ok(summaries)
    }
}

/// The colours a heap of identities adds up to
///
/// The database hands over every identity in the collection glued together, which is
/// unordered and full of repeats. What a tile shows is the five letters in the
/// order they are read, so that is what comes back.
fn fold_colors(glued: &str) -> String {
    COLOR_LETTERS
        .into_iter()
        .filter(|letter| glued.contains(*letter))
        .collect()
}

/// The largest page that may be asked for
///
/// A page is meant to be looked at; anything beyond this is a client trying to
/// use the endpoint as an export, which is what the whole rewrite was getting
/// away from.
pub const MAX_LIMIT: u32 = 200;

/// The grade of a stack as a number, best first
///
/// A static fragment, not built from anything a request carries. The order
/// mirrors [`CardCondition`]'s variants, which is the Cardmarket scale.
const CONDITION_RANK: &str = "CASE e.condition \
     WHEN 'Mint' THEN 0 WHEN 'NearMint' THEN 1 WHEN 'Excellent' THEN 2 \
     WHEN 'Good' THEN 3 WHEN 'LightPlayed' THEN 4 WHEN 'Played' THEN 5 ELSE 6 END";

/// What one copy of a stack is worth, in euro cents
///
/// A foil stack is worth the foil price; falling back to the ordinary one keeps
/// a foil Scryfall has not priced from sorting as worthless.
const UNIT_PRICE: &str = "CASE WHEN e.finish = 'Nonfoil' THEN p.price_eur \
     ELSE COALESCE(p.price_eur_foil, p.price_eur) END";

/// What a collection can be ordered by
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EntrySort {
    /// The order the stacks were filed in
    #[default]
    Filed,
    /// Card name
    Name,
    /// Set, then collector number — the order a binder is in
    Set,
    /// Rarity, commonest first
    Rarity,
    /// Mana value
    ManaValue,
    /// What one copy is worth
    UnitPrice,
    /// What the whole stack is worth
    StackValue,
    /// How many copies the stack holds
    Quantity,
    /// Condition, best first
    Condition,
}

impl EntrySort {
    /// The expression to order by
    ///
    /// Every branch returns a literal, so nothing a caller supplies reaches the
    /// statement as text.
    fn expression(self) -> &'static str {
        match self {
            Self::Filed => "e.uuid",
            Self::Name => "p.name_sort",
            Self::Set => "p.set_code",
            Self::Rarity => "p.rarity_rank",
            Self::ManaValue => "p.mana_value",
            Self::UnitPrice => UNIT_PRICE,
            Self::StackValue => {
                "(e.quantity * COALESCE(CASE WHEN e.finish = 'Nonfoil' THEN p.price_eur ELSE COALESCE(p.price_eur_foil, p.price_eur) END, 0))"
            }
            Self::Quantity => "e.quantity",
            Self::Condition => CONDITION_RANK,
        }
    }

    /// A second key, where the first one leaves ties that matter
    fn tiebreaker(self) -> Option<&'static str> {
        match self {
            // Within a set, the binder order is the collector number.
            Self::Set => Some("p.collector_number_sort"),
            _ => None,
        }
    }
}

/// Which page of which collection, in what order
#[derive(Debug, Clone)]
pub struct EntryQuery {
    /// What to order by
    pub sort: EntrySort,
    /// Whether to reverse that order
    pub descending: bool,
    /// How many stacks to return
    pub limit: u32,
    /// How many to skip
    ///
    /// Only consulted when there is no [`Self::after`] to start from.
    pub offset: u32,
    /// Continue after this stack rather than counting rows off the front
    ///
    /// Only honoured for [`EntrySort::Filed`], whose key is the primary key
    /// itself. The other orders would need the sort value carried alongside the
    /// key to resume unambiguously, which is a bigger cursor than this.
    pub after: Option<CollectionEntryUuid>,
    /// Free text matched against the card name
    pub search: Option<String>,
    /// Only stacks in this condition
    pub condition: Option<CardCondition>,
    /// Only stacks with this finish
    pub finish: Option<CardFinish>,
    /// Only cards of this rarity
    pub rarity: Option<CardRarity>,
    /// Only stacks of this printing
    ///
    /// What "is this card already filed here" is asked with, so that filing a
    /// card the reader cannot currently see still tops up its stack instead of
    /// starting a second one.
    pub printing: Option<Uuid>,
}

impl EntryQuery {
    /// Whether this page can be resumed by primary key
    ///
    /// Only the filed order can: it *is* the key order. Sorting by anything
    /// else leaves ties the key alone cannot resume from.
    fn uses_cursor(&self) -> bool {
        self.sort == EntrySort::Filed && self.after.is_some()
    }
}

/// What the catalog knows about a listed stack's card
#[derive(Debug, Clone)]
pub struct ListedCard {
    /// The printed name
    pub name: String,
    /// Set code, upper case
    pub set_code: String,
    /// Full set name
    pub set_name: String,
    /// Collector number as printed
    pub collector_number: String,
    /// Language of the printing, as Scryfall's code
    pub lang: String,
    /// Cardmarket's product id, `None` when Cardmarket does not stock it
    pub cardmarket_id: Option<i32>,
    /// How rare the printing is
    pub rarity: CardRarity,
    /// Mana value
    pub mana_value: f64,
    /// Colour identity letters
    pub color_identity: String,
    /// Type line as printed
    pub type_line: String,
    /// Artwork for a list row
    pub image_small: Option<String>,
    /// Artwork for a closer look, which a thumbnail cannot give
    pub image_normal: Option<String>,
    /// The back face's artwork for a list row, `None` for a one-faced card
    pub image_back_small: Option<String>,
    /// The back face's artwork for a closer look
    pub image_back_normal: Option<String>,
    /// Market price in euro cents
    pub price_eur: Option<i64>,
    /// Foil market price in euro cents
    pub price_eur_foil: Option<i64>,
    /// Comma separated finishes this printing exists in
    pub finishes: String,
    /// Whether the card is on the reserved list
    pub reserved: bool,
}

/// One stack, with its card
#[derive(Debug, Clone)]
pub struct ListedEntry {
    /// Primary key
    pub uuid: CollectionEntryUuid,
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies this stack holds
    pub quantity: i32,
    /// Condition of the cards
    pub condition: CardCondition,
    /// Finish of the cards
    pub finish: CardFinish,
    /// What was paid per copy, in euro cents
    pub purchase_price_cents: Option<i64>,
    /// The day the cards were acquired
    pub acquired_at: Option<Date>,
    /// When the stack was filed
    pub created_at: OffsetDateTime,
    /// The card, `None` while the catalog has not caught up with the printing
    pub card: Option<ListedCard>,
    /// The owner's card-wide tags on the card this stack holds
    pub tags: Vec<DeckTagUuid>,
}

/// A page of a collection, and how much there is to page through
#[derive(Debug, Clone)]
pub struct EntryPage {
    /// The stacks on this page
    pub entries: Vec<ListedEntry>,
    /// How many stacks match the filters in total
    ///
    /// Stacks, not cards — this is what the pager counts pages off.
    pub total: i64,
    /// How many copies those stacks hold
    ///
    /// What is actually in the collection: a stack of four counts four. The two
    /// numbers answer different questions, and only this one answers "how many
    /// cards do I have".
    pub total_copies: i64,
    /// What to pass as `after` to continue, `None` at the end or when the sort
    /// order cannot be resumed by key
    pub next_cursor: Option<CollectionEntryUuid>,
}

/// Builds the `WHERE` fragments and the values they bind
///
/// Kept together so the two can never drift apart — a condition added without
/// its value would shift every later placeholder.
struct Filters<'query> {
    /// Sql fragments, joined with `AND`
    clauses: Vec<String>,
    /// The values, in placeholder order
    values: Vec<Value<'query>>,
}

impl<'query> Filters<'query> {
    /// Assembles the filters a query asks for
    ///
    /// `pattern` is passed in rather than built here so that it outlives the
    /// borrow the value list takes of it.
    fn build(
        collection: CollectionUuid,
        query: &'query EntryQuery,
        pattern: &'query Option<String>,
    ) -> Self {
        let mut filters = Self {
            clauses: Vec::new(),
            values: Vec::new(),
        };

        filters.push("e.collection = ", Value::Uuid(collection.into_inner()));

        if let Some(pattern) = pattern {
            filters.push("p.name_sort LIKE ", Value::String(pattern));
        }
        if let Some(condition) = &query.condition {
            filters.push("e.condition = ", Value::String(condition.as_str()));
        }
        if let Some(finish) = &query.finish {
            filters.push("e.finish = ", Value::String(finish.as_str()));
        }
        if let Some(rarity) = &query.rarity {
            filters.push("p.rarity = ", Value::String(rarity.as_str()));
        }
        if let Some(printing) = query.printing {
            filters.push("e.printing = ", Value::Uuid(printing));
        }

        // Resuming by key rather than by counting rows off the front. The
        // uuids are v7, so their order is the order the stacks were filed in,
        // and `(collection, uuid)` is indexed in exactly that order — the page
        // becomes a range scan whose cost does not grow with how deep it sits.
        if let Some(after) = query.after.filter(|_| query.uses_cursor()) {
            let comparison = if query.descending {
                "e.uuid < "
            } else {
                "e.uuid > "
            };
            filters.push(comparison, Value::Uuid(after.into_inner()));
        }

        filters
    }

    /// Adds one comparison and the value it binds
    fn push(&mut self, column: &str, value: Value<'query>) {
        self.values.push(value);
        self.clauses.push(format!("{column}${}", self.values.len()));
    }

    /// The clauses as one `WHERE` body
    fn where_clause(&self) -> String {
        self.clauses.join(" AND ")
    }
}

impl EntryPage {
    /// Reads one page of a collection
    ///
    /// The caller has to have established that the account may see the
    /// collection; this only takes the collection's id.
    #[instrument(name = "EntryPage::read", skip(tx))]
    pub async fn read(
        tx: &mut Transaction,
        collection: CollectionUuid,
        query: &EntryQuery,
    ) -> Result<EntryPage, rorm::Error> {
        // `LIKE` over the folded column, so a search for "aether" finds
        // "Æther Vial". The wildcards are added here rather than by the caller,
        // which also keeps a `%` typed into the search collection from meaning
        // anything.
        let pattern = query
            .search
            .as_deref()
            .map(|search| format!("%{}%", fold_name(search).replace('%', "\\%")));

        let filters = Filters::build(collection, query, &pattern);
        let where_clause = filters.where_clause();

        // Stacks and copies in one pass: the pager needs the first, and "how
        // many cards is this" is only ever answered by the second. `sum` is
        // null over no rows, which is zero cards by any reading.
        let (total, total_copies): (i64, i64) = {
            let count = format!(
                "SELECT count(*), coalesce(sum(e.quantity), 0) FROM collection_entry e \
                 LEFT JOIN printing p ON p.id = e.printing WHERE {where_clause}"
            );
            let row = (&mut *tx)
                .execute::<One>(count, filters.values.clone())
                .await?;
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());

            (row.get(0).map_err(decode)?, row.get(1).map_err(decode)?)
        };

        let direction = if query.descending { "DESC" } else { "ASC" };
        let mut order = format!("{} {direction} NULLS LAST", query.sort.expression());
        if let Some(tiebreaker) = query.sort.tiebreaker() {
            order.push_str(&format!(", {tiebreaker} {direction} NULLS LAST"));
        }
        // The primary key closes every order: without it two stacks that tie on
        // the sort key can swap places between two requests, and a reader
        // paging through would see one of them twice and the other never.
        order.push_str(", e.uuid ASC");

        let mut values = filters.values.clone();
        values.push(Value::I64(i64::from(query.limit.min(MAX_LIMIT))));
        // A cursor has already skipped what an offset would count off, and
        // applying both would skip a page twice.
        let offset = if query.uses_cursor() { 0 } else { query.offset };
        values.push(Value::I64(i64::from(offset)));
        let limit_placeholder = values.len() - 1;
        let offset_placeholder = values.len();

        let statement = format!(
            "SELECT e.uuid, e.printing, e.quantity, e.condition, e.finish, \
                    e.purchase_price_cents, e.acquired_at, e.created_at, \
                    p.name, p.set_code, p.set_name, p.collector_number, p.rarity, \
                    p.lang, p.cardmarket_id, \
                    p.mana_value, p.color_identity, p.type_line, p.image_small, p.image_normal, \
                    p.image_back_small, p.image_back_normal, \
                    p.price_eur, p.price_eur_foil, p.finishes, p.reserved \
             FROM collection_entry e \
             LEFT JOIN printing p ON p.id = e.printing \
             WHERE {where_clause} ORDER BY {order} LIMIT ${limit_placeholder} OFFSET ${offset_placeholder}"
        );

        let rows = (&mut *tx).execute::<All>(statement, values).await?;

        let on_page: Vec<CollectionEntryUuid> = rows
            .iter()
            .map(|row| {
                row.get("uuid")
                    .map(CollectionEntryUuid::from_uuid)
                    .map_err(|error| rorm::Error::RowError(error.into_owned()))
            })
            .collect::<Result<_, rorm::Error>>()?;
        let mut tags = read_tags(&mut *tx, collection, &on_page).await?;

        let mut entries = Vec::with_capacity(rows.len());
        for row in rows {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());

            let name: Option<String> = row.get("name").map_err(decode)?;
            let card = match name {
                Some(name) => Some(ListedCard {
                    name,
                    set_code: row.get("set_code").map_err(decode)?,
                    set_name: row.get("set_name").map_err(decode)?,
                    collector_number: row.get("collector_number").map_err(decode)?,
                    lang: row.get("lang").map_err(decode)?,
                    cardmarket_id: row.get("cardmarket_id").map_err(decode)?,
                    rarity: rarity_of(row.get::<String>("rarity").map_err(decode)?.as_str()),
                    mana_value: row.get("mana_value").map_err(decode)?,
                    color_identity: row.get("color_identity").map_err(decode)?,
                    type_line: row.get("type_line").map_err(decode)?,
                    image_small: row.get("image_small").map_err(decode)?,
                    image_normal: row.get("image_normal").map_err(decode)?,
                    image_back_small: row.get("image_back_small").map_err(decode)?,
                    image_back_normal: row.get("image_back_normal").map_err(decode)?,
                    price_eur: row.get("price_eur").map_err(decode)?,
                    price_eur_foil: row.get("price_eur_foil").map_err(decode)?,
                    finishes: row.get("finishes").map_err(decode)?,
                    reserved: row.get("reserved").map_err(decode)?,
                }),
                None => None,
            };

            let uuid = CollectionEntryUuid::from_uuid(row.get("uuid").map_err(decode)?);
            entries.push(ListedEntry {
                tags: tags.remove(&uuid).unwrap_or_default(),
                uuid,
                printing: row.get("printing").map_err(decode)?,
                quantity: row.get("quantity").map_err(decode)?,
                condition: condition_of(row.get::<String>("condition").map_err(decode)?.as_str()),
                finish: finish_of(row.get::<String>("finish").map_err(decode)?.as_str()),
                purchase_price_cents: row.get("purchase_price_cents").map_err(decode)?,
                acquired_at: row.get("acquired_at").map_err(decode)?,
                created_at: row.get("created_at").map_err(decode)?,
                card,
            });
        }

        // Only offered when the page came back full: a short page is the last
        // one, and a cursor pointing past it would only cost a round trip to
        // learn that.
        let next_cursor = (query.sort == EntrySort::Filed
            && entries.len() as u32 >= query.limit.min(MAX_LIMIT))
        .then(|| entries.last().map(|entry| entry.uuid))
        .flatten();

        Ok(EntryPage {
            entries,
            total,
            total_copies,
            next_cursor,
        })
    }
}

/// Every card-wide tag the owner put on a card the page holds, grouped by stack
///
/// One statement for the whole page rather than one per stack, and only for the
/// stacks on it: every tag anchor has to be resolved against every stack it is
/// compared with, and a shelf holds far more rows than a page shows. Only the
/// account's card-wide tags: a collection is not a deck, so nothing local to
/// one can sit on a stack. The anchor of a tag is a printing, and it is
/// resolved to the card it stands for, so a tag put on one artwork is on every
/// copy of that card, in every language.
async fn read_tags(
    tx: &mut Transaction,
    collection: CollectionUuid,
    entries: &[CollectionEntryUuid],
) -> Result<HashMap<CollectionEntryUuid, Vec<DeckTagUuid>>, rorm::Error> {
    if entries.is_empty() {
        return Ok(HashMap::new());
    }

    let placeholders: Vec<String> = (0..entries.len())
        .map(|at| format!("${}", at + 2))
        .collect();
    let on_page = format!(" AND e.uuid IN ({})", placeholders.join(", "));

    let statement = "SELECT e.uuid AS entry, a.tag          FROM collection_entry e          JOIN collection col ON col.uuid = e.collection          LEFT JOIN printing card_printing ON card_printing.id = e.printing          JOIN global_card_tag a ON TRUE          LEFT JOIN printing anchor_printing ON anchor_printing.id = a.printing          JOIN deck_tag t ON t.uuid = a.tag AND t.deck IS NULL AND t.owner = col.owner          WHERE e.collection = $1            AND (anchor_printing.oracle_id = card_printing.oracle_id                 OR (anchor_printing.oracle_id IS NULL                     AND card_printing.oracle_id IS NULL                     AND anchor_printing.name_sort = card_printing.name_sort)                 OR (anchor_printing.id IS NULL                     AND card_printing.id IS NULL                     AND a.printing = e.printing))"
        .to_string()
        + &on_page;

    let mut values = vec![Value::Uuid(collection.into_inner())];
    values.extend(entries.iter().map(|entry| Value::Uuid(entry.into_inner())));

    let rows = (&mut *tx).execute::<All>(statement, values).await?;

    let mut grouped: HashMap<CollectionEntryUuid, Vec<DeckTagUuid>> = HashMap::new();
    for row in rows {
        let decode = |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
        let entry = CollectionEntryUuid::from_uuid(row.get("entry").map_err(decode)?);
        let tag = DeckTagUuid::from_uuid(row.get("tag").map_err(decode)?);
        grouped.entry(entry).or_default().push(tag);
    }
    Ok(grouped)
}

/// Reads a stored condition, defaulting to the commonest grade
pub(in crate::models) fn condition_of(stored: &str) -> CardCondition {
    match stored {
        "Mint" => CardCondition::Mint,
        "Excellent" => CardCondition::Excellent,
        "Good" => CardCondition::Good,
        "LightPlayed" => CardCondition::LightPlayed,
        "Played" => CardCondition::Played,
        "Poor" => CardCondition::Poor,
        _ => CardCondition::NearMint,
    }
}

/// Reads a stored finish, defaulting to the plain one
pub(in crate::models) fn finish_of(stored: &str) -> CardFinish {
    match stored {
        "Foil" => CardFinish::Foil,
        "Etched" => CardFinish::Etched,
        _ => CardFinish::Nonfoil,
    }
}

/// Reads a stored rarity, see [`CardRarity::from_scryfall`]
fn rarity_of(stored: &str) -> CardRarity {
    match stored {
        "Uncommon" => CardRarity::Uncommon,
        "Rare" => CardRarity::Rare,
        "Mythic" => CardRarity::Mythic,
        "Special" => CardRarity::Special,
        "Bonus" => CardRarity::Bonus,
        _ => CardRarity::Common,
    }
}
