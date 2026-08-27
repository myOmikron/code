//! Database model backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::fields::types::MaxStr;

/// What the last catalog sync took from Scryfall
///
/// One row, keyed by a constant. A table rather than a file because the process
/// that syncs is not the process that serves and may not outlive the run: on
/// the deploy host it is `compose run --rm`, and later it is a pod. Neither has
/// anywhere to keep a file, and both already have the database.
#[derive(Model, Debug)]
#[rorm(rename = "catalog_sync")]
pub struct CatalogSyncModel {
    /// Primary key, always [`super::CATALOG_SYNC_ID`]
    #[rorm(primary_key)]
    pub id: MaxStr<32>,

    /// The `updated_at` Scryfall stamped the bulk file with, verbatim
    ///
    /// Compared for equality rather than parsed and ordered: the only question
    /// asked of it is "is this the file we already have", and a string that
    /// came out of one source in one format answers that without a date parser
    /// and without a timezone to get wrong.
    pub bulk_updated_at: MaxStr<64>,

    /// When this end last finished reading that file
    pub synced_at: OffsetDateTime,
}
