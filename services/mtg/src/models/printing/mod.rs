//! The card catalog the collection queries are answered against
//!
//! Everything here is a copy of Scryfall's data. It exists so that "show me
//! page seven of this collection, sorted by price" is one indexed query instead
//! of eleven thousand rows shipped to a browser that then asks Scryfall about
//! each of them.

use std::collections::HashMap;
use std::collections::hash_map::Entry;

use galvyn::core::re_exports::time::Date;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::AffectedRows;
use galvyn::rorm::db::sql::value::NullType;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;
use tracing::warn;
use uuid::Uuid;

use crate::models::card_attributes::CardRarity;

pub(in crate::models) mod db;
pub mod resolve;

/// How many printings go into one `INSERT`
///
/// The upsert binds 34 parameters per row against Postgres' ceiling of 65535,
/// so this leaves generous headroom while still being a four-figure number of
/// rows per round trip.
const UPSERT_CHUNK: usize = 1024;

/// The columns the upsert writes, in the order the parameters are bound
const COLUMNS: [&str; 34] = [
    "id",
    "oracle_id",
    "name",
    "name_sort",
    "set_code",
    "set_name",
    "collector_number",
    "collector_number_sort",
    "rarity",
    "rarity_rank",
    "mana_value",
    "color_identity",
    "type_line",
    "mana_cost",
    "artist",
    "keywords",
    "legal_formats",
    "lang",
    "cardmarket_id",
    "released_at",
    "finishes",
    "image_small",
    "image_normal",
    "image_back_small",
    "image_back_normal",
    "image_art_crop",
    "price_eur",
    "price_eur_foil",
    "produced_mana",
    "game_changer",
    "mass_land_denial",
    "extra_turns",
    "reserved",
    "updated_at",
];

/// The formats the statistics ask about, in the order they are shown
///
/// Every format Scryfall keys its `legalities` map by, in the order that map
/// lists them. Lives next to the catalog because the sync reduces the map to
/// this list — `legal_formats` never holds anything else, and a format missing
/// here reads as "no card is legal" wherever it is offered.
pub const TRACKED_FORMATS: [&str; 23] = [
    "standard",
    "future",
    "historic",
    "timeless",
    "gladiator",
    "pioneer",
    "modern",
    "legacy",
    "pauper",
    "vintage",
    "penny",
    "commander",
    "oathbreaker",
    "standardbrawl",
    "brawl",
    "competitivebrawl",
    "alchemy",
    "paupercommander",
    "duel",
    "oldschool",
    "premodern",
    "predh",
    "tlr",
];

/// One printing in the catalog
#[derive(Debug, Clone)]
pub struct Printing {
    /// Scryfall's id
    pub id: Uuid,
    /// Groups every printing of the same card
    pub oracle_id: Option<Uuid>,
    /// The printed name
    pub name: String,
    /// The folded name, see [`fold_name`]
    pub name_sort: String,
    /// Set code, upper case
    pub set_code: String,
    /// Full set name
    pub set_name: String,
    /// Collector number as printed
    pub collector_number: String,
    /// Leading digits of the collector number
    pub collector_number_sort: i32,
    /// How rare the printing is
    pub rarity: CardRarity,
    /// Mana value
    pub mana_value: f64,
    /// Colour identity letters
    pub color_identity: String,
    /// Type line as printed
    pub type_line: String,
    /// Mana cost, split cards joined by ` // `
    pub mana_cost: String,
    /// Illustrator, empty when Scryfall has none on file
    pub artist: String,
    /// Rules keywords, comma separated
    pub keywords: String,
    /// The tracked formats this card is legal in, comma separated
    pub legal_formats: String,
    /// Language code
    pub lang: String,
    /// Cardmarket's product id, see [`db::PrintingModel::cardmarket_id`]
    pub cardmarket_id: Option<i32>,
    /// Release day
    pub released_at: Option<Date>,
    /// Comma separated finishes
    pub finishes: String,
    /// Artwork for a list row
    pub image_small: Option<String>,
    /// Artwork for the detail view
    pub image_normal: Option<String>,
    /// The back face's artwork for a list row, `None` for a one-faced card
    pub image_back_small: Option<String>,
    /// The back face's artwork for the detail view
    pub image_back_normal: Option<String>,
    /// The front face's illustration alone, in landscape
    pub image_art_crop: Option<String>,
    /// Market price in euro cents
    pub price_eur: Option<i64>,
    /// Foil market price in euro cents
    pub price_eur_foil: Option<i64>,
    /// The colours the card can produce, as the letters `WUBRGC`
    pub produced_mana: String,

    /// Whether Wizards lists the card as a Game Changer
    pub game_changer: bool,

