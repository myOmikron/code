//! Re-exports for codegen

use std::sync::LazyLock;

pub use galvyn::core::handler::GalvynHandler;
pub use galvyn::core::handler::HandlerMeta;
pub use galvyn::core::handler::request_body::RequestBodyMetadata;
pub use galvyn::core::handler::response_body::ResponseBodyMetadata;
pub use galvyn::core::re_exports::axum::extract::Extension;
pub use galvyn::core::re_exports::axum::extract::Request as AxumRequest;
pub use galvyn::core::re_exports::axum::http::Method;
pub use galvyn::core::re_exports::axum::http::StatusCode;
pub use galvyn::core::re_exports::axum::routing::MethodRouter;
pub use galvyn::core::re_exports::axum::routing::any;
use galvyn::core::re_exports::mime::Mime;
pub use galvyn::core::router::GalvynRouter;

pub use crate::grpc::GrpcRequest;
pub use crate::grpc::GrpcResponse;
pub use crate::grpc::GrpcStatus;
pub use crate::grpc::GrpcStatusCode;
pub use crate::grpc::boxed::BoxedError;
pub use crate::grpc::boxed::BoxedStream;
pub use crate::grpc::server::GrpcService;
pub use crate::grpc::server::dispatcher::DispatchConfig;
pub use crate::grpc::server::dispatcher::Dispatcher;

pub static MIME_APPLICATION_GRPC: LazyLock<Mime> =
    LazyLock::new(|| "application/grpc+proto".parse().unwrap());
