"""OpenTelemetry tracing for the advisor.

Mirrors service-bootstrap: `OTEL_EXPORTER_OTLP_ENDPOINT` set exports spans over
OTLP/gRPC in batches, empty installs no provider at all. The W3C TraceContext
propagator and the parent-based always-on sampler are the SDK's defaults, so
`OTEL_TRACES_SAMPLER` and friends keep working.

Server spans come from FastAPI's native telemetry (`TELEMETRY`), which wraps the
whole middleware stack; outbound httpx calls are instrumented globally. The
compute hotspots (`deck_span`) and background jobs (`background_job`) add their
own spans; Neo4j queries are traced by `graph.driver()`. A request `TELEMETRY`
excludes gets no span at all, down to its queries (`UntracedRequests`).
"""

from __future__ import annotations

import functools
import inspect
from collections.abc import Callable, MutableMapping
from typing import Any

import structlog
from fastapi.telemetry import TelemetryConfig
from opentelemetry import context, trace
from opentelemetry.context import Context
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import Link, NonRecordingSpan, SpanContext, TraceFlags
from opentelemetry.util.types import Attributes
from starlette.types import ASGIApp, Receive, Scope, Send

from .config import Settings

UNTRACED_PATHS = frozenset({"/health"})


def _untraced(scope: MutableMapping[str, Any]) -> bool:
    """Whether a request skips tracing, judged on its path below the root path."""
    path: str = scope.get("path", "")
    root: str = scope.get("root_path", "")
    if root and path.startswith(root):
        path = path[len(root) :] or "/"
    return path in UNTRACED_PATHS


TELEMETRY: TelemetryConfig = {
    "exclude": _untraced,
    "metrics": False,
    "logs": False,
}
"""`FastAPI(telemetry=...)`: request spans only, `/health` left out."""


_UNSAMPLED_PARENT = trace.set_span_in_context(
    NonRecordingSpan(
        SpanContext(
            trace_id=1, span_id=1, is_remote=False, trace_flags=TraceFlags(TraceFlags.DEFAULT)
        )
    )
)
"""A context whose current span is valid but not sampled.

The parent-based sampler then drops every span started below it, so the ids
never reach a trace backend and only have to be valid.
"""


class UntracedRequests:
    """ASGI middleware: inside an untraced request no span is recorded at all.

    `TELEMETRY` keeps FastAPI from opening a span for `UNTRACED_PATHS`, but a
    span the handler starts itself would then be the root of a trace of its
    own: `/health` counts the corpus in four Neo4j queries, and the compose
    healthcheck asks every 5 seconds, which showed up as a trace list made of
    nothing but `neo4j`. The request runs below `_UNSAMPLED_PARENT` instead.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not _untraced(scope):
            await self.app(scope, receive, send)
            return
        token = context.attach(_UNSAMPLED_PARENT)
        try:
            await self.app(scope, receive, send)
        finally:
            context.detach(token)


def start_tracing(settings: Settings) -> TracerProvider | None:
    """Install the exporting tracer provider, or nothing when no endpoint is set.

    The returned provider is the caller's to `shutdown()`, which flushes the batch.
    """
    HTTPXClientInstrumentor().instrument()

    if not settings.otel_exporter_otlp_endpoint:
        return None

    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

    provider = TracerProvider(
        resource=Resource.create({SERVICE_NAME: settings.otel_service_name}),
    )
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.otel_exporter_otlp_endpoint))
    )
    trace.set_tracer_provider(provider)
    return provider


tracer = trace.get_tracer("deck_lab")


DECK_SPAN_FIELDS = ("commander_oracle_id", "deck_size")
"""The parameters, besides the deck, every `deck_span` function takes and records."""


def deck_span[**P, R](name: str, *, deck: str) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """Run the decorated advisor function inside a span called `name`.

    The span records the card count of the parameter `deck` plus `DECK_SPAN_FIELDS`
    (the commander only when set): a decklist never goes to the trace backend.
    A function lacking any of these parameters is a `TypeError` when decorated.
    """

    def decorate(function: Callable[P, R]) -> Callable[P, R]:
        signature = inspect.signature(function)
        missing = [p for p in (deck, *DECK_SPAN_FIELDS) if p not in signature.parameters]
        if missing:
            raise TypeError(f"deck_span({name!r}): {function.__qualname__} lacks {missing}")

        @functools.wraps(function)
        def traced(*args: P.args, **kwargs: P.kwargs) -> R:
            call = signature.bind(*args, **kwargs)
            call.apply_defaults()
            commander_oracle_id, deck_size = (call.arguments[p] for p in DECK_SPAN_FIELDS)
            attributes: dict[str, Any] = {
                "deck.card_count": len(call.arguments[deck]),
                "deck_size": deck_size,
            }
            if commander_oracle_id:
                attributes["commander_oracle_id"] = commander_oracle_id
            with tracer.start_as_current_span(name, attributes=attributes):
                return function(*args, **kwargs)

        return traced

    return decorate


def background_job[**P, R](
    name: str, scheduled_by: SpanContext | None = None, attributes: Attributes = None
) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """Run the decorated job as a new trace, linked to the span that scheduled it.

    A link, not a parent: a job a request only kicked off must not stretch the
    request's trace to the job's duration.
    """
    links = [Link(scheduled_by)] if scheduled_by is not None and scheduled_by.is_valid else []

    def decorate(job: Callable[P, R]) -> Callable[P, R]:
        @functools.wraps(job)
        def traced(*args: P.args, **kwargs: P.kwargs) -> R:
            with tracer.start_as_current_span(
                name, context=Context(), links=links, attributes=attributes
            ):
                return job(*args, **kwargs)

        return traced

    return decorate


def add_trace_ids(
    _logger: Any, _method: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    """structlog processor: `trace_id` and `span_id` of the current span, in hex."""
    context = trace.get_current_span().get_span_context()
    if context.is_valid:
        event_dict["trace_id"] = format(context.trace_id, "032x")
        event_dict["span_id"] = format(context.span_id, "016x")
    return event_dict


def install_trace_id_processor() -> None:
    """Put `add_trace_ids` in front of the configured structlog processors, once."""
    processors = structlog.get_config()["processors"]
    if add_trace_ids not in processors:
        structlog.configure(processors=[add_trace_ids, *processors])
