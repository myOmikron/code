use galvyn::core::re_exports::tracing_opentelemetry::OpenTelemetrySpanExt;
use galvyn::tracing::opentelemetry::headers_to_context;
use http::Request;
use tracing::Span;
use tracing::info_span;
use tracing::warn;

/// Creates the span ever grpc handler is instrumented with
pub fn span_for_grpc_request<B>(request: &Request<B>) -> Span {
    let path = request.uri().path();
    let (service, method) = path
        .strip_prefix('/')
        .unwrap_or(path)
        .split_once('/')
        .unzip();

    let span = info_span!(
        "grpc-request",
        http.uri = %request.uri(),
        http.path = request.uri().path(),
        grpc.service = service,
        grpc.method = method,
    );

    if let Err(error) = span.set_parent(headers_to_context(request.headers())) {
        warn!(%error, "Failed to set parent trace");
    }

    span
}
