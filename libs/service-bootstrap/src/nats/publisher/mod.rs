//! Utilities for writing a publisher which produces NATS messages.

pub use crate::nats::publisher::module::Nats;
pub use crate::nats::publisher::module::NatsSetup;
pub use crate::nats::publisher::typed_message::TypedOutboundMessage;

mod module;
mod publish;
mod typed_message;

/// Raw protobuf definitions for the dead letter queue
pub mod dlq_proto {
    include!(concat!(env!("OUT_DIR"), "/common.dlq.rs"));
}
