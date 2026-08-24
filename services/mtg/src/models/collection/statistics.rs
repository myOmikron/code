//! Everything the statistics tab shows, counted server-side
//!
//! One query joins the collection against the catalog and a single pass over
//! the rows derives every number — the client used to fetch all entries, ask
//! Scryfall about each printing and do this arithmetic itself, which made the
//! tab cost thousands of requests instead of one.
//!
//! This is where every judgement call about what a number means lives: which
//! cards count, what a foil is worth, how a card with two types is filed.
//! Everything is weighted by copies — a playset of four counts four times,
//! which is the only reading that makes a mana curve describe the cardboard
//! actually sitting in the collection.

use std::collections::BTreeMap;
use std::collections::HashMap;

use galvyn::core::re_exports::time::Date;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;
use uuid::Uuid;

use crate::models::collection::CollectionEntryUuid;
use crate::models::collection::CollectionUuid;
use crate::models::printing::TRACKED_FORMATS;

/// The mana values shown separately before everything above is pooled
const MANA_CURVE_CAP: i64 = 7;

/// Magic's five colours, in the canonical WUBRG order
const COLOR_LETTERS: [char; 5] = ['W', 'U', 'B', 'R', 'G'];

/// The grades in Cardmarket's order, best first
const CONDITIONS: [&str; 7] = [
    "Mint",
    "NearMint",
    "Excellent",
    "Good",
    "LightPlayed",
    "Played",
    "Poor",
];

/// The finishes as they are stored
const FINISHES: [&str; 3] = ["Nonfoil", "Foil", "Etched"];

/// Card types, most specific first, with the slug each is filed under
///
/// A card gets exactly one bucket — a "Legendary Artifact Creature" is a
/// creature to anyone sorting a collection. Lands come first regardless, because an
/// artifact land is part of a mana base, not of an artifact theme.
///
/// The tail holds the types that only ever appear alone, on the cards from the
/// side formats. They are listed so that nothing real has to fall into "other" —
/// Magic has few enough types to name them all. `Planeswalker` has to stay ahead
/// of `Plane`, since the match is a substring test and every planeswalker would
/// otherwise be filed as a plane.
///
/// `Kindred` is deliberately absent: it never stands on its own, so a "Kindred
/// Sorcery" belongs under sorcery, which is what leaving it out achieves.
const TYPE_ORDER: [(&str, &str); 14] = [
    ("Land", "land"),
    ("Creature", "creature"),
    ("Planeswalker", "planeswalker"),
    ("Battle", "battle"),
    ("Instant", "instant"),
    ("Sorcery", "sorcery"),
    ("Enchantment", "enchantment"),
    ("Artifact", "artifact"),
    ("Conspiracy", "conspiracy"),
    ("Dungeon", "dungeon"),
    ("Phenomenon", "phenomenon"),
    ("Plane", "plane"),
    ("Scheme", "scheme"),
    ("Vanguard", "vanguard"),
];

/// Price brackets in euro cents, upper bound exclusive
///
/// Logarithmic rather than linear: a collection's value distribution is a long
/// tail, and linear buckets would put everything in the first one.
const VALUE_BUCKETS: [(&str, i64); 6] = [
    ("bulk", 25),
    ("low", 100),
    ("mid", 500),
    ("high", 2_000),
    ("premium", 10_000),
    ("chase", i64::MAX),
];

/// How many rows the "top N" charts show
const TOP_LIMIT: usize = 10;

/// How many stacks the "most valuable" list shows
const HIGHLIGHT_LIMIT: usize = 5;

/// How many dots the paid-against-worth scatter gets
///
/// One dot per stack with a recorded purchase price is unbounded, and a
/// collection of five figures answers with thousands of them — a payload no one
/// reads and an svg node per point. The cap keeps the stacks with the most
/// money riding on them, which are exactly the ones that carry the chart: what
/// falls away are the cent-priced stacks, and those are a single blob at the
/// origin however many of them there are.
const SCATTER_LIMIT: usize = 250;

/// A labelled count of copies
#[derive(Debug, Clone)]
pub struct StatBucket {
    /// Identifies the bucket — a translation slug for known sets, raw data otherwise
    pub key: String,
    /// Copies in it
    pub cards: i64,
}

/// One point of the acquisition timeline
#[derive(Debug, Clone)]
pub struct TimelinePoint {
    /// The month as `YYYY-MM`
    pub month: String,
    /// Copies owned by the end of that month
    pub cards: i64,
    /// What those copies are worth today, in euro cents
    pub value_cents: i64,
}

