//! Galvyn [`Module`] which starts background tasks for handling NATS messages.

use std::collections::HashMap;
use std::collections::hash_map::Entry;
use std::fmt;
use std::future;
use std::pin::pin;
use std::sync::Mutex;
use std::time::Duration;

use async_nats::jetstream;
use async_nats::jetstream::AckKind;
use async_nats::jetstream::consumer;
use async_nats::jetstream::consumer::Consumer;
use async_nats::jetstream::consumer::pull;
use async_nats::jetstream::message::Acker;
use futures::Stream;
use galvyn::core::InitError;
use galvyn::core::Module;
use galvyn::core::PostInitError;
use galvyn::core::PreInitError;
use galvyn::core::modules::shutdown::Shutdown;
use galvyn::core::re_exports::tracing_opentelemetry::OpenTelemetrySpanExt;
use nats_subjects::SubjectPattern;
use prometheus::register_int_counter_vec;
use tokio::select;
use tracing::Instrument;
use tracing::error;
use tracing::info;
use tracing::info_span;
use tracing::warn;

use crate::nats::NatsPayload;
use crate::nats::listener::RetryStrategy;
use crate::nats::listener::dlq;
use crate::nats::listener::dlq::Reason::HandlerTimeout;
use crate::nats::listener::handler::NatsHandler;
use crate::nats::listener::handler::boxed::BoxedHandler;
use crate::nats::listener::handler::boxed::ExtendedDontAck;
use crate::nats::listener::handler::boxed::box_handler;
use crate::nats::listener::owned_info::OwnedInfo;
use crate::nats::listener::retry::RetryContext;
use crate::nats::listener::retry::RetryResult;
use crate::nats::opentelemetry::headers_to_context;
use crate::nats::publisher::Nats;

/// Maximum number of consecutive pull errors before shutting down.
const MAX_CONSECUTIVE_PULL_ERRORS: usize = 10; // Value is arbitrary

/// Default timeout for NATS handler functions before canceling
/// the function and sending the payload to the DLQ
// TODO: define a sane default timeout for all projects (currently 12 seconds)
const DEFAULT_NATS_HANDLER_TIMEOUT: Duration = Duration::from_secs(12);

/// Maximum number of messages async-nats may prefetch into its client-side
/// buffer ahead of the one currently being processed.
///
/// Defaults to `1`, which gives strict work-queue semantics: the next
/// message is only pulled once the current one is acked. Raise this for
/// higher throughput when handlers are fast and uniform.
///
/// This is a per-consumer setting, you must consider the slowest possible
/// subject handler in calculating a higher value here.
///
/// # Why the default is 1
///
/// `consumer.stream().messages()` is a *prefetching* streamer — it issues
/// `batch=N` pulls in the background to keep `.next()` instant. async-nats
/// does **not** track per-message `ack_wait` deadlines client-side: stale
/// items are never dropped, you get whatever the server delivered.
///
/// `ProgressAcker` only keeps the *currently processing* message alive.
/// Messages queued behind it in the local buffer can silently age past
/// their `ack_wait` window, after which the server's stale-delivery check
/// drops the eventual Ack/Nak — causing redelivery cascades.
///
/// Any value above 1 is a throughput/safety tradeoff: it only holds while
/// `p99_handler_latency × prefetch < ack_wait`. With the default
/// `ack_wait = 30s` and prefetch = 30 that leaves ~1s of budget per message,
/// which is fragile. Tune up only if you've measured the slowest handler's p99
/// and have headroom.
///
/// Since right now we are not constrained in throughput at all, we just disable
/// the pre-fetching. This could in the future be configurable per-consumer (not
/// per subject)
const MAX_MESSAGES_PER_BATCH: usize = 1;

/// Galvyn [`Module`] which starts background tasks for handling NATS messages.
///
/// TODO: more docs
pub struct NatsListener {
    /// Publisher for the dead letter queue
    pub(crate) publisher: Nats,

    /// Hack to pass an argument to `post_init` from `init`
    post_init: Mutex<Option<NatsListenerPostInit>>,

    /// Prometheus metric for the number of messages processed
    metric_processed: prometheus::IntCounterVec,
}

