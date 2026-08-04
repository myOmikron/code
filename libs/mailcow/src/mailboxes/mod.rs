//! Handler for mailboxes

use tracing::instrument;

use crate::MailcowClient;
use crate::error::MailcowResult;
use crate::mailboxes::schema::GetAppPasswordsResponse;

pub mod schema;

impl MailcowClient {
    /// Retrieves all mailboxes for a given domain
    ///
    /// **domain**: The domain to retrieve mailboxes for
    #[instrument(skip(self), name = "MailcowClient::get_all_mailboxes")]
    pub async fn get_all_mailboxes(
        &self,
        domain: &str,
    ) -> MailcowResult<Vec<schema::MailcowMailbox>> {
        self.get(&format!("/api/v1/get/mailbox/all/{domain}"))
            .send()
            .await
    }

    /// Delete mailboxes
    ///
    /// **mailboxes**: List of mails to delete
    #[instrument(skip(self), name = "MailcowClient::delete_mailbox")]
    pub async fn delete_mailbox(&self, mailboxes: Vec<String>) -> MailcowResult<()> {
        self.post("/api/v1/delete/mailbox")
            .body(mailboxes)
            .send::<serde::de::IgnoredAny>()
            .await?;

        Ok(())
    }

    /// Get all app passwords for a mailbox
    #[instrument(skip(self), name = "MailcowClient::get_app_passwords")]
    pub async fn get_app_passwords(
        &self,
        email: String,
    ) -> MailcowResult<Vec<schema::GetAppPasswordSingleResponse>> {
        let app_passwords = self
            .get(&format!("/api/v1/get/app-passwd/all/{email}"))
            .send::<GetAppPasswordsResponse>()
            .await?;

        match app_passwords {
            GetAppPasswordsResponse::List(app_passwords) => Ok(app_passwords),
            GetAppPasswordsResponse::Empty(_) => Ok(Vec::new()),
        }
    }

    /// Deletes app passwords
    #[instrument(skip(self), name = "MailcowClient::delete_app_passwords")]
    pub async fn delete_app_passwords(&self, ids: Vec<u64>) -> MailcowResult<()> {
        let ids = ids.iter().map(|id| id.to_string()).collect::<Vec<String>>();
        self.post("/api/v1/delete/app-passwd")
            .body(&ids)
            .send::<serde::de::IgnoredAny>()
            .await?;

        Ok(())
    }

    /// Sets a new app password for an existing mailbox
    #[instrument(skip(self, req), name = "MailcowClient::create_app_password")]
    pub async fn create_app_password(
        &self,
        req: schema::CreateAppPasswordRequest,
    ) -> MailcowResult<()> {
        let protocols = vec![
            "imap_access".to_string(),
            "dav_access".to_string(),
            "smtp_access".to_string(),
            "eas_access".to_string(),
            "pop3_access".to_string(),
            "sieve_access".to_string(),
        ];

        self.post("/api/v1/add/app-passwd")
            .body(&schema::InnerCreateAppPasswordRequest {
                active: "1".to_string(),
                username: req.username,
                app_name: req.app_name,
                app_passwd: req.app_passwd,
                app_passwd2: req.app_passwd2,
                protocols,
            })
            .send::<serde::de::IgnoredAny>()
            .await?;

        Ok(())
    }
}
