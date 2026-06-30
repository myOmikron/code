//! Grpc implementation on top of [`tonic`] tailored to our needs
//!
//! See [`client`] or [`server`] for how to get started.

pub use tonic::Code as GrpcStatusCode;
pub use tonic::Request as GrpcRequest;
pub use tonic::Response as GrpcResponse;
pub use tonic::Status as GrpcStatus;

/// Re-exports of "internal" crates
pub mod re_export {
    pub use tonic;
    pub use tonic_prost;
}

pub mod boxed;
pub mod client;
pub mod server;
