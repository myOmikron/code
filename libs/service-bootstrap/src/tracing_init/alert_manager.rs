//! A tracing [`Layer`] which reports WARN and ERROR events to Alert Manager.

use std::collections::HashMap;
use std::fmt::Debug;
use std::sync::Arc;

use galvyn::core::re_exports::opentelemetry::TraceId;
use galvyn::core::re_exports::opentelemetry::trace::SpanContext;
use galvyn::core::re_exports::opentelemetry::trace::TraceContextExt;
use galvyn::core::re_exports::serde_json;
use galvyn::core::re_exports::tracing_opentelemetry::OpenTelemetrySpanExt;
use galvyn::core::re_exports::uuid::Uuid;
use galvyn::tracing::extensions::RecordExt;
use serde::Deserialize;
use serde::Serialize;
use time::OffsetDateTime;
use tracing::Event;
use tracing::Instrument;
use tracing::Metadata;
use tracing::Span;
use tracing::Subscriber;
use tracing::error_span;
use tracing::field::Field;
use tracing_subscriber::Layer;
use tracing_subscriber::layer::Context;
use tracing_subscriber::registry::LookupSpan;
use url::Url;

/// A tracing [`Layer`] which reports WARN and ERROR events to Alert Manager.
pub fn layer<S>(config: AlertManagerConfig) -> impl Layer<S>
where
    S: Subscriber,
    S: for<'s> LookupSpan<'s>,
{
    let config = AlertManagerConfig {
        alertmanager_url: config
            .alertmanager_url
            .join("api/v2/alerts")
            .expect("\"api/v2/alerts\" is a valid relative URL"),
        ..config
    };
    AlertManagerLayer {
        client: reqwest::Client::new(),
        config: Arc::new(config),
        runtime: tokio::runtime::Handle::current(),
    }
}

/// Config for the Alert Manager [`layer`]
pub struct AlertManagerConfig {
    /// URL of the Alert Manager.
    pub alertmanager_url: Url,

    /// Grafana data source ID used for tracing (it should be the respective 'tempo' data source ID)
    pub grafana_tracing_data_source: String,

    /// Grafana URI/origin used to construct direct links for tracing
    pub grafana_tracing_uri: Url,

    /// The service name from the event's parent span.
    pub service_name: String,
}

/// A tracing [`Layer`] which reports WARN and ERROR events to Alertmanager.
struct AlertManagerLayer {
    /// HTTP client used to send the alerts.
    client: reqwest::Client,
    /// Static configuration shared across all spawned report tasks.
    config: Arc<AlertManagerConfig>,
    /// Handle to the Tokio runtime alerts are dispatched onto.
    ///
    /// Captured at construction so events emitted from non-runtime threads can
    /// still spawn the report task. Using `tokio::spawn` directly would panic
    /// when `on_event` runs on a thread without a runtime context.
    runtime: tokio::runtime::Handle,
}

impl<S> Layer<S> for AlertManagerLayer
where
    S: Subscriber,
    S: for<'s> LookupSpan<'s>,
{
    /// Called by `tracing` for every `Event`
    ///
    /// It determines if the `Event` should be sent to Alert Manager and [spawns](tokio::spawn)
    /// [`AlertManagerLayer::send_alert`] to do so without blocking the current task.
    fn on_event(&self, event: &Event<'_>, ctx: Context<'_, S>) {
        // Should this event be reported as an alert?
        //
        // Default to `true` for `error!`and `warn!`.
        // Overwritten by the `tpig.alert` field.
        let mut alert = match *event.metadata().level() {
            tracing::Level::ERROR => true,
            tracing::Level::WARN => true,
            tracing::Level::INFO => false,
            _ => return,
        };
        event.record_bool(|field, value| {
            if field.name() == "tpig.alert" {
                alert = value
            }
        });
        if !alert {
            return;
        }

        // Check if this event originated from a root span created by this function.
        //
        // If it did and were an error because alertmanager are down,
        // it would case a feedback loop.
        let reporting_span = error_span!(
            parent: None, "AlertManagerLayer::on_event", otel.status_code = "ok",
            explanation = "This span is not an 'error', it is a tracing trick to prevent feedback loops"
        );
        if let Some(scope) = ctx.event_scope(event) {
            let Some(metadata) = reporting_span.metadata() else {
                // This would only happen if `reporting_span` were disabled.
                // I.e., the log level is not even ERROR.
                return;
            };

            if let Some(root_span) = scope.last()
                && root_span.metadata().callsite() == metadata.callsite()
            {
                return;
            }
        }

        self.runtime.spawn(
            Self::send_alert(
                OwnedEvent::new(event),
                self.client.clone(),
                Arc::clone(&self.config),
            )
            .instrument(reporting_span),
        );
    }
}

