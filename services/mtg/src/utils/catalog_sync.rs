//! Pulling Scryfall's catalog into the `printing` table
//!
//! Run from the `sync-catalog` subcommand, on a schedule. Prices are the only
//! thing that moves day to day, but a printing that was added since the last
//! run has to arrive too, so the whole file is applied rather than a diff.

use std::collections::HashMap;

use anyhow::Context;
use anyhow::anyhow;
use async_compression::tokio::bufread::GzipDecoder;
use futures_util::TryStreamExt;
use galvyn::core::re_exports::time::Date;
use galvyn::core::re_exports::time::Month;
use galvyn::rorm::Database;
use serde::Deserialize;
use tokio::io::AsyncReadExt;
use tokio_util::io::StreamReader;
use tracing::info;
use tracing::instrument;
use tracing::warn;
use uuid::Uuid;

use crate::models::card_attributes::CardRarity;
use crate::models::catalog::CatalogSync;
use crate::models::printing::Printing;
use crate::models::printing::TRACKED_FORMATS;
use crate::models::printing::collector_number_sort;
use crate::models::printing::fold_name;
use crate::models::watch_list::WatchListEntry;
use crate::models::watch_list::alarms::AlarmSweep;
use crate::utils::bracket_flags;
use crate::utils::json_objects::JsonObjects;

/// Where Scryfall lists its bulk files
const BULK_INDEX: &str = "https://api.scryfall.com/bulk-data";

/// Identifies this service to Scryfall, as their guidelines ask
const USER_AGENT: &str = "Planarium/0.1 catalog-sync";

/// How many printings are collected before a transaction is opened for them
///
/// Small enough that a failure costs one batch rather than the whole run, and
/// that the process never holds more than a few thousand rows in memory.
const BATCH: usize = 4096;

/// The `type` Scryfall lists the applied bulk file under
///
/// Always the full file — every printing in every language. The language is
/// part of a printing's id, so a collection holding a German card only
/// resolves against this one.
const BULK_TYPE: &str = "all_cards";

/// What asking Scryfall for the catalog came to
#[derive(Debug)]
pub enum SyncOutcome {
    /// The file on offer is the one already read, so nothing was downloaded
    Unchanged {
        /// The stamp both ends agree on
        stamp: String,
    },
    /// The file was new and has been read
    Synced(SyncReport),
}

/// What a run did
#[derive(Debug, Default)]
pub struct SyncReport {
    /// Printings read from the file
    pub read: usize,
    /// Printings written to the catalog
    pub written: u64,
    /// Printings the file held but this could not make sense of
    pub skipped: usize,
    /// Watch list entries whose price fell through their alarm
    pub armed: u64,
    /// Watch list entries whose price rose back above it
    pub disarmed: u64,
}

/// Scryfall's bulk index
#[derive(Deserialize)]
struct BulkIndex {
    data: Vec<BulkEntry>,
}

/// One file in the bulk index
///
/// Scryfall serves these as newline-delimited json, gzipped — hence the field
/// name. There is also a plain `download_uri` on some entries, but the jsonl
/// one is the format they keep current.
#[derive(Deserialize)]
struct BulkEntry {
    #[serde(rename = "type")]
    kind: String,
    jsonl_download_uri: String,
    /// When Scryfall last regenerated this file
    ///
    /// Kept as the string it arrived as; see `CatalogSyncModel.bulk_updated_at`
    /// for why it is never parsed.
    updated_at: String,
    /// Only ever logged
    #[serde(default)]
    compressed_size: Option<u64>,
}

/// The part of a Scryfall card object the catalog keeps
#[derive(Deserialize)]
struct ScryfallCard {
    id: Uuid,
    oracle_id: Option<Uuid>,
    name: String,
    set: String,
    set_name: String,
    collector_number: String,
    rarity: Option<String>,
    cmc: Option<f64>,
    color_identity: Option<Vec<String>>,
    type_line: Option<String>,
    mana_cost: Option<String>,
    artist: Option<String>,
    keywords: Option<Vec<String>>,
    legalities: Option<HashMap<String, String>>,
    lang: Option<String>,
    layout: Option<String>,
    released_at: Option<String>,
    finishes: Option<Vec<String>>,
    produced_mana: Option<Vec<String>>,
    game_changer: Option<bool>,
    reserved: Option<bool>,
    oracle_text: Option<String>,
    image_uris: Option<ImageUris>,
    card_faces: Option<Vec<CardFace>>,
    prices: Option<Prices>,
    cardmarket_id: Option<i32>,
}

/// Artwork urls, which two-faced cards carry per face instead
#[derive(Deserialize)]
struct ImageUris {
    small: Option<String>,
    normal: Option<String>,
}

