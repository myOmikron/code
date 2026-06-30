//! Shared bootstrap utilities for services: config loading, tracing setup, and service lifecycle.
#![warn(missing_docs)]

use std::future::Future;
use std::net::SocketAddr;
use std::net::SocketAddrV4;
use std::panic;
use std::process;
use std::time::Duration;

use galvyn::Galvyn;
use galvyn::GalvynSetup;
use galvyn::RouterBuilder;
use galvyn::core::Module;
use galvyn::core::modules::shutdown::Shutdown;
use galvyn::core::modules::shutdown::ShutdownSetup;
use galvyn::error::GalvynError;
use tokio::time::sleep;
use url::Url;

use crate::tracing_init::TracingConfig;

pub mod config;
#[cfg(feature = "grpc")]
pub mod grpc;
pub mod http;
pub mod nats;
pub mod o2o_helper;
pub mod tracing_init;
pub mod utils;

/// The http port services should host their public http api on
pub const PUBLIC_HTTP: SocketAddr =
    SocketAddr::V4(SocketAddrV4::new(std::net::Ipv4Addr::UNSPECIFIED, 8080));

/// Run a service with standard bootstrap: config loading, tracing init,
/// OTel lifecycle, and signal handling.
///
/// `default_service_name` is the fallback for `OTEL_SERVICE_NAME`.
/// `load_config` loads the service-specific config.
/// `run_service` is the async service entry point.
pub async fn run<C, Fut>(
    default_service_name: &str,
    load_config: impl FnOnce() -> Result<C, config::ConfigError>,
    build_galvyn: impl FnOnce(galvyn::ModuleBuilder, C) -> Fut,
) -> !
where
    Fut: Future<Output = Result<RouterBuilder, GalvynError>>,
{
    // Transitive deps enable both `ring` and `aws-lc-rs` features on rustls,  disabling auto-detection.
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    let mut env = config::EnvLoader::new();
    let otel_service_name = env.optional("OTEL_SERVICE_NAME", default_service_name);
    let otel_endpoint = env.require_parse::<Url>("OTEL_EXPORTER_OTLP_ENDPOINT");
    let alertmanager_url = env.require_parse::<Url>("ALERTMANAGER_URL");
    let grafana_tracing_uri = env.require_parse::<Url>("GRAFANA_TRACING_URI");
    let grafana_tracing_data_source = env.optional("GRAFANA_TRACING_DATA_SOURCE", "ceu7vj3tfgu80c");
    if let Err(err) = env.finish() {
        eprintln!("{err}");
        std::process::exit(1);
    }

    let config = match load_config() {
        Ok(c) => c,
        Err(err) => {
            eprintln!("{err}");
            std::process::exit(1);
        }
    };

    let otel_provider = tracing_init::init(TracingConfig {
        otel_endpoint: otel_endpoint.unwrap(),
        service_name: otel_service_name,
        alertmanager_url: alertmanager_url.unwrap(),
        grafana_tracing_uri: grafana_tracing_uri.unwrap(),
        grafana_tracing_data_source,
    });
    set_panic_hook();

    let run_galvyn = async move {
        let mut galvyn = build_galvyn(
            Galvyn::builder(GalvynSetup {
                disable_sessions: true,   // Most services don't talk to browsers
                disable_panic_hook: true, // We use our own
                shutdown: ShutdownSetup {
                    grace_period: Duration::from_millis(100),
                },
                ..Default::default()
            }),
            config,
        )
        .await?;

        galvyn
            .add_listener(
                SocketAddr::V4(SocketAddrV4::new(std::net::Ipv4Addr::UNSPECIFIED, 9090)),
                http::default_routes(),
            )
            .start()
            .await
    };

    let exit_code = match run_galvyn.await {
        Ok(()) => 0,
        Err(error) => {
            tracing::error!(error.debug = ?error, error.display = %error, "fatal error");
            1
        }
    };

    if let Err(err) = otel_provider.shutdown() {
        eprintln!("failed to shutdown otel provider: {err}");
    }

    process::exit(exit_code);
}

/// Sets a custom panic hook.
///
/// It logs an error and starts a graceful shutdown.
fn set_panic_hook() {
    panic::set_hook(Box::new(|info| {
        galvyn::panic_hook::panic_hook(info);

        // If the `Shutdown` module is available, then the panic most likely happened during service operation.
        // Try to use the normal shutdown mechanism. But spawn a custom timeout to make sure our process dies.
        if let Ok(shutdown) = Shutdown::try_global() {
            shutdown.start();
            tokio::spawn(async move {
                sleep(Duration::from_secs(1)).await;
                eprint!("Galvyn Shutdown did not work");
                process::exit(1);
            });
        }
        // If the `Shutdown` module is not available, then the panic most likely happened somewhere during initialization.
        // Ideally, it was the main task, in which case the process should die on its own.
        // We spawn a custom timeout to make sure our process dies, even if the panic was in another task.
        else {
            tokio::spawn(async move {
                sleep(Duration::from_millis(10)).await;
                eprint!("Process panicked pre-Galvyn without dying on its own");
                process::exit(1);
            });
        }
    }));
}