/// Setup struct for the [`NatsListener`] module.
///
/// # Example Construction
///
/// ```
/// # use service_bootstrap::nats::NatsPayload;
/// # use service_bootstrap::nats::listener::NatsHandler;
/// # use service_bootstrap::nats::listener::NatsListenerSetup;
/// # fn wrapper<T: NatsPayload, H: NatsHandler<T>>(handler_1: H, handler_2: H) -> NatsListenerSetup {
/// NatsListenerSetup::default()
///     .add_consumer("stream-name", "consumer-name", |router| {
///         router.add_subject(nats_subjects::example::some_module::HANDLER, handler_1);
///         router.add_subject(nats_subjects::SUBJECT_PATTERN_ANY, handler_2);
///     })
/// # }
/// ```
#[derive(Debug, Default)]
pub struct NatsListenerSetup {
    /// Streams, consumers, subjects, and the handlers to use for them.
    ///
    /// This field is best populated by the [`NatsListenerSetup::add_consumer`] method.
    ///
    /// ```text
    /// let handler_function = listener[stream_name][consumer_name][subject_name];
    /// ```
    pub listener: HashMap<String, HashMap<String, SubjectRouter>>,
}

impl NatsListenerSetup {
    /// Adds a consumer to listen on.
    ///
    /// # Panics
    /// If a consumer is added twice.
    ///
    /// (Two consumers for two different streams may share the same name.)
    #[track_caller]
    pub fn add_consumer(
        mut self,
        stream: &str,
        consumer: &str,
        builder: impl FnOnce(&mut SubjectRouter),
    ) -> Self {
        match self
            .listener
            .entry(stream.to_string())
            .or_default()
            .entry(consumer.to_string())
        {
            Entry::Occupied(_) => {
                panic!("Consumer was added twice");
            }
            Entry::Vacant(entry) => {
                builder(entry.insert(SubjectRouter::default()));
            }
        }
        self
    }
}

/// A router maps NATS subjects to [`NatsHandler`].
#[derive(Default)]
pub struct SubjectRouter(matchit::Router<SubjectRoute>);

/// Route stored in [`SubjectRouter`]
struct SubjectRoute {
    /// The handler function to call for this route
    handler: BoxedHandler,

    /// `RetryStrategy` to use for this route
    retry: RetryStrategy,

    /// Maximum time the handler function is allowed to run before getting
    /// aborted and pushed to DLQ.
    ///
    /// Note that you should not rely on this and should use this as last ditch
    /// effort to catch programming faults or unexpectedly slow runs. You should
    /// specify timeouts in your e.g. HTTP calls or other places to support
    /// retrying depending on context.
    timeout: Duration,
}

/// Explicit configuration for a route
#[derive(Debug)]
pub struct RouteConfig {
    /// `RetryStrategy` to use for this route
    pub retry: RetryStrategy,

    /// Maximum time the handler function is allowed to run before getting
    /// aborted and pushed to DLQ.
    ///
    /// Note that you should not rely on this and should use this as last ditch
    /// effort to catch programming faults or unexpectedly slow runs. You should
    /// specify timeouts in your e.g. HTTP calls or other places to support
    /// retrying depending on context.
    pub timeout: Duration,
}

impl SubjectRouter {
    /// Adds a new subject to the router
    ///
    /// # Wildcards
    ///
    /// NATS' wildcard characters (`*` and `>`) are supported:
    /// - `*` may occur between two dots and matches any single segment.
    ///
    ///   For example, `foo.*.bar` matches `foo.x.bar`, `foo.xyz.bar` but not `foo.x.y.bar`, `foo.bar`
    ///
    /// - `>` may occur at the end (after its own dot) and matches any (non-zero) number of segments.
    ///
    ///   For example, `foo.>` matches `foo.x`, `foo.x.y` but not `foo`
    ///
    /// # Panics
    /// If a subject is added twice.
    #[track_caller]
    pub fn add_subject<T: NatsPayload>(
        &mut self,
        subject: impl Into<SubjectPattern>,
        handler: impl NatsHandler<T>,
    ) -> &mut Self {
        self.add_subject_with_config(subject, handler, Default::default())
    }