/// One face of a two-faced card
#[derive(Deserialize)]
struct CardFace {
    image_uris: Option<ImageUris>,
    mana_cost: Option<String>,
    type_line: Option<String>,
    oracle_text: Option<String>,
}

/// The prices Scryfall quotes, as decimal strings
#[derive(Deserialize)]
struct Prices {
    eur: Option<String>,
    eur_foil: Option<String>,
}

/// Reads a decimal price into euro cents
///
/// # Returns
/// The price in cents, or `None` when Scryfall quotes none
fn cents(price: Option<&String>) -> Option<i64> {
    let parsed: f64 = price?.parse().ok()?;
    Some((parsed * 100.0).round() as i64)
}

/// Reads what a card only says on its faces
///
/// Split cards, adventures and transforming cards keep cost and type line per
/// face rather than on the card itself, and joining them the way Scryfall
/// prints them keeps every castable half countable.
///
/// A reversible card is the exception: it is one card photographed on both
/// sides, so its faces repeat the same cost and the same type line. Joining
/// those would count every mana symbol twice, which is why only the front is
/// read. The two scans are still taken, one per side — those really do differ.
fn from_faces(
    faces: &[CardFace],
    reversible: bool,
    separator: &str,
    read: fn(&CardFace) -> Option<&str>,
) -> String {
    let faces = match reversible {
        true => &faces[..faces.len().min(1)],
        false => faces,
    };
    faces
        .iter()
        .filter_map(read)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join(separator)
}

/// Adds a mana cost up the way Scryfall's `cmc` does
///
/// Only reached when the card object quotes no `cmc` of its own, which is the
/// reversible cards' case — everything about them lives on their faces. `{X}`
/// counts zero, a hybrid or phyrexian symbol counts one whichever half is
/// paid, and a generic `{7}` counts seven.
fn mana_value_of(cost: &str) -> f64 {
    let mut total = 0.0;
    let mut rest = cost;
    while let Some(open) = rest.find('{') {
        let Some(close) = rest[open..].find('}') else {
            break;
        };
        let symbol = &rest[open + 1..open + close];
        total += match symbol.parse::<f64>() {
            Ok(generic) => generic,
            Err(_) if matches!(symbol, "X" | "Y" | "Z") => 0.0,
            Err(_) => 1.0,
        };
        rest = &rest[open + close + 1..];
    }
    total
}

