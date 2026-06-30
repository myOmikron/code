//! "`Box<dyn NatsHandler>`" for internal usage

use std::pin::Pin;

use async_nats::Message;
use o2o::o2o;

use crate::nats::BoxedError;
use crate::nats::listener::dlq;
use crate::nats::listener::handler::DontAck;
use crate::nats::listener::handler::NatsHandler;
use crate::nats::listener::owned_info::OwnedInfo;
use crate::nats::listener::typed_message::TypedMessage;
use crate::nats::typed_payload::NatsPayload;

/// Boxes a `NatsHandler` handling the generic payload parsing which is not dyn compatible.
pub fn box_handler<T: NatsPayload>(handler: impl NatsHandler<T>) -> BoxedHandler {
    Box::new(move |info, msg| {
        let handler = &handler;

        let parse_result = TypedMessage::<T::Proto>::try_from_proto(msg)
            .map_err(dlq::Reason::Parse)
            .and_then(|msg| {
                msg.try_map::<T>()
                    .map_err(|error| dlq::Reason::Validate(error.into()))
            })
            .map_err(ExtendedDontAck::Dlq);

        let future_or_error = parse_result.map(move |msg| handler.handle(info, msg));
        Box::pin(async move { future_or_error?.await.map_err(ExtendedDontAck::from) })
    })
}
/// "`Box<dyn NatsHandler>`" returned by [`box_handler`]
///
/// [`NatsHandler`] itself is generic and not `dyn` compatible.
pub type BoxedHandler = Box<dyn Fn(OwnedInfo, Message) -> BoxedFuture + Send + Sync + 'static>;

/// Boxed future returned by [`BoxedHandler`]
pub type BoxedFuture = Pin<Box<dyn Future<Output = Result<(), ExtendedDontAck>> + Send + 'static>>;

/// An extended version of [`DontAck`] which contains additional variants introduced by [`box_handler`]
#[derive(o2o)]
#[from_owned(DontAck)]
pub enum ExtendedDontAck {
    /// [`DontAck::Retry`]
    Retry(BoxedError),

    /// [`DontAck::Dlq`]
    Dlq(#[from(dlq::Reason::Process(~))] dlq::Reason),
}
