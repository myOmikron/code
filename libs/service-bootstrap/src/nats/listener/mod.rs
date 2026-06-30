//! Utilities for writing a listener which consumes NATS messages.

pub use crate::nats::listener::handler::DontAck;
pub use crate::nats::listener::handler::NatsHandler;
pub use crate::nats::listener::module::NatsListener;
pub use crate::nats::listener::module::NatsListenerSetup;
pub use crate::nats::listener::module::RouteConfig;
pub use crate::nats::listener::owned_info::OwnedInfo;
pub use crate::nats::listener::retry::RetryStrategy;
pub use crate::nats::listener::typed_message::TypedJetstreamMessage;
pub use crate::nats::listener::typed_message::TypedMessage;

mod dlq;
mod handler;
mod module;
mod owned_info;
mod retry;
mod typed_message;
