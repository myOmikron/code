//! Utilities for configuring tracing

use opentelemetry::trace::TracerProvider;
use opentelemetry_otlp::ExporterBuildError;
use opentelemetry_otlp::SpanExporter;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::Resource;
use opentelemetry_sdk::trace::SdkTracerProvider;
use tracing::Subscriber;
use tracing_subscriber::Layer;
use tracing_subscriber::registry::LookupSpan;

use crate::config::OTEL_EXPORTER_OTLP_ENDPOINT;

/// Tracing layer exporting OpenTelemetry traces
///
/// The layer is not configurable yet and only suited for development.
/// It should simply work out of the box with a local jaeger instance.
pub fn opentelemetry_layer<S: Subscriber + for<'span> LookupSpan<'span>>()
-> Result<impl Layer<S>, ExporterBuildError> {
    let exporter = SpanExporter::builder()
        .with_tonic()
        .with_endpoint(OTEL_EXPORTER_OTLP_ENDPOINT.clone())
        .build()?;

    let resource = Resource::builder().with_service_name("bnv-manager").build();

    let provider = SdkTracerProvider::builder()
        .with_batch_exporter(exporter)
        .with_resource(resource)
        .build();

    let tracer = provider.tracer("bnv-manager");

    Ok(tracing_opentelemetry::layer()
        .with_threads(false) // It's a tokio worker anyway
        .with_tracked_inactivity(false)
        .with_tracer(tracer))
}
