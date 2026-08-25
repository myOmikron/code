"""Per-client token buckets.

Best-effort by construction, and worth being honest about what that means:

- **Per process.** Each uvicorn worker keeps its own buckets, so a client's
  real allowance is roughly `rate x workers`. Making it global needs a shared
  store, which is a dependency this does not want.
- **The key is only as trustworthy as the deployment.** Behind the Next.js
  proxy, `X-Forwarded-For`'s first hop is the browser's address. Exposed
  directly to the internet, a client picks its own key by sending whatever
  header it likes.

So this is not a shield against a determined attacker — a fronting proxy or
CDN is. What it does do is stop one enthusiastic client, or a runaway retry
loop in the frontend, from monopolising a worker's threads.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable

IDLE_EVICT_SECONDS = 60.0


class RateLimiter:
    """A token bucket per client key.

    `rate` tokens accrue per second up to `burst`, which is both the ceiling
    and the allowance a client that has been quiet can spend at once — deck
    editing is bursty (a diagnostics and a suggestions request land together),
    so a limiter without burst would reject normal use.
    """

    def __init__(
        self,
        rate: float,
        burst: int,
        *,
        max_clients: int = 1024,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.rate = rate
        self.burst = burst
        self.max_clients = max_clients
        self._clock = clock
        self._lock = threading.Lock()
        # key -> (tokens, last refill)
        self._buckets: dict[str, tuple[float, float]] = {}

    def check(self, key: str) -> float:
        """Consume a token. Returns 0.0 when allowed, else seconds to wait."""
        with self._lock:
            now = self._clock()
            tokens, last = self._buckets.get(key, (float(self.burst), now))
            tokens = min(self.burst, tokens + (now - last) * self.rate)

            if tokens >= 1.0:
                self._buckets[key] = (tokens - 1.0, now)
                self._prune(now)
                return 0.0

            self._buckets[key] = (tokens, now)
            self._prune(now)
            return (1.0 - tokens) / self.rate if self.rate > 0 else IDLE_EVICT_SECONDS

    def _prune(self, now: float) -> None:
        """Bound the table. Called under the lock.

        Without this the dict is an unbounded map keyed on attacker-supplied
        strings — the limiter would become the memory leak it exists to
        prevent.
        """
        if len(self._buckets) <= self.max_clients:
            return

        for key, (_, last) in list(self._buckets.items()):
            if now - last > IDLE_EVICT_SECONDS:
                del self._buckets[key]

        if len(self._buckets) > self.max_clients:
            # Still over: keep the most recently seen, drop the rest.
            keep = sorted(self._buckets.items(), key=lambda kv: -kv[1][1])[: self.max_clients]
            self._buckets = dict(keep)

    def __len__(self) -> int:
        with self._lock:
            return len(self._buckets)
