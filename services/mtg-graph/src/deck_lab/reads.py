"""Graph reads that run side by side on one shared pool."""

from __future__ import annotations

import contextvars
import threading
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any

from .config import settings

# Shared by every request: when it is full, reads queue rather than open more sockets.
_POOL = ThreadPoolExecutor(max_workers=settings.graph_read_workers, thread_name_prefix="graph-read")
_pooled = threading.local()


def _run_pooled[T](read: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    _pooled.active = True
    return read(*args, **kwargs)


def start_read[T](read: Callable[..., T], *args: Any, **kwargs: Any) -> Future[T]:
    """Start a read on the shared pool; `.result()` collects it.

    It runs in the caller's context, so its spans stay below the caller's.
    Called from a pooled read it runs inline: a pooled read waiting on the
    pool could wait forever.
    """
    if getattr(_pooled, "active", False):
        done: Future[T] = Future()
        try:
            done.set_result(read(*args, **kwargs))
        except Exception as error:  # noqa: BLE001 - handed to whoever collects the future
            done.set_exception(error)
        return done
    return _POOL.submit(contextvars.copy_context().run, _run_pooled, read, *args, **kwargs)


def read_together(*reads: Callable[[], Any]) -> list[Any]:
    """Run independent reads at once; their results in argument order."""
    started = [start_read(read) for read in reads[1:]]
    return [reads[0](), *(future.result() for future in started)]
