//! Writing gRPC clients
//!
//! # Rough how-to
//! Use [`Channel`] as the transport for any tonic-generated client. It wraps a lazy
//! [`tonic::transport::Channel`] and injects the current tracing span into every outgoing
//! request so traces propagate across service boundaries.
//!
//! `connect_lazy` is used so that a missing or unreachable endpoint during `pre_init` / `init`
//! does not prevent the service from starting. The actual TCP connection is deferred to the
//! first call.
//!
//! ## Usage example
//!
//! ```text
//! use galvyn::core::InitError;
//! use galvyn::core::Module;
//! use galvyn::core::PreInitError;
//! use service_bootstrap::grpc::client::Channel;
//! use tonic::transport::Uri;
//!
//! use crate::proto::my_service::MyServiceClient;
//!
//! pub struct MyRpcClient {
//!     pub client: MyServiceClient<Channel>,
//! }
//!
//! impl Module for MyRpcClient {
//!     type Setup = Uri; // pass the target URI from config
//!     type PreInit = Self;
//!
//!     async fn pre_init(uri: Self::Setup) -> Result<Self::PreInit, PreInitError> {
//!         Ok(Self {
//!             client: MyServiceClient::new(Channel::connect_lazy(uri)),
//!         })
//!     }
//!
//!     type Dependencies = ();
//!
//!     async fn init(pre_init: Self::PreInit, (): &mut Self::Dependencies) -> Result<Self, InitError> {
//!         Ok(pre_init)
//!     }
//! }
//! ```

use std::task::Context;
use std::task::Poll;

use galvyn::core::re_exports::tracing_opentelemetry::OpenTelemetrySpanExt;
use galvyn::tracing::opentelemetry::context_to_headers;
use http::Uri;
use tonic::Request;
use tonic::Status;
use tonic::client::GrpcService;
use tonic::codegen::InterceptedService;
use tonic::service::Interceptor;
use tonic::transport::Channel as CoreChannel;
use tonic::transport::Endpoint;
use tracing::Span;

/// gRPC channel wrapper that adds tracing context to outgoing gRPC requests.
#[derive(Clone, Debug)]
pub struct Channel(WrappedChannel);

impl Channel {
    /// Create a channel for `uri` and configure it to add tracing context to outgoing requests.
    ///
    /// The channel returned by this method does not attempt to connect to the endpoint until first use.
    pub fn connect_lazy(uri: Uri) -> Self {
        Self(InterceptedService::new(
            Endpoint::from(uri).connect_lazy(),
            Middleware,
        ))
    }
}

/// gRPC middleware that adds tracing context to outgoing requests.
#[derive(Copy, Clone, Debug)]
pub struct Middleware;
impl Interceptor for Middleware {
    fn call(&mut self, mut request: Request<()>) -> Result<Request<()>, Status> {
        request
            .metadata_mut()
            .as_mut()
            .extend(context_to_headers(&Span::current().context()));
        Ok(request)
    }
}

type WrappedChannel = InterceptedService<CoreChannel, Middleware>;
impl<T> GrpcService<T> for Channel
where
    WrappedChannel: GrpcService<T>,
{
    type ResponseBody = <WrappedChannel as GrpcService<T>>::ResponseBody;
    type Error = <WrappedChannel as GrpcService<T>>::Error;
    type Future = <WrappedChannel as GrpcService<T>>::Future;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.0.poll_ready(cx)
    }

    fn call(&mut self, request: http::Request<T>) -> Self::Future {
        self.0.call(request)
    }
}