impl AlertManagerLayer {
    /// [`Spawned`](tokio::spawn) by [`AlertManagerLayer::on_event`] to send the alert without blocking the current task
    async fn send_alert(
        event: OwnedEvent,
        client: reqwest::Client,
        config: Arc<AlertManagerConfig>,
    ) {
        let trace_url = (event.otel.trace_id() != TraceId::INVALID).then(|| {
            let mut url = config.grafana_tracing_uri.clone();
            url.set_path("explore");
            url.query_pairs_mut()
                .append_pair("schemaVersion", "1")
                .append_pair(
                    "panes",
                    &serde_json::json!({
                        "foo": {
                            "datasource": &config.grafana_tracing_data_source,
                            "queries": [{ "query": event.otel.trace_id().to_string() }]
                        }
                    })
                    .to_string(),
                );
            url.to_string()
        });

        let mut annotations = HashMap::new();
        for (key, value) in &event.fields {
            annotations.insert(key.to_string(), value.clone());
        }
        if let Some(file) = event.metadata.file() {
            annotations.insert("code.file".to_string(), file.to_string());
            annotations.insert("code.link".to_string(), format!(
                "jetbrains://rustrover/navigate/reference?project={repo}&path={file}:{line}:{column}",
                repo = "apps",
                line = event.metadata.line().unwrap_or_default(),
                column = 0
            ));
        }
        if let Some(line) = event.metadata.line() {
            annotations.insert("code.line".to_string(), line.to_string());
        }
        annotations.insert(
            "otel.trace_id".to_string(),
            event.otel.trace_id().to_string(),
        );
        annotations.insert("otel.span_id".to_string(), event.otel.span_id().to_string());

        // by default, all label's values (not keys) are visible in desk ticket subjects (alphabetically sorted by key)
        let mut labels = HashMap::new();

        // Convention expected by most tooling - also used in desk to filter for AlertManager tickets
        labels.insert("alertname".to_string(), "RustLog".to_string());

        // Prevent de-duplication
        labels.insert("nonce".to_string(), Uuid::new_v4().to_string());

        // Should be used for routing
        labels.insert("service".to_string(), config.service_name.clone());
        labels.insert("level".to_string(), event.metadata.level().to_string());
        labels.insert("target".to_string(), event.metadata.target().to_string());

        // included in subject and could be used for special routes
        if let Some(message) = event.fields.get("message") {
            labels.insert("message".to_string(), message.clone());
        }

        let alert_event = AlertEvent {
            starts_at: Some(OffsetDateTime::now_utc()),
            ends_at: None,
            labels,
            annotations,
            generator_url: trace_url,
        };

        match client
            .post(config.alertmanager_url.clone())
            .json(&[alert_event])
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {}
            Ok(resp) => {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                tracing::warn!(
                    status = %status,
                    body,
                    "failed to send alert to alertmanager"
                );
            }
            Err(err) => {
                tracing::warn!(error.display = %err, error.debug = ?err, "failed to send alert to alertmanager");
            }
        }
    }
}

/// Owned representation of a `tracing` [`Event`].
struct OwnedEvent {
    /// `tracing`'s static metadata for the event.
    ///
    /// This includes things like log-level and location of callsite.
    metadata: &'static Metadata<'static>,

    /// OpenTelemetry span the event occurred in.
    otel: SpanContext,

    /// All fields.
    fields: HashMap<&'static str, String>,
}
impl OwnedEvent {
    /// Constructs an `OwnedEvent` from a borrowed one
    pub fn new(event: &Event<'_>) -> Self {
        struct Visitor<'a>(&'a mut HashMap<&'static str, String>);
        impl tracing::field::Visit for Visitor<'_> {
            fn record_debug(&mut self, field: &Field, value: &dyn Debug) {
                self.0.insert(field.name(), format!("{value:?}"));
            }
        }

        let mut this = Self {
            metadata: event.metadata(),
            // TODO: this is actually not correct in general
            otel: Span::current().context().span().span_context().clone(),
            fields: HashMap::new(),
        };
        event.record(&mut Visitor(&mut this.fields));
        this
    }
}

/// JSON payload sent as an array to `api/v2/alerts` on the Alert Manager.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertEvent {
    /// Timestamp when the alert was fired.
    ///
    /// If omitted, Alertmanager sets `startsAt` to the current time.
    #[serde(with = "time::serde::rfc3339::option")]
    pub starts_at: Option<OffsetDateTime>,

    /// Timestamp when the alert should be resolved.
    ///
    /// If omitted, Alertmanager sets `endsAt` to `now + resolve_timeout`.
    #[serde(with = "time::serde::rfc3339::option")]
    pub ends_at: Option<OffsetDateTime>,

    /// Labels used to deduplicate identical instances of the same alert.
    pub labels: HashMap<String, String>,

    /// Additional context such as summary or description.
    pub annotations: HashMap<String, String>,

    /// URL linking to the source of the alert (e.g. a Grafana trace).
    #[serde(rename = "generatorURL")]
    pub generator_url: Option<String>,
}
