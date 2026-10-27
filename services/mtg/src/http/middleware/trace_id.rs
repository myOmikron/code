//! Middleware which tells the browser the trace id of every response

use galvyn::core::middleware::SimpleGalvynMiddleware;
use galvyn::core::re_exports::axum::http::HeaderName;
use galvyn::core::re_exports::axum::http::HeaderValue;
use galvyn::core::re_exports::axum::response::Response;
use galvyn::core::re_exports::opentelemetry::trace::TraceContextExt;
use galvyn::core::re_exports::opentelemetry::trace::TraceId;
use galvyn::core::re_exports::tracing_opentelemetry::OpenTelemetrySpanExt;
use tracing::Span;

/// The response header carrying the trace id
pub const TRACE_ID_HEADER: HeaderName = HeaderName::from_static("x-trace-id");

/// Sets [`TRACE_ID_HEADER`] to the trace id of the request's span
///
/// A Bug report lists the recent requests with this id, so an Admin finds
/// their traces. Without opentelemetry there is no trace and no header.
///
/// Wrapped around the frontend routes and the graph advisor proxy alike: the
/// proxy's answer is the advisor's, but the trace it belongs to is this one.
#[derive(Copy, Clone, Debug)]
pub struct TraceIdLayer;

impl SimpleGalvynMiddleware for TraceIdLayer {
    async fn post_handler(&mut self, mut response: Response) -> Response {
        let trace_id = Span::current().context().span().span_context().trace_id();
        if trace_id != TraceId::INVALID
            && let Ok(value) = HeaderValue::from_str(&trace_id.to_string())
        {
            response.headers_mut().insert(TRACE_ID_HEADER, value);
        }
        response
    }
}
