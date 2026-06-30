//! Utilities for writing a listener consuming NATS messages or a publisher producing them.
//!
//! # Publisher
//!
//! A "publisher" refers to a service publishing NATS messages.
//!
//! Start writing a server by adding the [`Nats`] module to your galvyn instance.
//!
//! It is basically a "client" sending requests / messages to a "server".
//! However, this nomenclature clashes because every service interacting with *the* NATS server is a client.
//!
//! # Listener
//!
//! A "listener" refers to a service consuming NATS messages.
//!
//! Start writing a server by adding the [`Nats`] and [`NatsListener`] modules to your galvyn instance.
//!
//! # Nomenclature
//!
//! *(Why those names?)*
//!
//! A publisher behaves like a client, and a listener behaves like a server in the common network nomenclature.
//! However, this clashes with NATS because every service interacting with *the* NATS server is a client.
//!
//! Furthermore, the name "consumer" is already used in NATS for a specific construct.
//! Most often, a listener will correspond one-to-one to a consumer, but their two distinct things
//! which should have two distinct names.
#![warn(clippy::missing_docs_in_private_items)]

pub use crate::nats::typed_payload::NatsPayload;
pub use crate::nats::typed_payload::NatsPayloadDecodeError;

pub mod listener;
mod opentelemetry;
pub mod publisher;
mod typed_payload;

/// Your average boxed std error.
pub type BoxedError = Box<dyn std::error::Error + Send + Sync + 'static>;
