//! The proxy handlers for the graph advisor
//!
//! One explicit handler per proxied endpoint rather than a wildcard: the
//! handler list *is* the allowlist, and fixed paths keep the generated
//! openapi document free of malformed wildcard parameters.
//!
//! The requests and responses are passed through opaquely — the ts client
//! for these routes is generated from FastAPI's own spec (`just
//! gen-graph-api`), so the payloads are not this service's contract to
//! describe.

use galvyn::core::Module;
use galvyn::core::re_exports::axum::body::Body;
use galvyn::core::re_exports::axum::body::to_bytes;
use galvyn::core::re_exports::axum::extract::Request;
use galvyn::core::re_exports::axum::http::HeaderName;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::http::header;
use galvyn::core::re_exports::axum::response::Response;
use galvyn::get;
use galvyn::post;
use tracing::warn;

use crate::http::middleware::rate_limit::trusted_client_ip;
use crate::modules::graph::GraphClient;

/// Deck diagnostics: curve, role quotas, resource balance, themes
#[post("/diagnostics")]
pub async fn post_diagnostics(req: Request) -> Response {
    proxy("/diagnostics", req).await
}

/// Suggested adds and cuts and the pairings between them
#[post("/swaps")]
pub async fn post_swaps(req: Request) -> Response {
    proxy("/swaps", req).await
}

/// Alternatives to one marked card
#[post("/replace")]
pub async fn post_replace(req: Request) -> Response {
    proxy("/replace", req).await
}

/// Solver-backed completion of a partial deck
#[post("/fill")]
pub async fn post_fill(req: Request) -> Response {
    proxy("/fill", req).await
}

/// Graph-backed card search
#[post("/search")]
pub async fn post_search(req: Request) -> Response {
    proxy("/search", req).await
}

/// Combos the deck completes or is one card short of
#[post("/combos")]
pub async fn post_combos(req: Request) -> Response {
    proxy("/combos", req).await
}

/// Complete combo lines and near-misses: cost, zones, prerequisites, fold
/// classes, tutor reach, and redundancy
#[post("/lines")]
pub async fn post_lines(req: Request) -> Response {
    proxy("/lines", req).await
}

/// Pre-fetch EDHREC data for a commander
#[post("/warm")]
pub async fn post_warm(req: Request) -> Response {
    proxy("/warm", req).await
}

/// Whether a pool restriction compiles, and where it stops if it does not
#[post("/pool-query")]
pub async fn post_pool_query(req: Request) -> Response {
    proxy("/pool-query", req).await
}

/// Search filter values that have cards behind them
#[get("/facets")]
pub async fn get_facets(req: Request) -> Response {
    proxy("/facets", req).await
}

/// Response headers that describe the connection, not the payload — never forwarded
const HOP_BY_HOP: [HeaderName; 8] = [
    header::CONNECTION,
    HeaderName::from_static("keep-alive"),
    header::PROXY_AUTHENTICATE,
    header::PROXY_AUTHORIZATION,
    header::TE,
    header::TRAILER,
    header::TRANSFER_ENCODING,
    header::UPGRADE,
];

/// Upper bound on a proxied request body
///
/// The advisor's requests are deck lists as json — a few hundred KB at the
/// absolute worst. Anything bigger is not ours.
const MAX_REQUEST_BODY: usize = 4 * 1024 * 1024;

/// Forward one request to the advisor and stream its answer back
///
/// Opaque on purpose, with three deliberate edits to the request:
/// - Only `Content-Type` crosses over — in particular the session cookie
///   must not reach the advisor.
/// - `X-Forwarded-For` is written fresh with the client as its only hop.
///   The advisor's per-client rate limiter reads the *first* hop while
///   [`trusted_client_ip`] believes only the *last* — a single hop is what
///   both conventions agree on, and never forwarding the client's own
///   header is what keeps the limiter's key out of the client's hands.
/// - The body is buffered (it is small json), the response is streamed.
///
/// The status and payload headers come back verbatim — `/fill` answers
/// 429 + `Retry-After` when the solver is saturated and the frontend reads
/// exactly that. When the browser aborts, this future is dropped, reqwest
/// closes the upstream connection, and the advisor's solver slot frees up.
async fn proxy(upstream_path: &str, req: Request) -> Response {
    let graph = GraphClient::global();

    // Read before the request is consumed.
    let client_ip = trusted_client_ip(&req);

    let mut url = graph
        .base_url
        .join(upstream_path)
        .expect("the paths are static and relative");
    if let Some(query) = req.uri().query() {
        url.set_query(Some(query));
    }

    let (parts, body) = req.into_parts();
    let Ok(body) = to_bytes(body, MAX_REQUEST_BODY).await else {
        return status_only(StatusCode::PAYLOAD_TOO_LARGE);
    };

    let mut upstream = graph.client.request(parts.method, url).body(body);
    if let Some(content_type) = parts.headers.get(header::CONTENT_TYPE) {
        upstream = upstream.header(header::CONTENT_TYPE, content_type);
    }
    if let Some(ip) = client_ip {
        upstream = upstream.header("x-forwarded-for", ip.to_string());
    }

    let upstream_response = match upstream.send().await {
        Ok(response) => response,
        Err(error) => {
            warn!(
                path = upstream_path,
                error = &error as &dyn std::error::Error,
                "Graph advisor unreachable"
            );
            return bad_gateway();
        }
    };

    let mut builder = Response::builder().status(upstream_response.status());
    for (name, value) in upstream_response.headers() {
        // Hyper frames the streamed body itself, so `Content-Length` goes too.
        if !HOP_BY_HOP.contains(name) && *name != header::CONTENT_LENGTH {
            builder = builder.header(name, value);
        }
    }
    builder
        .body(Body::from_stream(upstream_response.bytes_stream()))
        .unwrap_or_else(|_| bad_gateway())
}

/// An empty response carrying nothing but a status
fn status_only(status: StatusCode) -> Response {
    Response::builder()
        .status(status)
        .body(Body::empty())
        .expect("a bare status is a valid response")
}

/// The advisor did not answer
///
/// Hand-built because [`ApiError`](galvyn::core::stuff::api_error::ApiError)
/// has no 502 constructor. The body's shape does not matter to the frontend —
/// every advisor failure renders as "advisor unavailable".
fn bad_gateway() -> Response {
    Response::builder()
        .status(StatusCode::BAD_GATEWAY)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"detail":"graph advisor unreachable"}"#))
        .expect("a static response is a valid response")
}
