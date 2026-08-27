//! Schemas for the watch lists

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use uuid::Uuid;

use crate::http::handler_frontend::collections::schema::double_option;
use crate::models::card_attributes::CardCondition;
use crate::models::card_attributes::CardFinish;
use crate::models::collection::CollectionUuid;
use crate::models::deck::DeckUuid;
use crate::models::watch_list::WatchList;
use crate::models::watch_list::WatchListEntryUuid;
use crate::models::watch_list::WatchListUuid;
use crate::models::watch_list::availability::WatchedEntry;
use crate::models::watch_list::availability::WatchedMarket;
use crate::models::watch_list::availability::WatchedPrinting;
use crate::models::watch_list::copies::WatchedCopy;
use crate::models::watch_list::listing::WatchListSummary;

/// A list of cards an account is after
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WatchListResponse {
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
    /// The point in time the list was created
    pub created_at: SchemaDateTime,
}

impl From<WatchList> for WatchListResponse {
    fn from(list: WatchList) -> Self {
        Self {
            uuid: list.uuid,
            name: list.name,
            description: list.description,
            color: list.color,
            icon: list.icon,
            created_at: SchemaDateTime(list.created_at),
        }
    }
}

/// Wanted copies per rarity, for the bar under a tile
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WatchedRaritiesResponse {
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

/// One watch list as the overview grid shows it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WatchListOverviewResponse {
    /// The list itself
    pub list: WatchListResponse,
    /// How many cards are on it
    pub entries: i64,
    /// How many copies they ask for between them
    pub wanted: i64,
    /// How many of those copies are still missing
    ///
    /// Counted against the copies lying free in a collection only. A copy
    /// sleeved up in a deck is spoken for.
    pub missing: i64,
    /// What the missing copies cost, in euro cents
    pub price_eur_cents: i64,
    /// How many entries have a standing alarm
    pub alarms: i64,
    /// How many of those alarms the reader has not seen yet
    pub unread: i64,
    /// Wanted copies per rarity
    pub rarities: WatchedRaritiesResponse,
    /// The colours the list asks for, as the letters `WUBRG`
    pub colors: String,
    /// Artwork of the dearest entries, at most two
    pub arts: Vec<String>,
}

impl From<WatchListSummary> for WatchListOverviewResponse {
    fn from(summary: WatchListSummary) -> Self {
        let counts = summary.counts;
        Self {
            list: WatchListResponse {
                uuid: summary.uuid,
                name: summary.name,
                description: summary.description,
                color: summary.color,
                icon: summary.icon,
                created_at: SchemaDateTime(summary.created_at),
            },
            entries: counts.entries,
            wanted: counts.wanted,
            missing: counts.missing,
            price_eur_cents: counts.price_eur,
            alarms: counts.alarms,
            unread: counts.unread,
            rarities: WatchedRaritiesResponse {
                common: counts.rarities.common,
                uncommon: counts.rarities.uncommon,
                rare: counts.rarities.rare,
                mythic: counts.rarities.mythic,
                other: counts.rarities.other,
            },
            colors: counts.colors,
            arts: counts.arts,
        }
    }
}

/// Every watch list an account keeps
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListWatchListsResponse {
    /// The lists, oldest first
    pub lists: Vec<WatchListOverviewResponse>,
}

/// Request to create a watch list
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateWatchListRequest {
    /// What the list is called
    pub name: MaxStr<255>,
    /// Description shown above the entries
    pub description: MaxStr<1024>,
    /// The colour it is drawn in
    pub color: MaxStr<16>,
    /// The pictogram drawn on it
    pub icon: MaxStr<32>,
}

/// Request to rename a watch list or change its marker
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateWatchListRequest {
    /// What the list is called
    pub name: MaxStr<255>,
    /// Description shown above the entries
    pub description: MaxStr<1024>,
    /// The colour it is drawn in
    pub color: MaxStr<16>,
    /// The pictogram drawn on it
    pub icon: MaxStr<32>,
}

/// What the catalog knows about a watched card
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WatchedCardResponse {
    /// The printed name
    pub name: String,
    /// Groups every printing of the same card
    pub oracle_id: Option<Uuid>,
    /// Set code, upper case
    pub set_code: String,
    /// Full set name
    pub set_name: String,
    /// Collector number as printed
    pub collector_number: String,
    /// Language of the printing, as Scryfall's code
    pub lang: String,
    /// Cardmarket's product id, `None` when Cardmarket does not stock it
    ///
    /// Without one there is no price and therefore no alarm.
    pub cardmarket_id: Option<i32>,
    /// Artwork for a list row
    pub image_small: Option<String>,
    /// Artwork for a closer look
    pub image_normal: Option<String>,
    /// Comma separated finishes this printing exists in
    pub finishes: String,
    /// Market price in euro cents
    pub price_eur_cents: Option<i64>,
    /// Foil market price in euro cents
    pub price_eur_foil_cents: Option<i64>,
    /// When this printing last came out of a catalog sync
    ///
    /// How old the prices on this row are: they do not move between syncs.
    pub updated_at: SchemaDateTime,
}