    /// Adds a new subject to the router using a custom route configuration
    ///
    /// Otherwise, this works just like [`Self::add_subject`].
    #[track_caller]
    pub fn add_subject_with_config<T: NatsPayload>(
        &mut self,
        subject: impl Into<SubjectPattern>,
        handler: impl NatsHandler<T>,
        config: RouteConfig,
    ) -> &mut Self {
        let route = SubjectRoute {
            handler: box_handler(handler),
            retry: config.retry,
            timeout: config.timeout,
        };
        self.0
            .insert(
                subject
                    .into()
                    .as_str()
                    .replace('.', "/")
                    .replace('*', "{x}")
                    .replace('>', "{*x}"),
                route,
            )
            .expect("Subject was added twice");
        self
    }

    /// Retrieves the handler for a given subject
    fn lookup(&self, subject: &str) -> Option<&SubjectRoute> {
        let subject = subject.replace('.', "/");
        let mtch = self.0.at(&subject).ok()?;
        Some(mtch.value)
    }
}
impl fmt::Debug for SubjectRouter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SubjectRouter").finish_non_exhaustive()
    }
}

impl Default for RouteConfig {
    fn default() -> Self {
        Self {
            timeout: DEFAULT_NATS_HANDLER_TIMEOUT,
            retry: RetryStrategy::default(),
        }
    }
}

impl Module for NatsListener {
    type Setup = NatsListenerSetup;
    type PreInit = NatsListenerSetup;

    async fn pre_init(setup: Self::Setup) -> Result<Self::PreInit, PreInitError> {
        Ok(setup)
    }

    type Dependencies = (Nats,);

    async fn init(
        setup: Self::PreInit,
        (publisher,): &mut Self::Dependencies,
    ) -> Result<Self, InitError> {
        let mut any_error = false;
        let mut fetched_consumers = Vec::new();
        for (stream_name, consumers) in setup.listener {
            match publisher.context.get_stream(&stream_name).await {
                Err(error) => {
                    any_error = true;
                    error!(
                        stream.name = stream_name,
                        error.debug = ?error,
                        error.display = %error,
                        "Failed to retrieve stream"
                    );
                }
                Ok(stream) => {
                    for (consumer_name, router) in consumers {
                        match stream.get_consumer::<pull::Config>(&consumer_name).await {
                            Err(error) => {
                                any_error = true;
                                error!(
                                    stream.name = stream_name,
                                    consumer.name = consumer_name,
                                    error.debug = ?error,
                                    error.display = %error,
                                    "Failed to retrieve consumer"
                                );
                            }
                            Ok(consumer) => {
                                fetched_consumers.push((consumer, router));
                            }
                        }
                    }
                }
            }
        }
        if any_error {
            return Err("Failed to retrieve some consumers, see previous logs".into());
        }

        Ok(Self {
            publisher: publisher.internal_clone(),
            post_init: Mutex::new(Some(NatsListenerPostInit {
                consumers: fetched_consumers,
            })),
            metric_processed: register_int_counter_vec!(
                "svcbs_nats_listener_messages_total",
                "Number of messages the `NatsListener` received and processed\n\nRetried message are not de-duplicated",
                &["result"]
            )?,
        })
    }

    async fn post_init(&'static self) -> Result<(), PostInitError> {
        let post_init = {
            let mut guard = self.post_init.lock().unwrap_or_else(|_| {
                unreachable!("Not poisoned, because this is the only lock and it is called once")
            });
            guard.take().unwrap_or_else(|| {
                unreachable!("Is some, because it was set in init and this is the only access")
            })
        };

        let mut any_error = false;
        let mut streams = Vec::new();
        for (consumer, router) in post_init.consumers {
            let info = consumer.cached_info().clone();
            // Cap the per-pull prefetch so a single batch can be fully processed within
            // `ack_wait`. The async-nats default of 200 lets the buffer fill faster than
            // a slow handler can drain it on a backlog, after which `ack_wait` expires on
            // still-buffered messages and acks for them are silently dropped server-side
            // (see consumer's `processAckMsg` stale-delivery check) — causing redelivery
            // cascades.
            match consumer
                .stream()
                .max_messages_per_batch(MAX_MESSAGES_PER_BATCH)
                .messages()
                .await
            {
                Ok(stream) => streams.push((info, stream, router)),
                Err(error) => {
                    any_error = true;
                    error!(
                        stream.name = info.stream_name,
                        consumer.name = info.name,
                        error.debug = ?error,
                        error.display = %error,
                        "Failed to open consumer stream"
                    );
                }
            }
        }
        if any_error {
            return Err("Failed to open consumer stream, see previous logs".into());
        }

        for (info, stream, router) in streams {
            tokio::spawn(self.handle_stream(info, stream, router));
        }
        Ok(())
    }
}

