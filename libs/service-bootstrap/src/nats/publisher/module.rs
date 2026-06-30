//! Galvyn module for the global connection to the NATS server.

use std::collections::HashMap;
use std::env;
use std::sync::Arc;
use std::sync::RwLock;

use async_nats::ConnectErrorKind;
use async_nats::ConnectOptions;
use async_nats::jetstream;
use async_nats::jetstream::context::KeyValueError;
use async_nats::jetstream::kv::Store;
use galvyn::core::Module;
use galvyn::core::PreInitError;
use prometheus::IntCounter;
use prometheus::register_int_counter;
use secrecy::ExposeSecret;
use secrecy::SecretBox;
use tracing::debug;
use tracing::info;

/// Global connection to the NATS server.
pub struct Nats {
    /// CoreNATS client
    pub client: async_nats::Client,

    /// Jetstream client
    pub context: jetstream::Context,

    /// Prometheus metric for the number of messages published
    pub(super) metric_published: IntCounter,

    /// Cache of opened KV [`Store`] handles, keyed by bucket name.
    ///
    /// `get_key_value` performs a `STREAM.INFO` round-trip (~3ms) on every
    /// call; the resulting handle is cheap to clone, so we keep one per
    /// bucket. Shared across [`internal_clone`](Self::internal_clone)s via the
    /// `Arc`.
    kv_cache: Arc<RwLock<HashMap<String, Store>>>,
}

impl Nats {
    /// Private `clone`
    ///
    /// A service author should have to clone the `Nats` module.
    /// `Nats::global()` is `Copy`.
    pub(crate) fn internal_clone(&self) -> Self {
        Self {
            client: self.client.clone(),
            context: self.context.clone(),
            metric_published: self.metric_published.clone(),
            kv_cache: Arc::clone(&self.kv_cache),
        }
    }

    /// Gets a KV store from NATS, but cached.
    ///
    /// `get_key_value` performs a `STREAM.INFO` round-trip (~3ms) on every
    /// call to validate the bucket. The returned [`Store`] is only a cheap
    /// handle, so we cache it per bucket name and clone it out on subsequent
    /// calls, avoiding the round-trip entirely.
    pub async fn get_kv_bucket(&self, bucket: &str) -> Result<Store, KeyValueError> {
        if let Some(kv) = self
            .kv_cache
            .read()
            .expect("kv_cache lock poisoned")
            .get(bucket)
            .cloned()
        {
            return Ok(kv);
        }

        // Not cached yet — open it. A concurrent caller may race us here; that
        // is harmless, both resolve the same bucket and the later write wins.
        let kv = self.context.get_key_value(bucket).await?;
        self.kv_cache
            .write()
            .expect("kv_cache lock poisoned")
            .insert(bucket.to_owned(), kv.clone());
        Ok(kv)
    }
}

/// Setup struct for the [`Nats`] module.
#[derive(Debug, Default)]
pub enum NatsSetup {
    /// Reads all required values from env variables:
    ///
    /// - `NATS_URL` (required)
    /// - `NATS_NKEY_SEED` (recommended)
    #[default]
    FromEnv,

    /// Manually provide all values
    Manual {
        /// Full URL (possibly starting with `nats://`) of the NATS server (e.g. nats://localhost:4222)
        address: String,

        /// NKey seed secret for NATS authentication (empty to disable)
        nkey_seed: Option<SecretBox<String>>,
    },
}

impl Module for Nats {
    type Setup = NatsSetup;
    type PreInit = Self;

    async fn pre_init(setup: Self::Setup) -> Result<Self::PreInit, PreInitError> {
        let mut has_nkey = false;
        let mut options = ConnectOptions::new();
        let address = match setup {
            NatsSetup::FromEnv => {
                if let Ok(nkey_seed) = env::var("NATS_NKEY_SEED") {
                    has_nkey = true;
                    options = options.nkey(nkey_seed);
                }
                env::var("NATS_URL").map_err(|_| "Missing NATS_URL")?
            }
            NatsSetup::Manual { address, nkey_seed } => {
                if let Some(nkey_seed) = nkey_seed {
                    has_nkey = true;
                    options = options.nkey(nkey_seed.expose_secret().clone());
                }
                address
            }
        };

        info!(
            auth = if has_nkey { "nkey" } else { "none" },
            address, "Connecting to NATS..."
        );
        let mut client = None;
        for attempt in 0..3 {
            debug!(attempt, "Connecting to NATS...");
            match async_nats::connect_with_options(address.clone(), options.clone()).await {
                Ok(x) => {
                    client = Some(x);
                    break;
                }
                Err(error) if error.kind() == ConnectErrorKind::TimedOut => continue,
                Err(error) => return Err(error.into()),
            }
        }
        let client = client.ok_or("Timed out connecting to nats")?;

        let context = jetstream::new(client.clone());

        Ok(Self {
            client,
            context,
            metric_published: register_int_counter!(
                "svcbs_nats_published_total",
                "Number of messages published through the `Nats` module"
            )?,
            kv_cache: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    type Dependencies = ();

    async fn init(this: Self::PreInit, (): &mut Self::Dependencies) -> Result<Self, PreInitError> {
        Ok(this)
    }
}