    /// Whether the card denies lands en masse
    pub mass_land_denial: bool,

    /// Whether the card takes extra turns
    pub extra_turns: bool,

    /// Whether the card is on the reserved list
    pub reserved: bool,
}

/// Folds a card name for searching and sorting
///
/// Lowercases and strips the accents Magic actually prints. Done with a table
/// rather than by unicode normalisation because the alphabet in question is
/// closed — Latin script with a handful of diacritics — and a decomposition
/// crate would be a dependency for a dozen characters.
///
/// @returns the folded name
pub fn fold_name(name: &str) -> String {
    let mut folded = String::with_capacity(name.len());
    for character in name.to_lowercase().chars() {
        match character {
            'á' | 'à' | 'â' | 'ä' | 'ã' | 'å' => folded.push('a'),
            'æ' => folded.push_str("ae"),
            'ç' => folded.push('c'),
            'é' | 'è' | 'ê' | 'ë' => folded.push('e'),
            'í' | 'ì' | 'î' | 'ï' => folded.push('i'),
            'ñ' => folded.push('n'),
            'ó' | 'ò' | 'ô' | 'ö' | 'õ' | 'ø' => folded.push('o'),
            'œ' => folded.push_str("oe"),
            'ß' => folded.push_str("ss"),
            'ú' | 'ù' | 'û' | 'ü' => folded.push('u'),
            'ý' | 'ÿ' => folded.push('y'),
            other => folded.push(other),
        }
    }
    folded
}

/// Reads the leading digits of a collector number
///
/// Collector numbers are not numbers — "★", "12b" and "GR1" all occur. What
/// they do have is a numeric part, and ordering by that is what "sorted by
/// number" means to anyone flipping through a binder.
///
/// @returns the digits, or zero when the number starts with none
pub fn collector_number_sort(collector_number: &str) -> i32 {
    let digits: String = collector_number
        .trim_start_matches(|character: char| !character.is_ascii_digit())
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    digits.parse().unwrap_or(0)
}

/// One language the same card exists in
#[derive(Debug, Clone)]
pub struct PrintingLanguage {
    /// Scryfall's id of that language's printing
    pub id: Uuid,
    /// The language, as Scryfall's code
    pub lang: String,
    /// Artwork for a list row, so a picker can show the card as it reads
    pub image_small: Option<String>,
}

