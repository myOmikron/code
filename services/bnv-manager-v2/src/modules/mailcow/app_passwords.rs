use std::time::Duration;

use anyhow::anyhow;
use galvyn::core::Module;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;
use mailcow::MailcowClient;
use mailcow::mailboxes::schema::CreateAppPasswordRequest;
use tracing::Instrument;
use tracing::error;
use tracing::info;
use tracing::info_span;

use crate::models::account::ClubAccount;
use crate::utils::worker::Worker;

const APP_PASSWORD_NAME: &str = "nicht_editieren_bnv_verwaltet";

pub struct AppPasswordInitializer {
    /// Mailcow client
    pub sdk: MailcowClient,
    /// Mailbox to initialize app passwords for
    pub mailbox: MaxStr<255>,
}

impl Worker for AppPasswordInitializer {
    async fn run(self) {
        let span = info_span!("AppPasswordInitializer::run_once");
        if let Err(error) = self.run_once().instrument(span.clone()).await {
            span.in_scope(|| error!(error.debug = ?error, error.display = %error, "AppPasswordInitializer run exited with error"));
        }
    }
}

impl AppPasswordInitializer {
    pub async fn run_once(&self) -> anyhow::Result<()> {
        let mut account = ClubAccount::get_by_email(Database::global(), &self.mailbox)
            .await?
            .ok_or(anyhow!("Account not found"))?;

        let hashed_pw = format!("{{BLF-CRYPT}}{}", account.hashed_password());

        for x in 0..3 {
            info!("Trying to create app password: {}/3", x + 1);

            // Sleep to give mailcow a chance to create the mailbox
            // before we try to initialize app passwords
            tokio::time::sleep(Duration::from_secs(5)).await;

            let existing = self.sdk.get_app_passwords(self.mailbox.to_string()).await?;

            let mut to_delete = vec![];
            for existing_app_password in existing {
                if existing_app_password.name == APP_PASSWORD_NAME {
                    to_delete.push(existing_app_password.id);
                }
            }

            if !to_delete.is_empty() {
                self.sdk.delete_app_passwords(to_delete).await?;
            }

            let res = self
                .sdk
                .create_app_password(CreateAppPasswordRequest {
                    username: self.mailbox.to_string().clone(),
                    app_name: APP_PASSWORD_NAME.to_string(),
                    app_passwd: hashed_pw.clone(),
                    app_passwd2: hashed_pw.clone(),
                })
                .await;

            if res.is_ok() {
                account
                    .update_has_app_password_set(Database::global(), true)
                    .await?;
                break;
            }

            if x == 2 {
                return Err(anyhow!("Failed to create app password after 3 attempts"));
            }
        }

        Ok(())
    }
}
