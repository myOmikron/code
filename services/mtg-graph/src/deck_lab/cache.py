"""In-process response caching.

Diagnostics and suggestions are pure functions of a deck and its settings over
a corpus that changes only on re-ingest, and thousands of users build around
the same few hundred popular commanders — often from the same precons. That
makes the answer worth keeping rather than recomputing.

Deliberately per process, with no shared store. Redis would make the cache
global at the cost of a dependency, a network hop, and a serialisation format
for pydantic models; at this size the hit rate is carried by popularity, not
by cache size, so each uvicorn worker keeping its own is enough. The cost is
that N workers can each pay the first miss for the same deck — accepted, and
documented in `scripts/serve.sh`.

Cached values are handed back by reference and MUST be treated as frozen. The
handlers return them straight to FastAPI for serialisation and never mutate
them; anything that starts mutating a report has to copy first.
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from collections.abc import Callable, Hashable
from typing import Any

import structlog

from .config import settings

log = structlog.get_logger(__name__)


class LruTtlCache:
    """A bounded, expiring cache safe for concurrent handlers.

    The lock is held for every operation. Handlers run on Starlette's thread
    pool, so two requests for the same deck genuinely race here; the critical
    sections are dict operations, and contention costs less than the duplicate
    graph work it prevents.
    """

    def __init__(
        self,
        name: str,
        *,
        max_entries: int,
        ttl_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.name = name
        self.max_entries = max_entries
        self.ttl_seconds = ttl_seconds
        self._clock = clock
        self._lock = threading.Lock()
        self._entries: OrderedDict[Hashable, tuple[float, Any]] = OrderedDict()
        # One gate per in-flight key, so concurrent requests for the same
        # answer compute once instead of racing (see get_or_compute).
        self._inflight: dict[Hashable, threading.Lock] = {}
        # Bumped by every clear(). A handler that misses the cache, computes,
        # and then calls put() is unlocked in between — if a clear() lands in
        # that window (a /warm ingest just finished), writing the pre-clear
        # answer afterwards would resurrect exactly what the clear intended to
        # flush, for a full TTL. Callers that care pass the generation they
        # observed at the miss; put() then refuses a write that generation has
        # since invalidated.
        self._generation = 0

    @property
    def generation(self) -> int:
        with self._lock:
            return self._generation

    def get(self, key: Hashable) -> Any | None:
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                log.debug("cache.miss", cache=self.name, size=len(self._entries))
                return None

            expires_at, value = entry
            if self._clock() >= expires_at:
                # Dropped on read rather than swept: an expired entry costs
                # nothing until someone asks for it, and eviction bounds size.
                del self._entries[key]
                log.debug("cache.miss", cache=self.name, size=len(self._entries))
                return None

            self._entries.move_to_end(key)
            log.debug("cache.hit", cache=self.name, size=len(self._entries))
            return value

    def put(self, key: Hashable, value: Any, *, generation: int | None = None) -> None:
        if self.ttl_seconds <= 0:
            return

        with self._lock:
            if generation is not None and generation != self._generation:
                # A clear() happened after this value was computed from the
                # generation it was computed against — dropping it silently is
                # correct: the caller already has nothing better to do with a
                # stale answer than let it be recomputed on the next miss.
                return
            self._entries[key] = (self._clock() + self.ttl_seconds, value)
            self._entries.move_to_end(key)
            while len(self._entries) > self.max_entries:
                self._entries.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()
            self._generation += 1

    def get_or_compute(self, key: Hashable, compute: Callable[[], Any]) -> Any:
        """One compute per key at a time; a clear() during compute wins.

        The generation is captured *inside* the gate, right before `compute()`
        runs, mirroring what the call sites used to do by hand: capture, then
        compute unlocked, then `put(..., generation=)`. Capturing here (rather
        than before the gate) keeps the window between "generation observed"
        and "value computed" as small as possible, so a `clear()` (a /warm
        ingest landing) is maximally likely to be observed as a stale write
        and dropped, instead of resurrecting a pre-clear answer for a full TTL.
        """
        hit = self.get(key)
        if hit is not None:
            return hit
        with self._lock:
            gate = self._inflight.setdefault(key, threading.Lock())
        try:
            with gate:
                hit = self.get(key)  # a peer may have landed it while we waited
                if hit is not None:
                    return hit
                generation = self.generation
                value = compute()
                self.put(key, value, generation=generation)
                return value
        finally:
            # Opportunistic: a rare duplicate lock (a new waiter arrives right
            # as this one is torn down) is harmless, an unbounded dict is
            # not — and this must run even if compute() raised, or a key that
            # keeps failing leaks a lock forever.
            with self._lock:
                self._inflight.pop(key, None)

    def __len__(self) -> int:
        with self._lock:
            return len(self._entries)


diagnostics_cache = LruTtlCache(
    "diagnostics",
    max_entries=settings.response_cache_max_entries,
    ttl_seconds=settings.response_cache_ttl_seconds,
)

suggestions_cache = LruTtlCache(
    "suggestions",
    max_entries=settings.response_cache_max_entries,
    ttl_seconds=settings.response_cache_ttl_seconds,
)

# One corpus-wide answer, so one entry. Its TTL is long because facets change
# only on re-ingest, which restarts the process anyway.
facets_cache = LruTtlCache(
    "facets",
    max_entries=1,
    ttl_seconds=settings.facets_cache_ttl_seconds,
)
