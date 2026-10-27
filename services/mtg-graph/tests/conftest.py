"""Shared test setup.

The rate limiter is module-level state that outlives a single test: its buckets
are per process, so requests made by one test spend the allowance of every test
that follows. Left on, the suite fails by *order* — a test asserting a 422
starts seeing 429 once enough earlier tests have posted — which is the kind of
failure that gets debugged as a real bug.

So it is off by default and `test_ratelimit.py` switches it back on for the
tests that are actually about limiting.
"""

from __future__ import annotations

from contextlib import contextmanager

import pytest

from deck_lab.config import settings


@pytest.fixture(autouse=True)
def rate_limiting_off(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", False)


@pytest.fixture(autouse=True)
def no_live_graph(request, monkeypatch):
    """Fail the test that reaches for a real Neo4j, rather than let it connect.

    Everything outside `test_graph_live.py` stubs the graph functions it uses.
    Miss one and the call falls through to `settings.neo4j_uri` — which is a
    running dev stack on a developer's machine and nothing in CI, so the suite
    passes locally and fails there. This turns that into a local failure with
    the missing stub named.
    """
    if request.node.get_closest_marker("neo4j"):
        return

    from deck_lab import graph

    @contextmanager
    def refuse():
        raise AssertionError(
            "this test opened a Neo4j connection — stub the graph function it "
            "calls (see the traceback), or mark the test `@pytest.mark.neo4j`"
        )
        yield  # pragma: no cover - unreachable, keeps this a generator

    monkeypatch.setattr(graph, "driver", refuse)


@pytest.fixture(scope="session")
def _span_exporter():
    """One in-memory exporter behind the process-wide tracer provider.

    OpenTelemetry lets the global provider be set once per process, so the
    session installs it and `spans` empties it per test. Spans are exported
    synchronously as they end, so a test reads them right after its request.
    """
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    return exporter


@pytest.fixture
def spans(_span_exporter):
    """The spans ended during this test, read with `spans.get_finished_spans()`."""
    _span_exporter.clear()
    yield _span_exporter
    _span_exporter.clear()
