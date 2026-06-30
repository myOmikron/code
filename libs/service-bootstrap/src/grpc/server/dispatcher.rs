//! Boilerplate to process a grpc request using an async closure.
//!
//! See [`Dispatcher`].

use std::convert::Infallible;
use std::marker::PhantomData;
use std::sync::Arc;

use async_nats::Subject;
use futures::TryStreamExt;
use galvyn::core::Module;
use http::Request as HttpRequest;
use http::Response as HttpResponse;
use http_body::Body as HttpBody;
use prost::bytes::Bytes;
use prost_types::Timestamp;
use time::OffsetDateTime;
use tonic::Request as TonicRequest;
use tonic::Response as TonicResponse;
use tonic::Status;
use tonic::Streaming;
use tonic::body::Body as TonicBody;
use tonic::codec::EnabledCompressionEncodings;
use tonic::codegen::StdError;
use tonic::server::ClientStreamingService;
use tonic::server::Grpc;
use tonic::server::ServerStreamingService;
use tonic::server::StreamingService;
use tonic::server::UnaryService;
use tonic_prost::ProstCodec;
use tonic_prost::prost::Message;
use tracing::warn;

use crate::grpc::boxed::BoxedError;
use crate::grpc::boxed::BoxedStream;
use crate::nats::publisher::Nats;
use crate::nats::publisher::dlq_proto;

/// Config for [`Dispatcher`]
#[derive(Debug, Default, Copy, Clone)]
pub struct DispatchConfig {
    /// Compression encodings the server accepts in requests.
    pub accept_encodings: EnabledCompressionEncodings,

    /// Compression encodings the server offers for responses.
    pub send_encodings: EnabledCompressionEncodings,

    /// Sets the maximum size of a single message in requests.
    pub max_decoding_message_size: Option<usize>,

    /// Sets the maximum size of a single message in responses.
    pub max_encoding_message_size: Option<usize>,
}

/// Boilerplate to process a grpc request using an async closure.
///
/// It is a thin wrapper around `tonic`'s [`Grpc`].
/// The API is tailored to be easy to use from the code generator.
pub struct Dispatcher<Req, Res, RawReq, RawRes> {
    inner: Grpc<ProstCodec<RawRes, RawReq>>,
    phantom: PhantomData<(Req, Res)>,
}
impl<Req, Res, RawReq, RawRes> Default for Dispatcher<Req, Res, RawReq, RawRes>
where
    Req: TryFrom<RawReq, Error: Into<BoxedError>> + Send + 'static,
    Res: Into<RawRes> + Send + 'static,
    RawReq: Message + Default + Send + 'static,
    RawRes: Message + Send + 'static,
{
    fn default() -> Self {
        Self::new(DispatchConfig::default())
    }
}

