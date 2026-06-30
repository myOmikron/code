//! Internals used by [`NatsListener`] to push unhandleable messages to a dead letter queue.

use std::time::Duration;

use async_nats::Message;
use async_nats::Subject;
use async_nats::jetstream::AckKind;
use async_nats::jetstream::message::Acker;
use o2o::o2o;
use prost_types::Timestamp;
use time::OffsetDateTime;
use tracing::error;
use tracing::instrument;

use crate::nats::BoxedError;
use crate::nats::NatsPayloadDecodeError;
use crate::nats::listener::NatsListener;
use crate::nats::publisher::TypedOutboundMessage;
use crate::nats::publisher::dlq_proto;

impl NatsListener {
    /// Wrapper for [`Nats::push_to_dlq`] which acknowledges the original message after pushing to the DLQ.
    #[instrument(
        name = "NatsListener::push_to_dlq",
        skip_all, fields(
            message.subject = %message.subject,
            reason.kind = reason.kind(),
            reason.debug = ?reason
        )
    )]
    pub(crate) async fn push_to_dlq(&self, message: Message, receive_acker: Acker, reason: Reason) {
        let subject = Subject::from(format!("dlq.{}.{}", reason.kind(), message.subject));

        let now = OffsetDateTime::now_utc();
        let payload = dlq_proto::DeadLetterQueueItem {
            subject: message.subject.to_string(),
            payload: message.payload.clone(),
            headers: message
                .headers
                .iter()
                .flat_map(|x| x.iter())
                .flat_map(|(k, vs)| vs.iter().map(move |v| (v, k)))
                .map(|(v, k)| dlq_proto::DlqHeader {
                    name: k.to_string(),
                    value: v.to_string(),
                })
                .collect(),
            reason: match reason {
                Reason::Parse(_) => dlq_proto::DlqReason::Parse,
                Reason::Validate(_) => dlq_proto::DlqReason::Validate,
                Reason::Process(_) => dlq_proto::DlqReason::Process,
                Reason::UnknownSubject => dlq_proto::DlqReason::UnknownSubject,
                Reason::InvalidReply(_) => dlq_proto::DlqReason::InvalidReply,
                Reason::HandlerTimeout(_) => dlq_proto::DlqReason::HandlerTimeout,
            } as i32,
            reason_details: match reason {
                Reason::Parse(error) => error.to_string(),
                Reason::Validate(error) => error.to_string(),
                Reason::Process(error) => error.to_string(),
                Reason::UnknownSubject => String::new(),
                Reason::InvalidReply(error) => error.to_string(),
                Reason::HandlerTimeout(timeout) => format!("{} s exceeded", timeout.as_secs_f64()),
            },
            pushed_at: Some(Timestamp {
                seconds: now.unix_timestamp(),
                nanos: 0,
            }),
        };

        let publish_result = self
            .publisher
            .publish_message(TypedOutboundMessage {
                subject,
                payload,
                headers: None,
            })
            .await;

        match publish_result {
            Ok(_publish_ack) => {
                if let Err(error) = receive_acker.double_ack_with(AckKind::Term).await {
                    error!(
                        message.subject = %message.subject,
                        error.display = %error,
                        error.debug = ?error,
                        "Failed to acknowledge received message"
                    );
                }
            }
            Err(error) => {
                error!(
                    message.subject = %message.subject,
                    error.display = %error,
                    error.debug = ?error,
                    "Failed to publish to dead letter queue"
                );
            }
        }
    }
}

/// Reason why a message could not be processed and was pushed to the DLQ.
#[derive(Debug, o2o)]
#[o2o(from_owned(NatsPayloadDecodeError))]
pub enum Reason {
    /// The received payload doesn't match the expected proto schema.
    Parse(prost::DecodeError),

    /// The parsed payload doesn't pass the service-specific validation.
    Validate(BoxedError),

    /// The parsed and validated payload could not be processed.
    #[o2o(ghost)]
    Process(BoxedError),

    /// There is no function registered for this subject.
    ///
    /// This is most likely a mismatch between the service's code and consumer config.
    #[o2o(ghost)]
    UnknownSubject,

    /// Message had an invalid reply subject.
    ///
    /// TL;DR: NATS should not do that!?
    ///
    /// A core NATS message has a reply subject which can be used to model request-response patterns.
    ///
    /// Jetstream is a protocol built on top of core NATS.
    /// It uses reply subjects to implement internal details the normal user would offload to the SDK.
    /// Namely, acknowledgments are implemented as core messages published to the jetstream message's reply subject.
    ///
    /// That's why `OutboundMessage` contains a `reply_subject` field but `jetstream::OutboundMessage` does not.
    /// The NATS server will set the reply subject for each delivery of the message to a consumer with a unique value
    /// to track the acknowledgment of the specific delivery.
    ///
    /// This also means a message received from a jetstream consumer should always have a reply subject
    /// and the reply subject should match always match the [expected structure](https://docs.nats.io/reference/reference-protocols/nats_api_reference#acknowledging-messages).
    ///
    /// So, this error should never happen unless our NATS server / SDK is being weird.
    #[o2o(ghost)]
    InvalidReply(BoxedError),

    /// The handler function for the NATS message exceeded its time limit and was canceled.
    #[o2o(ghost)]
    HandlerTimeout(Duration),
}

impl Reason {
    /// Retrieves the variant as string
    ///
    /// This string is used for logging and to build the actual subject under which to publish.
    pub fn kind(&self) -> &'static str {
        match self {
            Reason::Parse(_) => "parse",
            Reason::Validate(_) => "validate",
            Reason::Process(_) => "process",
            Reason::UnknownSubject => "unknown-subject",
            Reason::InvalidReply(_) => "invalid-reply",
            Reason::HandlerTimeout(_) => "timeout",
        }
    }
}
