//! Turning the way an export names a card into a printing of the catalog
//!
//! An import is a file written by another tracker: a name, maybe a set code and
//! a collector number, sometimes Scryfall's id. Every row has to end up as one
//! printing id, because that id is the only thing a collection entry stores.
//!
//! This used to happen in the browser against Scryfall's api — thousands of
//! rows in batches of seventy-five, spaced by the rate limit, minutes of
//! waiting for data this service already holds a copy of. The catalog answers
//! the same question in a handful of indexed queries.
//!
//! The catalog holds every language, so a coordinate or a name matches several
//! rows and one of them has to be picked. That choice is what most of this
//! module is about: the language asked for wins, English is the fallback, and
//! everything below that only exists so the same file imported twice resolves
//! to the same cards.

use std::collections::HashMap;

use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::executor::All;
use galvyn::rorm::db::sql::value::Value;
use galvyn::rorm::db::transaction::Transaction;
use tracing::instrument;
use uuid::Uuid;

use crate::models::printing::fold_name;

/// The language a printing is assumed to be in when a row does not say
const DEFAULT_LANG: &str = "en";

/// How many lookups go into one statement
///
/// Each pair binds two parameters against Postgres' ceiling of 65535, so this
/// is nowhere near it — it is chosen so that one statement stays a bounded
/// amount of work rather than growing with whatever the client sent.
const QUERY_CHUNK: usize = 512;

/// The columns every lookup reads
const COLUMNS: &str =
    "p.id, p.name, p.set_code, p.set_name, p.collector_number, p.lang, p.finishes";

/// The asked-for pair, carried through so an answer can be filed under it
///
/// A statement answers the pairs the catalog knows and says nothing about the
/// rest, so the rows come back neither complete nor in the order they were
/// asked in. Selecting the question next to the answer is what makes the two
/// line up again.
const ASKED: &str = "v.asked_left, v.asked_right";

/// How one row of an import names the card it wants
///
/// Everything is optional because every exporter writes a different subset. The
/// fields are tried in the order of how much they pin down: an id names exactly
/// one printing, a set and a collector number name one card in every language,
/// a name alone names a card but not which printing of it.
#[derive(Debug, Clone, Default)]
pub struct PrintingLookup {
    /// Scryfall's id, when the export carried one
    pub id: Option<Uuid>,
    /// Set code, in any case
    pub set_code: Option<String>,
    /// Collector number as printed
    pub collector_number: Option<String>,
    /// The printed name, in any spelling [`fold_name`] folds away
    pub name: Option<String>,
    /// The language the row is in, as Scryfall's code
    pub lang: Option<String>,
}

/// What the catalog answers a lookup with
///
/// Only what filing a card and reporting what was understood needs. The rest of
/// the printing is not sent: an import turns into collection entries, and those
/// are read back through the listing, which joins the catalog itself.
#[derive(Debug, Clone)]
pub struct ResolvedPrinting {
    /// Scryfall's id of the printing
    pub id: Uuid,
    /// The printed name
    pub name: String,
    /// Set code, upper case
    pub set_code: String,
    /// Full set name
    pub set_name: String,
    /// Collector number as printed
    pub collector_number: String,
    /// Language of this printing, as Scryfall's code
    pub lang: String,
    /// Comma separated finishes this printing exists in
    pub finishes: String,
}

/// What a lookup was narrowed down to, and what it is keyed by while resolving
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum LookupKey {
    /// Scryfall's id
    Id(Uuid),
    /// A set and a position in it, in the language asked for
    Coordinate {
        /// Set code, upper case
        set_code: String,
        /// Collector number as the export wrote it
        collector_number: String,
        /// The language wanted
        lang: String,
    },
    /// A folded name, optionally narrowed to a set, in the language asked for
    Name {
        /// The folded name
        name_sort: String,
        /// Set code, upper case, empty when the row named none
        set_code: String,
        /// The language wanted
        lang: String,
    },
}

