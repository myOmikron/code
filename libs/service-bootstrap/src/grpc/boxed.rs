//! Type aliases / newtypes for `Box<dyn Trait>`s.

use std::fmt;
use std::pin::Pin;
use std::task::Context;
use std::task::Poll;

use futures::Stream;

/// A boxed std error
pub type BoxedError = Box<dyn std::error::Error + Send + Sync + 'static>;

/// A boxed stream of grpc bodies.
///
/// The actual item type is `Result<T, tonic::Status>`.
///
/// This is a newtype because the alias caused weird lifetime issues.
pub struct BoxedStream<T> {
    boxed: Pin<Box<dyn Stream<Item = Result<T, tonic::Status>> + Send + 'static>>,
}

impl<T> Unpin for BoxedStream<T> {}

impl<T> BoxedStream<T> {
    /// Constructs a new `BoxedStream`
    pub fn new(stream: impl Stream<Item = Result<T, tonic::Status>> + Send + 'static) -> Self {
        Self {
            boxed: Box::pin(stream),
        }
    }
}

impl<T> Stream for BoxedStream<T> {
    type Item = Result<T, tonic::Status>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.boxed.as_mut().poll_next(cx)
    }
}

impl<T> fmt::Debug for BoxedStream<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_fmt(format_args!("BoxedStream<{}>", std::any::type_name::<T>()))
    }
}
