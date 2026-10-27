"""OpenTelemetry tracing for the advisor's HTTP surface.

Mirrors service-bootstrap: `OTEL_EXPORTER_OTLP_ENDPOINT` set exports spans over
OTLP/gRPC in batches, empty installs no provider at all. The W3C TraceContext
propagator and the parent-based always-on sampler are the SDK's defaults, so
`OTEL_TRACES_SAMPLER` and friends keep working.

Server spans come from FastAPI's native telemetry (`TELEMETRY`), which wraps the
whole middleware stack; outbound httpx calls are instrumented globally.
"""

from __future__ import annotations

from collections.abc import MutableMapping
from typing import Any

import structlog
from fastapi.telemetry import TelemetryConfig
from opentelemetry import trace
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

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
