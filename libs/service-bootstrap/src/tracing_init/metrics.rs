//! See [`layer`]

use prometheus::IntCounterVec;
use prometheus::IntGaugeVec;
use prometheus::register_int_counter_vec;
use prometheus::register_int_gauge_vec;
use tracing::Event;
use tracing::Id;
use tracing::Subscriber;
use tracing::span::Attributes;
use tracing_subscriber::Layer;
use tracing_subscriber::layer::Context;
use tracing_subscriber::registry::LookupSpan;

/// A tracing [`Layer`] which collects a few basic metrics about the tracing system
///
/// # Errors
/// if prometheus registration fails - likely a programmer mistake.
pub fn layer<S>() -> Result<impl Layer<S>, prometheus::Error>
where
    S: Subscriber + for<'span> LookupSpan<'span>,
{
    Ok(MetricsLayer {
        events_created: register_int_counter_vec!(
            "svcbs_tracing_events_total",
            "Number of tracing events created since service start",
            &["level"]
        )?,
        spans_created: register_int_counter_vec!(
            "svcbs_tracing_spans_total",
            "Number of tracing spans created since service start",
            &["level"]
        )?,
        spans_open: register_int_gauge_vec!(
            "svcbs_tracing_spans_open",
            "Number of currently open spans",
            &["level"]
        )?,
    })
}

/// Returned by [`layer`]
struct MetricsLayer {
    /// Number of tracing events created since service start
    events_created: IntCounterVec,

    /// Number of tracing spans created since service start
    spans_created: IntCounterVec,

    /// Number of currently open spans
    spans_open: IntGaugeVec,
}

impl<S> Layer<S> for MetricsLayer
where
    S: Subscriber + for<'span> LookupSpan<'span>,
{
    fn on_new_span(&self, attrs: &Attributes<'_>, _id: &Id, _ctx: Context<'_, S>) {
        self.spans_created
            .with_label_values(&[attrs.metadata().level().as_str()])
            .inc();

        self.spans_open
            .with_label_values(&[attrs.metadata().level().as_str()])
            .inc();
    }

    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        self.events_created
            .with_label_values(&[event.metadata().level().as_str()])
            .inc();
    }

    fn on_close(&self, id: Id, ctx: Context<'_, S>) {
        // Most other impls (including our otel layer) panic here as well
        let span = ctx.span(&id).expect("Span not found, this is a bug");

        self.spans_open
            .with_label_values(&[span.metadata().level().as_str()])
            .dec();
    }
}
