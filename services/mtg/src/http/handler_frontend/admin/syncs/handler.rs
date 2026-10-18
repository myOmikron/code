use galvyn::core::Module;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use galvyn::rorm::Database;

use crate::http::handler_frontend::admin::syncs::schema::AdminCatalogStamp;
use crate::http::handler_frontend::admin::syncs::schema::AdminCatalogSync;
use crate::http::handler_frontend::admin::syncs::schema::AdminPriceGuideStamp;
use crate::http::handler_frontend::admin::syncs::schema::AdminPriceGuideSync;
use crate::http::handler_frontend::admin::syncs::schema::AdminSyncRuns;
use crate::http::handler_frontend::admin::syncs::schema::AdminSyncsResponse;
use crate::models::catalog::CatalogSync;
use crate::models::price::PriceGuideSync;
use crate::models::sync_run::SyncKind;
use crate::models::sync_run::SyncStatus;

/// How many recent runs each sync shows
const RECENT_RUNS: u64 = 30;

/// The state of the catalog and price guide syncs, with their recent Sync runs
#[get("/")]
pub async fn admin_get_syncs() -> ApiResult<ApiJson<AdminSyncsResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let catalog_stamp = CatalogSync::read(&mut tx).await?;
    let catalog_runs = SyncStatus::read(&mut tx, SyncKind::Catalog, RECENT_RUNS).await?;
    let price_stamp = PriceGuideSync::read(&mut tx).await?;
    let price_runs = SyncStatus::read(&mut tx, SyncKind::PriceGuide, RECENT_RUNS).await?;
    tx.commit().await?;

    Ok(ApiJson(AdminSyncsResponse {
        catalog: AdminCatalogSync {
            stamp: catalog_stamp.map(AdminCatalogStamp::from),
            runs: AdminSyncRuns::from(catalog_runs),
        },
        price_guide: AdminPriceGuideSync {
            stamp: price_stamp.map(AdminPriceGuideStamp::from),
            runs: AdminSyncRuns::from(price_runs),
        },
    }))
}
