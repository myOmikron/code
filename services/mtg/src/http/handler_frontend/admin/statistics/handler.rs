use galvyn::core::Module;
use galvyn::core::re_exports::time::Duration;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use galvyn::rorm::Database;

use crate::http::handler_frontend::admin::statistics::schema::AdminStatisticsResponse;
use crate::http::handler_frontend::admin::statistics::schema::AdminStatisticsSnapshot;
use crate::models::statistics::StatisticsSnapshot;

/// How far back the curve reaches
const HISTORY: Duration = Duration::days(30);

/// The newest Statistics snapshot and the last 30 days of them
#[get("/")]
pub async fn admin_get_statistics() -> ApiResult<ApiJson<AdminStatisticsResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let newest = StatisticsSnapshot::newest(&mut tx).await?;
    let history = StatisticsSnapshot::since(&mut tx, OffsetDateTime::now_utc() - HISTORY).await?;
    tx.commit().await?;

    Ok(ApiJson(AdminStatisticsResponse {
        newest: newest.map(AdminStatisticsSnapshot::from),
        history: history
            .into_iter()
            .map(AdminStatisticsSnapshot::from)
            .collect(),
    }))
}
