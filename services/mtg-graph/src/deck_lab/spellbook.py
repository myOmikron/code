"""Commander Spellbook adapter — combos as ground truth.

LLMs are unreliable about Magic rules interactions, so combo detection is never
reasoned; it is looked up. Commander Spellbook is an open, MIT-licensed, curated
combo database with a documented REST backend.

Unlike EDHREC this is a supported API, so the quarantine is lighter — but it is
still the only module that talks to it.

The corpus is ingested (`deck-lab ingest-combos`) rather than queried per deck:
`find-my-combos` answered the right question, but at ~3 s per POST with a cache
keyed on exact deck contents, it missed on essentially every request during
active building and was the whole tail latency of /suggestions. The bulk export
(627 MB as of 2026-08; it grows) becomes `(:Combo)-[:USES]->(:Card)` nodes, and
"which combos am I one card short of" becomes a local graph query.
`find_my_combos` remains as the pre-ingest fallback.

Cards are identified by `oracleId`, which joins straight to our graph — no
name matching required.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

import httpx
import structlog

from .config import settings

log = structlog.get_logger(__name__)

FIND_MY_COMBOS_URL = "https://backend.commanderspellbook.com/find-my-combos"
VARIANTS_URL = "https://json.commanderspellbook.com/variants.json"
CACHE_TTL_SECONDS = 24 * 60 * 60


@dataclass(frozen=True, slots=True)
class Combo:
    id: str
    uses: tuple[str, ...]  # oracle ids
    card_names: tuple[str, ...]
    produces: tuple[str, ...]
    bracket: str = ""
    popularity: int = 0
    missing: tuple[str, ...] = field(default_factory=tuple)  # card names not in the deck
    # Each piece's colour identity, index-parallel to `card_names` — the graph
    # path fills it, the HTTP fallback cannot (Spellbook's card objects do not
    # carry one), so an empty tuple means "not known", never "colourless".
    color_identities: tuple[tuple[str, ...], ...] = field(default_factory=tuple)

    @property
    def is_complete(self) -> bool:
        return not self.missing

    def identity_of(self, name: str) -> tuple[str, ...] | None:
        """The colour identity of the piece `name` names.

        `None` when this combo carries no identities at all (the HTTP
        fallback); an empty tuple is a real answer — the piece is colourless.
        """
        for piece, identity in zip(self.card_names, self.color_identities, strict=False):
            if piece == name:
                return identity
        return None


def _cache_path(card_names: list[str]) -> Path:
    # Deck identity is the sorted card set — order and quantity are irrelevant
    # to which combos are present.
    digest = hashlib.sha256("\n".join(sorted(card_names)).encode()).hexdigest()[:16]
    return settings.data_dir / "spellbook" / f"{digest}.json"


def _parse_combos(entries: list[dict], *, deck: frozenset[str]) -> list[Combo]:
    """Parse combo entries, computing which pieces the deck lacks.

    The API has no `missing` field — `almostIncluded` returns every piece and
    leaves the diff to the caller. Computing it here means no dependence on an
    undocumented field, and it stays correct if they add one.
    """
    out: list[Combo] = []

    for entry in entries:
        uses, names = [], []
        for use in entry.get("uses") or []:
            card = use.get("card") or {}
            if oracle_id := card.get("oracleId"):
                uses.append(oracle_id)
                names.append(card.get("name", ""))

        produces = [
            (produced.get("feature") or {}).get("name", "")
            for produced in entry.get("produces") or []
        ]

        missing = [name for name in names if name and name not in deck]

        out.append(
            Combo(
                id=str(entry.get("id", "")),
                uses=tuple(uses),
                card_names=tuple(names),
                produces=tuple(p for p in produces if p),
                bracket=entry.get("bracketTag") or "",
                popularity=int(entry.get("popularity") or 0),
                missing=tuple(missing),
            )
        )

    return out


def find_my_combos(card_names: list[str], *, force: bool = False) -> dict[str, list[Combo]]:
    """Combos in a decklist.

    Returns `{"included": [...], "almost_included": [...]}` — complete combos and
    those one or more cards short. The second list is the combo-completion
    retrieval channel.
    """
    path = _cache_path(card_names)

    if not force and path.exists() and time.time() - path.stat().st_mtime < CACHE_TTL_SECONDS:
        payload = json.loads(path.read_text())
        log.debug("spellbook.cached", cards=len(card_names))
    else:
        log.info("spellbook.fetch", cards=len(card_names))
        response = httpx.post(
            FIND_MY_COMBOS_URL,
            json={"main": [{"card": name, "quantity": 1} for name in card_names]},
            headers={"User-Agent": settings.scryfall_user_agent, "Accept": "application/json"},
            # This call sits inside /suggestions' request path. A slow answer
            # degrades gracefully there (the channel is skipped with a note);
            # a hung one holds the whole report hostage, so the cap is tight.
            timeout=10.0,
        )
        response.raise_for_status()
        payload = response.json()

        # Atomic: a write that dies partway (disk full, kill -9) must never
        # leave a truncated file where a good cached answer used to be.
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload))
        tmp.replace(path)

    results = payload.get("results") or payload

    deck = frozenset(card_names)

    return {
        "included": _parse_combos(results.get("included") or [], deck=deck),
        "almost_included": _parse_combos(results.get("almostIncluded") or [], deck=deck),
    }


def fetch_variants(*, force: bool = False) -> Path:
    """Download the bulk variants export, cached on disk by ETag.

    The file is hundreds of megabytes, so it streams to disk and a HEAD
    request decides freshness — re-downloading on every ingest run would cost
    more than the ingest itself.

    A network failure (HEAD or the stream) serves the cached file when one
    exists — stale combos are a better answer than an ingest that cannot run
    at all — and only raises when there is nothing on disk to fall back to.
    """
    path = settings.data_dir / "spellbook" / "variants.json"
    etag_path = path.with_suffix(".etag")
    headers = {"User-Agent": settings.scryfall_user_agent}

    try:
        head = httpx.head(VARIANTS_URL, headers=headers, timeout=30.0, follow_redirects=True)
        head.raise_for_status()
    except httpx.HTTPError as exc:
        if path.exists():
            log.warning("spellbook.variants_stale", stage="head", error=str(exc))
            return path
        raise
    remote_etag = head.headers.get("etag", "")

    current = (
        path.exists()
        and remote_etag
        and (etag_path.exists() and etag_path.read_text() == remote_etag)
    )
    if not force and current:
        log.info("spellbook.variants_cached", bytes=path.stat().st_size)
        return path

    log.info("spellbook.variants_fetch", url=VARIANTS_URL)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Stream into a tmp file, not the destination: an aborted download must
    # leave the previous good copy in place rather than a truncated one.
    tmp = path.with_suffix(".json.tmp")
    try:
        with httpx.stream(
            "GET", VARIANTS_URL, headers=headers, timeout=120.0, follow_redirects=True
        ) as response:
            response.raise_for_status()
            with tmp.open("wb") as fh:
                for chunk in response.iter_bytes():
                    fh.write(chunk)
    except httpx.HTTPError as exc:
        tmp.unlink(missing_ok=True)
        if path.exists():
            log.warning("spellbook.variants_stale", stage="stream", error=str(exc))
            return path
        raise
    tmp.replace(path)
    etag_path.write_text(remote_etag)
    log.info("spellbook.variants_fetched", bytes=path.stat().st_size)
    return path


def iter_variants(path: Path, *, _chunk: int = 1 << 20) -> Iterator[dict]:
    """Yield the export's variant objects one at a time.

    The export is a single JSON document; `json.load` would materialise the
    whole tree (gigabytes of Python objects) to read a few fields per combo.
    This walks the `variants` array with `raw_decode` over a sliding buffer
    instead, holding roughly one chunk in memory. `_chunk` is exposed so tests
    can force object boundaries to straddle reads.
    """
    decoder = json.JSONDecoder()
    with path.open(encoding="utf-8") as fh:
        buf = ""
        while True:
            idx = buf.find('"variants"')
            bracket = buf.find("[", idx) if idx != -1 else -1
            if bracket != -1:
                pos = bracket + 1
                break
            chunk = fh.read(_chunk)
            if not chunk:
                return
            buf += chunk

        while True:
            while pos < len(buf) and buf[pos] in " \t\r\n,":
                pos += 1
            if pos < len(buf) and buf[pos] == "]":
                return
            try:
                obj, pos = decoder.raw_decode(buf, pos)
            except ValueError:
                # Either the buffer ends mid-object or mid-separator — read
                # more. At EOF this also ends a malformed document quietly;
                # the ingest counts what it wrote, so truncation is visible.
                chunk = fh.read(_chunk)
                if not chunk:
                    return
                buf = buf[pos:] + chunk
                pos = 0
                continue
            yield obj
            if pos > 2 * _chunk:
                buf = buf[pos:]
                pos = 0


def parse_variant(entry: dict) -> dict | None:
    """One bulk-export variant as an ingest row, or None if out of scope.

    Out of scope: not curator-approved (`status` != OK), not commander-legal,
    needing a card *template* (`requires`, e.g. "a creature with power 2+") —
    a template is not a card we can suggest, and treating it as satisfied
    would report combos closer to completion than they are — or any piece
    without an oracleId to join on.

    Piece quantity is deliberately ignored: deck identity is a card *set*
    here, exactly as in `_cache_path` and `_parse_combos`.
    """
    if entry.get("status") != "OK":
        return None
    if not (entry.get("legalities") or {}).get("commander", False):
        return None
    if entry.get("requires"):
        return None

    uses: list[str] = []
    names: list[str] = []
    for use in entry.get("uses") or []:
        card = use.get("card") or {}
        oracle_id = card.get("oracleId")
        if not oracle_id:
            return None
        uses.append(oracle_id)
        names.append(card.get("name", ""))
    if not uses:
        return None

    produces = [
        (produced.get("feature") or {}).get("name", "") for produced in entry.get("produces") or []
    ]

    return {
        "id": str(entry.get("id", "")),
        "uses": uses,
        "names": names,
        "produces": [p for p in produces if p],
        "bracket": entry.get("bracketTag") or "",
        "popularity": int(entry.get("popularity") or 0),
        "pieces": len(uses),
    }


def _combos_from_rows(rows: list[dict], deck_oracle_ids: set[str]) -> dict[str, list[Combo]]:
    """Split graph rows into complete and one-or-more-short, computing missing."""
    included: list[Combo] = []
    almost: list[Combo] = []

    for row in rows:
        missing = tuple(
            name
            for oracle_id, name in zip(row["uses"], row["names"], strict=True)
            if oracle_id not in deck_oracle_ids
        )
        combo = Combo(
            id=row["id"],
            uses=tuple(row["uses"]),
            card_names=tuple(row["names"]),
            produces=tuple(row["produces"] or ()),
            bracket=row["bracket"] or "",
            popularity=int(row["popularity"] or 0),
            missing=missing,
            color_identities=tuple(tuple(ci or ()) for ci in row.get("color_identities") or ()),
        )
        (included if combo.is_complete else almost).append(combo)

    return {"included": included, "almost_included": almost}


def deck_combos(
    deck_oracle_ids: list[str], card_names: list[str] | None = None
) -> dict[str, list[Combo]]:
    """Combos in the deck — local graph lookup, HTTP fallback.

    After `deck-lab ingest-combos` this is one local round trip. With no Combo
    nodes in the graph yet it falls back to `find_my_combos`, so nothing
    breaks — it is merely slow again — before the first ingest.
    """
    from .graph import combo_count, deck_combo_rows, fetch_deck

    if combo_count() == 0:
        # The graph path never needed names — it joins on oracle_id. Only the
        # Spellbook HTTP fallback's request shape does, so derive them here
        # rather than force every caller to carry ~100 names just in case.
        if not card_names:
            card_names = [row["name"] for row in fetch_deck(dict.fromkeys(deck_oracle_ids, 1))]
        return find_my_combos(card_names)

    return _combos_from_rows(deck_combo_rows(deck_oracle_ids), set(deck_oracle_ids))


def ingest_combos(*, force_download: bool = False) -> dict[str, int]:
    """Fetch the bulk export and replace the graph's combo layer.

    Variants are dropped for two counted — never silent — reasons:
    `out_of_scope` (not curator-approved, not commander-legal, template
    requirements, unjoinable pieces; see `parse_variant`) and `unknown_pieces`
    (a piece absent from our card graph, which `replace_combos` requires the
    caller to screen out).
    """
    from .graph import apply_schema, known_oracle_ids, replace_combos

    apply_schema()
    path = fetch_variants(force=force_download)
    known = known_oracle_ids()

    rows: list[dict] = []
    total = 0
    out_of_scope = 0
    unknown_pieces = 0
    for entry in iter_variants(path):
        total += 1
        row = parse_variant(entry)
        if row is None:
            out_of_scope += 1
        elif any(oid not in known for oid in row["uses"]):
            unknown_pieces += 1
        else:
            rows.append(row)

    written = replace_combos(rows)
    return {
        "variants": total,
        "written": written,
        "out_of_scope": out_of_scope,
        "unknown_pieces": unknown_pieces,
    }