impl From<WatchedPrinting> for WatchedCardResponse {
    fn from(card: WatchedPrinting) -> Self {
        Self {
            name: card.name,
            oracle_id: card.oracle_id,
            set_code: card.set_code,
            set_name: card.set_name,
            collector_number: card.collector_number,
            lang: card.lang,
            cardmarket_id: card.cardmarket_id,
            image_small: card.image_small,
            image_normal: card.image_normal,
            finishes: card.finishes,
            price_eur_cents: card.price_eur,
            price_eur_foil_cents: card.price_eur_foil,
            updated_at: SchemaDateTime(card.updated_at),
        }
    }
}

/// How many copies of a watched card the account already holds
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WatchedStockResponse {
    /// Copies lying in a collection that is not a deck's
    pub free: i64,
    /// Copies sleeved up in a deck
    pub sleeved: i64,
    /// Free copies a wider printing match would count
    ///
    /// Includes [`Self::free`]; the difference is what the entry's printing
    /// switch is turning away.
    pub free_any_printing: i64,
    /// Free copies a looser finish match would count, including [`Self::free`]
    pub free_any_finish: i64,
}

/// The printing an entry's price and alarm refer to
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WatchedMarketResponse {
    /// Scryfall's id of the printing being priced
    pub printing: Uuid,
    /// What one copy of it costs, in euro cents
    pub price_cents: i64,
    /// Cardmarket's id of the product it is sold as, `None` when unstocked
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

impl From<WatchedMarket> for WatchedMarketResponse {
    fn from(market: WatchedMarket) -> Self {
        Self {
            printing: market.printing,
            price_cents: market.price_cents,
            cardmarket_id: market.cardmarket_id,
            name: market.name,
            set_code: market.set_code,
            collector_number: market.collector_number,
            lang: market.lang,
        }
    }
}

/// One card on a watch list, with everything the row shows
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WatchListEntryResponse {
    /// Primary key
    pub uuid: WatchListEntryUuid,
    /// Scryfall's id of the printing the entry names
    pub printing: Uuid,
    /// The finish that is wanted
    pub finish: CardFinish,
    /// Whether only this very printing counts
    pub exact_printing: bool,
    /// Whether only the entry's finish counts
    pub match_finish: bool,
    /// Which languages count, as Scryfall's codes, empty for any
    ///
    /// Only in force while the printing is not pinned: a pinned printing is
    /// already one language.
    pub languages: Vec<String>,
    /// How many copies the account is after
    pub wanted: i32,
    /// What the entry is for, in the account's own words
    pub note: MaxStr<1024>,
    /// Alarm below this price in euro cents, `None` for an entry without one
    pub alarm_price_cents: Option<i64>,
    /// When the price last fell through the alarm, `None` while it has not
    pub triggered_at: Option<SchemaDateTime>,
    /// What the card cost when the alarm went off, in euro cents
    pub triggered_price_cents: Option<i64>,
    /// Which printing was that cheap
    pub triggered_printing: Option<Uuid>,
    /// Whether the reader has seen the alarm
    pub acknowledged: bool,
    /// What the catalog knows, `None` for a printing it has not caught up with
    pub card: Option<WatchedCardResponse>,
    /// What the account already holds
    pub stock: WatchedStockResponse,
    /// The printing the price and the alarm actually refer to
    ///
    /// For an entry that watches one printing this is that printing. For a wide
    /// one it is the cheapest print of the card the switches accept, which is a
    /// different card than the row is named after — so it carries its own
    /// identity, and a shop link opens the product that actually costs what the
    /// row says. `None` when the catalog prices nothing the entry accepts.
    pub market: Option<WatchedMarketResponse>,
    /// The point in time the entry was added
    pub created_at: SchemaDateTime,
}

impl From<WatchedEntry> for WatchListEntryResponse {
    fn from(watched: WatchedEntry) -> Self {
        let WatchedEntry {
            entry,
            card,
            stock,
            market,
        } = watched;
        Self {
            uuid: entry.uuid,
            printing: entry.printing,
            finish: entry.finish,
            exact_printing: entry.exact_printing,
            match_finish: entry.match_finish,
            languages: entry.languages,
            wanted: entry.wanted,
            note: entry.note,
            alarm_price_cents: entry.alarm_price_cents,
            triggered_at: entry.triggered_at.map(SchemaDateTime),
            triggered_price_cents: entry.triggered_price_cents,
            triggered_printing: entry.triggered_printing,
            acknowledged: entry.acknowledged,
            card: card.map(WatchedCardResponse::from),
            stock: WatchedStockResponse {
                free: stock.free,
                sleeved: stock.sleeved,
                free_any_printing: stock.free_any_printing,
                free_any_finish: stock.free_any_finish,
            },
            market: market.map(WatchedMarketResponse::from),
            created_at: SchemaDateTime(entry.created_at),
        }
    }
}

/// Everything one watch list page is drawn from
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListWatchListEntriesResponse {
    /// The list itself
    pub list: WatchListResponse,
    /// What is on it, oldest first
    pub entries: Vec<WatchListEntryResponse>,
    /// The newest catalog sync any of these cards came out of
    ///
    /// What the page dates its prices by. `None` for a list whose cards the
    /// catalog holds none of.
    pub prices_updated_at: Option<SchemaDateTime>,
}

/// Request to put a card on a watch list
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AddWatchListEntryRequest {
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// The finish that is wanted
    pub finish: CardFinish,
    /// Whether only this very printing counts
    pub exact_printing: bool,
    /// Whether only the named finish counts
    pub match_finish: bool,
    /// Which languages count, as Scryfall's codes; empty for any
    #[serde(default)]
    pub languages: Vec<String>,
    /// How many copies the account is after, at least one
    pub wanted: i32,
    /// What the entry is for
    pub note: MaxStr<1024>,
    /// Alarm below this price in euro cents, `None` for no alarm
    #[serde(default)]
    pub alarm_price_cents: Option<i64>,
}

/// Request to change some of an entry's fields, leaving the rest alone
///
/// Anything the alarm reads disarms it when it changes: the stored alarm is a
/// comparison between one price and one threshold, and once either side moves
/// it no longer describes anything. The next catalog sync sets it again if it
/// still holds.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateWatchListEntryRequest {
    /// A different printing
    #[serde(default)]
    pub printing: Option<Uuid>,
    /// A different finish
    #[serde(default)]
    pub finish: Option<CardFinish>,
    /// Whether only the named printing counts
    #[serde(default)]
    pub exact_printing: Option<bool>,
    /// Whether only the named finish counts
    #[serde(default)]
    pub match_finish: Option<bool>,
    /// Which languages count; an empty list means any
    #[serde(default)]
    pub languages: Option<Vec<String>>,
    /// How many copies the account is after
    #[serde(default)]
    pub wanted: Option<i32>,
    /// What the entry is for
    #[serde(default)]
    pub note: Option<MaxStr<1024>>,
    /// Alarm below this price in euro cents; `null` takes the alarm off
    #[serde(default, deserialize_with = "double_option")]
    pub alarm_price_cents: Option<Option<i64>>,
}

