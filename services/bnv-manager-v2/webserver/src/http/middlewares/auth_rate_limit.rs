use std::collections::HashMap;
use std::net::IpAddr;
use std::ops::ControlFlow;
use std::sync::Arc;
use std::sync::Mutex;

use galvyn::core::middleware::SimpleGalvynMiddleware;
use galvyn::core::re_exports::axum::extract::Request;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Response;
use time::Date;
use time::OffsetDateTime;
use tracing::warn;

/// Rate limit based on the client IPAddr.
///
/// The IP Address is taken from the X-Real-IP header, so make sure the proxy sets this correctly.
#[derive(Debug, Clone)]
pub struct AuthRateLimit {
    tries: Arc<Mutex<HashMap<IpAddr, u8>>>,
    current_date: Arc<Mutex<Date>>,
    max_tries: u8,
    client_id: Option<IpAddr>,
}

impl AuthRateLimit {
    /// Create a new rate limiter.
    ///
    /// `max_tries` specifies the tries an IP has until is blocked.
    /// The client will be blocked at the current day (based on the UTC date)
    pub fn new(max_tries: u8) -> Self {
        Self {
            tries: Default::default(),
            current_date: Arc::new(Mutex::new(OffsetDateTime::now_utc().date())),
            max_tries,
            client_id: None,
        }
    }
}

impl SimpleGalvynMiddleware for AuthRateLimit {
    async fn pre_handler(&mut self, request: Request) -> ControlFlow<Response, Request> {
        let Some(header_value) = request.headers().get("x-real-ip") else {
            return ControlFlow::Break(
                (StatusCode::BAD_REQUEST, "Missing X-Real-IP Header").into_response(),
            );
        };

        let Ok(header_value) = header_value.to_str() else {
            return ControlFlow::Break(
                (StatusCode::BAD_REQUEST, "Invalid X-Real-IP Header").into_response(),
            );
        };

        let Ok(client_ip_addr) = header_value.parse::<IpAddr>() else {
            return ControlFlow::Break(
                (StatusCode::BAD_REQUEST, "Invalid X-Real-IP Header").into_response(),
            );
        };
        self.client_id = Some(client_ip_addr);

        let today = OffsetDateTime::now_utc().date();
        {
            #[allow(clippy::expect_used)]
            let mut guard = self.current_date.lock().expect("Poison error");
            if *guard != today {
                *guard = today;

                #[allow(clippy::expect_used)]
                {
                    *self.tries.lock().expect("Poison error") = HashMap::new();
                }
            }
        }

        {
            #[allow(clippy::expect_used)]
            let mut guard = self.tries.lock().expect("Poison error");

            let tries = guard.entry(client_ip_addr).or_insert(0);

            if *tries > self.max_tries {
                warn!("Blocking request due to too many tries");
                return ControlFlow::Break(
                    (StatusCode::BAD_REQUEST, "Invalid X-Real-IP Header").into_response(),
                );
            }
        }

        ControlFlow::Continue(request)
    }

    async fn post_handler(&mut self, response: Response) -> Response {
        #[allow(clippy::expect_used)]
        let client_id = self.client_id.expect("Must be set in pre_handler");

        if response.status().is_success() {
            #[allow(clippy::expect_used)]
            self.tries
                .lock()
                .expect("Poison error")
                .insert(client_id, 0);
        } else {
            #[allow(clippy::expect_used)]
            self.tries
                .lock()
                .expect("Poison error")
                .entry(client_id)
                .and_modify(|x| *x += 1);
        }

        response
    }
}
