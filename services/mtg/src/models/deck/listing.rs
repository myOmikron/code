//! A deck's cards, joined against the card catalog
//!
//! Raw sql for the same reason as [`crate::models::collection::listing`]:
//! `printing` is deliberately not a foreign key of `deckcard`, so there is no
//! relation for the query builder to walk.
//!
//! Unlike a collection this reads the whole deck at once. A deck is a hundred
//! slots, so paging, filtering and sorting would cost a round trip each to save
//! nothing — the client holds the list and groups it however it is being looked
//! at.

use std::collections::HashMap;

use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;
use uuid::Uuid;

use crate::models::account::AccountUuid;
use crate::models::card_attributes::CardRarity;
use crate::models::deck::DeckCardUuid;
use crate::models::deck::DeckUuid;
use crate::models::deck::DeckZone;
use crate::models::deck::tag::DeckTagUuid;

/// What the catalog knows about a deck card's printing
///
/// `None` on a slot means the catalog has not caught up with that printing.
#[derive(Debug, Clone)]
pub struct ListedDeckCard {
    /// The printed name
    pub name: String,
    /// Groups every printing of the same card, which is what a copy limit counts
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
    /// How rare the printing is
    pub rarity: CardRarity,
    /// Mana value
    pub mana_value: f64,
    /// Mana cost as printed, faces joined by ` // `
    pub mana_cost: String,
    /// Colour identity as the letters `WUBRG`, which is what a commander binds
    pub color_identity: String,
    /// Type line as printed, which the client groups by
    pub type_line: String,
    /// The formats this printing is legal in, of the ones the catalog tracks
    pub legal_formats: String,
    /// Artwork for a list row
    pub image_small: Option<String>,
    /// Artwork for a closer look
    pub image_normal: Option<String>,
    /// The back face's artwork for a list row, `None` for a one-faced card
    pub image_back_small: Option<String>,
    /// The back face's artwork for a closer look
    pub image_back_normal: Option<String>,
    /// Market price in euro cents
    pub price_eur: Option<i64>,
    /// Foil market price in euro cents
    pub price_eur_foil: Option<i64>,
    /// The finishes this printing exists in
    pub finishes: String,
    /// The colours the card can produce, as the letters `WUBRGC`
    pub produced_mana: String,
    /// Whether Wizards lists the card as a Game Changer
    pub game_changer: bool,
    /// Whether the card denies lands en masse, which brackets 1 to 3 play none of
    pub mass_land_denial: bool,
    /// Whether the card takes extra turns, which brackets 1 and 2 play none of
    pub extra_turns: bool,
    /// Whether the card is on the reserved list
    pub reserved: bool,
}

/// One slot of a deck, with the card it holds and the tags on it
#[derive(Debug, Clone)]
pub struct ListedSlot {
    /// Primary key
    pub uuid: DeckCardUuid,
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies this slot holds
    pub quantity: i32,
    /// Which zone the slot sits in
    pub zone: DeckZone,
    /// Whether the copies in this slot are the foil ones
    pub foil: bool,
    /// The card, as far as the catalog knows it
    pub card: Option<ListedDeckCard>,
    /// Local tags put on this slot plus global tags for its card identity
    pub tags: Vec<DeckTagUuid>,
}