/// One alarm that has gone off, as the navigation badge shows it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WatchListAlarmResponse {
    /// The list the entry sits on
    pub watch_list: WatchListUuid,
    /// What that list is called
    pub watch_list_name: MaxStr<255>,
    /// The entry whose alarm went off
    pub entry: WatchListEntryUuid,
    /// The printed name of the card, empty while the catalog misses it
    pub name: String,
    /// What the card cost when the alarm went off, in euro cents
    pub triggered_price_cents: Option<i64>,
    /// The threshold it fell through, in euro cents
    pub alarm_price_cents: Option<i64>,
    /// When it went off
    pub triggered_at: SchemaDateTime,
}

/// Every alarm that has gone off across an account's watch lists
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListWatchListAlarmsResponse {
    /// The alarms, newest first
    pub alarms: Vec<WatchListAlarmResponse>,
    /// How many of them the reader has not seen yet
    pub unread: i64,
}

/// One stack of a watched card, and where it lies
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WatchedCopyResponse {
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

impl From<WatchedCopy> for WatchedCopyResponse {
    fn from(copy: WatchedCopy) -> Self {
        Self {
            printing: copy.printing,
            quantity: copy.quantity,
            condition: copy.condition,
            finish: copy.finish,
            collection: copy.collection,
            collection_name: copy.collection_name,
            collection_color: copy.collection_color,
            collection_icon: copy.collection_icon,
            deck: copy.deck,
            deck_name: copy.deck_name,
            name: copy.name,
            set_code: copy.set_code,
            set_name: copy.set_name,
            collector_number: copy.collector_number,
            lang: copy.lang,
            image_small: copy.image_small,
        }
    }
}

/// Every stack one watch list entry counts
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListWatchListCopiesResponse {
    /// The stacks, the ones on a shelf before the ones sleeved into a deck
    pub copies: Vec<WatchedCopyResponse>,
}
