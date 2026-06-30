//! Propagates opentelemetry traces through NATS' headers.

use std::str::FromStr;

use async_nats::HeaderMap;
use async_nats::HeaderName;
use async_nats::HeaderValue;
use galvyn::core::re_exports::opentelemetry::Context;
use galvyn::core::re_exports::opentelemetry::propagation::Extractor;
use galvyn::core::re_exports::opentelemetry::propagation::Injector;
use galvyn::core::re_exports::opentelemetry::propagation::TextMapPropagator;
use galvyn::core::re_exports::opentelemetry_sdk::propagation::TraceContextPropagator;
use tracing::warn;

/// Converts an opentelemetry context to a list of headers.
///
/// Those headers can be included in messages to preserve the opentelemetry trace.
pub fn context_to_headers(context: &Context) -> HeaderMap {
    let mut map = HeaderMap::new();
    TraceContextPropagator::new().inject_context(context, &mut HeaderMapWrite(&mut map));
    map
}

/// Reads an opentelemetry context from a list of headers.
///
/// Those headers can be received in messages to preserve the opentelemetry trace.
pub fn headers_to_context(headers: &HeaderMap) -> Context {
    TraceContextPropagator::new().extract(&HeaderMapRead(headers))
}

/// Adaptor to plug `async_nats::HeaderMap` into `opentelemetry`
struct HeaderMapWrite<'a>(&'a mut HeaderMap);
impl Injector for HeaderMapWrite<'_> {
    fn set(&mut self, key: &str, value: String) {
        let Ok(name) = HeaderName::from_str(key) else {
            warn!(key, value, "Opentelemetry produced an invalid header");
            return;
        };
        let Ok(value) = HeaderValue::from_str(&value) else {
            warn!(key, value, "Opentelemetry produced an invalid header");
            return;
        };
        self.0.insert(name, value);
    }
}

/// Adaptor to plug `async_nats::HeaderMap` into `opentelemetry`
struct HeaderMapRead<'a>(&'a HeaderMap);
impl Extractor for HeaderMapRead<'_> {
    fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key).map(|value| value.as_str())
    }

    fn keys(&self) -> Vec<&str> {
        // This method cannot be implemented if your keys are not exactly rust strings.
        // However, it has never been called in any of our projects.
        warn!("Extractor::keys is not implemented");
        vec![]
    }
}
