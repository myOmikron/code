"""The one cost reduction that is a property of the deck, not of a game.

An eminence that discounts spells works from the command zone, before the
commander is ever cast, so its deck pays the reduced cost in every game from
the first turn on. Grading that deck's curve by printed cost measures a deck
nobody plays — and the frontend's statistics tab already counts the discount
in (`frontend/mtg/src/utils/commander.ts`), so the advisor has to bucket the
same way or the two views disagree by a column on every affected card.

Battlefield cost reducers (Animar, Goreclaw) stay printed on purpose: they
are a game state the deck has to reach, not a standing property of the deck.

Every path that buckets a mana value applies the discount at its own data
boundary: `diagnose`, `suggest_swaps`, `find_replacements`, and `_fill_deck`
rewrite the fetched deck rows, and `suggest` discounts each candidate once as
it becomes a `Suggestion` — the single door every add, swap and fill
candidate leaves through.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

# Commander name -> (creature type whose spells cost less, by how much).
# Exactly one eminence in all of Magic reduces costs; keyed by name so the
# table reads like the card does.
DISCOUNTS: dict[str, tuple[str, int]] = {
    "The Ur-Dragon": ("Dragon", 1),
}


def eminence_discount(commander_names: Iterable[str | None]) -> tuple[str, int] | None:
    """The discount the command zone grants, if any of its seats carries one."""
    for name in commander_names:
        found = DISCOUNTS.get(name or "")
        if found is not None:
            return found
    return None


def discount_for(
    cards: list[dict[str, Any]], commander_ids: Iterable[str]
) -> tuple[str, int] | None:
    """The discount, resolved from card rows already in hand.

    The command zone normally rides inside the deck entries, so the names are
    in `cards` and this costs nothing. A commander the rows do not hold — a
    CLI deck file that keeps the command zone out of the list — falls back to
    one indexed fetch, the same trade `diagnose` makes for its type targets.
    """
    ids = list(commander_ids)
    by_id = {card["oracle_id"]: card["name"] for card in cards}
    held = [by_id[oid] for oid in ids if oid in by_id]

    found = eminence_discount(held)
    if found is not None or len(held) == len(ids):
        return found

    from .graph import fetch_deck

    missing = [oid for oid in ids if oid not in by_id]
    return eminence_discount(row["name"] for row in fetch_deck(dict.fromkeys(missing, 1)))


def discounted_cmc(cmc: float, type_line: str | None, discount: tuple[str, int] | None) -> float:
    """A card's mana value as the deck casts it."""
    if discount is None:
        return cmc
    affected_type, less = discount
    if affected_type not in (type_line or ""):
        return cmc
    return max(0.0, cmc - less)


def apply_discount(rows: list[dict[str, Any]], discount: tuple[str, int] | None) -> None:
    """Rewrite `cmc` on fetched card rows in place, once, at the data boundary."""
    if discount is None:
        return
    for row in rows:
        row["cmc"] = discounted_cmc(row.get("cmc") or 0.0, row.get("type_line"), discount)
