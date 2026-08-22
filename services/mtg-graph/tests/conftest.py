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

import pytest

from deck_lab.config import settings


@pytest.fixture(autouse=True)
def rate_limiting_off(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", False)
