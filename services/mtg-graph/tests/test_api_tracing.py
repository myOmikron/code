"""The advisor's spans and log lines, as a trace backend and a log reader see them.

Bare `TestClient(app)` as in `test_api_validation.py`, so the lifespan and its
warmup never run; the `spans` fixture holds what got exported. An empty deck
posted to `/diagnostics` is a 422, a served request that needs no graph.
"""

from __future__ import annotations

import time

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

    monkeypatch.setattr(api, "run_facets", facets)
    api.facets_cache.clear()
    client.get("/facets", headers={"traceparent": TRACEPARENT})
    api.facets_cache.clear()

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


def test_what_health_does_is_not_traced_either(spans, monkeypatch):
    """Its Neo4j queries must not become traces of their own, four every 5 seconds."""
    from deck_lab import graph
    from deck_lab.tracing import tracer

    def counting() -> dict[str, int]:
        with tracer.start_as_current_span("neo4j"):
            return {"cards": 1}

    monkeypatch.setattr(graph, "bootstrap_state", counting)
    response = client.get("/health", headers={"traceparent": TRACEPARENT})

    assert response.status_code == 200
    assert spans.get_finished_spans() == ()


COMMANDER = "cmd-krenko"
DECK = ["card-goblin-1", "card-goblin-2", "card-mountain"]


def _stub_deck_graph(monkeypatch) -> None:
    """The graph reads `diagnose()` makes, answered for any deck without Neo4j."""
    from deck_lab import diagnostics, graph, interaction, type_targets

    def fetch_deck(counts):
        return [
            {
                "oracle_id": oid,
                "name": oid,
                "cmc": 2,
                "type_line": "Creature",
                "is_land": False,
                "color_identity": [],
                "price_usd": None,
                "qty": qty,
            }
            for oid, qty in counts.items()
        ]

    monkeypatch.setattr(graph, "fetch_deck", fetch_deck)
    monkeypatch.setattr(graph, "deck_card_resources", lambda deck: {})
    monkeypatch.setattr(graph, "deck_card_roles", lambda deck: [])
    monkeypatch.setattr(graph, "deck_card_types", lambda deck: [])
    monkeypatch.setattr(graph, "deck_resource_balance", lambda deck: {})
    monkeypatch.setattr(graph, "deck_role_weights", lambda deck: {})
    monkeypatch.setattr(graph, "resource_scene_supply", lambda *a, **kw: 0)
    monkeypatch.setattr(diagnostics, "resource_idf", lambda: {})
    monkeypatch.setattr(diagnostics, "typal_density", lambda: {})
    monkeypatch.setattr(
        interaction, "_tag_members", lambda slugs, oracle_ids: {slug: set() for slug in slugs}
    )
    monkeypatch.setattr(type_targets, "resolve_type_targets", lambda *a, **kw: ({}, "default"))


def test_a_decklist_stays_off_the_spans(spans, monkeypatch):
    """Counts and the commander are recorded; the cards of the deck never are."""
    _stub_deck_graph(monkeypatch)
    cards = [{"oracle_id": COMMANDER}, *({"oracle_id": oid} for oid in DECK)]

    response = client.post("/diagnostics", json={"cards": cards, "commander_oracle_id": COMMANDER})

    assert response.status_code == 200
    finished = spans.get_finished_spans()
    [diagnosis] = [s for s in finished if s.name == "diagnose"]
    assert diagnosis.attributes["deck.card_count"] == len(cards)
    assert diagnosis.attributes["commander_oracle_id"] == COMMANDER
    recorded = " ".join(str(v) for s in finished for v in s.attributes.values())
    assert not [oid for oid in DECK if oid in recorded]


def test_the_endpoint_span_says_whether_the_cache_answered(spans, monkeypatch):
    """`fastapi.endpoint` is the span FastAPI opens around the handler."""
    _stub_deck_graph(monkeypatch)
    body = {"cards": [{"oracle_id": oid} for oid in ["cache-a", "cache-b"]]}

    client.post("/diagnostics", json=body)
    client.post("/diagnostics", json=body)

    flagged = [s for s in spans.get_finished_spans() if "cache.hit" in s.attributes]
    assert [s.attributes["cache.hit"] for s in flagged] == [False, True]
    assert {s.name for s in flagged} == {"fastapi.endpoint"}


def _await_span(spans, name: str, timeout: float = 5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        found = [s for s in spans.get_finished_spans() if s.name == name]
        if found:
            return found
        time.sleep(0.01)
    raise AssertionError(f"no {name!r} span within {timeout}s")


def test_a_warm_job_is_its_own_trace_linked_to_the_request(spans, monkeypatch):
    """The request answers at once; the EDHREC fetch it scheduled must not stretch it."""
    from deck_lab import edhrec, graph

    monkeypatch.setattr(graph, "has_recommendations", lambda oid: False)
    monkeypatch.setattr(graph, "fetch_deck", lambda deck: [{"name": "Krenko, Mob Boss"}])
    monkeypatch.setattr(edhrec, "ingest_commander", lambda name: {"fetched": False})

    client.post(
        "/warm", json={"commander_oracle_id": COMMANDER}, headers={"traceparent": TRACEPARENT}
    )

    [job] = _await_span(spans, "warm")
    assert job.parent is None
    assert format(job.context.trace_id, "032x") != TRACE_ID
    assert job.attributes["commander_oracle_id"] == COMMANDER
    [link] = job.links
    request_span_ids = {
        s.context.span_id
        for s in spans.get_finished_spans()
        if format(s.context.trace_id, "032x") == TRACE_ID
    }
    assert format(link.context.trace_id, "032x") == TRACE_ID
    assert link.context.span_id in request_span_ids


def test_the_cache_leaves_its_callers_span_alone(spans):
    """Startup warmup fills the facets cache too; only an endpoint reports `cache.hit`."""
    from deck_lab.cache import LruTtlCache
    from deck_lab.tracing import tracer

    cache = LruTtlCache("test", max_entries=4, ttl_seconds=60.0)
    with tracer.start_as_current_span("caller"):
        cache.get_or_compute("k", lambda: "computed")
        cache.get_or_compute("k", lambda: "computed")

    [caller] = spans.get_finished_spans()
    assert "cache.hit" not in caller.attributes


def test_a_deck_span_names_the_deck_it_counts(spans):
    from deck_lab.tracing import deck_span

    @deck_span("count", deck="entries")
    def count(
        flags: list[str], entries: list[str], *, commander_oracle_id=None, deck_size=99
    ) -> int:
        return len(entries)

    count(["flag"], DECK, deck_size=60)

    [span] = spans.get_finished_spans()
    assert span.attributes["deck.card_count"] == len(DECK)
    assert span.attributes["deck_size"] == 60
    assert "commander_oracle_id" not in span.attributes


def test_a_deck_span_refuses_a_function_without_the_fields_it_records():
    """Caught where the decorator is applied, not on the first request."""
    import pytest

    from deck_lab.tracing import deck_span

    with pytest.raises(TypeError, match="deck_size"):

        @deck_span("count", deck="entries")
        def count(entries: list[str], *, commander_oracle_id=None) -> int:
            return len(entries)
