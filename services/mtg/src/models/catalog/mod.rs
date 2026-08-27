//! What the catalog last took from Scryfall
//!
//! Scryfall regenerates its bulk files at most every twelve hours, and the
//! index that lists them says when each was last written. Remembering that
//! stamp is what lets the sync run on a schedule without downloading four
//! hundred megabytes of identical rows every time it fires.

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use tracing::instrument;

use crate::models::catalog::db::CatalogSyncModel;

pub(in crate::models) mod db;

/// The key the single row is kept under
const CATALOG_SYNC_ID: &str = "scryfall";

/// What the catalog last took from Scryfall
#[derive(Debug, Clone)]
pub struct CatalogSync {
    /// The `updated_at` of the bulk file that was read
    pub bulk_updated_at: MaxStr<64>,
    /// When it was read
    pub synced_at: OffsetDateTime,
}

impl CatalogSync {
    /// What the last successful sync recorded, `None` before the first one
    #[instrument(name = "CatalogSync::read", skip(tx))]
    pub async fn read(tx: &mut Transaction) -> Result<Option<CatalogSync>, rorm::Error> {
        let row = rorm::query(tx, CatalogSyncModel)
            .condition(CatalogSyncModel.id.equals(CATALOG_SYNC_ID))
            .optional()
            .await?;
        Ok(row.map(|row| CatalogSync {
            bulk_updated_at: row.bulk_updated_at,
            synced_at: row.synced_at,
        }))
    }

    /// Record the file this run read
    ///
    /// Written only once the run has finished, so an interrupted sync is
    /// retried rather than skipped.
    #[instrument(name = "CatalogSync::record", skip(tx))]
    pub async fn record(tx: &mut Transaction, bulk_updated_at: &str) -> Result<(), rorm::Error> {
        let id = bounded::<32>(CATALOG_SYNC_ID);
        let stamp = bounded::<64>(bulk_updated_at);
        let now = OffsetDateTime::now_utc();

        let updated = rorm::update(&mut *tx, CatalogSyncModel)
            .set(CatalogSyncModel.bulk_updated_at, stamp.clone())
            .set(CatalogSyncModel.synced_at, now)
            .condition(CatalogSyncModel.id.equals(CATALOG_SYNC_ID))
            .await?;
        if updated > 0 {
            return Ok(());
        }

        rorm::insert(&mut *tx, CatalogSyncModel)
            .return_nothing()
            .single(&CatalogSyncModel {
                id,
                bulk_updated_at: stamp,
                synced_at: now,
            })
            .await?;
        Ok(())
    }
}

/// Trims a known-short string into its bounded type
///
/// Both values here are a constant and a timestamp; the truncation exists so
/// the type is satisfied without an unwrap that could ever fire.
fn bounded<const N: usize>(value: &str) -> MaxStr<N> {
    let mut value = value.to_owned();
    value.truncate(N);
    MaxStr::new(value).unwrap_or_else(|_| unreachable!("truncated to the maximum length"))
}
