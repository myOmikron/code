//! Settings related endpoints

use galvyn::core::Module;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use tracing::instrument;

use crate::http::handler_frontend::settings::schema::SettingsSchema;
use crate::modules::mailcow::Mailcow;

#[get("/")]
#[instrument(name = "Api::common::get_settings")]
pub async fn get_settings() -> ApiJson<SettingsSchema> {
    ApiJson(SettingsSchema {
        mailcow_url: Mailcow::global().base_url.clone(),
    })
}