impl NatsListener {
    /// Infinite loop handling a single nats consumer
    ///
    /// It is spawned in [`NatsListener::post_init`] as a tokio task.
    ///
    /// It handles errors with the stream of messages and creates a new root span before calling [`Self::handle_message`].
    ///
    /// It returns on a galvyn shutdown. (Triggering one if it failed)
    // not instrumented: infinite loops break opentelemetry; each loop item creates a span
    async fn handle_stream(
        &'static self,
        consumer: consumer::Info,
        stream: pull::Stream,
        router: SubjectRouter,
    ) {
        let _blocker = Shutdown::global().block();
        let mut progress_acker = ProgressAcker::new(&consumer.config);

        let mut stream = pin!(stream);
        let mut consecutive_errors: usize = 0;
        loop {
            let result = select! {
                _ = Shutdown::global().wait_for_started() => return,
                option = future::poll_fn(|cx| stream.as_mut().poll_next(cx)) => if let Some(result) = option {
                    result
                } else {
                    error!("NATS terminated unexpectedly, shutting down entire service...");
                    Shutdown::global().start();
                    return;
                },
            };

            let message = match result {
                Ok(message) => {
                    consecutive_errors = 0;
                    message
                }
                Err(error) => {
                    // Create an ad-hoc span for the logs to attach to
                    let _span = info_span!(
                        "NatsListener::handle_stream",
                        stream.name = consumer.stream_name,
                        consumer.name
                    )
                    .entered();

                    consecutive_errors += 1;
                    if consecutive_errors < MAX_CONSECUTIVE_PULL_ERRORS {
                        warn!(
                            error.debug = ?error,
                            error.display = %error,
                            consecutive_errors,
                            "Failed to receive message from stream"
                        );
                        continue;
                    } else {
                        error!(
                            error.debug = ?error,
                            error.display = %error,
                            consecutive_errors,
                            "Failed to receive message from stream. This happened too ofter, shutting down entire service."
                        );
                        Shutdown::global().start();
                        return;
                    }
                }
            };

            let span = info_span!(parent: None, "NatsListener::handle_message",
                stream.name = consumer.stream_name,
                consumer.name,
                message.subject = %message.subject
            );

            if let Some(headers) = &message.headers {
                let trace_ctx = headers_to_context(headers);
                if let Err(error) = span.set_parent(trace_ctx) {
                    span.in_scope(|| {
                        warn!(error.debug = ?error, error.display = %error, "Failed to set trace parent");
                    });
                }
            }

            let result = self
                .handle_message(message, &router, &mut progress_acker)
                .instrument(span)
                .await;
            self.metric_processed
                .with_label_values(&[match result {
                    MsgResult::Success => "success",
                    MsgResult::Retry => "retry",
                    MsgResult::Failed => "failed",
                }])
                .inc();
        }
    }