impl ListedSlot {
    /// Read every slot of a deck, in the order they were added
    ///
    /// The caller has to have established that the account may see the deck;
    /// this only takes its id.
    #[instrument(name = "ListedSlot::read_deck", skip(tx))]
    pub async fn read_deck(
        tx: &mut Transaction,
        deck: DeckUuid,
    ) -> Result<Vec<ListedSlot>, rorm::Error> {
        let statement = "SELECT c.uuid, c.printing, c.quantity, c.zone, c.foil, \
                    p.name, p.oracle_id, p.set_code, p.set_name, p.collector_number, \
                    p.lang, p.cardmarket_id, p.rarity, p.mana_value, p.mana_cost, \
                    p.color_identity, p.type_line, p.legal_formats, \
                    p.image_small, p.image_normal, p.image_back_small, p.image_back_normal, \
                    p.price_eur, p.price_eur_foil, p.finishes, p.produced_mana, p.game_changer, p.mass_land_denial, p.extra_turns, p.reserved \
             FROM deckcard c \
             LEFT JOIN printing p ON p.id = c.printing \
             WHERE c.deck = $1 \
             ORDER BY c.uuid ASC"
            .to_string();

        let rows = (&mut *tx)
            .execute::<All>(statement, vec![Value::Uuid(deck.into_inner())])
            .await?;

        let mut tags = read_tags(&mut *tx, deck).await?;

        let mut slots = Vec::with_capacity(rows.len());
        for row in rows {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());

            let name: Option<String> = row.get("name").map_err(decode)?;
            let card = match name {
                Some(name) => Some(ListedDeckCard {
                    name,
                    oracle_id: row.get("oracle_id").map_err(decode)?,
                    set_code: row.get("set_code").map_err(decode)?,
                    set_name: row.get("set_name").map_err(decode)?,
                    collector_number: row.get("collector_number").map_err(decode)?,
                    lang: row.get("lang").map_err(decode)?,
                    cardmarket_id: row.get("cardmarket_id").map_err(decode)?,
                    rarity: rarity_of(row.get::<String>("rarity").map_err(decode)?.as_str()),
                    mana_value: row.get("mana_value").map_err(decode)?,
                    mana_cost: row.get("mana_cost").map_err(decode)?,
                    color_identity: row.get("color_identity").map_err(decode)?,
                    type_line: row.get("type_line").map_err(decode)?,
                    legal_formats: row.get("legal_formats").map_err(decode)?,
                    image_small: row.get("image_small").map_err(decode)?,
                    image_normal: row.get("image_normal").map_err(decode)?,
                    image_back_small: row.get("image_back_small").map_err(decode)?,
                    image_back_normal: row.get("image_back_normal").map_err(decode)?,
                    price_eur: row.get("price_eur").map_err(decode)?,
                    price_eur_foil: row.get("price_eur_foil").map_err(decode)?,
                    finishes: row.get("finishes").map_err(decode)?,
                    produced_mana: row.get("produced_mana").map_err(decode)?,
                    game_changer: row.get("game_changer").map_err(decode)?,
                    mass_land_denial: row.get("mass_land_denial").map_err(decode)?,
                    extra_turns: row.get("extra_turns").map_err(decode)?,
                    reserved: row.get("reserved").map_err(decode)?,
                }),
                None => None,
            };

            let uuid = DeckCardUuid::from_uuid(row.get("uuid").map_err(decode)?);
            slots.push(ListedSlot {
                uuid,
                printing: row.get("printing").map_err(decode)?,
                quantity: row.get("quantity").map_err(decode)?,
                zone: zone_of(row.get::<String>("zone").map_err(decode)?.as_str()),
                foil: row.get("foil").map_err(decode)?,
                card,
                tags: tags.remove(&uuid).unwrap_or_default(),
            });
        }

        Ok(slots)
    }
}

/// One commander of a deck, as far as the catalog knows it
#[derive(Debug, Clone)]
pub struct DeckCommander {
    /// The printed name
    pub name: String,
    /// Artwork for a tile
    pub image_small: Option<String>,
    /// Artwork for a wider tile
    pub image_normal: Option<String>,
    /// Colour identity as the letters `WUBRG`, which is what it binds the deck to
    pub color_identity: String,
}

/// What a deck looks like from the outside
///
/// Everything the list of decks shows besides the deck's own row: how big it
/// is, what it is worth, and who is at the head of it. The sideboard and the
/// maybe board are left out of both numbers, the same way the statistics count.
#[derive(Debug, Clone, Default)]
pub struct DeckSummary {
    /// How many cards sit in the deck proper
    pub cards: i64,
    /// What those cards are worth in euro cents
    pub price_eur: i64,
    /// The commanders, in the order they were put in
    pub commanders: Vec<DeckCommander>,
}

