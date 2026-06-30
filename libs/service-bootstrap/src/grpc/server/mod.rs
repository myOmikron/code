//! Writing grpc servers
//!
//! # Rough how-to
//! You spawn your [`GrpcServer`] as a `galvyn` module.
//!
//! The [`GrpcServerSetup`] requires an address to bind on,
//! and implementations of the grpc services to expose.
//!
//! Configure your build script to process all `.proto` files which contain services you want to implement.
//!
//! It will produce structs in the shape of
//! ```text
//! struct <ServiceName>Server {
//!     <method_name>: <fn with correct signature>
//! }
//! ```
//!
//! You instantiate those structs with your handler functions and pass them to [`GrpcServerSetup::add_service`](GrpcServerSetup::add_service).

use galvyn::core::GalvynRouter;
pub use module::GrpcServer;
pub use module::GrpcServerSetup;

#[doc(hidden)]
pub mod codegen;
pub mod dispatcher;
mod module;
pub(crate) mod tracing;

/// Implementation of a grpc service
///
/// **You should not implement this trait yourself.**
/// The server structs produced by the build script will implement this trait.
///
/// See [module](self) docs
pub trait GrpcService {
    /// The full name of the grpc service (including its package path)
    ///
    /// Example: `com.example.MyService`
    const FULL_NAME: &'static str;

    /// Converts this implementation into a `GalvynRouter`.
    ///
    /// It should only handle the methods' subroutes.
    ///
    /// In gRPC each method call is a http2 request to the path `/<package>.<service>/<method>`.
    /// This router should only handle the `/<method>` part.
    fn into_router(self) -> GalvynRouter;
}
