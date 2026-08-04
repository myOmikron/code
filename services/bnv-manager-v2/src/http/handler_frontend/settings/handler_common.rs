//! Settings related endpoints

use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use tracing::instrument;

use crate::config::MAILCOW_BASE_URL;
use crate::http::handler_frontend::settings::schema::SettingsSchema;

#[get("/")]
#[instrument(name = "Api::common::get_settings")]
pub async fn get_settings() -> ApiJson<SettingsSchema> {
    ApiJson(SettingsSchema {
        mailcow_url: MAILCOW_BASE_URL.clone(),
    })
}