impl<Req, Res, RawReq, RawRes> Dispatcher<Req, Res, RawReq, RawRes>
where
    Req: TryFrom<RawReq, Error: Into<BoxedError>> + Send + 'static,
    Res: Into<RawRes> + Send + 'static,
    RawReq: Message + Default + Send + 'static,
    RawRes: Message + Send + 'static,
{
    /// Constructs a new `Dispatcher` for a given config.
    pub fn new(config: DispatchConfig) -> Self {
        Self {
            inner: Grpc::new(ProstCodec::new())
                .apply_compression_config(config.accept_encodings, config.send_encodings)
                .apply_max_message_size_config(
                    config.max_decoding_message_size,
                    config.max_encoding_message_size,
                ),
            phantom: PhantomData,
        }
    }

    /// Processes a single gRPC call, neither request nor response is streamed.
    pub async fn dispatch_unary<Body, Handler, Fut>(
        mut self,
        request: HttpRequest<Body>,
        handler: Handler,
    ) -> Result<HttpResponse<TonicBody>, Infallible>
    where
        Handler: FnOnce(TonicRequest<Req>) -> Fut + Clone + Send + 'static,
        Fut: Future<Output = Result<TonicResponse<Res>, Status>> + Send + 'static,
        Body: HttpBody + Send + 'static,
        Body::Error: Into<StdError> + Send + 'static,
    {
        Ok(self
            .inner
            .unary(
                Wrapper(move |raw_request: TonicRequest<RawReq>| async move {
                    let request = try_map_request(raw_request).await?;
                    Ok(map_response(handler(request).await?))
                }),
                request,
            )
            .await)
    }

    /// Processes a single gRPC call, request is streamed.
    pub async fn dispatch_client_streaming<Body, Handler, Fut>(
        mut self,
        request: HttpRequest<Body>,
        handler: Handler,
    ) -> Result<HttpResponse<TonicBody>, Infallible>
    where
        Handler: FnOnce(TonicRequest<BoxedStream<Req>>) -> Fut + Clone,
        Fut: Future<Output = Result<TonicResponse<Res>, Status>> + Send + 'static,
        Body: HttpBody + Send + 'static,
        Body::Error: Into<StdError> + Send + 'static,
    {
        Ok(self
            .inner
            .client_streaming(
                Wrapper(move |raw_request| {
                    let future = handler(map_streamed_request(raw_request));
                    async move { future.await.map(map_response) }
                }),
                request,
            )
            .await)
    }

    /// Processes a single gRPC call, response is streamed.
    pub async fn dispatch_server_streaming<Body, Handler, Fut>(
        mut self,
        request: HttpRequest<Body>,
        handler: Handler,
    ) -> Result<HttpResponse<TonicBody>, Infallible>
    where
        Handler: FnOnce(TonicRequest<Req>) -> Fut + Clone + Send + 'static,
        Fut: Future<Output = Result<TonicResponse<BoxedStream<Res>>, Status>> + Send + 'static,
        Body: HttpBody + Send + 'static,
        Body::Error: Into<StdError> + Send + 'static,
    {
        Ok(self
            .inner
            .server_streaming(
                Wrapper(move |raw_request: TonicRequest<RawReq>| async move {
                    let request = try_map_request(raw_request).await?;
                    Ok(map_streamed_response(handler(request).await?))
                }),
                request,
            )
            .await)
    }

    /// Processes a single gRPC call, both request and response are streamed.
    pub async fn dispatch_streaming<Body, Handler, Fut>(
        mut self,
        request: HttpRequest<Body>,
        handler: Handler,
    ) -> Result<HttpResponse<TonicBody>, Infallible>
    where
        Handler: FnOnce(TonicRequest<BoxedStream<Req>>) -> Fut + Clone + Send,
        Fut: Future<Output = Result<TonicResponse<BoxedStream<Res>>, Status>> + Send + 'static,
        Body: HttpBody + Send + 'static,
        Body::Error: Into<StdError> + Send + 'static,
    {
        Ok(self
            .inner
            .streaming(
                Wrapper(move |raw_request: TonicRequest<Streaming<RawReq>>| {
                    let future = handler(map_streamed_request(raw_request));
                    async move { future.await.map(map_streamed_response) }
                }),
                request,
            )
            .await)
    }
}

/// Converts an async `FnOnce + Clone` into a service expected by [`Grpc`]
pub struct Wrapper<T>(pub T);

impl<Req, Res, Handler, Fut> UnaryService<Req> for Wrapper<Handler>
where
    Handler: FnOnce(TonicRequest<Req>) -> Fut + Clone,
    Fut: Future<Output = Result<TonicResponse<Res>, Status>> + Send + 'static,
{
    type Response = Res;
    type Future = Fut;

    fn call(&mut self, request: TonicRequest<Req>) -> Self::Future {
        let inner = self.0.clone();
        inner(request)
    }
}

impl<Req, Res, Handler, Fut> ClientStreamingService<Req> for Wrapper<Handler>
where
    Handler: FnOnce(TonicRequest<Streaming<Req>>) -> Fut + Clone,
    Fut: Future<Output = Result<TonicResponse<Res>, Status>> + Send + 'static,
{
    type Response = Res;
    type Future = Fut;

    fn call(&mut self, request: TonicRequest<Streaming<Req>>) -> Self::Future {
        let inner = self.0.clone();
        inner(request)
    }
}