/// One set's share of the collection
#[derive(Debug, Clone)]
pub struct SetBucket {
    /// Set code, upper case
    pub set_code: String,
    /// Full set name
    pub set_name: String,
    /// Copies from this set
    pub cards: i64,
    /// What those copies are worth, in euro cents
    pub value_cents: i64,
}

/// A stack worth calling out
#[derive(Debug, Clone)]
pub struct TopCard {
    /// The entry it came from
    pub uuid: CollectionEntryUuid,
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// The card's name
    pub name: String,
    /// Full set name
    pub set_name: String,
    /// Artwork for a list row
    pub image_small: Option<String>,
    /// Copies in the stack
    pub copies: i64,
    /// What the whole stack is worth, in euro cents
    pub value_cents: i64,
}

/// One stack in the market-versus-purchase comparison
#[derive(Debug, Clone)]
pub struct PricePoint {
    /// The card's name
    pub name: String,
    /// What was paid per copy, in euro cents
    pub purchase_cents: i64,
    /// What one copy fetches today, in euro cents
    pub market_cents: i64,
    /// How many copies the stack holds
    pub copies: i64,
}

/// The oldest printing in the collection
#[derive(Debug, Clone)]
pub struct OldestPrinting {
    /// The card's name
    pub name: String,
    /// Full set name
    pub set_name: String,
    /// The day it was released
    pub released_at: Date,
}

/// The numbers behind the statistics tab
#[derive(Debug, Clone)]
pub struct CollectionStatistics {
    /// Copies filed in total
    pub total_cards: i64,
    /// How many different sets are represented
    pub distinct_sets: i64,
    /// What the whole collection fetches today, in euro cents
    pub market_value_cents: i64,
    /// Copies the catalog has a price for
    pub priced_cards: i64,
    /// What was paid, over the stacks that recorded it, in euro cents
    pub purchase_total_cents: i64,
    /// Copies with a recorded purchase price
    pub purchased_cards: i64,
    /// Today's value of exactly those copies, in euro cents
    pub market_of_purchased_cents: i64,
    /// Mean value of a priced copy, in euro cents
    pub average_value_cents: i64,
    /// Copies on the reserved list
    pub reserved_cards: i64,
    /// What those are worth, in euro cents
    pub reserved_value_cents: i64,
    /// Copies per mana value, lands excluded, everything above the cap pooled
    pub mana_curve: Vec<StatBucket>,
    /// Copies whose colour identity contains each colour
    pub color_identity: Vec<StatBucket>,
    /// Coloured mana symbols across all costs, weighted by copies
    pub pips: Vec<StatBucket>,
    /// Copies per colour count — mono, two-colour, and so on
    pub color_spread: Vec<StatBucket>,
    /// Copies per card type
    pub types: Vec<StatBucket>,
    /// Copies per rarity, most first
    pub rarities: Vec<StatBucket>,
    /// Copies per price bracket
    pub value_buckets: Vec<StatBucket>,
    /// Copies per condition, best grade first
    pub conditions: Vec<StatBucket>,
    /// Copies per finish
    pub finishes: Vec<StatBucket>,
    /// Cumulative copies and value over time
    pub timeline: Vec<TimelinePoint>,
    /// Copies per release year of the printing
    pub years: Vec<StatBucket>,
    /// The most represented illustrators
    pub artists: Vec<StatBucket>,
    /// Copies legal in each tracked format
    pub formats: Vec<StatBucket>,
    /// The most common rules keywords
    pub keywords: Vec<StatBucket>,
    /// Sets by copies, most first
    pub sets: Vec<SetBucket>,
    /// The most valuable stacks
    pub top_cards: Vec<TopCard>,
    /// Paid against worth, for the stacks with the most money riding on them
    pub price_points: Vec<PricePoint>,
    /// The oldest printing in the collection, `None` when nothing resolved
    pub oldest: Option<OldestPrinting>,
}

