"""Scryfall bulk-data access.

Bulk downloads are the intended refresh path — never iterate the card API to
build the corpus. Files are cached on disk and only re-downloaded when Scryfall
reports a newer `updated_at`, satisfying the documented 24h caching requirement.

Format note: Scryfall now publishes bulk data as gzipped JSONL
(`jsonl_download_uri`), not the JSON array the older docs describe. The archive
is kept compressed on disk — 24MB rather than ~500MB — and decompressed on the
fly while streaming.
"""

from __future__ import annotations

import gzip
import json
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import IO

import httpx
import structlog

from .config import settings

log = structlog.get_logger(__name__)

BULK_INDEX_URL = "https://api.scryfall.com/bulk-data"
SEARCH_URL = "https://api.scryfall.com/cards/search"
GZIP_MAGIC = b"\x1f\x8b"

# Commander eligibility is a rules question, not a type-line question, and the
# bulk files do not answer it. Deriving it from the type line was wrong in both
# directions but especially here: `Hearthhull, the Worldseed` is a
# `Legendary Artifact — Spacecraft` that only becomes a creature at 8+ Station
# counters, carries no "can be your commander" grant, and is nonetheless the
# face commander of its own precon. 64 cards are non-creature commanders with
# no textual grant — Vehicles, Spacecraft, Backgrounds, a Legendary Sorcery —
# and no type-line heuristic reaches them.
#
# So we ask Scryfall, which implements the rules — but only about the cards a
# type line cannot settle. "Every legendary creature is a commander" is rule
# 903.3a and needs no lookup; the exceptions are the 96 non-creature commanders,
# which fit in **one** unpaginated response.
#
# Asking for the whole `is:commander` set instead costs 21 paged requests, and
# that is not a theoretical cost: it 429s partway through and degrades to the
# heuristic, leaving a commander count quietly a couple of hundred short with no
# error anywhere. One request cannot half-fail.
COMMANDER_EXCEPTIONS_QUERY = "is:commander -type:creature"
COMMANDER_CACHE = "commander_exceptions.json"


def _headers() -> dict[str, str]:
    return {
        "User-Agent": settings.scryfall_user_agent,
        "Accept": "application/json",
    }


def _bulk_entry(bulk_type: str) -> dict:
    """Look up one entry in the bulk-data index."""
    response = httpx.get(BULK_INDEX_URL, headers=_headers(), timeout=30.0)
    response.raise_for_status()
    payload = response.json()["data"]

    for entry in payload:
        if entry["type"] == bulk_type:
            return entry

    available = sorted(entry["type"] for entry in payload)
    raise ValueError(f"Unknown bulk type {bulk_type!r}; Scryfall offers {available}")


def _download_uri(entry: dict) -> str:
    """Prefer the JSONL archive; fall back to the legacy array download."""
    uri = entry.get("jsonl_download_uri") or entry.get("download_uri")
    if not uri:
        raise KeyError(
            f"Bulk entry {entry.get('type')!r} has no download URI; available keys: {sorted(entry)}"
        )
    return uri


def _local_path(bulk_type: str, uri: str) -> Path:
    suffix = ".jsonl.gz" if uri.endswith(".jsonl.gz") else Path(uri).suffix or ".json"
    return settings.bulk_dir / f"{bulk_type}{suffix}"


