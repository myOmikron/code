//! The card catalog the collection queries are answered against
//!
//! Everything here is a copy of Scryfall's data. It exists so that "show me
//! page seven of this collection, sorted by price" is one indexed query instead
//! of eleven thousand rows shipped to a browser that then asks Scryfall about
//! each of them.

use galvyn::core::re_exports::time::Date;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::AffectedRows;
use galvyn::rorm::db::sql::value::NullType;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;
use uuid::Uuid;

use crate::models::card_attributes::CardRarity;

pub(in crate::models) mod db;

/// How many printings go into one `INSERT`
///
/// The upsert binds 22 parameters per row against Postgres' ceiling of 65535,
/// so this leaves generous headroom while still being a four-figure number of
/// rows per round trip.
const UPSERT_CHUNK: usize = 1024;

/// The columns the upsert writes, in the order the parameters are bound
const COLUMNS: [&str; 22] = [
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
    "lang",
    "released_at",
    "finishes",
    "image_small",
    "image_normal",
    "price_eur",
    "price_eur_foil",
    "reserved",
    "updated_at",
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
    /// Language code
    pub lang: String,
    /// Release day
    pub released_at: Option<Date>,
    /// Comma separated finishes
    pub finishes: String,
    /// Artwork for a list row
    pub image_small: Option<String>,
    /// Artwork for the detail view
    pub image_normal: Option<String>,
    /// Market price in euro cents
    pub price_eur: Option<i64>,
    /// Foil market price in euro cents
    pub price_eur_foil: Option<i64>,
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

        let now = OffsetDateTime::now_utc();
        let mut written = 0;

        for chunk in printings.chunks(UPSERT_CHUNK) {
            let mut placeholders = String::new();
            let mut values: Vec<Value<'_>> = Vec::with_capacity(chunk.len() * COLUMNS.len());

            for (row, printing) in chunk.iter().enumerate() {
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
                values.push(Value::String(&printing.lang));
                values.push(match printing.released_at {
                    Some(released_at) => Value::TimeDate(released_at),
                    None => Value::Null(NullType::TimeDate),
                });
                values.push(Value::String(&printing.finishes));
                values.push(optional_string(printing.image_small.as_deref()));
                values.push(optional_string(printing.image_normal.as_deref()));
                values.push(optional_i64(printing.price_eur));
                values.push(optional_i64(printing.price_eur_foil));
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
fn optional_i64(value: Option<i64>) -> Value<'static> {
    match value {
        Some(value) => Value::I64(value),
        None => Value::Null(NullType::I64),
    }
}