impl LookupKey {
    /// Reads a lookup as the most specific key it supports
    ///
    /// `None` for a row that names no card at all — those are answered as
    /// unmatched rather than being asked about.
    fn of(lookup: &PrintingLookup) -> Option<LookupKey> {
        if let Some(id) = lookup.id {
            return Some(LookupKey::Id(id));
        }

        let lang = lookup
            .lang
            .as_deref()
            .map(str::trim)
            .filter(|lang| !lang.is_empty())
            .unwrap_or(DEFAULT_LANG)
            .to_lowercase();
        let set_code = lookup
            .set_code
            .as_deref()
            .map(str::trim)
            .unwrap_or_default()
            .to_uppercase();
        // Kept as written: the catalog stores what Scryfall prints, and
        // matching that exactly is what the index is for. The case-folded
        // second pass in [`resolve_pairs`] catches the rest.
        let collector_number = lookup
            .collector_number
            .as_deref()
            .map(str::trim)
            .unwrap_or_default()
            .to_string();

        if !set_code.is_empty() && !collector_number.is_empty() {
            return Some(LookupKey::Coordinate {
                set_code,
                collector_number,
                lang,
            });
        }

        let name_sort = fold_name(lookup.name.as_deref().unwrap_or_default().trim());
        if name_sort.is_empty() {
            return None;
        }

        Some(LookupKey::Name {
            name_sort,
            set_code,
            lang,
        })
    }
}

impl ResolvedPrinting {
    /// Resolves every lookup against the catalog, in order
    ///
    /// Identical lookups are asked about once, so a playset written as four
    /// lines costs one. Every input gets an answer at its own index — `None`
    /// for the ones the catalog cannot place, which the caller has to report
    /// rather than quietly drop.
    #[instrument(
        name = "ResolvedPrinting::resolve",
        skip(tx, lookups),
        fields(count = lookups.len())
    )]
    pub async fn resolve(
        tx: &mut Transaction,
        lookups: &[PrintingLookup],
    ) -> Result<Vec<Option<ResolvedPrinting>>, rorm::Error> {
        let keys: Vec<Option<LookupKey>> = lookups.iter().map(LookupKey::of).collect();

        let mut ids: Vec<Uuid> = Vec::new();
        // Grouped by language rather than asked per row: a file is written in
        // one or two languages, and the preference is an `ORDER BY` that every
        // row of a group shares. Six statements for a whole import, not one per
        // card.
        let mut coordinates: HashMap<&str, Vec<(&str, &str)>> = HashMap::new();
        let mut names: HashMap<&str, Vec<(&str, &str)>> = HashMap::new();

        for key in keys.iter().flatten() {
            match key {
                LookupKey::Id(id) => ids.push(*id),
                LookupKey::Coordinate {
                    set_code,
                    collector_number,
                    lang,
                } => coordinates
                    .entry(lang)
                    .or_default()
                    .push((set_code, collector_number)),
                LookupKey::Name {
                    name_sort,
                    set_code,
                    lang,
                } => names.entry(lang).or_default().push((name_sort, set_code)),
            }
        }

        let mut found: HashMap<LookupKey, ResolvedPrinting> = HashMap::new();

        ids.sort_unstable();
        ids.dedup();
        for chunk in ids.chunks(QUERY_CHUNK) {
            let placeholders = placeholders(chunk.len());
            let statement =
                format!("SELECT {COLUMNS} FROM printing p WHERE p.id IN ({placeholders})");
            let values = chunk.iter().copied().map(Value::Uuid).collect();

            for printing in read_ids(tx, statement, values).await? {
                found.insert(LookupKey::Id(printing.id), printing);
            }
        }

        for (lang, pairs) in coordinates.iter_mut() {
            pairs.sort_unstable();
            pairs.dedup();

            for chunk in pairs.chunks(QUERY_CHUNK) {
                let key = |set_code: &str, collector_number: &str| LookupKey::Coordinate {
                    set_code: set_code.to_string(),
                    collector_number: collector_number.to_string(),
                    lang: (*lang).to_string(),
                };
                resolve_pairs(tx, &mut found, chunk, lang, key, coordinate_statement).await?;
            }
        }

        for (lang, pairs) in names.iter_mut() {
            pairs.sort_unstable();
            pairs.dedup();

            for chunk in pairs.chunks(QUERY_CHUNK) {
                let key = |name_sort: &str, set_code: &str| LookupKey::Name {
                    name_sort: name_sort.to_string(),
                    set_code: set_code.to_string(),
                    lang: (*lang).to_string(),
                };
                resolve_pairs(tx, &mut found, chunk, lang, key, name_statement).await?;
            }
        }

        Ok(keys
            .into_iter()
            .map(|key| key.and_then(|key| found.get(&key).cloned()))
            .collect())
    }
}

