//! Handlers for the card catalog

use galvyn::core::Module;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::post;
use galvyn::rorm::Database;

use crate::http::handler_frontend::printings::schema::ResolvePrintingsRequest;
use crate::http::handler_frontend::printings::schema::ResolvePrintingsResponse;
use crate::http::handler_frontend::printings::schema::ResolvedPrintingResponse;
use crate::models::printing::resolve::PrintingLookup;
use crate::models::printing::resolve::ResolvedPrinting;

/// How many cards one request may ask about
///
/// An import of a five-figure collection has to be split, and splitting it is
/// what lets the client show how far it has got. Large enough that the whole
/// thing is a handful of requests rather than the hundreds the browser used to
/// send to Scryfall.
const MAX_LOOKUPS: usize = 2_000;

/// Place cards in the catalog
///
/// Takes the rows of an imported collection as the exporter wrote them — an id,
/// a set and a collector number, or a bare name — and answers with the printing
/// each names. Every answer carries the position of the lookup it belongs to;
/// a lookup nothing names is one the catalog holds no card for.
///
/// This is the catalog the collection listing and the statistics are already
/// answered from, so nothing can be filed here that those cannot read back.
#[post("/resolve")]
pub async fn resolve_printings(
    ApiJson(ResolvePrintingsRequest { lookups }): ApiJson<ResolvePrintingsRequest>,
) -> ApiResult<ApiJson<ResolvePrintingsResponse>> {
    if lookups.len() > MAX_LOOKUPS {
        return Err(ApiError::bad_request("Too many cards in one request"));
    }

    let lookups: Vec<PrintingLookup> = lookups.into_iter().map(PrintingLookup::from).collect();

    let mut tx = Database::global().start_transaction().await?;
    let printings = ResolvedPrinting::resolve(&mut tx, &lookups).await?;
    tx.commit().await?;

    Ok(ApiJson(ResolvePrintingsResponse {
        printings: printings
            .into_iter()
            .enumerate()
            .filter_map(|(lookup, printing)| {
                // The cast cannot lose anything: the request was rejected above
                // if it held more lookups than `MAX_LOOKUPS`.
                printing.map(|printing| ResolvedPrintingResponse::from((lookup as u32, printing)))
            })
            .collect(),
    }))
}
