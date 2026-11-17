"""Reads that run side by side. Pure: no graph, the reads are plain functions."""

from __future__ import annotations

import contextvars
import threading

import pytest

from deck_lab.reads import read_together, start_read
from deck_lab.suggestions import _count_then_rows


def test_results_come_back_in_argument_order():
    gate = threading.Event()

    def slow():
        gate.wait(timeout=5)
        return "slow"

    def fast():
        gate.set()
        return "fast"

    assert read_together(slow, fast) == ["slow", "fast"]


def test_a_failed_read_raises_where_it_is_collected():
    def broken():
        raise ValueError("no graph")

    with pytest.raises(ValueError, match="no graph"):
        read_together(lambda: 1, broken)


def test_a_read_sees_the_callers_context():
    request = contextvars.ContextVar("request", default="none")
    request.set("this one")

    assert start_read(request.get).result(timeout=5) == "this one"


def test_a_pooled_read_runs_its_own_reads_inline():
    def outer():
        inner = start_read(threading.get_ident)
        return threading.get_ident(), inner.result(timeout=5)

    outer_thread, inner_thread = start_read(outer).result(timeout=5)

    assert outer_thread == inner_thread
    assert outer_thread != threading.get_ident()


def test_the_rows_are_only_read_when_the_count_is_short():
    asked: list[str] = []

    def rows():
        asked.append("rows")
        return [{"name": "Demonic Tutor"}]

    assert _count_then_rows(lambda: 5.0, lambda: 3, rows) == (5.0, 3, [{"name": "Demonic Tutor"}])
    assert _count_then_rows(lambda: 5.0, lambda: 5, rows) == (5.0, 5, None)
    assert asked == ["rows"]