/// Turns a Scryfall card into a catalog row
///
/// # Returns
/// The printing, or `None` when the object is not one this can file
fn to_printing(card: ScryfallCard) -> Option<Printing> {
    // Read once, because everything below asks the faces something: a
    // reversible card says nothing about itself at all — no type line, no cost,
    // no mana value — and left unread it would file as "other" with a curve
    // slot of zero.
    let reversible = card.layout.as_deref() == Some("reversible_card");
    let faces = card.card_faces.unwrap_or_default();

    let mana_cost = match card.mana_cost.filter(|cost| !cost.is_empty()) {
        Some(cost) => cost,
        None => from_faces(&faces, reversible, " // ", |face| face.mana_cost.as_deref()),
    };

    let type_line = match card.type_line.filter(|line| !line.is_empty()) {
        Some(line) => line,
        None => from_faces(&faces, reversible, " // ", |face| face.type_line.as_deref()),
    };

    // Reduced to the tracked formats right here: the full map is thirty
    // entries per card, and the statistics only ever ask about these.
    let legalities = card.legalities.unwrap_or_default();
    let legal_formats = TRACKED_FORMATS
        .into_iter()
        .filter(|format| legalities.get(*format).map(String::as_str) == Some("legal"))
        .collect::<Vec<_>>()
        .join(",");

    // Both faces joined, and read before the faces are consumed below: the
    // bracket patterns read rules text, and a two-faced card carries it per
    // face rather than on the card itself.
    let oracle_text = match card.oracle_text.as_deref() {
        Some(text) => text.to_owned(),
        None => faces
            .iter()
            .filter_map(|face| face.oracle_text.as_deref())
            .collect::<Vec<_>>()
            .join("\n"),
    };

    // A two-faced card carries no artwork of its own; its faces do, one scan
    // each. That is also how a card that can be flipped is told from one that
    // only reads as two: a split card has faces but a single photograph, so its
    // back stays empty and nothing offers to turn it over.
    let mut faces = faces.into_iter();
    let front = faces.next();
    let back = faces.next();
    let images = card
        .image_uris
        .or_else(|| front.and_then(|face| face.image_uris));
    let back_images = back.and_then(|face| face.image_uris);

    let released_at = card.released_at.as_deref().and_then(parse_date);

    let mut color_identity = card.color_identity.unwrap_or_default().join("");
    color_identity.truncate(8);

    Some(Printing {
        id: card.id,
        oracle_id: card.oracle_id,
        name_sort: fold_name(&card.name),
        name: truncated(card.name, 512),
        set_code: truncated(card.set.to_uppercase(), 16),
        set_name: truncated(card.set_name, 255),
        collector_number_sort: collector_number_sort(&card.collector_number),
        collector_number: truncated(card.collector_number, 32),
        rarity: CardRarity::from_scryfall(card.rarity.as_deref().unwrap_or("")),
        mana_value: card.cmc.unwrap_or_else(|| mana_value_of(&mana_cost)),
        color_identity,
        type_line: truncated(type_line, 255),
        mana_cost: truncated(mana_cost, 128),
        artist: truncated(card.artist.unwrap_or_default(), 255),
        keywords: truncated(card.keywords.unwrap_or_default().join(","), 512),
        legal_formats,
        lang: truncated(card.lang.unwrap_or_else(|| String::from("en")), 16),
        cardmarket_id: card.cardmarket_id,
        released_at,
        finishes: truncated(card.finishes.unwrap_or_default().join(","), 64),
        image_small: images.as_ref().and_then(|uris| uris.small.clone()),
        image_normal: images.as_ref().and_then(|uris| uris.normal.clone()),
        image_back_small: back_images.as_ref().and_then(|uris| uris.small.clone()),
        image_back_normal: back_images.as_ref().and_then(|uris| uris.normal.clone()),
        price_eur: cents(card.prices.as_ref().and_then(|prices| prices.eur.as_ref())),
        price_eur_foil: cents(
            card.prices
                .as_ref()
                .and_then(|prices| prices.eur_foil.as_ref()),
        ),
        produced_mana: truncated(card.produced_mana.unwrap_or_default().join(""), 16),
        game_changer: card.game_changer.unwrap_or(false),
        mass_land_denial: bracket_flags::is_mass_land_denial(&oracle_text),
        extra_turns: bracket_flags::is_extra_turns(&oracle_text),
        reserved: card.reserved.unwrap_or(false),
    })
}

/// Reads Scryfall's `YYYY-MM-DD` release date
///
/// Split by hand rather than through `format_description!`: the macro resolves
/// its own paths against a crate called `time`, which this service only has
/// re-exported through galvyn.
///
/// # Returns
/// The date, or `None` when it is not one
fn parse_date(value: &str) -> Option<Date> {
    let mut parts = value.split('-');
    let year: i32 = parts.next()?.parse().ok()?;
    let month: u8 = parts.next()?.parse().ok()?;
    let day: u8 = parts.next()?.parse().ok()?;
    Date::from_calendar_date(year, Month::try_from(month).ok()?, day).ok()
}

/// Cuts a string to what its column holds
///
/// Scryfall has no length contract, and a card with a name longer than the
/// column is not worth failing a whole batch over.
fn truncated(mut value: String, limit: usize) -> String {
    if value.chars().count() > limit {
        value = value.chars().take(limit).collect();
    }
    value
}

