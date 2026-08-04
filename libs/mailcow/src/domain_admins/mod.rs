//! Endpoints for managing domain admins

use tracing::instrument;

use crate::MailcowClient;
use crate::domain_admins::schema::CreateDomainAdminRequest;
use crate::domain_admins::schema::EditDomainAdminsRequest;
use crate::error::MailcowResult;

pub mod schema;

impl MailcowClient {
    /// Create a new domain admin
    #[instrument(name = "MailcowClient::create_domain_admin", skip(self))]
    pub async fn create_domain_admin(&self, req: CreateDomainAdminRequest) -> MailcowResult<()> {
        self.post("/api/v1/add/domain-admin")
            .body(&req)
            .send::<serde::de::IgnoredAny>()
            .await?;

        Ok(())
    }

    /// Delete an existing domain admin in mailcow
    #[instrument(name = "MailcowClient::delete_domain_admin", skip(self))]
    pub async fn delete_domain_admins(&self, admins: Vec<String>) -> MailcowResult<()> {
        self.post("/api/v1/delete/domain-admin")
            .body(admins)
            .send::<serde::de::IgnoredAny>()
            .await?;

        Ok(())
    }

    /// Edit a list of domain admins
    #[instrument(name = "MailcowClient::edit_domain_admins", skip(self))]
    pub async fn edit_domain_admins(&self, req: EditDomainAdminsRequest) -> MailcowResult<()> {
        self.post("/api/v1/edit/domain-admin")
            .body(&req)
            .send::<serde::de::IgnoredAny>()
            .await?;

        Ok(())
    }
}
