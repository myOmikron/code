use std::time::Duration;

use galvyn::core::Module;
use galvyn::rorm::Database;
use tracing::Instrument;
use tracing::error;

use crate::models::credential_reset::CredentialReset;
use crate::models::invite::Invite;
use crate::utils::worker::Worker;

const GC_INTERVAL: Duration = Duration::from_secs(60 * 60);

pub struct GarbageCollectorWorker;

impl Worker for GarbageCollectorWorker {
    async fn run(self) {
        let mut timer = tokio::time::interval(GC_INTERVAL);

        loop {
            let span = tracing::info_span!("GarbageCollectorWorker::run");

            if let Err(error) = self.run_once().instrument(span.clone()).await {
                span.in_scope(|| error!(error.display = %error, error.debug = ?error));
            }

            timer.tick().await;
        }
    }
}

impl GarbageCollectorWorker {
    async fn run_once(&self) -> anyhow::Result<()> {
        let mut tx = Database::global().start_transaction().await?;

        Invite::clear_expired(&mut tx).await?;
        CredentialReset::clear_expired(&mut tx).await?;

        tx.commit().await?;

        Ok(())
    }
}
