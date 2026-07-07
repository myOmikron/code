use galvyn::core::Module;
use galvyn::rorm::Database;
use mailcow::MailcowClient;
use tracing::Instrument;
use tracing::error;
use tracing::info;
use tracing::info_span;

use crate::models::domain::Domain;
use crate::utils::worker::Worker;

/// Synchronization worker
pub struct SyncWorker {
    /// Mailcow client
    pub sdk: MailcowClient,
}

impl Worker for SyncWorker {
    async fn run(self) {
        let mut timer = tokio::time::interval(tokio::time::Duration::from_secs(120));

        loop {
            timer.tick().await;

            let span = info_span!("SyncWorker::run_once");
            if let Err(error) = self.run_once().instrument(span.clone()).await {
                span.in_scope(|| error!(error.debug = ?error, error.display = %error, "SyncWorker run exited with error"));
            }
        }
    }
}

impl SyncWorker {
    pub async fn run_once(&self) -> anyhow::Result<()> {
        let domains = self.sdk.get_all_domains().await?;
        info!(domains = ?domains, "Got domains");

        Domain::sync_mailcow_domains(Database::global(), domains).await?;

        Ok(())
    }
}
