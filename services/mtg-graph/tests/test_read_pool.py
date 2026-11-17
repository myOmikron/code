"""Reads that run side by side. Pure: no graph, the reads are plain functions."""

from __future__ import annotations

import contextvars
import threading

import pytest

from deck_lab.graph import read_together, start_read
from deck_lab.suggestions import _Ahead


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


def test_take_collects_the_read_started_with_the_same_arguments():
    calls = []

    def read(key, *, limit):
        calls.append((key, limit))
        return f"{key}:{limit}"

    ahead = _Ahead()
    ahead.start(read, "a", limit=1)

    assert ahead.take(read, "a", limit=1) == "a:1"
    assert calls == [("a", 1)]


def test_take_reads_again_when_the_arguments_differ():
    calls = []

    def read(key):
        calls.append(key)
        return key

    ahead = _Ahead()
    ahead.start(read, "started")

    assert ahead.take(read, "wanted") == "wanted"
    assert calls.count("wanted") == 1


def test_a_started_read_is_collected_once():
    calls = []

    def read():
        calls.append(1)
        return len(calls)

    ahead = _Ahead()
    ahead.start(read)

    assert [ahead.take(read), ahead.take(read)] == [1, 2]
