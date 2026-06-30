//! A function that handles NATS messages for a specific subject.

use crate::nats::BoxedError;
use crate::nats::NatsPayload;
use crate::nats::listener::owned_info::OwnedInfo;
use crate::nats::listener::typed_message::TypedMessage;

pub(crate) mod boxed;

/// A function that handles NATS messages for a specific subject.
///
/// It is used in combination with the [`NatsListener`] and its [`SubjectRouter`]
///
/// # Auto-implemented
/// for functions and closures with the matching signature.
///
/// [`NatsListener`]: crate::nats::listener::NatsListener
/// [`SubjectRouter`]: crate::nats::listener::SubjectRouter
pub trait NatsHandler<T: NatsPayload>: Send + Sync + 'static {
    /// Async function handling a NATS message.
    ///
    /// Returns `Ok` to acknowledge the message as processed successfully.
    /// The `Err` variant's `DontAck` enum contains various alternative "acknowledgements".
    ///
    /// Clean signature:
    /// ```
    /// # use service_bootstrap::nats::NatsPayload;
    /// # use service_bootstrap::nats::listener::DontAck;
    /// # use service_bootstrap::nats::listener::NatsHandler;
    /// # use service_bootstrap::nats::listener::TypedMessage;
    /// # use service_bootstrap::nats::listener::OwnedInfo;
    /// async fn handle_message<T>(info: OwnedInfo, msg: TypedMessage<T>) -> Result<(), DontAck> {
    ///     Ok(())
    /// }
    /// # fn test_outer<T: NatsPayload>() {
    /// #     fn test_inner<T: NatsPayload>(handler: impl NatsHandler<T>) {}
    /// #     test_inner(handle_message::<T>);
    /// # }
    /// ```
    fn handle(
        &self,
        info: OwnedInfo,
        msg: TypedMessage<T>,
    ) -> impl Future<Output = Result<(), DontAck>> + Send + 'static;
}

/// The `Err` return of a [`NatsHandler`]
///
/// It lists various unsuccessful acknowledgements.
pub enum DontAck {
    /// Retry the message in accordance with the route's [`RetryStrategy`](crate::nats::listener::RetryStrategy).
    ///
    /// (If you haven't specified a `RetryStrategy`, `Default` has been used.)
    ///
    /// When the message is retired, the error will be `info!` logged.
    /// Once the message has been retired too often, the error will be `error!` logged and send to the dlq.
    Retry(BoxedError),

    /// Permanent failure or retries exhausted — send to DLQ and ack.
    Dlq(BoxedError),
}

impl DontAck {
    /// Constructs a [`DontAck::Retry`] converting the error
    pub fn retry(error: impl Into<BoxedError>) -> Self {
        Self::Retry(error.into())
    }

    /// Constructs a [`DontAck::Dlq`] converting the error
    pub fn dlq(error: impl Into<BoxedError>) -> Self {
        Self::Dlq(error.into())
    }
}

impl<Func, Fut, Pay> NatsHandler<Pay> for Func
where
    Func: Send + Sync + 'static,
    Func: Fn(OwnedInfo, TypedMessage<Pay>) -> Fut,
    Fut: Future<Output = Result<(), DontAck>> + Send + 'static,
    Pay: NatsPayload,
{
    fn handle(
        &self,
        info: OwnedInfo,
        msg: TypedMessage<Pay>,
    ) -> impl Future<Output = Result<(), DontAck>> + Send + 'static {
        self(info, msg)
    }
}
