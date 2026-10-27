//! Trace propagation for outgoing http requests
//!
//! The http counterpart of the gRPC client `Channel` (`grpc` feature): a request
//! that carries the current span's context continues its trace on the receiving service.
//!
//! ```text
//! use service_bootstrap::http::client::PropagateTrace;
//!
//! client.post(url).json(&body).propagate_trace().send().await
//! ```

use galvyn::core::re_exports::tracing_opentelemetry::OpenTelemetrySpanExt;
use galvyn::tracing::opentelemetry::context_to_headers;
use http::HeaderMap;
use tracing::Span;

/// Writes the current tracing span's context into `headers` as W3C `traceparent` (and
/// `tracestate`, if any)
///
/// Writes nothing when the current span carries no valid OpenTelemetry context.
pub fn inject_trace_context(headers: &mut HeaderMap) {
    headers.extend(context_to_headers(&Span::current().context()));
}

/// Adds the current tracing span's context to an outgoing [`reqwest`] request
pub trait PropagateTrace {
    /// Sets `traceparent` (and `tracestate`) from the current span, see [`inject_trace_context`]
    fn propagate_trace(self) -> Self;
}

impl PropagateTrace for reqwest::RequestBuilder {
    fn propagate_trace(self) -> Self {
        let mut headers = HeaderMap::new();
        inject_trace_context(&mut headers);
        self.headers(headers)
    }
}

#[cfg(test)]
mod tests {
    use galvyn::core::re_exports::opentelemetry::trace::TraceContextExt;
    use galvyn::core::re_exports::opentelemetry::trace::TracerProvider;
    use galvyn::core::re_exports::opentelemetry_sdk::trace::SdkTracerProvider;
    use galvyn::core::re_exports::tracing_opentelemetry;
    use galvyn::core::re_exports::tracing_opentelemetry::OpenTelemetrySpanExt;
    use tracing::Span;
    use tracing::info_span;
    use tracing_subscriber::layer::SubscriberExt;

    use super::*;

    /// Inside a span with an OpenTelemetry context the header names that span's trace.
    #[test]
    fn injects_the_current_span() {
        let provider = SdkTracerProvider::builder().build();
        let subscriber = tracing_subscriber::registry()
            .with(tracing_opentelemetry::layer().with_tracer(provider.tracer("test")));

        tracing::subscriber::with_default(subscriber, || {
            let span = info_span!("outgoing");
            let _entered = span.enter();
            let trace_id = Span::current().context().span().span_context().trace_id();

            let mut headers = HeaderMap::new();
            inject_trace_context(&mut headers);

            let traceparent = headers["traceparent"].to_str().unwrap();
            let parts: Vec<&str> = traceparent.split('-').collect();
            assert_eq!(parts.len(), 4, "{traceparent}");
            assert_eq!(parts[0], "00");
            assert_eq!(parts[1], trace_id.to_string());
            assert_ne!(parts[1], "0".repeat(32));
        });
    }

    /// Without a span there is no trace to continue, so nothing is written.
    #[test]
    fn no_span_no_header() {
        let mut headers = HeaderMap::new();
        inject_trace_context(&mut headers);
        assert!(headers.is_empty(), "{headers:?}");
    }
}
