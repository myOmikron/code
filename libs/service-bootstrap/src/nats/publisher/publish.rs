//! [`Nats`] methods for publishing messages.

use async_nats::Subject;
use async_nats::jetstream::context::PublishError;
use async_nats::jetstream::context::traits::Publisher;
use async_nats::jetstream::message::OutboundMessage;
use async_nats::jetstream::publish::PublishAck;
use galvyn::core::re_exports::tracing_opentelemetry::OpenTelemetrySpanExt;
use tracing::Span;
use tracing::instrument;

use crate::nats::NatsPayload;
use crate::nats::opentelemetry::context_to_headers;
use crate::nats::publisher::Nats;
use crate::nats::publisher::typed_message::TypedOutboundMessage;

impl Nats {
    /// Publishes a (jetstream) message to NATS
    ///
    /// Use [`Nats::publish_message`] if you need to specify headers.
    #[instrument(
        name = "Nats::publish",
        level = "debug", // send_publish will log on info
        skip_all, fields(message.subject = %subject)
    )]
    pub async fn publish<T: NatsPayload>(
        &self,
        subject: Subject,
        payload: T,
    ) -> Result<PublishAck, PublishError> {
        let message = TypedOutboundMessage {
            subject,
            payload,
            headers: None,
        };
        let message: OutboundMessage = message.into();
        self.send_publish(message).await
    }

    /// Publishes a (jetstream) message to NATS
    ///
    /// Use [`Nats::publish`] if you don't care about headers.
    #[instrument(
        name = "Nats::publish_message",
        level = "debug", // send_publish will log on info
        skip_all, fields(message.subject = %message.subject)
    )]
    pub async fn publish_message<T: NatsPayload>(
        &self,
        message: TypedOutboundMessage<T>,
    ) -> Result<PublishAck, PublishError> {
        let message: OutboundMessage = message.into();
        self.send_publish(message).await
    }

    /// Publish a raw message to NATS but add trace headers as well
    ///
    /// You should prefer [`Nats::publish`] or [`Nats::publish_message`] if
    /// you have a typed struct, e.g. a proto messsage. This should be used
    /// as a fallback if no such struct exist and a raw payload should be sent.
    ///
    /// This is currently only used by the DLQ service, which handles arbitrary bytes
    /// as payloads; other services should likely refrain from using this function.
    #[instrument(
        name = "Nats::send_publish",
        skip_all, fields(message.subject = %message.subject)
    )]
    pub async fn send_publish(
        &self,
        mut message: OutboundMessage,
    ) -> Result<PublishAck, PublishError> {
        let trace_headers = context_to_headers(&Span::current().context());
        if let Some(existing_headers) = message.headers.as_mut() {
            for (k, vs) in trace_headers.iter() {
                for v in vs {
                    existing_headers.insert(k.clone(), v.clone());
                }
            }
        } else {
            message.headers = Some(trace_headers);
        }

        // `publish_message` is `async` and returns a future.
        //
        // `publish_message` itself only awaits two internal semaphores.
        // It yields once the library's background worker took the job to send the message.
        // The returned future awaits the background worker to forward the acknowledgement of the server.
        //
        // This wrapper forces the caller to wait for the acknowledgement.
        // This reduces the (cognitive) complexity for the caller.
        // Most of the time, this is what the caller wants anyway to handle the error in some fashion.
        let ack = self.context.publish_message(message).await?.await?;
        self.metric_published.inc();
        Ok(ack)
    }
}
