"""Scryfall Tagger — a curated functional ontology, ingested as graph structure.

Tagger is the Scryfall community's functional tagging project: ~4.5k tags like
`sacrifice-outlet`, `mana-rock`, `reanimate`, `landfall`, arranged in a
parent/child taxonomy and applied to oracle IDs by hand. It covers 99.4% of our
corpus at a mean of 6.5 tags per card.

The taxonomy is not decoration — it is load-bearing. `sacrifice-outlet` carries
**zero** taggings of its own; all 2,440 sit on its 14 children
(`sacrifice-outlet-permanent`, `sacrifice-outlet-land`, …). Reading direct
taggings alone silently reports that no card is a sacrifice outlet.

Only direct taggings are stored as edges. Closure is a variable-length Cypher
traversal at query time, which keeps the write at ~200k edges instead of
materialising roughly a million.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

import structlog

from .scryfall import download_bulk, iter_cards

log = structlog.get_logger(__name__)


@dataclass(slots=True)
class Tag:
    id: str
    slug: str
    description: str = ""
    parent_ids: list[str] = field(default_factory=list)
    child_ids: list[str] = field(default_factory=list)
    oracle_ids: list[str] = field(default_factory=list)


def parse_tags(path: Path) -> Iterator[Tag]:
    """Stream the oracle-tags bulk file into `Tag` records."""
    for raw in iter_cards(path):
        if raw.get("type") != "oracle":
            continue

        yield Tag(
            id=raw["id"],
            slug=raw["slug"],
            description=raw.get("description") or "",
            parent_ids=list(raw.get("parent_ids") or []),
            child_ids=list(raw.get("child_ids") or []),
            oracle_ids=[t["oracle_id"] for t in (raw.get("taggings") or [])],
        )


def build_closure(tags: dict[str, Tag]) -> dict[str, set[str]]:
    """Resolve each tag to every oracle ID on it or any descendant.

    Used for offline analysis and for scoring deterministic rules; the graph
    itself does this traversal in Cypher.

    The live taxonomy is acyclic (verified: 0 cycles, deepest chain 6 levels
    under `tutor`), but the guard stays because Tagger is community-edited and
    a cycle would otherwise recurse until the stack blows. Note that under a
    cycle the memo can hold a partial result for nodes visited mid-loop — an
    acceptable degradation for data that is not supposed to contain cycles,
    and one the tests pin.
    """
    memo: dict[str, set[str]] = {}

    def resolve(tag_id: str, seen: frozenset[str]) -> set[str]:
        if tag_id in memo:
            return memo[tag_id]
        if tag_id in seen or tag_id not in tags:
            return set()

        tag = tags[tag_id]
        below = frozenset(seen | {tag_id})
        out = set(tag.oracle_ids)
        for child in tag.child_ids:
            out |= resolve(child, below)

        # Only memoise cycle-free results; a partial answer computed under a
        # `seen` guard is not valid for other callers.
        memo[tag_id] = out
        return out

    return {tag_id: resolve(tag_id, frozenset()) for tag_id in tags}


def ingest_tags(*, force_download: bool = False, batch_size: int = 5_000) -> dict[str, int]:
    """Download the oracle-tags bulk and write Tag nodes plus edges."""
    from .graph import apply_tag_schema, tag_stats, upsert_tag_edges, upsert_tags

    path = download_bulk("oracle_tags", force=force_download)
    tags = {tag.id: tag for tag in parse_tags(path)}
    log.info("tags.parsed", tags=len(tags))

    apply_tag_schema()
    upsert_tags(tags.values(), batch_size=batch_size)
    upsert_tag_edges(tags.values(), batch_size=batch_size)

    summary = tag_stats()
    log.info("tags.done", **summary)
    return summary
