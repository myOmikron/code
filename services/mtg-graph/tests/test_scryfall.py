"""Bulk-file streaming.

Scryfall switched bulk data from a JSON array to gzipped JSONL. These tests pin
both, so a format change surfaces as a failure rather than a zero-card ingest.
"""

from __future__ import annotations

import gzip
import json
import os
import time
from types import SimpleNamespace

import httpx
import pytest

from deck_lab.scryfall import _download_uri, iter_cards

CARDS = [{"name": "Sol Ring"}, {"name": "Command Tower"}]


def _write_jsonl(path, cards, *, compress: bool):
    payload = "\n".join(json.dumps(card) for card in cards).encode()
    if compress:
        path.write_bytes(gzip.compress(payload))
    else:
        path.write_bytes(payload)
    return path


def test_reads_gzipped_jsonl(tmp_path):
    path = _write_jsonl(tmp_path / "cards.jsonl.gz", CARDS, compress=True)
    assert list(iter_cards(path)) == CARDS


def test_reads_plain_jsonl(tmp_path):
    """httpx may decode Content-Encoding itself, landing an uncompressed file."""
    path = _write_jsonl(tmp_path / "cards.jsonl", CARDS, compress=False)
    assert list(iter_cards(path)) == CARDS


def test_reads_legacy_json_array(tmp_path):
    path = tmp_path / "cards.json"
    path.write_bytes(json.dumps(CARDS).encode())
    assert list(iter_cards(path)) == CARDS


def test_blank_lines_are_skipped(tmp_path):
    path = tmp_path / "cards.jsonl"
    path.write_bytes(b'{"name": "Sol Ring"}\n\n{"name": "Command Tower"}\n')
    assert list(iter_cards(path)) == CARDS


def test_empty_file_yields_nothing(tmp_path):
    path = tmp_path / "empty.jsonl"
    path.write_bytes(b"")
    assert list(iter_cards(path)) == []


def test_prefers_jsonl_uri():
    entry = {
        "type": "oracle_cards",
        "jsonl_download_uri": "https://data.scryfall.io/x.jsonl.gz",
        "download_uri": "https://data.scryfall.io/x.json",
    }
    assert _download_uri(entry) == "https://data.scryfall.io/x.jsonl.gz"


def test_falls_back_to_legacy_uri():
    entry = {"type": "oracle_cards", "download_uri": "https://data.scryfall.io/x.json"}
    assert _download_uri(entry) == "https://data.scryfall.io/x.json"


def test_missing_uri_raises_with_available_keys():
    """The failure mode that broke the first ingest run — make it legible."""
    with pytest.raises(KeyError, match="no download URI"):
        _download_uri({"type": "oracle_cards", "uri": "https://api.scryfall.com/..."})


# --- commander_exceptions.json TTL (Task 11) --------------------------------
# Previously the cache check was existence-only, so a set released after the
# file was last written permanently misjudged that set's non-creature
# commanders. `COMMANDER_CACHE_TTL_SECONDS` bounds how long the file is
# trusted without a refetch.


class _FakeResponse:
    """Just enough of an httpx.Response for `fetch_commander_exceptions`."""

    def __init__(self, payload=None, *, error=None):
        self._payload = payload
        self._error = error

    def raise_for_status(self):
        if self._error is not None:
            raise self._error

    def json(self):
        return self._payload


@pytest.fixture
def stubbed_commanders(tmp_path, monkeypatch):
    """Point the disk cache at a temp dir and script `httpx.get`'s replies."""
    from deck_lab import scryfall

    monkeypatch.setattr(scryfall.settings, "data_dir", tmp_path)

    responses: list[_FakeResponse] = []
    calls: list[str] = []

    def fake_get(url, **kwargs):
        calls.append(url)
        return responses.pop(0)

    monkeypatch.setattr(scryfall.httpx, "get", fake_get)

    return SimpleNamespace(scryfall=scryfall, responses=responses, calls=calls)


def _write_cache(scryfall, oracle_ids, *, age_seconds=0):
    path = scryfall._commander_cache_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sorted(oracle_ids)))
    if age_seconds:
        stamp = time.time() - age_seconds
        os.utime(path, (stamp, stamp))
    return path


def test_a_fresh_cache_is_served_without_a_fetch(stubbed_commanders):
    scryfall = stubbed_commanders.scryfall
    _write_cache(scryfall, {"fresh-oracle-id"})

    result = scryfall.fetch_commander_exceptions()

    assert result == {"fresh-oracle-id"}
    assert stubbed_commanders.calls == []


def test_a_stale_cache_is_refetched(stubbed_commanders):
    scryfall = stubbed_commanders.scryfall
    _write_cache(
        scryfall, {"old-oracle-id"}, age_seconds=scryfall.COMMANDER_CACHE_TTL_SECONDS + 1
    )
    stubbed_commanders.responses.append(
        _FakeResponse({"data": [{"oracle_id": "new-oracle-id"}], "has_more": False})
    )

    result = scryfall.fetch_commander_exceptions()

    assert result == {"new-oracle-id"}
    assert len(stubbed_commanders.calls) == 1


def test_a_stale_cache_survives_a_failing_refetch(stubbed_commanders):
    """The pre-existing fallback (`except httpx.HTTPError`) already logs a
    warning and serves the stale file — this only pins that a TTL expiry is
    one more way into that path, not a way to lose the cached answer."""
    scryfall = stubbed_commanders.scryfall
    _write_cache(
        scryfall, {"old-oracle-id"}, age_seconds=scryfall.COMMANDER_CACHE_TTL_SECONDS + 1
    )
    stubbed_commanders.responses.append(_FakeResponse(error=httpx.HTTPError("boom")))

    result = scryfall.fetch_commander_exceptions()

    assert result == {"old-oracle-id"}