/// Asks about one chunk of pairs, in two passes
///
/// The strict pass is the one an index can answer; the loose one exists because
/// exports are written by hand as often as by a program — a collector number in
/// the wrong case, a split card named by half of itself. It only ever asks
/// about what the strict pass left unmatched, so a clean file never pays for
/// it, and a file that needs it pays once per chunk.
async fn resolve_pairs<Key>(
    tx: &mut Transaction,
    found: &mut HashMap<LookupKey, ResolvedPrinting>,
    pairs: &[(&str, &str)],
    lang: &str,
    key: Key,
    statement: fn(usize, bool) -> String,
) -> Result<(), rorm::Error>
where
    Key: Fn(&str, &str) -> LookupKey,
{
    for strict in [true, false] {
        let missing: Vec<(&str, &str)> = pairs
            .iter()
            .copied()
            .filter(|(left, right)| !found.contains_key(&key(left, right)))
            .collect();
        if missing.is_empty() {
            break;
        }

        let values = pair_values(&missing, lang);
        // Filed under what was asked, not under what came back: the answer's
        // name is the whole "Fire // Ice" even when the question was half of it.
        for (left, right, printing) in
            read_pairs(tx, statement(missing.len(), strict), values).await?
        {
            found.insert(key(&left, &right), printing);
        }
    }

    Ok(())
}

/// Runs a statement that looks printings up by id
async fn read_ids(
    tx: &mut Transaction,
    statement: String,
    values: Vec<Value<'_>>,
) -> Result<Vec<ResolvedPrinting>, rorm::Error> {
    let rows = (&mut *tx).execute::<All>(statement, values).await?;

    rows.into_iter().map(printing_of).collect()
}

/// Runs a statement built around a pair list, keeping each answer's question
async fn read_pairs(
    tx: &mut Transaction,
    statement: String,
    values: Vec<Value<'_>>,
) -> Result<Vec<(String, String, ResolvedPrinting)>, rorm::Error> {
    let rows = (&mut *tx).execute::<All>(statement, values).await?;

    rows.into_iter()
        .map(|row| {
            let decode =
                |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());
            let left: String = row.get("asked_left").map_err(decode)?;
            let right: String = row.get("asked_right").map_err(decode)?;

            Ok((left, right, printing_of(row)?))
        })
        .collect()
}

/// Reads one row of [`COLUMNS`]
fn printing_of(row: rorm::db::row::Row) -> Result<ResolvedPrinting, rorm::Error> {
    let decode = |error: rorm::db::row::RowError<'_>| rorm::Error::RowError(error.into_owned());

    Ok(ResolvedPrinting {
        id: row.get("id").map_err(decode)?,
        name: row.get("name").map_err(decode)?,
        set_code: row.get("set_code").map_err(decode)?,
        set_name: row.get("set_name").map_err(decode)?,
        collector_number: row.get("collector_number").map_err(decode)?,
        lang: row.get("lang").map_err(decode)?,
        finishes: row.get("finishes").map_err(decode)?,
    })
}

/// A comma separated run of placeholders, `$1, $2, …`
fn placeholders(count: usize) -> String {
    (1..=count)
        .map(|index| format!("${index}"))
        .collect::<Vec<_>>()
        .join(", ")
}

/// The values for a statement built by [`pair_rows`], with the language last
fn pair_values<'query>(
    pairs: &[(&'query str, &'query str)],
    lang: &'query str,
) -> Vec<Value<'query>> {
    let mut values: Vec<Value<'query>> = Vec::with_capacity(pairs.len() * 2 + 1);
    for (left, right) in pairs {
        values.push(Value::String(left));
        values.push(Value::String(right));
    }
    values.push(Value::String(lang));
    values
}

/// The rows of a `VALUES` list holding pairs, cast so Postgres can type them
///
/// A parameter inside `VALUES` carries no type of its own, and Postgres refuses
/// a list it cannot type. The cast is on the placeholder, never on data.
fn pair_rows(count: usize) -> String {
    (0..count)
        .map(|index| format!("(${}::varchar, ${}::varchar)", index * 2 + 1, index * 2 + 2))
        .collect::<Vec<_>>()
        .join(", ")
}