/// What one copy of a stack is worth today, in euro cents
///
/// A foil is a different card on the market than its non-foil twin, and a
/// collection that is half foils would be badly misvalued by the non-foil
/// price. An etched foil is valued the same way: Scryfall quotes no separate
/// euro price for one, and a printing that only exists etched carries its
/// price in `eur_foil`, so reading the non-foil field would value it at
/// nothing.
///
/// This is the listing's `UNIT_PRICE` written in Rust — the
/// statistics read every row anyway, so the value is counted here rather than
/// in the statement. The two have to say the same thing, or a collection's
/// total disagrees with the list it was added up from.
fn unit_price_cents(finish: &str, eur: Option<i64>, eur_foil: Option<i64>) -> Option<i64> {
    if finish == "Nonfoil" {
        return eur;
    }
    eur_foil.or(eur)
}

/// The single type slug a card is filed under
///
/// Only the front half of a two-faced card is read: the back is the same piece
/// of cardboard, and counting both would inflate the totals. Everything after
/// the em dash is the subtype — "Creature — Goblin Rogue" must not be read as
/// a card called Rogue.
fn primary_type(type_line: &str) -> &'static str {
    let front = type_line.split("//").next().unwrap_or("");
    let front = front.split('—').next().unwrap_or("");
    for (needle, slug) in TYPE_ORDER {
        if front.contains(needle) {
            return slug;
        }
    }
    "other"
}

/// Counts the coloured mana symbols in a card's cost
///
/// Hybrid and phyrexian symbols count for every colour they can be paid with:
/// `{W/U}` is a white pip and a blue pip, because that is exactly what makes
/// the card castable in either deck. The cost string carries both halves of a
/// split card joined by ` // `, so counting over the whole string counts every
/// castable half.
fn count_pips(mana_cost: &str) -> [i64; 5] {
    let mut counts = [0; 5];
    let mut rest = mana_cost;
    while let Some(open) = rest.find('{') {
        let Some(close) = rest[open..].find('}') else {
            break;
        };
        let symbol = &rest[open..open + close];
        for (slot, letter) in COLOR_LETTERS.into_iter().enumerate() {
            if symbol.contains(letter) {
                counts[slot] += 1;
            }
        }
        rest = &rest[open + close + 1..];
    }
    counts
}

/// The price bracket a copy of this value falls into
fn value_bucket(price_cents: i64) -> &'static str {
    for (key, max) in VALUE_BUCKETS {
        if price_cents < max {
            return key;
        }
    }
    "chase"
}

/// The month a date belongs to, as the sortable `YYYY-MM`
fn month_key(date: Date) -> String {
    format!("{:04}-{:02}", date.year(), date.month() as u8)
}

/// Adds copies to a bucket
fn add(counts: &mut HashMap<String, i64>, key: &str, copies: i64) {
    *counts.entry(key.to_string()).or_insert(0) += copies;
}

/// Sorts buckets by copies and keeps the busiest ones
fn top_buckets(counts: HashMap<String, i64>, limit: usize) -> Vec<StatBucket> {
    let mut buckets: Vec<(String, i64)> = counts.into_iter().collect();
    buckets.sort_by(|(left_key, left), (right_key, right)| {
        right.cmp(left).then_with(|| left_key.cmp(right_key))
    });
    buckets.truncate(limit);
    buckets
        .into_iter()
        .map(|(key, cards)| StatBucket { key, cards })
        .collect()
}

/// Buckets in a fixed order, zero-filled where nothing was counted
fn fixed_buckets(
    counts: &HashMap<String, i64>,
    keys: impl IntoIterator<Item: Into<String>>,
) -> Vec<StatBucket> {
    keys.into_iter()
        .map(|key| {
            let key = key.into();
            StatBucket {
                cards: counts.get(&key).copied().unwrap_or(0),
                key,
            }
        })
        .collect()
}