/// Applies Scryfall's bulk file to the catalog
#[instrument(name = "catalog_sync", skip(database))]
pub async fn sync_catalog(database: &Database, force: bool) -> anyhow::Result<SyncOutcome> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .context("building the http client")?;

    let index: BulkIndex = client
        .get(BULK_INDEX)
        .send()
        .await
        .context("asking Scryfall for its bulk index")?
        .error_for_status()
        .context("Scryfall refused the bulk index")?
        .json()
        .await
        .context("reading the bulk index")?;

    let entry = index
        .data
        .into_iter()
        .find(|entry| entry.kind == BULK_TYPE)
        .ok_or_else(|| anyhow!("Scryfall lists no {BULK_TYPE} file"))?;

    // The whole point of the index request: Scryfall regenerates these files at
    // most twice a day, so a run that finds the same stamp has nothing to do
    // and stops before four hundred megabytes are pulled over the wire and
    // every printing row is rewritten. That is what makes running this on a
    // schedule cheap enough to run it often.
    if !force {
        let mut tx = database
            .start_transaction()
            .await
            .context("opening a transaction for the last sync")?;
        let last = CatalogSync::read(&mut tx)
            .await
            .context("reading what the last sync took")?;
        tx.commit().await.context("committing")?;

        if last.is_some_and(|last| *last.bulk_updated_at == entry.updated_at) {
            info!(
                file = BULK_TYPE,
                stamp = entry.updated_at,
                "Catalog already up to date"
            );
            return Ok(SyncOutcome::Unchanged {
                stamp: entry.updated_at,
            });
        }
    }

    info!(
        file = BULK_TYPE,
        compressed_bytes = entry.compressed_size,
        stamp = entry.updated_at,
        "Downloading the catalog"
    );

    let stream = client
        .get(&entry.jsonl_download_uri)
        .send()
        .await
        .context("downloading the catalog")?
        .error_for_status()
        .context("Scryfall refused the download")?
        .bytes_stream()
        .map_err(std::io::Error::other);

    // The body is a gzip *file* — `Content-Type: application/gzip` with no
    // `Content-Encoding` — so the http client hands it over still packed and
    // this has to unpack it as it arrives.
    let mut decoder = GzipDecoder::new(StreamReader::new(stream));

    let mut objects = JsonObjects::default();
    let mut batch: Vec<Printing> = Vec::with_capacity(BATCH);
    let mut report = SyncReport::default();
    let mut buffer = vec![0_u8; 64 * 1024];

    loop {
        let read = decoder
            .read(&mut buffer)
            .await
            .context("unpacking the catalog stream")?;
        if read == 0 {
            break;
        }

        for object in objects.feed(&buffer[..read]) {
            report.read += 1;
            match serde_json::from_slice::<ScryfallCard>(&object) {
                Ok(card) => match to_printing(card) {
                    Some(printing) => batch.push(printing),
                    None => report.skipped += 1,
                },
                Err(error) => {
                    // One unreadable card must not end a sync of a hundred
                    // thousand. Counted, so a broken run is visible.
                    report.skipped += 1;
                    if report.skipped <= 5 {
                        warn!(%error, "Skipping a card the catalog could not read");
                    }
                }
            }

            if batch.len() >= BATCH {
                report.written += flush(database, &mut batch).await?;
                info!(read = report.read, written = report.written, "Syncing");
            }
        }
    }

    report.written += flush(database, &mut batch).await?;

    // The stock rollup keeps a copy of each printing's card and language, and
    // this run may have moved either — a printing the catalog had never heard of
    // before now has an oracle id, and a merge gives an old one a new card. The
    // copy is refreshed here for the same reason the alarms are decided here:
    // this is the moment the catalog changed.
    let refreshed = refresh_stock(database).await?;
    if refreshed > 0 {
        info!(rows = refreshed, "Refreshed the stock rollup's card data");
    }

    // The alarms belong to this run, not to a clock of their own: a price only
    // ever moves because a sync moved it, so this is the one moment at which an
    // alarm can have become true or stopped being true.
    let sweep = sweep_alarms(database).await?;
    report.armed = sweep.armed;
    report.disarmed = sweep.disarmed;

    // Recorded last, so a run that died halfway is retried rather than skipped.
    let mut tx = database
        .start_transaction()
        .await
        .context("opening a transaction for the sync stamp")?;
    CatalogSync::record(&mut tx, &entry.updated_at)
        .await
        .context("recording what this sync took")?;
    tx.commit().await.context("committing the sync stamp")?;

    info!(
        read = report.read,
        written = report.written,
        skipped = report.skipped,
        armed = report.armed,
        disarmed = report.disarmed,
        stamp = entry.updated_at,
        "Catalog synced"
    );

    Ok(SyncOutcome::Synced(report))
}

/// Points the stock rollup at what the catalog now says
///
/// Only the rows that disagree, which after most syncs is none of them: the
/// statement is a join against `printing` and writes nothing when the two
/// already match. See `migrations/0027_collection_stock_card.toml` for why the
/// rollup holds a copy at all.
///
/// Returns how many rows were put right.
async fn refresh_stock(database: &Database) -> anyhow::Result<u64> {
    let mut tx = database
        .start_transaction()
        .await
        .context("opening a transaction for the stock rollup")?;
    let rows = crate::models::collection::stock::refresh_cards(&mut tx)
        .await
        .context("refreshing the stock rollup's card data")?;
    tx.commit()
        .await
        .context("committing the stock rollup refresh")?;
    Ok(rows)
}

/// Decides every watch list alarm against the prices the sync just wrote
async fn sweep_alarms(database: &Database) -> anyhow::Result<AlarmSweep> {
    let mut tx = database
        .start_transaction()
        .await
        .context("opening a transaction for the alarms")?;
    let sweep = WatchListEntry::evaluate_alarms(&mut tx)
        .await
        .context("deciding the watch list alarms")?;
    tx.commit().await.context("committing the alarms")?;
    Ok(sweep)
}

