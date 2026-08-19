"""Per-client rate limiting.

The middleware runs before request validation, so an intentionally invalid body
exercises the limiter without reaching a handler — which is how these stay
graph-free. `TestClient` is bare here; see `test_api_validation.py`.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from deck_lab import api
from deck_lab.api import app
from deck_lab.config import settings
from deck_lab.ratelimit import IDLE_EVICT_SECONDS, RateLimiter

client = TestClient(app)


class FakeClock:
    def __init__(self) -> None:
        self.now = 500.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


# --- the bucket -----------------------------------------------------------


def test_burst_is_spendable_at_once():
    limiter = RateLimiter(rate=1.0, burst=3, clock=FakeClock())

    assert [limiter.check("client") for _ in range(3)] == [0.0, 0.0, 0.0]
    assert limiter.check("client") > 0


def test_denial_reports_the_wait():
    clock = FakeClock()
    limiter = RateLimiter(rate=2.0, burst=1, clock=clock)
    limiter.check("client")

    # Empty bucket at 2 tokens/sec means half a second to the next one.
    assert limiter.check("client") == pytest.approx(0.5)


def test_tokens_refill_over_time():
    clock = FakeClock()
    limiter = RateLimiter(rate=1.0, burst=2, clock=clock)
    limiter.check("client")
    limiter.check("client")
    assert limiter.check("client") > 0

    clock.advance(1.0)
    assert limiter.check("client") == 0.0


def test_refill_is_capped_at_the_burst():
    clock = FakeClock()
    limiter = RateLimiter(rate=1.0, burst=2, clock=clock)

    clock.advance(3600.0)  # idle for an hour

    assert [limiter.check("c") for _ in range(2)] == [0.0, 0.0]
    assert limiter.check("c") > 0  # not an hour's worth of credit


def test_clients_are_isolated():
    limiter = RateLimiter(rate=1.0, burst=1, clock=FakeClock())
    limiter.check("a")

    assert limiter.check("b") == 0.0
    assert limiter.check("a") > 0


def test_idle_clients_are_pruned():
    clock = FakeClock()
    limiter = RateLimiter(rate=1.0, burst=1, max_clients=2, clock=clock)
    limiter.check("old-1")
    limiter.check("old-2")

    clock.advance(IDLE_EVICT_SECONDS + 1)
    limiter.check("fresh")

    assert len(limiter) == 1


def test_table_stays_bounded_when_nothing_is_idle():
    """A flood of distinct keys must not grow the table without limit."""
    limiter = RateLimiter(rate=1.0, burst=1, max_clients=4, clock=FakeClock())

    for i in range(50):
        limiter.check(f"client-{i}")

    assert len(limiter) <= 4


# --- the middleware -------------------------------------------------------


@pytest.fixture
def limited(monkeypatch):
    """A limiter with room for two requests and no refill worth waiting for."""
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    monkeypatch.setattr(api, "_RATE_LIMITER", RateLimiter(rate=0.001, burst=2))


def _post_invalid(headers: dict | None = None):
    # `cards` is empty, so validation would 422 — but only if the request gets
    # past the limiter at all.
    return client.post("/diagnostics", json={"cards": []}, headers=headers or {})


def test_requests_are_rejected_once_the_bucket_empties(limited):
    assert _post_invalid().status_code == 422
    assert _post_invalid().status_code == 422

    response = _post_invalid()
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) >= 1


def test_forwarded_clients_get_their_own_buckets(limited):
    for _ in range(3):
        _post_invalid({"X-Forwarded-For": "10.0.0.1"})

    # A different client is unaffected by the first one's exhaustion.
    assert _post_invalid({"X-Forwarded-For": "10.0.0.2"}).status_code == 422


def test_only_the_first_forwarded_hop_is_used(limited):
    for _ in range(3):
        _post_invalid({"X-Forwarded-For": "10.0.0.9, 172.16.0.1"})

    assert _post_invalid({"X-Forwarded-For": "10.0.0.9, 192.168.0.1"}).status_code == 429


def test_disabling_the_limiter_lets_everything_through(monkeypatch, limited):
    monkeypatch.setattr(settings, "rate_limit_enabled", False)

    assert [_post_invalid().status_code for _ in range(5)] == [422] * 5


def test_cheap_endpoints_are_not_limited(limited):
    """/search is a single fast query and must stay usable while typing."""
    for _ in range(5):
        assert client.post("/search", json={"limit": 0}).status_code == 422