impl CollectionStatistics {
    /// Counts a whole collection in one pass
    ///
    /// The caller has to have established that the account may see the
    /// collection; this only takes the collection's id.
    ///
    /// Written as raw sql for the same reason as the listing — `printing` is
    /// deliberately not a foreign key, so there is no relation for the query
    /// builder to walk. Stacks whose printing the catalog does not know still
    /// count towards the card total — they are cards in a collection — but they
    /// contribute to no chart that needs card data, rather than silently
    /// landing in an "unknown" bucket that would read as a real category.
    #[instrument(name = "CollectionStatistics::compute", skip(tx))]
    pub async fn compute(
        tx: &mut Transaction,
        collection: CollectionUuid,
    ) -> Result<CollectionStatistics, rorm::Error> {
        let statement = "SELECT e.uuid, e.printing, e.quantity, e.condition, e.finish, \
                    e.purchase_price_cents, e.acquired_at, e.created_at, \
                    p.name, p.set_code, p.set_name, p.rarity, p.mana_value, \
                    p.color_identity, p.type_line, p.mana_cost, p.artist, p.keywords, \
                    p.legal_formats, p.released_at, p.image_small, \
                    p.price_eur, p.price_eur_foil, p.reserved \
             FROM collection_entry e \
             LEFT JOIN printing p ON p.id = e.printing \
             WHERE e.collection = $1"
            .to_string();

        let rows = (&mut *tx)
            .execute::<All>(statement, vec![Value::Uuid(collection.into_inner())])
            .await?;

        let mut total_cards = 0;
        let mut market_value_cents = 0;
        let mut priced_cards = 0;
        let mut purchase_total_cents = 0;
        let mut purchased_cards = 0;
        let mut market_of_purchased_cents = 0;
        let mut reserved_cards = 0;
        let mut reserved_value_cents = 0;

        let mut mana_curve = HashMap::new();
        let mut color_identity = HashMap::new();
        let mut pips = HashMap::new();
        let mut color_spread = HashMap::new();
        let mut types = HashMap::new();
        let mut rarities = HashMap::new();
        let mut value_buckets = HashMap::new();
        let mut conditions = HashMap::new();
        let mut finishes = HashMap::new();
        let mut years = BTreeMap::new();
        let mut artists = HashMap::new();
        let mut formats = HashMap::new();
        let mut keywords = HashMap::new();
        let mut set_cards: HashMap<String, i64> = HashMap::new();
        let mut set_value: HashMap<String, i64> = HashMap::new();
        let mut set_names: HashMap<String, String> = HashMap::new();
        let mut per_month: BTreeMap<String, (i64, i64)> = BTreeMap::new();

        let mut highlights: Vec<TopCard> = Vec::new();
        let mut price_points: Vec<PricePoint> = Vec::new();
        let mut oldest: Option<OldestPrinting> = None;

        for row in rows {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());

            let uuid: Uuid = row.get("uuid").map_err(decode)?;
            let printing: Uuid = row.get("printing").map_err(decode)?;
            let quantity: i32 = row.get("quantity").map_err(decode)?;
            let condition: String = row.get("condition").map_err(decode)?;
            let finish: String = row.get("finish").map_err(decode)?;
            let purchase_price_cents: Option<i64> =
                row.get("purchase_price_cents").map_err(decode)?;
            let acquired_at: Option<Date> = row.get("acquired_at").map_err(decode)?;
            let created_at: OffsetDateTime = row.get("created_at").map_err(decode)?;
            // The name tells whether the join found the printing at all — every
            // other catalog column is only read once it did.
            let name: Option<String> = row.get("name").map_err(decode)?;

            let copies = i64::from(quantity);
            total_cards += copies;
            add(&mut conditions, &condition, copies);
            add(&mut finishes, &finish, copies);

            let price = match name {
                Some(_) => unit_price_cents(
                    &finish,
                    row.get("price_eur").map_err(decode)?,
                    row.get("price_eur_foil").map_err(decode)?,
                ),
                None => None,
            };
            let stack_value = price.map(|price| price * copies).unwrap_or(0);

            if let Some(price) = price {
                market_value_cents += stack_value;
                priced_cards += copies;
                add(&mut value_buckets, value_bucket(price), copies);
            }

            if let Some(paid) = purchase_price_cents {
                purchase_total_cents += paid * copies;
                purchased_cards += copies;
                market_of_purchased_cents += stack_value;
            }

            // The day the cards were acquired is the honest x-axis; when nobody
            // recorded one, the day the stack was filed is the best stand-in.
            let month = month_key(acquired_at.unwrap_or_else(|| created_at.date()));
            let point = per_month.entry(month).or_insert((0, 0));
            point.0 += copies;
            point.1 += stack_value;

            let Some(name) = name else {
                continue;
            };

            let set_code: String = row.get("set_code").map_err(decode)?;
            let set_name: String = row.get("set_name").map_err(decode)?;
            let rarity: String = row.get("rarity").map_err(decode)?;
            let mana_value: f64 = row.get("mana_value").map_err(decode)?;
            let identity: String = row.get("color_identity").map_err(decode)?;
            let type_line: String = row.get("type_line").map_err(decode)?;
            let mana_cost: String = row.get("mana_cost").map_err(decode)?;
            let artist: String = row.get("artist").map_err(decode)?;
            let card_keywords: String = row.get("keywords").map_err(decode)?;
            let legal_formats: String = row.get("legal_formats").map_err(decode)?;
            let released_at: Option<Date> = row.get("released_at").map_err(decode)?;
            let image_small: Option<String> = row.get("image_small").map_err(decode)?;
            let reserved: bool = row.get("reserved").map_err(decode)?;

            if reserved {
                reserved_cards += copies;
                reserved_value_cents += stack_value;
            }

            let card_type = primary_type(&type_line);
            add(&mut types, card_type, copies);
            // A land's mana value is zero and would tower over the curve
            // without saying anything about what the deck casts.
            if card_type != "land" {
                let step = (mana_value.round() as i64).clamp(0, MANA_CURVE_CAP);
                add(&mut mana_curve, &step.to_string(), copies);
            }

            let mut identity_colors = 0;
            for letter in COLOR_LETTERS {
                if identity.contains(letter) {
                    add(&mut color_identity, &letter.to_string(), copies);
                    identity_colors += 1;
                }
            }
            add(&mut color_spread, &identity_colors.to_string(), copies);
            for (slot, count) in count_pips(&mana_cost).into_iter().enumerate() {
                if count > 0 {
                    add(&mut pips, &COLOR_LETTERS[slot].to_string(), count * copies);
                }
            }

            add(&mut rarities, &rarity.to_lowercase(), copies);
            if !artist.is_empty() {
                add(&mut artists, &artist, copies);
            }
            for keyword in card_keywords.split(',').filter(|word| !word.is_empty()) {
                add(&mut keywords, keyword, copies);
            }
            for format in legal_formats.split(',').filter(|entry| !entry.is_empty()) {
                add(&mut formats, format, copies);
            }

            if let Some(released) = released_at {
                *years.entry(released.year().to_string()).or_insert(0) += copies;
                if oldest
                    .as_ref()
                    .is_none_or(|current| released < current.released_at)
                {
                    oldest = Some(OldestPrinting {
                        name: name.clone(),
                        set_name: set_name.clone(),
                        released_at: released,
                    });
                }
            }

            *set_cards.entry(set_code.clone()).or_insert(0) += copies;
            *set_value.entry(set_code.clone()).or_insert(0) += stack_value;
            set_names
                .entry(set_code)
                .or_insert_with(|| set_name.clone());

            if let Some(price) = price {
                if let Some(paid) = purchase_price_cents {
                    price_points.push(PricePoint {
                        name: name.clone(),
                        purchase_cents: paid,
                        market_cents: price,
                        copies,
                    });
                }
                highlights.push(TopCard {
                    uuid: CollectionEntryUuid::from_uuid(uuid),
                    printing,
                    name,
                    set_name,
                    image_small,
                    copies,
                    value_cents: stack_value,
                });
            }
        }