impl<Req, Res, Handler, Fut> ServerStreamingService<Req> for Wrapper<Handler>
where
    Handler: FnOnce(TonicRequest<Req>) -> Fut + Clone,
    Fut: Future<Output = Result<TonicResponse<BoxedStream<Res>>, Status>> + Send + 'static,
{
    type Response = Res;
    type ResponseStream = BoxedStream<Res>;
    type Future = Fut;

    fn call(&mut self, request: TonicRequest<Req>) -> Self::Future {
        let inner = self.0.clone();
        inner(request)
    }
}

impl<Req, Res, Handler, Fut> StreamingService<Req> for Wrapper<Handler>
where
    Handler: FnOnce(TonicRequest<Streaming<Req>>) -> Fut + Clone,
    Fut: Future<Output = Result<TonicResponse<BoxedStream<Res>>, Status>> + Send + 'static,
{
    type Response = Res;
    type ResponseStream = BoxedStream<Res>;
    type Future = Fut;

    fn call(&mut self, request: TonicRequest<Streaming<Req>>) -> Self::Future {
        let inner = self.0.clone();
        inner(request)
    }
}

async fn try_map_request<Req, Raw>(
    raw_request: TonicRequest<Raw>,
) -> Result<TonicRequest<Req>, Status>
where
    Req: TryFrom<Raw, Error: Into<BoxedError>> + Send + 'static,
    Raw: prost::Message,
{
    let (meta, ext, raw_body) = raw_request.into_parts();
    let body = try_map_request_body(raw_body).await?;
    Ok(TonicRequest::from_parts(meta, ext, body))
}

fn map_streamed_request<Req, Raw>(
    raw_request: TonicRequest<Streaming<Raw>>,
) -> TonicRequest<BoxedStream<Req>>
where
    Req: TryFrom<Raw, Error: Into<BoxedError>> + Send + 'static,
    Raw: prost::Message + Send + 'static,
{
    let (meta, ext, raw_body) = raw_request.into_parts();
    let body = BoxedStream::new(raw_body.and_then(try_map_request_body));
    TonicRequest::from_parts(meta, ext, body)
}

fn map_response<Res, Raw>(response: TonicResponse<Res>) -> TonicResponse<Raw>
where
    Res: Into<Raw>,
{
    let (meta, body, ext) = response.into_parts();
    let raw_body = Res::into(body);
    TonicResponse::from_parts(meta, raw_body, ext)
}

fn map_streamed_response<Res, Raw>(
    response: TonicResponse<BoxedStream<Res>>,
) -> TonicResponse<BoxedStream<Raw>>
where
    Res: Into<Raw> + 'static,
    Raw: 'static,
{
    let (meta, body, ext) = response.into_parts();
    let raw_body = BoxedStream::new(body.map_ok(Res::into));
    TonicResponse::from_parts(meta, raw_body, ext)
}

fn try_map_request_body<Req, Raw>(
    raw_body: Raw,
) -> impl Future<Output = Result<Req, Status>> + Send + 'static
where
    Req: TryFrom<Raw, Error: Into<BoxedError>> + Send + 'static,
    Raw: prost::Message,
{
    let raw_bytes = raw_body.encode_to_vec();

    let result = match Req::try_from(raw_body) {
        Ok(body) => Ok(body),
        Err(error) => Err(error.into()),
    };

    async move {
        match result {
            Ok(body) => Ok(body),
            Err(error) => {
                let now = OffsetDateTime::now_utc();

                let subject = Subject::from("dlq.grpc");
                let payload = dlq_proto::DeadLetterQueueItem {
                    subject: "dlq.grpc".to_string(),
                    payload: Bytes::from(raw_bytes),
                    headers: Vec::new(),
                    reason: dlq_proto::DlqReason::Validate as i32,
                    reason_details: error.to_string(),
                    pushed_at: Some(Timestamp {
                        seconds: now.unix_timestamp(),
                        nanos: 0,
                    }),
                };

                let result = Nats::global().publish(subject, payload).await;

                if let Err(error) = result {
                    warn!(error.debug = ?error, error.display = %error,"Failed to push grpc request to dlq");
                }

                let mut status = Status::invalid_argument(
                    "Message doesn't match the domain-specific constraints. It has been pushed to dlq.",
                );
                status.set_source(Arc::from(error));
                Err(status)
            }
        }
    }
}
