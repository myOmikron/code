use std::time::Duration;

use galvyn::core::Module;
use galvyn::rorm::Database;
use mailcow::MailcowClient;
use tracing::Instrument;
use tracing::error;
use tracing::info_span;
use tracing::warn;

use crate::models::domain::Domain;
use crate::modules::mailcow::domain_stats_cache::CachedDomainStats;
use crate::modules::mailcow::domain_stats_cache::DomainStatsCache;
use crate::utils::worker::Worker;

/// Background worker that periodically fetches domain statistics from Mailcow
pub struct DomainStatsWorker {
    /// Mailcow client
    pub sdk: MailcowClient,
    /// Shared cache to write stats into
    pub cache: DomainStatsCache,
}

impl Worker for DomainStatsWorker {
    async fn run(self) {
        let mut timer = tokio::time::interval(Duration::from_secs(120));

        loop {
            timer.tick().await;

            let span = info_span!("DomainStatsWorker::run_once");
            if let Err(error) = self.run_once().instrument(span.clone()).await {
                span.in_scope(|| {
                    error!(
                        error.debug = ?error,
                        error.display = %error,
                        "DomainStatsWorker run exited with error"
                    )
                });
            }
        }
    }
}

impl DomainStatsWorker {
    async fn run_once(&self) -> anyhow::Result<()> {
        let mut tx = Database::global().start_transaction().await?;

        let domains = Domain::find_all(&mut tx)
            .await?
            .into_iter()
            .filter(|d| d.is_primary)
            .collect::<Vec<_>>();

        tx.commit().await?;

        for domain in domains {
            let domain_name: String = domain.domain.into_inner();

            let (domain_result, mailboxes_result) = tokio::join!(
                self.sdk.get_domain(&domain_name),
                self.sdk.get_all_mailboxes(&domain_name),
            );

            let mailcow_domain = match domain_result {
                Ok(d) => d,
                Err(error) => {
                    warn!(
                        %domain_name,
                        error.debug = ?error,
                        error.display = %error,
                        "Failed to fetch domain stats, keeping stale entry"
                    );
                    continue;
                }
            };

            let mailboxes = match mailboxes_result {
                Ok(m) => m,
                Err(error) => {
                    warn!(
                        %domain_name,
                        error.debug = ?error,
                        error.display = %error,
                        "Failed to fetch mailboxes, keeping stale entry"
                    );
                    continue;
                }
            };

            self.cache.write().await.insert(
                domain_name,
                CachedDomainStats {
                    domain: mailcow_domain,
                    mailboxes,
                },
            );
        }

        Ok(())
    }
}
