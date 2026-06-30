//! Types copied from [`async_nats`] with a generic payload.

use async_nats::HeaderMap;
use async_nats::Subject;
use async_nats::jetstream::message::OutboundMessage;
use o2o::o2o;

use crate::nats::NatsPayload;

/// An outbound message to be published.
///
/// Does not contain status or description which are valid only for inbound messages.
///
/// This type is a copy of [`OutboundMessage`] but with a decoded `T` as payload.
#[derive(Clone, Debug, o2o)]
#[o2o(owned_into(OutboundMessage))]
#[o2o(where_clause(T: NatsPayload))]
pub struct TypedOutboundMessage<T> {
    /// The subject the message should be published to.
    pub subject: Subject,

    /// The message's payload
    #[o2o(into(NatsPayload::encode(~)))]
    pub payload: T,

    /// Optional headers
    ///
    /// This concept is similar to HTTP headers.
    /// It differs in some technical details and has other predefined.
    pub headers: Option<HeaderMap>,
}
