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

    def put(self, key: Hashable, value: Any) -> None:
        if self.ttl_seconds <= 0:
            return

        with self._lock:
            self._entries[key] = (self._clock() + self.ttl_seconds, value)
            self._entries.move_to_end(key)
            while len(self._entries) > self.max_entries:
                self._entries.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()

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