impl Printing {
    /// Writes printings, replacing whatever the catalog held for them
    ///
    /// Scryfall is the only writer here, so a conflict is not a merge but a
    /// refresh — every column is overwritten. That is also what makes a sync
    /// re-runnable: the same bulk file applied twice leaves the same rows.
    ///
    /// Uses raw sql because rorm cannot express `ON CONFLICT`. The statement is
    /// still a prepared one with bound parameters; only the placeholder list is
    /// built as text, and it is built from the row count, never from data.
    #[instrument(name = "Printing::upsert_many", skip(tx, printings), fields(count = printings.len()))]
    pub async fn upsert_many(
        tx: &mut Transaction,
        printings: &[Printing],
    ) -> Result<u64, rorm::Error> {
        if printings.is_empty() {
            return Ok(0);
        }
        let len = printings.len();

        // Postgres refuses a statement whose `VALUES` hits the same conflict
        // target twice, and a bulk file has been seen to carry the same
        // printing more than once. Where that comes from is Scryfall's to know;
        // what matters here is that a sync must not die on the shape of a file
        // nobody at this end controls. Last one wins, which is the rule the
        // upsert already follows — and the fold is counted, so a file that does
        // this stays visible instead of being quietly swallowed.
        let printings = last_per_key(printings, |printing| printing.id);
        if printings.len() < len {
            warn!(
                folded = len - printings.len(),
                "Scryfall repeated printings in one batch"
            );
        }

        let now = OffsetDateTime::now_utc();
        let mut written = 0;

        for chunk in printings.chunks(UPSERT_CHUNK) {
            let mut placeholders = String::new();
            let mut values: Vec<Value<'_>> = Vec::with_capacity(chunk.len() * COLUMNS.len());

            for (row, printing) in chunk.iter().copied().enumerate() {
                if row > 0 {
                    placeholders.push_str(", ");
                }
                placeholders.push('(');
                for column in 0..COLUMNS.len() {
                    if column > 0 {
                        placeholders.push_str(", ");
                    }
                    placeholders.push_str(&format!("${}", values.len() + column + 1));
                }
                placeholders.push(')');

                values.push(Value::Uuid(printing.id));
                values.push(match printing.oracle_id {
                    Some(oracle_id) => Value::Uuid(oracle_id),
                    None => Value::Null(NullType::Uuid),
                });
                values.push(Value::String(&printing.name));
                values.push(Value::String(&printing.name_sort));
                values.push(Value::String(&printing.set_code));
                values.push(Value::String(&printing.set_name));
                values.push(Value::String(&printing.collector_number));
                values.push(Value::I32(printing.collector_number_sort));
                values.push(Value::String(printing.rarity.as_str()));
                values.push(Value::I16(printing.rarity.rank()));
                values.push(Value::F64(printing.mana_value));
                values.push(Value::String(&printing.color_identity));
                values.push(Value::String(&printing.type_line));
                values.push(Value::String(&printing.mana_cost));
                values.push(Value::String(&printing.artist));
                values.push(Value::String(&printing.keywords));
                values.push(Value::String(&printing.legal_formats));
                values.push(Value::String(&printing.lang));
                values.push(optional_i32(printing.cardmarket_id));
                values.push(match printing.released_at {
                    Some(released_at) => Value::TimeDate(released_at),
                    None => Value::Null(NullType::TimeDate),
                });
                values.push(Value::String(&printing.finishes));
                values.push(optional_string(printing.image_small.as_deref()));
                values.push(optional_string(printing.image_normal.as_deref()));
                values.push(optional_string(printing.image_back_small.as_deref()));
                values.push(optional_string(printing.image_back_normal.as_deref()));
                values.push(optional_string(printing.image_art_crop.as_deref()));
                values.push(optional_i64(printing.price_eur));
                values.push(optional_i64(printing.price_eur_foil));
                values.push(Value::String(&printing.produced_mana));
                values.push(Value::Bool(printing.game_changer));
                values.push(Value::Bool(printing.mass_land_denial));
                values.push(Value::Bool(printing.extra_turns));
                values.push(Value::Bool(printing.reserved));
                values.push(Value::TimeOffsetDateTime(now));
            }

            // Everything but the key is refreshed; listing the columns rather
            // than reaching for `EXCLUDED.*` keeps this honest if a column is
            // ever added without being added to `COLUMNS`.
            let updates = COLUMNS
                .iter()
                .filter(|column| **column != "id")
                .map(|column| format!("{column} = EXCLUDED.{column}"))
                .collect::<Vec<_>>()
                .join(", ");

            let query = format!(
                "INSERT INTO printing ({}) VALUES {placeholders} ON CONFLICT (id) DO UPDATE SET {updates}",
                COLUMNS.join(", "),
            );

            written += (&mut *tx).execute::<AffectedRows>(query, values).await?;
        }

        Ok(written)
    }

    /// Fills what Scryfall only ever states for the English printing
    ///
    /// Scryfall attaches `cardmarket_id` and its euro prices to the English row
    /// of a printing and to no other: every other language of the same card
    /// carries `None` for all three. Cardmarket sells all of them as the one
    /// product and sorts the languages into it, so the English row's id *is*
    /// the German card's id, and the price it quotes is the closest the catalog
    /// has to what that card is worth.
    ///
    /// Matched on the coordinate a printing is addressed by, `(set_code,
    /// collector_number)`, which is what the `printing_coordinate` index leads
    /// with. A set with no English printing at all keeps its `None`.
    ///
    /// `COALESCE` rather than a plain assignment, so a value Scryfall does
    /// state survives. It cannot go stale: the upsert rewrites every column of
    /// every row each sync, so a non-English row arrives here empty again
    /// before this refills it.
    #[instrument(name = "Printing::inherit_from_english", skip(tx))]
    pub async fn inherit_from_english(tx: &mut Transaction) -> Result<u64, rorm::Error> {
        (&mut *tx)
            .execute::<AffectedRows>(
                "UPDATE printing p \
                 SET cardmarket_id = COALESCE(p.cardmarket_id, e.cardmarket_id), \
                     price_eur = COALESCE(p.price_eur, e.price_eur), \
                     price_eur_foil = COALESCE(p.price_eur_foil, e.price_eur_foil) \
                 FROM printing e \
                 WHERE e.set_code = p.set_code \
                   AND e.collector_number = p.collector_number \
                   AND e.lang = 'en' \
                   AND p.lang <> 'en' \
                   AND ((p.cardmarket_id IS NULL AND e.cardmarket_id IS NOT NULL) \
                        OR (p.price_eur IS NULL AND e.price_eur IS NOT NULL) \
                        OR (p.price_eur_foil IS NULL AND e.price_eur_foil IS NOT NULL))"
                    .to_string(),
                Vec::new(),
            )
            .await
    }

