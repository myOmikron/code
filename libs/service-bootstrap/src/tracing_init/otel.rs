//! [`opentelemetry_layer`]

use galvyn::core::re_exports::opentelemetry::trace::TracerProvider;
use galvyn::core::re_exports::opentelemetry_otlp::ExporterBuildError;
use galvyn::core::re_exports::opentelemetry_otlp::SpanExporter;
use galvyn::core::re_exports::opentelemetry_otlp::WithExportConfig;
use galvyn::core::re_exports::opentelemetry_sdk::Resource;
use galvyn::core::re_exports::opentelemetry_sdk::trace::SdkTracerProvider;
use galvyn::core::re_exports::tracing_opentelemetry;
use tracing::Subscriber;
use tracing_subscriber::Layer;
use tracing_subscriber::registry::LookupSpan;
use url::Url;

/// Constructs a `tracing` `Layer` forwarding to OpenTelemetry.
///
/// The returned `SdkTracerProvider` should be flushed before exiting the process.
pub fn opentelemetry_layer<S: Subscriber + for<'span> LookupSpan<'span>>(
    service_name: &str,
    endpoint: Url,
) -> Result<(impl Layer<S>, SdkTracerProvider), ExporterBuildError> {
    let exporter = SpanExporter::builder()
        .with_tonic()
        .with_endpoint(endpoint)
        .build()?;

    let resource = Resource::builder()
        .with_service_name(service_name.to_string())
        .build();

    let provider = SdkTracerProvider::builder()
        .with_batch_exporter(exporter)
        .with_resource(resource)
        .build();

    let tracer = provider.tracer(service_name.to_string());

    let layer = tracing_opentelemetry::layer()
        .with_threads(false)
        .with_tracked_inactivity(false)
        .with_tracer(tracer);

    Ok((layer, provider))
}
