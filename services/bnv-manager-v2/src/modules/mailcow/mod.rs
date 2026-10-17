//! Mailcow API integration module for the galvyn framework
//!
//! This module provides a structured interface for interacting with the Mailcow email server API.
//! It implements the galvyn module trait system, enabling seamless integration into the framework's
//! initialization and dependency management pipeline.
//!
//! The module serves as the primary entry point for all Mailcow API operations within the application,
//! providing access to the underlying MailcowClient SDK through a standardized interface.

use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;
use std::sync::Mutex;

use galvyn::core::InitError;
use galvyn::core::Module;
use galvyn::core::PostInitError;
use galvyn::core::PreInitError;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;
use mailcow::MailcowClient;
use tokio::sync::RwLock;
use tracing::info;
use tracing::instrument;
use url::Url;

use crate::config::DISABLE_MAILCOW;
use crate::config::MAILCOW_API_KEY;
use crate::config::MAILCOW_BASE_URL;
use crate::modules::mailcow::app_passwords::AppPasswordInitializer;
use crate::modules::mailcow::domain_stats_cache::CachedDomainStats;
use crate::modules::mailcow::domain_stats_cache::DomainStatsCache;
use crate::modules::mailcow::domain_stats_worker::DomainStatsWorker;
use crate::modules::mailcow::sync::SyncWorker;
use crate::utils::worker::Worker;
use crate::utils::worker::WorkerHandle;

mod app_passwords;
pub(crate) mod domain_stats_cache;
mod domain_stats_worker;
mod sync;

/// galvyn module that serves as the main entry point for interacting with the Mailcow API.
pub struct Mailcow {
    /// SDK client
    pub sdk: MailcowClient,
    /// Base url of the mailcow instance
    pub base_url: Url,
    /// Synchronization worker
    pub sync_worker: Mutex<Option<WorkerHandle<SyncWorker>>>,
    /// Domain statistics cache
    pub domain_stats_cache: DomainStatsCache,
    /// Domain statistics worker
    pub stats_worker: Mutex<Option<WorkerHandle<DomainStatsWorker>>>,
}

impl Mailcow {
    /// Initializes the Mailcow app passwords worker.
    pub fn create_app_password(
        &self,
        mailbox: MaxStr<255>,
    ) -> WorkerHandle<AppPasswordInitializer> {
        AppPasswordInitializer {
            sdk: Mailcow::global().sdk.clone(),
            mailbox,
        }
        .spawn()
    }

    /// Retrieve cached domain statistics for a domain
    pub async fn get_cached_domain_stats(&self, domain: &str) -> Option<CachedDomainStats> {
        self.domain_stats_cache.read().await.get(domain).cloned()
    }
}

/// Where to find the mailcow instance
pub struct MailcowSetup {
    /// Base url of the mailcow instance
    pub base_url: Url,
    /// API key of the mailcow user
    pub api_key: String,
    /// Skip the version check at startup
    pub skip_version_check: bool,
}

impl Default for MailcowSetup {
    /// Reads the setup from the environment
    fn default() -> Self {
        Self {
            base_url: MAILCOW_BASE_URL.clone(),
            api_key: MAILCOW_API_KEY.clone(),
            skip_version_check: *DISABLE_MAILCOW.get(),
        }
    }
}

impl fmt::Debug for MailcowSetup {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("MailcowSetup")
            .field("base_url", &self.base_url.as_str())
            .field("skip_version_check", &self.skip_version_check)
            .finish_non_exhaustive()
    }
}

impl Module for Mailcow {
    type Setup = MailcowSetup;
    type PreInit = MailcowSetup;

    async fn pre_init(setup: Self::Setup) -> Result<Self::PreInit, PreInitError> {
        Ok(setup)
    }

    type Dependencies = (Database,);

    #[instrument(name = "Mailcow::initialize", skip_all)]
    async fn init(
        MailcowSetup {
            base_url,
            api_key,
            skip_version_check,
        }: Self::PreInit,
        _dependencies: &mut Self::Dependencies,
    ) -> Result<Self, InitError> {
        let sdk = MailcowClient::new(base_url.clone(), api_key)?;

        if !skip_version_check {
            let version = sdk.get_version().await?;
            info!("Mailcow is running version: {}", version.version);
        }

        Ok(Self {
            sdk: sdk.clone(),
            base_url,
            sync_worker: Mutex::new(None),
            domain_stats_cache: Arc::new(RwLock::new(HashMap::new())),
            stats_worker: Mutex::new(None),
        })
    }

    async fn post_init(&'static self) -> Result<(), PostInitError> {
        let sync_worker = SyncWorker {
            sdk: self.sdk.clone(),
        };

        // Run sync once to ensure domains are in the DB before starting the stats worker
        sync_worker
            .run_once()
            .await
            .map_err(|e| PostInitError::from(anyhow::anyhow!("Initial domain sync failed: {e}")))?;

        #[allow(clippy::expect_used)]
        {
            *self.sync_worker.lock().expect("Poison error") = Some(sync_worker.spawn());

            *self.stats_worker.lock().expect("Poison error") = Some(
                DomainStatsWorker {
                    sdk: self.sdk.clone(),
                    cache: self.domain_stats_cache.clone(),
                }
                .spawn(),
            );
        }

        Ok(())
    }
}
