"""Scryfall bulk -> Neo4j `Card` nodes."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date
from pathlib import Path

import structlog

from .models import Card, card_from_scryfall
from .scryfall import download_bulk, fetch_commander_exceptions, iter_cards

log = structlog.get_logger(__name__)

# Non-playable products that share the card schema. Without this filter the
# corpus picks up ~2k art cards, tokens and memorabilia that are commander-legal
# by omission rather than by rule.
EXCLUDED_LAYOUTS = {
    "art_series",
    "token",
    "double_faced_token",
    "emblem",
    "planar",
    "scheme",
    "vanguard",
    "augment",
    "host",
}


def is_unreleased(raw: dict, *, today: str) -> bool:
    """A card that has been spoiled but has not reached its release date.

    Scryfall reports `legalities.commander == "not_legal"` for anything not yet
    released, so a plain legality filter drops every new spoiler — which is
    exactly the cold-start case the mechanical layer exists to serve. A user
    building around a card previewed two days ago found their commander missing
    from the graph entirely, which then cascaded into the wrong commander being
    inferred for their whole deck.

    Restricted to paper cards so Arena-only and Alchemy rebalances, which are
    permanently commander-illegal, do not sneak in on a future date.
    """
    released = raw.get("released_at") or ""
    if not released or released <= today:
        return False

    return "paper" in (raw.get("games") or [])


def is_ingestable(raw: dict, *, today: str | None = None) -> bool:
    """Commander-legal cards, plus spoilers that will become legal on release."""
    if raw.get("layout") in EXCLUDED_LAYOUTS:
        return False
    if not raw.get("oracle_id"):
        return False

    legality = (raw.get("legalities") or {}).get("commander")
    if legality == "legal":
        return True
    if legality == "banned":
        return False

    return is_unreleased(raw, today=today or date.today().isoformat())


def parse_bulk(path: Path, commander_exceptions: set[str] | None = None) -> Iterator[Card]:
    """Stream a bulk file into `Card` models, skipping anything not ingestable.

    `commander_exceptions` are the commanders no type line identifies — the 96
    legendary non-creature ones. Unioned with the type-line rule rather than
    replacing it, so an empty set (offline, no cache) degrades to exactly the
    old behaviour instead of emptying the commander pool.
    """
    for raw in iter_cards(path):
        if not is_ingestable(raw):
            continue

        card = card_from_scryfall(raw)

        # `_can_be_commander` is a rule and gets 2 of 3,354 wrong. Scryfall's
        # `is:commander -type:creature` is the complete, curated answer for
        # exactly the population the rule struggles with, so where the card is a
        # legendary non-creature the list wins **in both directions** — it adds
        # Grist and removes The Eternity Elevator.
        #
        # Every legendary creature is a commander by rule 903.3a and is not in
        # that list at all, so it must never be consulted for them; doing so
        # would mark all 3,300 ineligible.
        if commander_exceptions and not card.is_creature and card.is_legendary:
            card.can_be_commander = card.oracle_id in commander_exceptions

        yield card


def ingest(*, force_download: bool = False, batch_size: int = 1_000) -> dict[str, int]:
    """Download (or reuse) the oracle_cards bulk and load it into Neo4j."""
    # Imported here so `parse_bulk` stays usable without a running database.
    from .graph import apply_schema, stats, upsert_cards

    path = download_bulk("oracle_cards", force=force_download)
    exceptions = fetch_commander_exceptions(force=force_download)
    if not exceptions:
        log.warning("ingest.commanders.heuristic_only")

    apply_schema()
    written = upsert_cards(parse_bulk(path, exceptions), batch_size=batch_size)

    summary = stats()
    log.info("ingest.done", written=written, **summary)
    return summary