/// Writes a batch in its own transaction and empties it
///
/// A transaction per batch rather than one around the whole file: a run over
/// half a million printings would otherwise hold a single transaction open for
/// minutes, and an interrupted sync would leave nothing behind at all.
async fn flush(database: &Database, batch: &mut Vec<Printing>) -> anyhow::Result<u64> {
    if batch.is_empty() {
        return Ok(0);
    }

    let mut tx = database
        .start_transaction()
        .await
        .context("opening a transaction for a batch")?;
    let written = Printing::upsert_many(&mut tx, batch)
        .await
        .context("writing a batch")?;
    tx.commit().await.context("committing a batch")?;

    batch.clear();
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::ScryfallCard;
    use super::to_printing;

    /// Reads a card object the way the sync reads one out of the bulk file
    fn printing(json: &str) -> super::Printing {
        let card: ScryfallCard = serde_json::from_str(json).expect("the card object should parse");
        to_printing(card).expect("the card should file")
    }

    #[test]
    fn takes_both_scans_off_a_card_photographed_twice() {
        let card = printing(
            r#"{
                "id": "11bf83bb-c95b-4b4f-9a56-ce7a1816307a",
                "name": "Delver of Secrets // Insectile Aberration",
                "set": "isd",
                "set_name": "Innistrad",
                "collector_number": "51",
                "card_faces": [
                    {"image_uris": {"small": "front-small", "normal": "front-normal"}, "mana_cost": "{U}"},
                    {"image_uris": {"small": "back-small", "normal": "back-normal"}, "mana_cost": ""}
                ]
            }"#,
        );

        assert_eq!(card.image_small.as_deref(), Some("front-small"));
        assert_eq!(card.image_normal.as_deref(), Some("front-normal"));
        assert_eq!(card.image_back_small.as_deref(), Some("back-small"));
        assert_eq!(card.image_back_normal.as_deref(), Some("back-normal"));
    }

    #[test]
    fn leaves_the_back_empty_for_faces_sharing_one_picture() {
        let card = printing(
            r#"{
                "id": "1f5b8b0c-9c19-4a1f-bfe1-58ba4d2e1eb2",
                "name": "Fire // Ice",
                "set": "apc",
                "set_name": "Apocalypse",
                "collector_number": "128",
                "image_uris": {"small": "split-small", "normal": "split-normal"},
                "card_faces": [{"mana_cost": "{1}{R}"}, {"mana_cost": "{1}{U}"}]
            }"#,
        );

        assert_eq!(card.image_small.as_deref(), Some("split-small"));
        assert_eq!(card.image_back_small, None);
        assert_eq!(card.image_back_normal, None);
        assert_eq!(card.mana_cost, "{1}{R} // {1}{U}");
    }

    /// A reversible card says nothing about itself, and what its faces say it
    /// says twice — the Secret Lair print of Teferi's Ageless Insight, whose
    /// front is the God of War card. Filed off the card alone it was an "other"
    /// costing nothing.
    #[test]
    fn reads_a_reversible_card_off_its_front_face_only() {
        let card = printing(
            r#"{
                "id": "b83edc5c-ee6b-4c75-94b2-46d1f68f7304",
                "name": "Teferi's Ageless Insight // Teferi's Ageless Insight",
                "set": "sld",
                "set_name": "Secret Lair Drop",
                "collector_number": "2214",
                "layout": "reversible_card",
                "card_faces": [
                    {
                        "image_uris": {"small": "mimir-small", "normal": "mimir-normal"},
                        "mana_cost": "{2}{U}{U}",
                        "type_line": "Legendary Enchantment"
                    },
                    {
                        "image_uris": {"small": "teferi-small", "normal": "teferi-normal"},
                        "mana_cost": "{2}{U}{U}",
                        "type_line": "Legendary Enchantment"
                    }
                ]
            }"#,
        );

        assert_eq!(card.type_line, "Legendary Enchantment");
        assert_eq!(card.mana_cost, "{2}{U}{U}");
        assert_eq!(card.mana_value, 4.0);
        // Both sides are photographed, and those two pictures do differ.
        assert_eq!(card.image_small.as_deref(), Some("mimir-small"));
        assert_eq!(card.image_back_small.as_deref(), Some("teferi-small"));
    }

    #[test]
    fn adds_a_mana_cost_up_like_scryfall() {
        assert_eq!(super::mana_value_of("{2}{U}{U}"), 4.0);
        assert_eq!(super::mana_value_of("{X}{R}"), 1.0);
        assert_eq!(super::mana_value_of("{W/U}{2/B}{U/P}"), 3.0);
        assert_eq!(super::mana_value_of("{15}"), 15.0);
        assert_eq!(super::mana_value_of(""), 0.0);
    }
}
