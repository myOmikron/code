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
use crate::models::printing::Printing;
use crate::models::printing::TRACKED_FORMATS;
use crate::models::printing::collector_number_sort;
use crate::models::printing::fold_name;
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

/// What a run did
#[derive(Debug, Default)]
pub struct SyncReport {
    /// Printings read from the file
    pub read: usize,
    /// Printings written to the catalog
    pub written: u64,
    /// Printings the file held but this could not make sense of
    pub skipped: usize,
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
    released_at: Option<String>,
    finishes: Option<Vec<String>>,
    reserved: Option<bool>,
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

/// Turns a Scryfall card into a catalog row
///
/// # Returns
/// The printing, or `None` when the object is not one this can file
fn to_printing(card: ScryfallCard) -> Option<Printing> {
    // A split card or adventure carries a cost per face and often none on the
    // card itself. Joining them the way Scryfall prints them keeps every
    // castable half countable; a transform back face has no cost and adds
    // nothing.
    let mana_cost = match card.mana_cost.filter(|cost| !cost.is_empty()) {
        Some(cost) => cost,
        None => card
            .card_faces
            .as_deref()
            .unwrap_or_default()
            .iter()
            .filter_map(|face| face.mana_cost.as_deref())
            .filter(|cost| !cost.is_empty())
            .collect::<Vec<_>>()
            .join(" // "),
    };

    // Reduced to the tracked formats right here: the full map is thirty
    // entries per card, and the statistics only ever ask about these.
    let legalities = card.legalities.unwrap_or_default();
    let legal_formats = TRACKED_FORMATS
        .into_iter()
        .filter(|format| legalities.get(*format).map(String::as_str) == Some("legal"))
        .collect::<Vec<_>>()
        .join(",");

    // A two-faced card carries no artwork of its own; the front face does.
    let images = card
        .image_uris
        .or_else(|| card.card_faces?.into_iter().next()?.image_uris);

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
        mana_value: card.cmc.unwrap_or(0.0),
        color_identity,
        type_line: truncated(card.type_line.unwrap_or_default(), 255),
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
        price_eur: cents(card.prices.as_ref().and_then(|prices| prices.eur.as_ref())),
        price_eur_foil: cents(
            card.prices
                .as_ref()
                .and_then(|prices| prices.eur_foil.as_ref()),
        ),
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
pub async fn sync_catalog(database: &Database) -> anyhow::Result<SyncReport> {
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

    info!(
        file = BULK_TYPE,
        compressed_bytes = entry.compressed_size,
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
    info!(
        read = report.read,
        written = report.written,
        skipped = report.skipped,
        "Catalog synced"
    );

    Ok(report)
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
