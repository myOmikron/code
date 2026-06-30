//! HTTP handlers used by [`default_routes`](super::default_routes)

use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::get;
use http::HeaderName;
use http::header::CONTENT_TYPE;
use prometheus::TEXT_FORMAT;
use prometheus::TextEncoder;

/// Most basic liveness probe.
///
/// TODO: this should probably be a startup probe and to a liveness one
///       we don't need a liveness probe for our services:
///       https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/#when-should-you-use-a-liveness-probe
#[get("/livez")]
pub async fn livez() -> &'static str {
    "Ok"
}

/// Prometheus metrics endpoint.
#[get("/metrics")]
pub async fn metrics() -> ApiResult<([(HeaderName, &'static str); 1], String)> {
    const HEADER: (HeaderName, &str) = (CONTENT_TYPE, TEXT_FORMAT);

    let body = TextEncoder::new()
        .encode_to_string(&prometheus::gather())
        .map_err(ApiError::map_server_error("Failed to encode metrics"))?;

    Ok(([HEADER], body))
}