        // Cumulative, so the line only ever climbs: the chart answers "what did
        // I own back then", not "what did I buy that month".
        let mut timeline = Vec::with_capacity(per_month.len());
        let mut running_cards = 0;
        let mut running_value = 0;
        for (month, (cards, value)) in per_month {
            running_cards += cards;
            running_value += value;
            timeline.push(TimelinePoint {
                month,
                cards: running_cards,
                value_cents: running_value,
            });
        }

        highlights.sort_by_key(|card| std::cmp::Reverse(card.value_cents));
        highlights.truncate(HIGHLIGHT_LIMIT);

        // Ranked by what the stack is worth at whichever of the two prices is
        // higher: the dot's distance from the diagonal is the point of the
        // chart, and a stack that was bought for nothing and is worth a lot has
        // to survive the cut just as much as the other way round.
        price_points.sort_by_key(|point| {
            std::cmp::Reverse(point.purchase_cents.max(point.market_cents) * point.copies)
        });
        price_points.truncate(SCATTER_LIMIT);

        let distinct_sets = set_cards.len() as i64;
        let sets = top_buckets(set_cards, TOP_LIMIT)
            .into_iter()
            .map(|bucket| SetBucket {
                set_name: set_names.remove(&bucket.key).unwrap_or_default(),
                value_cents: set_value.get(&bucket.key).copied().unwrap_or(0),
                set_code: bucket.key,
                cards: bucket.cards,
            })
            .collect();

