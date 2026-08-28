//! Pulling Cardmarket's price guide into `cardmarket_price`
//!
//! Run from the `sync-price-guide` subcommand, on a schedule. Cardmarket
//! publishes the guide as a public file on their CDN, regenerated once a night,
//! and it is the only euro price with a yesterday this service can get: the
//! Cardmarket API stopped taking applications, and Scryfall quotes one number
//! per printing with no history behind it.
//!
//! Twenty-five megabytes a day, so the run asks with `If-None-Match` first. The
//! CDN answers `304` for a file already read, which is what makes ticking every
//! few hours cost one request rather than the file.

use anyhow::Context;
use anyhow::anyhow;
use galvyn::core::re_exports::time::Date;
use galvyn::rorm::Database;
use reqwest::StatusCode;
use reqwest::header::ETAG;
use reqwest::header::IF_NONE_MATCH;
use serde::Deserialize;
use tracing::info;
use tracing::instrument;
use tracing::warn;

use crate::models::price::CardmarketPrice;
use crate::models::price::PriceGuideSync;
use crate::models::price::PricePoint;
use crate::utils::catalog_sync::parse_date;

/// Where Cardmarket publishes the guide
///
/// The `_1` is their game id, and 1 is Magic. Undocumented in the sense that
/// Cardmarket does not offer it as an API, which is why this reads it once a
/// day with a name in the user agent and treats a bad answer as "no prices
/// today" rather than as a failure worth stopping over.
const PRICE_GUIDE: &str =
    "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json";

/// Identifies this service to Cardmarket's CDN
const USER_AGENT: &str = "Planarium/0.1 price-sync";

/// Cardmarket's category id for a Magic single
///
/// The file also carries sealed product, art series and the rest, none of which
/// a printing joins to.
const MAGIC_SINGLE: i32 = 1;

/// What asking Cardmarket for the guide came to
#[derive(Debug)]
pub enum PriceOutcome {
    /// The file on offer is the one already read, so nothing was downloaded
    Unchanged {
        /// The etag both ends agree on
        etag: String,
    },
    /// The file was new and has been applied
    Synced(PriceReport),
}

/// What a run did
#[derive(Debug, Default)]
pub struct PriceReport {
    /// The day the file quoted prices for
    pub day: Option<Date>,
    /// Entries the file held
    pub read: usize,
    /// Rows written to the history
    pub written: u64,
    /// Entries that were not a Magic single, or carried no price at all
    pub skipped: usize,
    /// Rows the thinning dropped from beyond the daily window
    pub compacted: u64,
}

/// The file as this reads it
#[derive(Debug, Deserialize)]
struct Guide {
    /// When Cardmarket wrote the file, e.g. `2026-08-27T02:46:07+0200`
    #[serde(rename = "createdAt")]
    created_at: String,
    /// One entry per product
    #[serde(rename = "priceGuides")]
    price_guides: Vec<GuideEntry>,
}

/// One product's prices, in euro
#[derive(Debug, Deserialize)]
struct GuideEntry {
    /// Cardmarket's product id
    #[serde(rename = "idProduct")]
    id_product: i32,
    /// What kind of product it is, see [`MAGIC_SINGLE`]
    #[serde(rename = "idCategory")]
    id_category: i32,
    /// The cheapest offer
    low: Option<f64>,
    /// Cardmarket's trend price
    trend: Option<f64>,
    /// The cheapest foil offer
    #[serde(rename = "low-foil")]
    low_foil: Option<f64>,
    /// The foil trend price
    #[serde(rename = "trend-foil")]
    trend_foil: Option<f64>,
}

