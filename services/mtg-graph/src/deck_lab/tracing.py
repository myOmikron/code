"""OpenTelemetry tracing for the advisor.

Mirrors service-bootstrap: `OTEL_EXPORTER_OTLP_ENDPOINT` set exports spans over
OTLP/gRPC in batches, empty installs no provider at all. The W3C TraceContext
propagator and the parent-based always-on sampler are the SDK's defaults, so
`OTEL_TRACES_SAMPLER` and friends keep working.

Server spans come from FastAPI's native telemetry (`TELEMETRY`), which wraps the
whole middleware stack; outbound httpx calls are instrumented globally. The
compute hotspots (`deck_span`) and background jobs (`background_job`) add their
own spans; Neo4j queries are traced by `graph.driver()`.
"""

from __future__ import annotations

import functools
import inspect
from collections.abc import Callable, MutableMapping
from typing import Any

import structlog
from fastapi.telemetry import TelemetryConfig
from opentelemetry import trace
from opentelemetry.context import Context
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import Link, SpanContext
from opentelemetry.util.types import Attributes

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


def deck_span[**P, R](name: str) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """Run the decorated advisor function inside a span called `name`.

    The function takes the deck first, plus `commander_oracle_id` and `deck_size`.
    The span records only the deck's card count, the deck size and the commander:
    a decklist never goes to the trace backend.
    """

    def decorate(function: Callable[P, R]) -> Callable[P, R]:
        signature = inspect.signature(function)

        @functools.wraps(function)
        def traced(*args: P.args, **kwargs: P.kwargs) -> R:
            call = signature.bind(*args, **kwargs)
            call.apply_defaults()
            deck, *_ = call.arguments.values()
            attributes: dict[str, Any] = {
                "deck.card_count": len(deck),
                "deck_size": call.arguments["deck_size"],
            }
            if commander := call.arguments["commander_oracle_id"]:
                attributes["commander_oracle_id"] = commander
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


def log_trace_ids() -> None:
    """Put `add_trace_ids` in front of the configured structlog processors, once."""
    processors = structlog.get_config()["processors"]
    if add_trace_ids not in processors:
        structlog.configure(processors=[add_trace_ids, *processors])
