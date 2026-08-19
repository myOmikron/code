"""Bulk-file streaming.

Scryfall switched bulk data from a JSON array to gzipped JSONL. These tests pin
both, so a format change surfaces as a failure rather than a zero-card ingest.
"""

from __future__ import annotations

import gzip
import json

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
