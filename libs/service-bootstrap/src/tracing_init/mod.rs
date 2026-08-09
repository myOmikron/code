//! Tracing setup: stdout tree logging and optional OpenTelemetry export.

use std::fmt;

use galvyn::core::re_exports::opentelemetry::trace::TraceContextExt;
use galvyn::core::re_exports::opentelemetry::trace::TraceId;
use galvyn::core::re_exports::opentelemetry_sdk::trace::SdkTracerProvider;
use galvyn::core::re_exports::tracing_opentelemetry::OpenTelemetrySpanExt;
use tracing::Event;
use tracing::Level;
use tracing::Span;
use tracing::Subscriber;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::Layer;
use tracing_subscriber::fmt::FmtContext;
use tracing_subscriber::fmt::FormatEvent;
use tracing_subscriber::fmt::FormatFields;
use tracing_subscriber::fmt::format::Writer;
use tracing_subscriber::fmt::time::FormatTime;
use tracing_subscriber::fmt::time::SystemTime;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::registry::LookupSpan;
use tracing_subscriber::util::SubscriberInitExt;
use url::Url;

use crate::tracing_init::otel::opentelemetry_layer;

mod alert_manager;
mod metrics;
mod otel;

pub use alert_manager::AlertEvent;
pub use alert_manager::AlertManagerConfig;

/// Config shared across all tracing layers.
pub struct TracingConfig {
    /// URL of the Open Telemetry Collector to send traces to, or `None` to export nothing.
    ///
    /// Without a collector the batch exporter would retry a connect on every flush and log an
    /// error for each one, which the alert manager layer would then try to forward as well.
    pub otel_endpoint: Option<Url>,

    /// URL of the Alert Manager.
    pub alertmanager_url: Url,

    /// Grafana data source ID used for tracing (it should be the respective 'tempo' data source ID)
    pub grafana_tracing_data_source: String,

    /// Grafana URI/origin used to construct direct links for tracing
    pub grafana_tracing_uri: Url,

    /// The service name from the event's parent span.
    pub service_name: String,
}

/// Initialize tracing with ForestLayer and optional OpenTelemetry export.
///
/// Returns the [`SdkTracerProvider`], or `None` when no collector is configured.
/// The caller **must** hold the returned provider alive for the lifetime of
/// the application and call [`SdkTracerProvider::shutdown`] before exit.
pub fn init(config: TracingConfig) -> Option<SdkTracerProvider> {
    let TracingConfig {
        otel_endpoint,
        alertmanager_url,
        grafana_tracing_data_source,
        grafana_tracing_uri,
        service_name,
    } = config;

    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    let (otel_layer, provider) = match otel_endpoint {
        Some(endpoint) => {
            let (layer, provider) = opentelemetry_layer(&service_name, endpoint).expect(
                "Failed to initialize opentelemetry, this is a programmer or deployment error",
            );
            (Some(layer), Some(provider))
        }
        None => (None, None),
    };
    let otel_enabled = provider.is_some();

    tracing_subscriber::registry()
        .with(env_filter)
        .with(metrics::layer().expect("Failed to register metrics"))
        .with(
            tracing_subscriber::fmt::layer()
                .event_format(NoSpans)
                .with_filter(EnvFilter::new("info")),
        )
        .with(otel_layer)
        .with(alert_manager::layer(AlertManagerConfig {
            alertmanager_url,
            grafana_tracing_data_source,
            grafana_tracing_uri,
            service_name,
        }))
        .init();

    if !otel_enabled {
        tracing::info!("OTEL_EXPORTER_OTLP_ENDPOINT is unset, trace export is disabled");
    }

    provider
}

/// Tracing event formatter which looks like the default stdout formatter, but hides span information
pub struct NoSpans;

impl<S, N> FormatEvent<S, N> for NoSpans
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    N: for<'a> FormatFields<'a> + 'static,
{
    fn format_event(
        &self,
        ctx: &FmtContext<'_, S, N>,
        mut writer: Writer<'_>,
        event: &Event<'_>,
    ) -> fmt::Result {
        let ansi = writer.has_ansi_escapes();
        let meta = event.metadata();

        // dimmed timestamp, matching the default Full formatter
        if ansi {
            write!(writer, "\x1b[2m")?;
        }
        SystemTime.format_time(&mut writer)?;
        if ansi {
            write!(writer, "\x1b[0m")?;
        }
        writer.write_char(' ')?;

        // colored level
        if ansi {
            let color = match *meta.level() {
                Level::ERROR => "\x1b[31m",
                Level::WARN => "\x1b[33m",
                Level::INFO => "\x1b[32m",
                Level::DEBUG => "\x1b[34m",
                Level::TRACE => "\x1b[35m",
            };
            write!(writer, "{}{:>5}\x1b[0m ", color, meta.level())?;
        } else {
            write!(writer, "{:>5} ", meta.level())?;
        }

        // trace id (only when an OTel context is active)
        let trace_id = Span::current().context().span().span_context().trace_id();
        if ansi {
            write!(writer, "\x1b[2m")?;
        }
        if trace_id == TraceId::INVALID {
            write!(writer, "{:>32} ", "(no trace)")?;
        } else {
            write!(writer, "{trace_id:>32} ")?;
        }

        write!(writer, "{}:", meta.target())?;
        if ansi {
            write!(writer, "\x1b[0m")?;
        }
        writer.write_char(' ')?;

        // event's own fields — no span scope walk
        ctx.field_format().format_fields(writer.by_ref(), event)?;

        writeln!(writer)
    }
}
