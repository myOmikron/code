"""The /fill concurrency gate. No graph — the gate is taken before the first
graph call, which is the whole reason it is acquired where it is.

`TestClient` is used without its context manager on purpose; see
`test_api_validation.py`.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from deck_lab import solver
from deck_lab.api import app
from deck_lab.config import settings
from deck_lab.solver import SolverBusy, fill_deck

client = TestClient(app)


@pytest.fixture
def saturated(monkeypatch):
    """Hold every permit for the duration of a test.

    The semaphore is sized at import, so it is drained rather than resized.
    The acquire timeout is forced to zero so a test never waits for a slot it
    is itself holding.
    """
    monkeypatch.setattr(settings, "fill_acquire_timeout_seconds", 0.0)

    held = 0
    try:
        while solver._FILL_GATE.acquire(timeout=0):
            held += 1
        yield held
    finally:
        for _ in range(held):
            solver._FILL_GATE.release()


def test_fill_raises_when_every_slot_is_taken(saturated):
    with pytest.raises(SolverBusy):
        fill_deck(["some-oracle-id"], [])


def test_saturation_is_a_429_with_retry_after(saturated):
    response = client.post("/fill", json={"cards": [{"oracle_id": "some-oracle-id"}]})

    assert response.status_code == 429
    assert response.headers["retry-after"] == str(int(solver.DEFAULT_TIME_LIMIT))


def test_slots_are_returned_after_a_rejection(saturated):
    """A refused fill must not leak the permit it never acquired."""
    with pytest.raises(SolverBusy):
        fill_deck(["some-oracle-id"], [])


def test_gate_is_free_again_once_the_fixture_releases():
    acquired = solver._FILL_GATE.acquire(timeout=0)
    try:
        assert acquired, "the gate should be idle between tests"
    finally:
        if acquired:
            solver._FILL_GATE.release()


def test_gate_size_matches_the_setting():
    held = 0
    try:
        while solver._FILL_GATE.acquire(timeout=0):
            held += 1
    finally:
        for _ in range(held):
            solver._FILL_GATE.release()

    assert held == settings.fill_max_concurrent


def test_a_rejected_fill_never_resolves_a_deferred_allow_network(saturated):
    """The API hands `allow_network` over as a callable precisely so its graph
    query runs only behind the gate — a saturated gate must 429 without it."""

    def probe() -> bool:
        raise AssertionError("the allow_network probe must not run on the rejection path")

    with pytest.raises(SolverBusy):
        fill_deck(["some-id"], [], allow_network=probe)
