//! Request span for browser-facing routers

use galvyn::core::re_exports::axum::body::Body;
use galvyn::core::re_exports::axum::extract::MatchedPath;
use galvyn::core::re_exports::axum::http::Request;
use tower_http::classify::ServerErrorsAsFailures;
use tower_http::classify::SharedClassifier;
use tower_http::trace::TraceLayer;
use tracing::Span;
use tracing::info_span;

/// The [`TraceLayer`] returned by [`trace_layer`]
pub type RequestTraceLayer =
    TraceLayer<SharedClassifier<ServerErrorsAsFailures>, fn(&Request<Body>) -> Span>;

/// A [`TraceLayer`] whose request span is named `<method> <route>`, e.g.
/// `GET /api/frontend/v1/collections/{uuid}`
///
/// Apply it outside the session layer: `tower-sessions` opens an INFO span `call` per request,
/// which would otherwise be the root of the trace. galvyn's own `TraceLayer` creates its span at
/// DEBUG and is filtered out by default.
pub fn trace_layer() -> RequestTraceLayer {
    TraceLayer::new_for_http().make_span_with(make_span as fn(&Request<Body>) -> Span)
}

fn make_span(request: &Request<Body>) -> Span {
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map(MatchedPath::as_str);
    info_span!(
        "request",
        otel.name = span_name(request),
        http.request.method = %request.method(),
        http.route = route,
        url.path = request.uri().path(),
    )
}

/// The span name the OpenTelemetry HTTP conventions ask for: the method, then the route template
/// rather than the path, so requests to the same handler share a name
fn span_name<B>(request: &Request<B>) -> String {
    match request.extensions().get::<MatchedPath>() {
        Some(route) => format!("{} {}", request.method(), route.as_str()),
        None => request.method().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use galvyn::core::re_exports::axum::Router;
    use galvyn::core::re_exports::axum::middleware::Next;
    use galvyn::core::re_exports::axum::middleware::from_fn;
    use galvyn::core::re_exports::axum::response::Response;
    use galvyn::core::re_exports::axum::routing::get;
    use tower::ServiceExt;

    use super::*;

    async fn record_name(request: Request<Body>, next: Next) -> Response {
        let name = span_name(&request);
        let mut response = next.run(request).await;
        response
            .headers_mut()
            .insert("span-name", name.parse().unwrap());
        response
    }

    async fn name_for(uri: &str) -> String {
        let router = Router::new()
            .nest(
                "/api",
                Router::new().route("/items/{uuid}", get(|| async {})),
            )
            .layer(from_fn(record_name));
        let response = router
            .oneshot(Request::get(uri).body(Body::empty()).unwrap())
            .await
            .unwrap();
        response.headers()["span-name"].to_str().unwrap().to_owned()
    }

    /// A layer on the outer router sees the full route template of a nested route.
    #[tokio::test]
    async fn names_by_nested_route() {
        assert_eq!(name_for("/api/items/42").await, "GET /api/items/{uuid}");
    }

    /// Without a matching route the path stays out of the name, it is unbounded.
    #[tokio::test]
    async fn unmatched_is_method_only() {
        assert_eq!(name_for("/nope").await, "GET");
    }
}
