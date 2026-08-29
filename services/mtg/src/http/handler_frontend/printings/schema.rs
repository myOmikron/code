//! Schemas for [`super::handler`]

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDate;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use uuid::Uuid;

use crate::models::price::PriceDay;
use crate::models::printing::resolve::PrintingLookup;
use crate::models::printing::resolve::ResolvedPrinting;

/// How one row of an import names the card it wants
///
/// Everything is optional because every exporter writes a different subset.
/// What is present decides how precisely the card is named: an id names exactly
/// one printing, a set code with a collector number names one card in every
/// language, a name alone names a card but not which printing of it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PrintingLookupRequest {
    /// Scryfall's id of the printing, when the export carried one
    #[serde(default)]
    pub id: Option<Uuid>,
    /// Set code, in any case
    #[serde(default)]
    pub set_code: Option<MaxStr<16>>,
    /// Collector number as printed
    #[serde(default)]
    pub collector_number: Option<MaxStr<32>>,
    /// The printed name
    #[serde(default)]
    pub name: Option<MaxStr<512>>,
    /// The language the row is in, as Scryfall's code — English when absent
    #[serde(default)]
    pub lang: Option<MaxStr<16>>,
}

/// A list of cards to place in the catalog
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ResolvePrintingsRequest {
    /// The rows to look up, in any order
    pub lookups: Vec<PrintingLookupRequest>,
}

/// What the catalog knows about a card an import asked for
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ResolvedPrintingResponse {
    /// Which lookup this answers, as its position in the request
    ///
    /// Answers carry their question rather than the list carrying a hole per
    /// unmatched row: a five-figure import is mostly cards the catalog knows,
    /// and the few it does not are what the client reports as unmatched.
    pub lookup: u32,
    /// Scryfall's id of the printing — what a collection entry stores
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
    /// The finishes this printing exists in, as Scryfall spells them
    pub finishes: Vec<String>,
}

/// What the catalog could place
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ResolvePrintingsResponse {
    /// The printings, each naming the lookup it answers
    ///
    /// A lookup no printing names is one the catalog holds no card for. That is
    /// an answer, not a failure — the row has to be reported as unmatched
    /// rather than dropped, and a card the catalog does not know cannot be
    /// filed anyway.
    pub printings: Vec<ResolvedPrintingResponse>,
}

impl From<PrintingLookupRequest> for PrintingLookup {
    fn from(lookup: PrintingLookupRequest) -> Self {
        Self {
            id: lookup.id,
            set_code: lookup.set_code.map(|value| value.to_string()),
            collector_number: lookup.collector_number.map(|value| value.to_string()),
            name: lookup.name.map(|value| value.to_string()),
            lang: lookup.lang.map(|value| value.to_string()),
        }
    }
}

impl From<(u32, ResolvedPrinting)> for ResolvedPrintingResponse {
    fn from((lookup, printing): (u32, ResolvedPrinting)) -> Self {
        Self {
            lookup,
            id: printing.id,
            name: printing.name,
            set_code: printing.set_code,
            set_name: printing.set_name,
            collector_number: printing.collector_number,
            lang: printing.lang,
            // Stored joined by commas, see `ListedCardResponse`.
            finishes: printing
                .finishes
                .split(',')
                .filter(|finish| !finish.is_empty())
                .map(str::to_owned)
                .collect(),
        }
    }
}

/// What one card cost on one day
///
/// All four are euro cents and all four may be absent: Cardmarket quotes no
/// foil price for a card that was never printed in foil, and no price at all
/// for a product nobody is offering that day.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PriceDayResponse {
    /// The day the guide quoted these prices for
    pub day: SchemaDate,
    /// The cheapest offer
    pub low_cents: Option<i32>,
    /// Cardmarket's trend price
    pub trend_cents: Option<i32>,
    /// The cheapest foil offer
    pub low_foil_cents: Option<i32>,
    /// The foil trend price
    pub trend_foil_cents: Option<i32>,
}

impl From<PriceDay> for PriceDayResponse {
    fn from(day: PriceDay) -> Self {
        Self {
            day: SchemaDate(day.day),
            low_cents: day.low,
            trend_cents: day.trend,
            low_foil_cents: day.low_foil,
            trend_foil_cents: day.trend_foil,
        }
    }
}

/// What a card has cost over time
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PriceHistoryResponse {
    /// The days, oldest first
    ///
    /// Daily for the last quarter and weekly before that — the history is
    /// thinned as it ages, so a chart should plot against the dates rather
    /// than against the position in this list.
    pub days: Vec<PriceDayResponse>,
}