/// Applies Cardmarket's price guide to the history
#[instrument(name = "price_sync", skip(database))]
pub async fn sync_price_guide(database: &Database, force: bool) -> anyhow::Result<PriceOutcome> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .context("building the http client")?;

    let known = {
        let mut tx = database
            .start_transaction()
            .await
            .context("opening a transaction for the last price sync")?;
        let known = PriceGuideSync::read(&mut tx)
            .await
            .context("reading what the last price sync took")?;
        tx.commit().await.context("committing")?;
        known
    };

    let mut request = client.get(PRICE_GUIDE);
    if !force && let Some(known) = known.as_ref() {
        request = request.header(IF_NONE_MATCH, &known.etag);
    }

    let response = request
        .send()
        .await
        .context("asking Cardmarket for the price guide")?;

    if response.status() == StatusCode::NOT_MODIFIED {
        let etag = known.map(|known| known.etag).unwrap_or_default();
        info!(etag, "Price guide already up to date");
        return Ok(PriceOutcome::Unchanged { etag });
    }

    let response = response
        .error_for_status()
        .context("Cardmarket refused the price guide")?;

    // Kept before the body is consumed, and defaulted rather than required: a
    // CDN that stops sending one costs a download a day, not a sync.
    let etag = response
        .headers()
        .get(ETAG)
        .and_then(|etag| etag.to_str().ok())
        .unwrap_or_default()
        .to_owned();

    let body = response
        .bytes()
        .await
        .context("downloading the price guide")?;
    info!(bytes = body.len(), "Read the price guide");

    let guide: Guide = serde_json::from_slice(&body).context("reading the price guide")?;

    // The stamp carries an offset, and the day is what the history is keyed by,
    // so only the date half is read — a file written at 02:46 in Berlin is the
    // 27th's prices whatever the reader's clock says.
    let day = guide
        .created_at
        .get(..10)
        .and_then(parse_date)
        .ok_or_else(|| anyhow!("the guide is stamped {}", guide.created_at))?;

    let mut report = PriceReport {
        day: Some(day),
        read: guide.price_guides.len(),
        ..PriceReport::default()
    };

    let mut points = Vec::with_capacity(report.read);
    for entry in guide.price_guides {
        if entry.id_category != MAGIC_SINGLE {
            report.skipped += 1;
            continue;
        }

        let point = PricePoint {
            cardmarket_id: entry.id_product,
            low: cents(entry.low),
            trend: cents(entry.trend),
            low_foil: cents(entry.low_foil),
            trend_foil: cents(entry.trend_foil),
        };

        // A product Cardmarket lists but nobody offers carries no number at
        // all. Storing a row of four nulls a day would be the bulk of the
        // table and would say nothing.
        if point.low.is_none()
            && point.trend.is_none()
            && point.low_foil.is_none()
            && point.trend_foil.is_none()
        {
            report.skipped += 1;
            continue;
        }

        points.push(point);
    }

    if points.is_empty() {
        warn!("The price guide held no Magic singles");
    }

    let mut tx = database
        .start_transaction()
        .await
        .context("opening a transaction for the price guide")?;
    report.written = CardmarketPrice::write_day(&mut tx, day, &points)
        .await
        .context("writing the day's prices")?;
    report.compacted = CardmarketPrice::compact(&mut tx)
        .await
        .context("thinning the history")?;
    // Recorded in the same transaction as the day it describes: a stamp without
    // its rows would skip the file for good.
    PriceGuideSync::record(&mut tx, &etag, day)
        .await
        .context("recording what this price sync took")?;
    tx.commit().await.context("committing the price guide")?;

    info!(
        %day,
        read = report.read,
        written = report.written,
        skipped = report.skipped,
        compacted = report.compacted,
        "Price guide applied"
    );

    Ok(PriceOutcome::Synced(report))
}

/// Turns a euro amount into whole cents
///
/// Cents for the same reason the catalog stores them: these are summed and
/// compared, and a binary fraction of a euro does not compare to what a person
/// typed into an alarm. Anything that cannot be a price is dropped rather than
/// wrapped — a `NaN` or a number past two billion cents is a broken file, not a
/// card worth twenty million euro.
fn cents(value: Option<f64>) -> Option<i32> {
    let value = value?;
    if !value.is_finite() || value < 0.0 {
        return None;
    }
    let cents = (value * 100.0).round();
    if cents > f64::from(i32::MAX) {
        return None;
    }
    Some(cents as i32)
}

#[cfg(test)]
mod tests {
    use super::cents;

    #[test]
    fn rounds_a_price_to_whole_cents() {
        assert_eq!(cents(Some(0.02)), Some(2));
        assert_eq!(cents(Some(0.845)), Some(85));
        assert_eq!(cents(Some(899969.69)), Some(89996969));
    }

    #[test]
    fn drops_what_cannot_be_a_price() {
        assert_eq!(cents(None), None);
        assert_eq!(cents(Some(-1.0)), None);
        assert_eq!(cents(Some(f64::NAN)), None);
        assert_eq!(cents(Some(f64::INFINITY)), None);
        assert_eq!(cents(Some(1e12)), None);
    }
}
