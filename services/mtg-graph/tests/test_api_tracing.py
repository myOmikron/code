"""The advisor's spans and log lines, as a trace backend and a log reader see them.

Bare `TestClient(app)` as in `test_api_validation.py`, so the lifespan and its
warmup never run; the `spans` fixture holds what got exported. An empty deck
posted to `/diagnostics` is a 422, a served request that needs no graph.
"""

from __future__ import annotations

import structlog
from fastapi.testclient import TestClient
from opentelemetry.trace import SpanKind

from deck_lab import api
from deck_lab.api import app

client = TestClient(app)

TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736"
PARENT_SPAN_ID = "00f067aa0ba902b7"
TRACEPARENT = f"00-{TRACE_ID}-{PARENT_SPAN_ID}-01"


def _server_spans(spans):
    return [s for s in spans.get_finished_spans() if s.kind == SpanKind.SERVER]


def _lines(capsys, event: str) -> list[str]:
    return [line for line in capsys.readouterr().out.splitlines() if event in line]


def test_a_request_continues_the_callers_trace(spans):
    client.post("/diagnostics", json={"cards": []}, headers={"traceparent": TRACEPARENT})

    [server] = _server_spans(spans)
    assert server.name == "POST /diagnostics"
    assert format(server.context.trace_id, "032x") == TRACE_ID
    assert format(server.parent.span_id, "016x") == PARENT_SPAN_ID


def test_the_request_log_line_names_the_request_span(spans, capsys):
    client.post("/diagnostics", json={"cards": []}, headers={"traceparent": TRACEPARENT})

    [server] = _server_spans(spans)
    [line] = _lines(capsys, "http.request")
    assert TRACE_ID in line
    assert format(server.context.span_id, "016x") in line


def test_a_sync_handler_runs_inside_the_request_trace(spans, capsys, monkeypatch):
    """Sync handlers run in the threadpool, where the request's context must follow."""

    def facets() -> dict:
        structlog.get_logger().info("facets.computed")
        return {}

    monkeypatch.setattr(api, "_facets_cached", facets)
    client.get("/facets", headers={"traceparent": TRACEPARENT})

    span_ids = {format(s.context.span_id, "016x") for s in spans.get_finished_spans()}
    [line] = _lines(capsys, "facets.computed")
    assert TRACE_ID in line
    assert any(span_id in line for span_id in span_ids)


def test_health_is_not_traced(spans):
    """The compose healthcheck polls it every 5 seconds; without a graph it answers 503."""
    client.get("/health", headers={"traceparent": TRACEPARENT})

    assert spans.get_finished_spans() == ()


def test_health_under_the_deployed_root_path_is_not_traced(spans):
    """uvicorn serves the app with `--root-path /api/graph`."""
    TestClient(app, root_path="/api/graph").get("/api/graph/health")

    assert spans.get_finished_spans() == ()
