//! Garbage collector that cleans up unused data

mod worker;

use std::sync::OnceLock;

use anyhow::anyhow;
use galvyn::core::InitError;
use galvyn::core::Module;
use galvyn::core::PostInitError;
use galvyn::core::PreInitError;
use galvyn::rorm::Database;

use crate::modules::garbage_collector::worker::GarbageCollectorWorker;
use crate::utils::worker::Worker;
use crate::utils::worker::WorkerHandle;

/// Garbage collector
///
/// Cleans up unused data in the database
pub struct GarbageCollector {
    worker: OnceLock<WorkerHandle<GarbageCollectorWorker>>,
}

impl Module for GarbageCollector {
    type Setup = ();
    type PreInit = ();

    async fn pre_init(_setup: Self::Setup) -> Result<Self::PreInit, PreInitError> {
        Ok(())
    }

    type Dependencies = (Database,);

    async fn init(
        _pre_init: Self::PreInit,
        _deps: &mut Self::Dependencies,
    ) -> Result<Self, InitError> {
        Ok(Self {
            worker: Default::default(),
        })
    }

    async fn post_init(&'static self) -> Result<(), PostInitError> {
        self.worker
            .set(GarbageCollectorWorker.spawn())
            .map_err(|_| anyhow!("Failed to initialize garbage collector worker"))?;

        Ok(())
    }
}
