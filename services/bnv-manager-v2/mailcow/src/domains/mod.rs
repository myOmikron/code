//! Endpoints for managing domains in mailcow

use tracing::instrument;

use crate::MailcowClient;
use crate::domains::schema::MailcowDomain;
use crate::error::MailcowResult;

pub mod schema;

impl MailcowClient {
    /// Retrieves all domains from the Mailcow API
    ///
    /// This function makes a GET request to the Mailcow API endpoint `/api/v1/get/domain/all`
    /// to fetch a list of all domains managed by the Mailcow server.
    #[instrument(name = "MailcowClient::get_all_domains", skip(self))]
    pub async fn get_all_domains(&self) -> MailcowResult<Vec<MailcowDomain>> {
        self.get("/api/v1/get/domain/all").send().await
    }

    /// Retrieves a single domain from the Mailcow API
    #[instrument(name = "MailcowClient::get_domain", skip(self))]
    pub async fn get_domain(&self, domain: &str) -> MailcowResult<MailcowDomain> {
        self.get(&format!("/api/v1/get/domain/{domain}"))
            .send()
            .await
    }
}
