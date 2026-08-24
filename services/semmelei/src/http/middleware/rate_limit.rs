//! Tiny in-process fixed-window rate limiter for the public order endpoints.

use std::collections::HashMap;
use std::net::IpAddr;
use std::net::SocketAddr;
use std::ops::ControlFlow;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;
use std::time::Instant;

use galvyn::core::middleware::SimpleGalvynMiddleware;
use galvyn::core::re_exports::axum::extract::ConnectInfo;
use galvyn::core::re_exports::axum::extract::Request;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Response;
use galvyn::core::stuff::api_error::ApiError;
use tracing::warn;

/// Fixed-window per-IP rate limiter.
///
/// Village-shop scale: state lives in-process and is lost on restart,
/// which is fine — this only bounds abuse of the public order endpoints.
#[derive(Clone, Debug)]
pub struct RateLimitLayer {
    max_requests: u32,
    window: Duration,
    state: Arc<Mutex<HashMap<IpAddr, (Instant, u32)>>>,
}

impl RateLimitLayer {
    /// Create a limiter allowing `max_requests` per `window` per client IP
    pub fn new(max_requests: u32, window: Duration) -> Self {
        Self {
            max_requests,
            window,
            state: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// The address to count a request against
    ///
    /// Everything reaches this service through traefik, so the socket address
    /// is always the proxy and the client is in `X-Forwarded-For`. Which hop of
    /// it is the client is the whole question: the header arrives partly
    /// written by the client itself, and reading the *first* entry — the usual
    /// spelling — hands the counter's key to whoever is being counted. A
    /// different value per request buys a fresh budget each time, which is no
    /// limit at all.
    ///
    /// So the **last** hop is taken. That one is not the client's to write:
    /// traefik replaces the header for an untrusted client and appends its own
    /// view of the peer for a trusted one, and either way what it wrote ends up
    /// at the end. This holds as long as traefik is not configured with
    /// `forwardedHeaders.insecure`, which would pass the client's header
    /// through untouched.
    ///
    /// Only the last header line is read, for the same reason: a client sending
    /// an `X-Forwarded-For` of its own must not be able to get its value looked
    /// at instead of the proxy's.
    fn client_ip(req: &Request) -> Option<IpAddr> {
        if let Some(forwarded) = req.headers().get_all("x-forwarded-for").iter().next_back()
            && let Ok(value) = forwarded.to_str()
            && let Some(last) = value.rsplit(',').next()
            && let Ok(ip) = last.trim().parse()
        {
            return Some(ip);
        }
        req.extensions()
            .get::<ConnectInfo<SocketAddr>>()
            .map(|ConnectInfo(addr)| addr.ip())
    }
}

impl SimpleGalvynMiddleware for RateLimitLayer {
    async fn pre_handler(&mut self, req: Request) -> ControlFlow<Response, Request> {
        let Some(ip) = Self::client_ip(&req) else {
            // No IP to key on — let the request through instead of breaking
            // deployments without ConnectInfo.
            warn!("Rate limiter could not determine a client ip");
            return ControlFlow::Continue(req);
        };

        let now = Instant::now();
        let mut state = self.state.lock().unwrap_or_else(|poison| {
            // A poisoned counter map is not worth crashing requests over.
            poison.into_inner()
        });
        // Keep the map from growing unboundedly.
        if state.len() > 10_000 {
            state.retain(|_, (start, _)| now.duration_since(*start) < self.window);
        }
        let (window_start, count) = state.entry(ip).or_insert((now, 0));
        if now.duration_since(*window_start) >= self.window {
            *window_start = now;
            *count = 0;
        }
        *count += 1;
        if *count > self.max_requests {
            let error: ApiError = ApiError::bad_request("Too many requests, try again later");
            return ControlFlow::Break(error.into_response());
        }
        drop(state);

        ControlFlow::Continue(req)
    }
}