    /// Every language the same card was printed in
    ///
    /// A printing *is* one language: Scryfall gives each its own id, which is
    /// what a collection entry stores. So changing a card's language means
    /// pointing the entry at a sibling printing, and this is the list of them —
    /// the same card, the same set, the same collector number, one row per
    /// language, English first and the rest by their code so the order does not
    /// move between calls.
    ///
    /// Empty for a printing the catalog does not know. The card itself always
    /// comes back in the list, so a caller can show what is set today.
    #[instrument(name = "Printing::languages", skip(tx))]
    pub async fn languages(
        tx: &mut Transaction,
        printing: Uuid,
    ) -> Result<Vec<PrintingLanguage>, rorm::Error> {
        let Some((set_code, collector_number)) = rorm::query(
            &mut *tx,
            (
                db::PrintingModel.set_code,
                db::PrintingModel.collector_number,
            ),
        )
        .condition(db::PrintingModel.id.equals(printing))
        .optional()
        .await?
        else {
            return Ok(Vec::new());
        };

        let mut rows = rorm::query(
            &mut *tx,
            (
                db::PrintingModel.id,
                db::PrintingModel.lang,
                db::PrintingModel.image_small,
            ),
        )
        .condition(rorm::and![
            db::PrintingModel.set_code.equals(&*set_code),
            db::PrintingModel
                .collector_number
                .equals(&*collector_number),
        ])
        .all()
        .await?;

        rows.sort_by(|left, right| {
            let rank = |lang: &str| u8::from(lang != "en");
            rank(&left.1)
                .cmp(&rank(&right.1))
                .then_with(|| left.1.cmp(&right.1))
        });

        Ok(rows
            .into_iter()
            .map(|(id, lang, image_small)| PrintingLanguage {
                id,
                lang: lang.into_inner(),
                image_small: image_small.map(MaxStr::into_inner),
            })
            .collect())
    }

    /// How many printings the catalog holds
    #[instrument(name = "Printing::count", skip(tx))]
    pub async fn count(tx: &mut Transaction) -> Result<i64, rorm::Error> {
        let count = rorm::query(&mut *tx, db::PrintingModel.id.count())
            .one()
            .await?;
        Ok(count)
    }
}

/// Binds an optional string, since `Value` has no option of its own
fn optional_string(value: Option<&str>) -> Value<'_> {
    match value {
        Some(value) => Value::String(value),
        None => Value::Null(NullType::String),
    }
}

/// Binds an optional integer, see [`optional_string`]
fn optional_i32(value: Option<i32>) -> Value<'static> {
    match value {
        Some(value) => Value::I32(value),
        None => Value::Null(NullType::I32),
    }
}

/// Binds an optional integer, see [`optional_string`]
fn optional_i64(value: Option<i64>) -> Value<'static> {
    match value {
        Some(value) => Value::I64(value),
        None => Value::Null(NullType::I64),
    }
}

/// Keeps one item per key, the last of each
///
/// Order is that of the first appearance, so a batch stays in the order it was
/// read even where a later row replaced an earlier one. Takes the items and the
/// key to fold them by.
fn last_per_key<T>(items: &[T], key: impl Fn(&T) -> Uuid) -> Vec<&T> {
    let mut seen: HashMap<Uuid, usize> = HashMap::with_capacity(items.len());
    let mut kept: Vec<&T> = Vec::with_capacity(items.len());

    for item in items {
        match seen.entry(key(item)) {
            Entry::Occupied(slot) => kept[*slot.get()] = item,
            Entry::Vacant(slot) => {
                slot.insert(kept.len());
                kept.push(item);
            }
        }
    }
    kept
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::last_per_key;

    /// A stand-in for a printing: an id and something to tell copies apart
    #[derive(Debug, PartialEq, Eq)]
    struct Row(Uuid, u8);

    /// A uuid that reads as its own number in a failure message
    fn id(byte: u8) -> Uuid {
        Uuid::from_bytes([byte; 16])
    }

    #[test]
    fn keeps_the_last_of_each_key() {
        let rows = [Row(id(1), 1), Row(id(2), 2), Row(id(1), 3)];
        assert_eq!(last_per_key(&rows, |row| row.0), vec![&rows[2], &rows[1]]);
    }

    #[test]
    fn leaves_a_batch_without_repeats_alone() {
        let rows = [Row(id(1), 1), Row(id(2), 2), Row(id(3), 3)];
        assert_eq!(
            last_per_key(&rows, |row| row.0),
            vec![&rows[0], &rows[1], &rows[2]]
        );
    }

    #[test]
    fn folds_a_key_that_repeats_more_than_twice() {
        let rows = [Row(id(1), 1), Row(id(1), 2), Row(id(1), 3)];
        assert_eq!(last_per_key(&rows, |row| row.0), vec![&rows[2]]);
    }

    #[test]
    fn yields_nothing_for_an_empty_batch() {
        let rows: [Row; 0] = [];
        assert!(last_per_key(&rows, |row| row.0).is_empty());
    }
}
