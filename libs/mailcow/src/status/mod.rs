//! Handler for mailcows' status

use tracing::instrument;

use crate::MailcowClient;
use crate::error::MailcowResult;
use crate::status::schema::Version;

pub mod schema;

impl MailcowClient {
    /// Retrieves the version information from the Mailcow API
    #[instrument(name = "MailcowClient::get_version", skip(self))]
    pub async fn get_version(&self) -> MailcowResult<Version> {
        self.get("/api/v1/get/status/version").send().await
    }
}