    /// Processes a single NATS message
    ///
    /// 1. Finds associated handler by subject
    /// 2. Parses payload¹
    /// 3. Calls handler
    /// 4. Acknowledges the message based on the handler's return
    ///
    /// It is called by [`Self::handle_stream`].
    ///
    /// ¹ Parsing is done indirectly in [`box_handler`], which has to handle the generics.
    // not instrumented: caller creates span manually
    async fn handle_message(
        &self,
        message: jetstream::Message,
        router: &SubjectRouter,
        progress_acker: &mut ProgressAcker,
    ) -> MsgResult {
        let info = match message.info() {
            Ok(info) => OwnedInfo::from(&info),
            Err(error) => {
                warn!(
                    %message.subject,
                    message.reply = message.reply.as_ref().map(|x| x.to_string()),
                    error.debug = ?error,
                    error.display = %error,
                    "Received jetstream message with invalid reply subject. NATS should not do that!? Pushing to DLQ."
                );
                let (message, acker) = message.split();
                self.push_to_dlq(message, acker, dlq::Reason::InvalidReply(error))
                    .await;
                return MsgResult::Failed;
            }
        };
        let (message, acker) = message.split();

        if let Some(route) = router.lookup(&message.subject) {
            let retry_ctx = RetryContext::from(&info);
            let handler_result = select! {
                x = (route.handler)(info, message.clone()) => x,
                _ = tokio::time::sleep(route.timeout) => Err(ExtendedDontAck::Dlq(HandlerTimeout(route.timeout))),
                _ = progress_acker.continuos_ack(&acker) => unreachable!(),
            };

            // Any of the following ack errors should not occur
            // unless nats, the sdk or our deployment has an issue.
            match handler_result {
                Ok(()) => {
                    if let Err(error) = acker.double_ack_with(AckKind::Ack).await {
                        warn!(
                            message.subject = %message.subject,
                            error.debug = ?error,
                            error.display = %error,
                            "Failed to acknowledge message"
                        );
                    }
                    MsgResult::Success
                }
                Err(ExtendedDontAck::Retry(retry_reason)) => {
                    match route.retry.evaluate(retry_ctx) {
                        RetryResult::RetryIn(timeout) => {
                            info!(
                                message.subject = %message.subject,
                                retry.reason.debug = ?retry_reason,
                                retry.reason.display = %retry_reason,
                                retry.timeout = ?timeout,
                                "NATS message will be retried"
                            );
                            if let Err(error) =
                                acker.double_ack_with(AckKind::Nak(Some(timeout))).await
                            {
                                warn!(
                                    message.subject = %message.subject,
                                    retry.reason.debug = ?error,
                                    retry.reason.display = %error,
                                    retry.timeout = ?timeout,
                                    error.debug = ?error,
                                    error.display = %error,
                                    "Failed to request explicit timeout for message retry"
                                );
                            }
                            MsgResult::Retry
                        }
                        RetryResult::Dlq => {
                            info!(
                                message.subject = %message.subject,
                                retry.reason.debug = ?retry_reason,
                                retry.reason.display = %retry_reason,
                                "NATS message won't be retried anymore"
                            );
                            self.push_to_dlq(
                                message,
                                acker,
                                dlq::Reason::Process(
                                    format!("Retry Strategy exhausted ({retry_reason})").into(),
                                ),
                            )
                            .await;
                            MsgResult::Failed
                        }
                    }
                }
                Err(ExtendedDontAck::Dlq(reason)) => {
                    self.push_to_dlq(message, acker, reason).await;
                    MsgResult::Failed
                }
            }
        } else {
            warn!(
                %message.subject,
                "Received unknown subject. The service code and chart seem to be out of sync. Pushing to DLQ."
            );

            // REASON:
            // 1. Every service has its own consumer (replicas share the consumer)
            // 2. A consumer's subject filter should match the subjects the code can handle

            self.push_to_dlq(message, acker, dlq::Reason::UnknownSubject)
                .await;
            MsgResult::Failed
        }
    }
}

/// Data passed from [`NatsListener::init`] to [`NatsListener::post_init`].
///
/// This is similar to `PreInit` but for `post_init`, hence the name.
#[doc(hidden)]
pub struct NatsListenerPostInit {
    /// The already fetched consumers to listen on and their routers.
    consumers: Vec<(Consumer<pull::Config>, SubjectRouter)>,
}

/// Small helper for sending [`AckKind::Progress`] while handling a message
struct ProgressAcker {
    /// Interval ticking at `ack_wait / 2`
    interval: tokio::time::Interval,
}
impl ProgressAcker {
    /// Constructs a new `ProgressAcker` from a consumer's config
    pub fn new(config: &consumer::Config) -> Self {
        Self {
            interval: tokio::time::interval(config.ack_wait / 2),
        }
    }
    /// Continuously send [`AckKind::Progress`] using `acker`
    pub async fn continuos_ack(&mut self, acker: &Acker) -> ! {
        self.interval.reset();
        loop {
            self.interval.tick().await;
            if let Err(error) = acker.double_ack_with(AckKind::Progress).await {
                warn!(
                    error.debug = ?error,
                    error.display = %error,
                    "Failed to send AckProgress"
                );
            }
        }
    }
}

/// Enum returned by [`NatsListener::handle_message`] to [`NatsHandler::handle_stream`]
///
/// It carries the result how the message was handled and is used to increment a metric.
#[allow(clippy::missing_docs_in_private_items)]
pub enum MsgResult {
    Success,
    Retry,
    Failed,
}