impl DeckSummary {
    /// Read the summary of every deck of an account, keyed by the deck
    ///
    /// Two statements for the whole list rather than two per deck: the numbers
    /// are one grouped read, and the commanders are a second one because a deck
    /// can have two of them.
    #[instrument(name = "DeckSummary::read_for_account", skip(tx))]
    pub async fn read_for_account(
        tx: &mut Transaction,
        account: AccountUuid,
    ) -> Result<HashMap<DeckUuid, DeckSummary>, rorm::Error> {
        let counts = "SELECT c.deck AS deck,                     COALESCE(SUM(c.quantity), 0)::bigint AS cards,                     COALESCE(SUM(c.quantity * COALESCE(p.price_eur, 0)), 0)::bigint AS price              FROM deckcard c              JOIN deck d ON d.uuid = c.deck              LEFT JOIN printing p ON p.id = c.printing              WHERE d.owner = $1 AND c.zone IN ('Main', 'Commander')              GROUP BY c.deck"
            .to_string();

        let rows = (&mut *tx)
            .execute::<All>(counts, vec![Value::Uuid(account.into_inner())])
            .await?;

        let mut summaries: HashMap<DeckUuid, DeckSummary> = HashMap::new();
        for row in rows {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
            let deck = DeckUuid::from_uuid(row.get("deck").map_err(decode)?);
            summaries.insert(
                deck,
                DeckSummary {
                    cards: row.get("cards").map_err(decode)?,
                    price_eur: row.get("price").map_err(decode)?,
                    commanders: Vec::new(),
                },
            );
        }

        let commanders = "SELECT c.deck AS deck, p.name, p.image_small, p.image_normal, p.color_identity              FROM deckcard c              JOIN deck d ON d.uuid = c.deck              JOIN printing p ON p.id = c.printing              WHERE d.owner = $1 AND c.zone = 'Commander'              ORDER BY c.uuid ASC"
            .to_string();

        let rows = (&mut *tx)
            .execute::<All>(commanders, vec![Value::Uuid(account.into_inner())])
            .await?;

        for row in rows {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
            let deck = DeckUuid::from_uuid(row.get("deck").map_err(decode)?);
            summaries
                .entry(deck)
                .or_default()
                .commanders
                .push(DeckCommander {
                    name: row.get("name").map_err(decode)?,
                    image_small: row.get("image_small").map_err(decode)?,
                    image_normal: row.get("image_normal").map_err(decode)?,
                    color_identity: row.get("color_identity").map_err(decode)?,
                });
        }

        Ok(summaries)
    }
}

/// Every local or card-wide global tag visible on a deck, grouped by slot
///
/// One statement for the whole deck rather than one per slot.
async fn read_tags(
    tx: &mut Transaction,
    deck: DeckUuid,
) -> Result<HashMap<DeckCardUuid, Vec<DeckTagUuid>>, rorm::Error> {
    let statement = "SELECT c.uuid AS deck_card, a.tag \
         FROM deckcard c \
         JOIN deck_card_tag a ON a.deck_card = c.uuid \
         JOIN deck_tag t ON t.uuid = a.tag AND t.deck = c.deck \
         WHERE c.deck = $1 \
         UNION \
         SELECT c.uuid AS deck_card, a.tag \
         FROM deckcard c \
         JOIN deck d ON d.uuid = c.deck \
         LEFT JOIN printing card_printing ON card_printing.id = c.printing \
         JOIN global_card_tag a ON TRUE \
         LEFT JOIN printing anchor_printing ON anchor_printing.id = a.printing \
         JOIN deck_tag t ON t.uuid = a.tag AND t.deck IS NULL AND t.owner = d.owner \
         WHERE c.deck = $1 \
           AND (anchor_printing.oracle_id = card_printing.oracle_id \
                OR (anchor_printing.oracle_id IS NULL \
                    AND card_printing.oracle_id IS NULL \
                    AND anchor_printing.name_sort = card_printing.name_sort) \
                OR (anchor_printing.id IS NULL \
                    AND card_printing.id IS NULL \
                    AND a.printing = c.printing))"
        .to_string();

    let rows = (&mut *tx)
        .execute::<All>(statement, vec![Value::Uuid(deck.into_inner())])
        .await?;

    let mut grouped: HashMap<DeckCardUuid, Vec<DeckTagUuid>> = HashMap::new();
    for row in rows {
        let decode = |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
        let slot = DeckCardUuid::from_uuid(row.get("deck_card").map_err(decode)?);
        let tag = DeckTagUuid::from_uuid(row.get("tag").map_err(decode)?);
        grouped.entry(slot).or_default().push(tag);
    }
    Ok(grouped)
}

/// Reads a stored rarity, defaulting to the commonest
fn rarity_of(rarity: &str) -> CardRarity {
    match rarity {
        "Uncommon" => CardRarity::Uncommon,
        "Rare" => CardRarity::Rare,
        "Mythic" => CardRarity::Mythic,
        "Special" => CardRarity::Special,
        "Bonus" => CardRarity::Bonus,
        _ => CardRarity::Common,
    }
}

/// Reads a stored zone, defaulting to the main deck
pub(in crate::models) fn zone_of(zone: &str) -> DeckZone {
    match zone {
        "Side" => DeckZone::Side,
        "Commander" => DeckZone::Commander,
        "Companion" => DeckZone::Companion,
        "Maybe" => DeckZone::Maybe,
        _ => DeckZone::Main,
    }
}
