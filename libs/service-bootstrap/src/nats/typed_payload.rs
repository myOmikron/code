//! Trait for the generic payload of typed messages

use galvyn::core::re_exports::axum::body::Bytes;
use prost::Message;
use thiserror::Error;

use crate::nats::BoxedError;

/// A struct used as payload for NATS messages.
///
/// In our architecture, messages carry protobuf encoded payloads.
/// This trait is (auto-implemented) for any protobuf struct (i.e., implementing [`prost::Message`]).
///
/// Working with protobuf compatible structs can get really annoying.
/// So authors might want to create a "higher level" struct which uses rust's entire type system.
/// It is recommended to use [`o2o`] to create the conversion boilerplate
/// between your higher and the protobuf struct.
///
/// # How-to
///
/// 1. Declare messages in `.proto` files
/// 2. Auto-generate the ` prost ` struct using `service-bootstrap-build` in your `build.rs`
/// 3. Write a domain-specific rust struct matching your message and derive the conversion using `o2o`
/// 4. `impl NatPayload for YourStruct { type Proto = YourMessage; }`
///
/// ## Alternatively
///
/// Skip steps 3 and 4 and use your `prost` struct directly.
pub trait NatsPayload
where
    Self: Send + Sync + 'static,
    Self: TryFrom<Self::Proto, Error: Into<BoxedError>>,
    Self: Into<Self::Proto>,
{
    /// Protobuf compatible struct storing the payload
    type Proto: prost::Message + Default;

    /// Encodes `self` into bytes.
    fn encode(self) -> Bytes {
        Bytes::from(self.into().encode_to_vec())
    }

    /// Decodes `Self` from bytes.
    fn decode(bytes: Bytes) -> Result<Self, NatsPayloadDecodeError> {
        let proto = <Self::Proto as prost::Message>::decode(bytes)
            .map_err(NatsPayloadDecodeError::Parse)?;
        Self::try_from(proto).map_err(|error| NatsPayloadDecodeError::Validate(error.into()))
    }
}

// Auto-implement NatsPayload for any struct implementing prost::Message
#[diagnostic::do_not_recommend]
impl<T> NatsPayload for T
where
    Self: Send + Sync + 'static,
    Self: TryFrom<Self, Error: Into<BoxedError>>,
    Self: prost::Message + Default,
{
    type Proto = Self;
}

/// Error returned by [`NatsPayload::decode`]
#[derive(Debug, Error)]
pub enum NatsPayloadDecodeError {
    /// The bytes don't match the expected proto schema.
    #[error(transparent)]
    Parse(prost::DecodeError),

    /// The parsed bytes don't pass the service-specific validation.
    #[error(transparent)]
    Validate(BoxedError),
}
