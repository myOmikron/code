"""Startup warmup.

The only file that may enter `TestClient` as a context manager — doing so is
what runs the lifespan, and the lifespan is the subject here. Every other API
test uses a bare `TestClient(app)` so it never touches the graph.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from deck_lab import api, diagnostics
from deck_lab.api import app
from deck_lab.config import settings


@pytest.fixture(autouse=True)
def no_graph(monkeypatch):
    """Warmup must never reach Neo4j from a test, however it is invoked."""
    monkeypatch.setattr(api, "_facets_cached", lambda: {})
    monkeypatch.setattr(diagnostics, "resource_idf", lambda: {})
    monkeypatch.setattr(diagnostics, "resource_relative_idf", lambda: {})
    monkeypatch.setattr(diagnostics, "typal_density", lambda: {})


def test_boot_survives_a_cold_graph(monkeypatch):
    """Every warmup step failing is a slow first request, not a dead worker."""

    def explode() -> None:
        raise RuntimeError("neo4j unreachable")

    monkeypatch.setattr(api, "_facets_cached", explode)
    monkeypatch.setattr(diagnostics, "resource_idf", explode)
    monkeypatch.setattr(diagnostics, "resource_relative_idf", explode)
    monkeypatch.setattr(diagnostics, "typal_density", explode)

    with TestClient(app):
        pass  # startup and shutdown both complete


def test_warmup_runs_every_step(monkeypatch):
    called: list[str] = []

    monkeypatch.setattr(settings, "warmup_on_start", True)
    monkeypatch.setattr(diagnostics, "resource_idf", lambda: called.append("idf") or {})
    monkeypatch.setattr(
        diagnostics, "resource_relative_idf", lambda: called.append("relative") or {}
    )
    monkeypatch.setattr(diagnostics, "typal_density", lambda: called.append("typal") or {})
    monkeypatch.setattr(api, "_facets_cached", lambda: called.append("facets") or {})

    with TestClient(app):
        pass

    assert called == ["idf", "relative", "typal", "facets"]


def test_warmup_can_be_switched_off(monkeypatch):
    called: list[str] = []

    monkeypatch.setattr(settings, "warmup_on_start", False)
    monkeypatch.setattr(diagnostics, "resource_idf", lambda: called.append("idf") or {})

    with TestClient(app):
        pass

    assert called == []