        Ok(CollectionStatistics {
            total_cards,
            distinct_sets,
            market_value_cents,
            priced_cards,
            purchase_total_cents,
            purchased_cards,
            market_of_purchased_cents,
            average_value_cents: if priced_cards == 0 {
                0
            } else {
                market_value_cents / priced_cards
            },
            reserved_cards,
            reserved_value_cents,
            mana_curve: fixed_buckets(
                &mana_curve,
                (0..=MANA_CURVE_CAP).map(|step| step.to_string()),
            ),
            color_identity: fixed_buckets(&color_identity, COLOR_LETTERS.map(String::from)),
            pips: fixed_buckets(&pips, COLOR_LETTERS.map(String::from)),
            color_spread: fixed_buckets(&color_spread, ["0", "1", "2", "3", "4", "5"]),
            types: fixed_buckets(
                &types,
                TYPE_ORDER
                    .into_iter()
                    .map(|(_, slug)| slug)
                    .chain(["other"]),
            ),
            rarities: top_buckets(rarities, TOP_LIMIT),
            value_buckets: fixed_buckets(&value_buckets, VALUE_BUCKETS.map(|(key, _)| key)),
            conditions: fixed_buckets(&conditions, CONDITIONS),
            finishes: fixed_buckets(&finishes, FINISHES),
            timeline,
            years: years
                .into_iter()
                .map(|(key, cards)| StatBucket { key, cards })
                .collect(),
            artists: top_buckets(artists, TOP_LIMIT),
            formats: fixed_buckets(&formats, TRACKED_FORMATS),
            keywords: top_buckets(keywords, TOP_LIMIT),
            sets,
            top_cards: highlights,
            price_points,
            oldest,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn primary_type_picks_one_bucket() {
        assert_eq!(
            primary_type("Legendary Artifact Creature — Golem"),
            "creature"
        );
        assert_eq!(primary_type("Artifact Land"), "land");
        assert_eq!(
            primary_type("Legendary Planeswalker — Jace"),
            "planeswalker"
        );
        assert_eq!(primary_type("Kindred Sorcery — Eldrazi"), "sorcery");
        assert_eq!(primary_type("Token"), "other");
    }

    #[test]
    fn primary_type_reads_only_the_front_face() {
        assert_eq!(primary_type("Instant // Land"), "instant");
        // The subtype after the em dash must not be matched — a "Creature —
        // Egg" is not filed by its egg.
        assert_eq!(primary_type("Enchantment — Aura"), "enchantment");
    }

    #[test]
    fn pips_count_every_payable_colour() {
        // {W/U} is castable in a white and in a blue deck, so it is both pips.
        let counts = count_pips("{1}{W/U}{W}");
        assert_eq!(counts, [2, 1, 0, 0, 0]);
    }

    #[test]
    fn pips_count_both_halves_of_a_split_card() {
        let counts = count_pips("{X}{R} // {2}{B}");
        assert_eq!(counts, [0, 0, 1, 1, 0]);
    }

    #[test]
    fn pips_ignore_generic_and_colourless_symbols() {
        assert_eq!(count_pips("{10}{C}{S}"), [0, 0, 0, 0, 0]);
        assert_eq!(count_pips(""), [0, 0, 0, 0, 0]);
    }

    #[test]
    fn value_buckets_are_upper_bound_exclusive() {
        assert_eq!(value_bucket(0), "bulk");
        assert_eq!(value_bucket(24), "bulk");
        assert_eq!(value_bucket(25), "low");
        assert_eq!(value_bucket(499), "mid");
        assert_eq!(value_bucket(2_000), "premium");
        assert_eq!(value_bucket(1_000_000), "chase");
    }

    #[test]
    fn foils_are_priced_as_foils_with_a_fallback() {
        assert_eq!(unit_price_cents("Foil", Some(100), Some(500)), Some(500));
        assert_eq!(unit_price_cents("Foil", Some(100), None), Some(100));
        assert_eq!(unit_price_cents("Etched", Some(100), Some(500)), Some(500));
        assert_eq!(unit_price_cents("Etched", None, Some(500)), Some(500));
        assert_eq!(unit_price_cents("Nonfoil", None, Some(500)), None);
    }

    #[test]
    fn months_sort_lexicographically() {
        let january =
            Date::from_calendar_date(2024, galvyn::core::re_exports::time::Month::January, 5)
                .expect("valid date");
        let december =
            Date::from_calendar_date(2023, galvyn::core::re_exports::time::Month::December, 31)
                .expect("valid date");
        assert_eq!(month_key(january), "2024-01");
        assert!(month_key(december) < month_key(january));
    }
}
