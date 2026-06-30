//! Types copied from [`async_nats`] with a generic payload.

use std::ops::Deref;

use async_nats::Message;
use async_nats::jetstream;
use async_nats::jetstream::message::Acker;
use prost::bytes::Bytes;
use serde::Deserialize;
use serde::Serialize;

/// This type is a copy of [`jetstream::Message`] but with a decoded `T` as payload.
#[derive(Clone, Debug)]
pub struct TypedJetstreamMessage<T> {
    /// Decoded payload of the message.
    pub payload: T,

    /// Original message
    inner: jetstream::Message,
}

impl<T> Deref for TypedJetstreamMessage<T> {
    type Target = jetstream::Message;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl<T> TypedJetstreamMessage<T> {
    /// Splits `TypedJetstreamMessage` into `Acker` and `TypedMessage`.
    pub fn split(self) -> (TypedMessage<T>, Acker) {
        let (inner, acker) = self.inner.split();
        (
            TypedMessage {
                payload: self.payload,
                inner,
            },
            acker,
        )
    }
}

/// A Core NATS message with a decoded payload.
///
/// This type is a copy of [`Message`] but with a decoded `T` as payload.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TypedMessage<T> {
    /// Decoded payload of the message.
    pub payload: T,

    /// Original message
    inner: Message,
}

impl<T> Deref for TypedMessage<T> {
    type Target = Message;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl<T> TypedMessage<T> {
    /// Access the message's original raw payload
    pub fn original_payload(&self) -> Bytes {
        self.inner.payload.clone()
    }

    /// Parses a `Message`'s protobuf encoded payload
    pub fn try_from_proto(msg: Message) -> Result<Self, prost::DecodeError>
    where
        T: prost::Message + Default,
    {
        Ok(Self {
            payload: T::decode(msg.payload.clone())?,
            inner: msg,
        })
    }

    /// Refines an already parsed payload into a stricter type
    pub fn try_map<U>(self) -> Result<TypedMessage<U>, T::Error>
    where
        T: TryInto<U>,
    {
        Ok(TypedMessage {
            payload: self.payload.try_into()?,
            inner: self.inner,
        })
    }
}

impl<T> TypedJetstreamMessage<T> {
    /// Access the message's original raw payload
    pub fn original_payload(&self) -> Bytes {
        self.inner.payload.clone()
    }

    /// Parses a `Message`'s protobuf encoded payload
    pub fn try_from_proto(msg: jetstream::Message) -> Result<Self, prost::DecodeError>
    where
        T: prost::Message + Default,
    {
        Ok(Self {
            payload: T::decode(msg.payload.clone())?,
            inner: msg,
        })
    }
    /// Refines an already parsed payload into a stricter type
    pub fn try_map<U>(self) -> Result<TypedJetstreamMessage<U>, T::Error>
    where
        T: TryInto<U>,
    {
        Ok(TypedJetstreamMessage {
            payload: self.payload.try_into()?,
            inner: self.inner,
        })
    }
}