/// Looks printings up by set and collector number
///
/// `DISTINCT ON` picks one row per asked-for coordinate; the `ORDER BY` decides
/// which. The language asked for comes first, English second — a collection
/// that records no language is one of English cards, and answering a
/// coordinate with whichever language the catalog happened to store first would
/// file a Japanese printing on a whim.
fn coordinate_statement(count: usize, strict: bool) -> String {
    let rows = pair_rows(count);
    let lang = count * 2 + 1;
    // The strict comparison is the one `(set_code, collector_number)` is
    // indexed for. Folding the case is a function on the column and therefore a
    // scan, which is why it only runs over what stayed unmatched.
    let number = if strict {
        "p.collector_number = v.asked_right"
    } else {
        "lower(p.collector_number) = lower(v.asked_right)"
    };

    format!(
        "SELECT DISTINCT ON (v.asked_left, v.asked_right) {ASKED}, {COLUMNS} \
         FROM (VALUES {rows}) AS v(asked_left, asked_right) \
         JOIN printing p ON p.set_code = v.asked_left AND {number} \
         ORDER BY v.asked_left, v.asked_right, \
                  (p.lang = ${lang}) DESC, (p.lang = 'en') DESC, p.lang ASC"
    )
}

/// Looks printings up by name, optionally narrowed to a set
///
/// The empty set code stands for "any set" — spelling that as a condition
/// rather than as a second statement keeps one query per language group.
///
/// The strict pass asks for the name as the catalog spells it. The loose one
/// matches it against the front half of a two-part name, which is how a split
/// card ends up written in half the exports there are — "Fire" for what the
/// catalog calls "Fire // Ice".
///
/// The oldest printing wins, since a name alone says nothing about which one
/// was meant and the first printing is the one people mean by the card.
fn name_statement(count: usize, strict: bool) -> String {
    let rows = pair_rows(count);
    let lang = count * 2 + 1;
    let name = if strict {
        "p.name_sort = v.asked_left"
    } else {
        "split_part(p.name_sort, ' // ', 1) = v.asked_left"
    };

    format!(
        "SELECT DISTINCT ON (v.asked_left, v.asked_right) {ASKED}, {COLUMNS} \
         FROM (VALUES {rows}) AS v(asked_left, asked_right) \
         JOIN printing p \
           ON {name} AND (v.asked_right = '' OR p.set_code = v.asked_right) \
         ORDER BY v.asked_left, v.asked_right, \
                  (p.lang = ${lang}) DESC, (p.lang = 'en') DESC, \
                  p.released_at ASC NULLS LAST, p.collector_number_sort ASC, p.id ASC"
    )
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::LookupKey;
    use super::PrintingLookup;

    #[test]
    fn an_id_beats_everything_else() {
        let id = Uuid::from_u128(1);
        let key = LookupKey::of(&PrintingLookup {
            id: Some(id),
            set_code: Some(String::from("2ed")),
            collector_number: Some(String::from("161")),
            name: Some(String::from("Lightning Bolt")),
            lang: None,
        });

        assert_eq!(key, Some(LookupKey::Id(id)));
    }

    #[test]
    fn a_coordinate_is_normalised_and_beats_the_name() {
        let key = LookupKey::of(&PrintingLookup {
            set_code: Some(String::from(" 2ed ")),
            collector_number: Some(String::from(" 161a ")),
            name: Some(String::from("Lightning Bolt")),
            ..PrintingLookup::default()
        });

        assert_eq!(
            key,
            Some(LookupKey::Coordinate {
                set_code: String::from("2ED"),
                collector_number: String::from("161a"),
                lang: String::from("en"),
            })
        );
    }

    #[test]
    fn half_a_coordinate_falls_back_to_the_name() {
        let key = LookupKey::of(&PrintingLookup {
            set_code: Some(String::from("2ed")),
            name: Some(String::from("Æther Vial")),
            lang: Some(String::from("DE")),
            ..PrintingLookup::default()
        });

        assert_eq!(
            key,
            Some(LookupKey::Name {
                name_sort: String::from("aether vial"),
                set_code: String::from("2ED"),
                lang: String::from("de"),
            })
        );
    }

    #[test]
    fn a_row_naming_nothing_has_no_key() {
        let key = LookupKey::of(&PrintingLookup {
            set_code: Some(String::from("2ed")),
            name: Some(String::from("   ")),
            ..PrintingLookup::default()
        });

        assert_eq!(key, None);
    }
}
