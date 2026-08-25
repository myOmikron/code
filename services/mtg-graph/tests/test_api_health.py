"""Readiness checks for the graph API."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from deck_lab import api, graph


def test_health_accepts_a_complete_corpus(monkeypatch):
    monkeypatch.setattr(
        graph,
        "bootstrap_state",
        lambda: {"cards": 1, "taggings": 1, "role_edges": 1, "combos": 1},
    )

    assert api.health() == {"status": "ok"}


def test_health_rejects_an_incomplete_corpus(monkeypatch):
    monkeypatch.setattr(
        graph,
        "bootstrap_state",
        lambda: {"cards": 1, "taggings": 1, "role_edges": 0, "combos": 0},
    )

    with pytest.raises(HTTPException) as raised:
        api.health()

    assert raised.value.status_code == 503
    assert raised.value.detail == "graph corpus incomplete: role_edges, combos"


def test_health_rejects_an_unreachable_database(monkeypatch):
    def unreachable() -> dict[str, int]:
        raise RuntimeError("connection refused")

    monkeypatch.setattr(graph, "bootstrap_state", unreachable)

    with pytest.raises(HTTPException) as raised:
        api.health()

    assert raised.value.status_code == 503
    assert raised.value.detail == "neo4j unreachable: connection refused"