def download_bulk(bulk_type: str = "oracle_cards", *, force: bool = False) -> Path:
    """Download a bulk file, reusing the cached copy unless Scryfall has newer data.

    Returns the path to the local archive.
    """
    entry = _bulk_entry(bulk_type)
    uri = _download_uri(entry)
    updated_at = entry["updated_at"]

    settings.bulk_dir.mkdir(parents=True, exist_ok=True)
    target = _local_path(bulk_type, uri)
    stamp = settings.bulk_dir / f"{bulk_type}.updated_at"

    if not force and target.exists() and stamp.exists():
        cached = stamp.read_text().strip()
        if cached == updated_at:
            log.info("bulk.cached", type=bulk_type, updated_at=cached, path=str(target))
            return target
        log.info("bulk.stale", type=bulk_type, cached=cached, remote=updated_at)

    size_mb = round((entry.get("compressed_size") or entry.get("size") or 0) / 1e6, 1)
    log.info(
        "bulk.download",
        type=bulk_type,
        compressed_mb=size_mb,
        updated_at=str(datetime.fromisoformat(updated_at)),
    )

    # Stream to a temp file so an interrupted download never leaves a truncated
    # archive in place of a good cached copy.
    tmp = target.with_name(target.name + ".part")
    with httpx.stream(
        "GET", uri, headers=_headers(), timeout=300.0, follow_redirects=True
    ) as response:
        response.raise_for_status()
        with tmp.open("wb") as handle:
            for chunk in response.iter_bytes(chunk_size=1 << 20):
                handle.write(chunk)

    tmp.replace(target)
    stamp.write_text(updated_at)
    log.info(
        "bulk.ready", type=bulk_type, path=str(target), mb=round(target.stat().st_size / 1e6, 1)
    )
    return target


def _open_maybe_gzip(path: Path) -> IO[bytes]:
    """Open `path`, transparently decompressing if it is a gzip archive.

    Detected by magic bytes rather than file extension: httpx decodes
    `Content-Encoding: gzip` itself, so a `.gz` URL can land on disk already
    decompressed depending on how the CDN labels it.
    """
    with path.open("rb") as probe:
        is_gzip = probe.read(2) == GZIP_MAGIC

    return gzip.open(path, "rb") if is_gzip else path.open("rb")


def iter_cards(path: Path) -> Iterator[dict]:
    """Stream card objects from a bulk file.

    Handles both the current JSONL format and the legacy JSON array, so a stale
    cached download does not become a silent zero-card ingest.
    """
    with _open_maybe_gzip(path) as handle:
        first = handle.readline().lstrip()
        if not first:
            return

        # A legacy array file starts with '['; JSONL starts with '{'.
        if first.startswith(b"["):
            handle.seek(0)
            yield from json.load(handle)
            return

        yield json.loads(first)
        for line in handle:
            if stripped := line.strip():
                yield json.loads(stripped)


def _commander_cache_path() -> Path:
    return settings.bulk_dir / COMMANDER_CACHE


def fetch_commander_exceptions(*, force: bool = False) -> set[str]:
    """Oracle ids of every commander a type line cannot identify.

    The 96 legendary non-creature commanders — Vehicles, Spacecraft,
    Backgrounds, planeswalkers, a Legendary Sorcery. Fits in one response, so
    there is no pagination to half-fail.

    On a network failure the cached copy is served; with no cache the caller
    gets an empty set and falls back to the type-line heuristic, which is right
    for the 3,300 legendary creatures and wrong only for these 96.
    """
    path = _commander_cache_path()

    if not force and path.exists():
        cached = set(json.loads(path.read_text()))
        log.debug("scryfall.commanders.cached", count=len(cached))
        return cached

    try:
        response = httpx.get(
            SEARCH_URL,
            params={"q": COMMANDER_EXCEPTIONS_QUERY, "unique": "cards"},
            headers=_headers(),
            timeout=30.0,
        )
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPError as exc:
        if path.exists():
            log.warning("scryfall.commanders.stale", error=str(exc))
            return set(json.loads(path.read_text()))
        log.warning("scryfall.commanders.unavailable", error=str(exc))
        return set()

    oracle_ids = {c["oracle_id"] for c in payload.get("data", []) if c.get("oracle_id")}

    # If Scryfall ever pages this, the set is silently incomplete and a real
    # commander stops being nominable. Say so rather than shipping a short list.
    if payload.get("has_more"):
        log.warning(
            "scryfall.commanders.truncated",
            got=len(oracle_ids),
            total=payload.get("total_cards"),
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sorted(oracle_ids)))
    log.info("scryfall.commanders.fetched", count=len(oracle_ids))
    return oracle_ids
