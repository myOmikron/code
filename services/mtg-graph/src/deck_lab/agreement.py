"""Score a theme against EDHREC's tag pages — the layer's external check.

`docs/themes.md` cites a dozen agreement numbers and every one of them was
produced by a throwaway script, then re-derived from scratch the next time
somebody wanted one. That is how the numbers in a design document go stale
without anybody noticing: nothing recomputes them, so nothing contradicts
them. This is that script, kept.

The **High Synergy** list is the one that matters. EDHREC's plain Top Cards
list for a tag is dominated by format staples — Sol Ring heads the storm page
— so agreement there measures how many staples we let into a theme, not
whether the theme found the archetype. High Synergy is the tag-*defining*
population: cards played in that tag far above their baseline rate.

Two readings to keep straight, both learned the hard way:

- **A miss is not automatically a defect.** A cares-gated theme is *right* to
  exclude the enablers a deck co-plays, and the produces side is what
  `retrieve_on` exists to reach. Score detection and retrieval separately
  (`--retrieval`) before concluding anything: voltron's misses were 5/10 as
  detection and 7/10 as retrieval, and only the second number was the bug.
- **Agreement can be scored downward on purpose.** `counters` against
  `minus-1-minus-1-counters` measures a *conflation* — 8/10 was the defect
  and 3/10 is the fix.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx
import structlog

from .config import settings

log = structlog.get_logger(__name__)

TAG_URL = "https://json.edhrec.com/pages/tags/{slug}.json"

# EDHREC's own tag slugs, for the checks `THEME_TAG_SLUGS` does not cover
# because it exists for a different job — reaching commander×theme subpages.
# A tag here needs no subpage; it only needs a High Synergy list.
CHECK_SLUGS: dict[str, tuple[str, ...]] = {
    "voltron": ("voltron", "equipment", "auras"),
    "spellslinger": ("spellslinger", "storm"),
    "counters": ("plus-1-plus-1-counters", "minus-1-minus-1-counters"),
    "reanimator": ("reanimator", "discard", "madness"),
    "poison": ("infect",),
}


@dataclass(frozen=True, slots=True)
class Agreement:
    theme_id: str
    tag_slug: str
    retrieval: bool
    hits: tuple[str, ...]
    misses: tuple[str, ...]
    absent: tuple[str, ...]

    @property
    def scored(self) -> int:
        """The list minus cards the corpus does not hold — an absent card is
        not evidence either way, and counting it as a miss quietly penalises
        a theme for an ingest gap."""
        return len(self.hits) + len(self.misses)

    def __str__(self) -> str:
        side = "retrieval" if self.retrieval else "detection"
        return f"{self.theme_id} vs {self.tag_slug} ({side}): {len(self.hits)}/{self.scored}"


def high_synergy(tag_slug: str, limit: int = 10) -> list[str]:
    """The tag page's High Synergy card names, most synergistic first.

    Returns `[]` for a tag EDHREC has no page for — `poisoned-gifts` 403s,
    the same way commander slugs do — rather than raising, because "no such
    tag" is an answer the caller wants, not an error.
    """
    response = httpx.get(
        TAG_URL.format(slug=tag_slug),
        headers={"User-Agent": settings.scryfall_user_agent, "Accept": "application/json"},
        timeout=30.0,
        follow_redirects=True,
    )
    if response.status_code in (403, 404):
        log.warning("agreement.no_tag_page", slug=tag_slug, status=response.status_code)
        return []
    response.raise_for_status()

    for cardlist in response.json()["container"]["json_dict"]["cardlists"]:
        if "High Synergy" in cardlist.get("header", ""):
            return [view["name"] for view in cardlist.get("cardviews", [])][:limit]

    log.warning("agreement.no_high_synergy_list", slug=tag_slug)
    return []


def score(theme_id: str, tag_slug: str, *, retrieval: bool = False, limit: int = 10) -> Agreement:
    """Score one theme against one EDHREC tag over the live graph.

    Membership is recomputed with `theme_fit` rather than read off the
    `FITS_THEME` edges, because those edges are built with `retrieval=True`
    only — reading them would silently score every theme's retrieval side and
    report it as detection, which is the exact distinction this is here to
    keep straight.
    """
    from .diagnostics import _as_resources, resource_idf
    from .graph import all_card_resources
    from .themes import FIT_THRESHOLD, THEMES, theme_fit

    theme = THEMES[theme_id]
    idf = resource_idf()
    names = high_synergy(tag_slug, limit)
    wanted = set(names)

    members: set[str] = set()
    known: set[str] = set()
    for card in all_card_resources():
        if card["name"] not in wanted:
            continue
        known.add(card["name"])
        produces = _as_resources({r for r in card["produces"] if r})
        cares = _as_resources({r for r in card["cares_about"] if r})
        if theme_fit(produces, cares, theme, idf, retrieval=retrieval) >= FIT_THRESHOLD:
            members.add(card["name"])

    hits = tuple(n for n in names if n in members)
    absent = tuple(n for n in names if n not in known)
    misses = tuple(n for n in names if n not in members and n not in absent)
    return Agreement(theme_id, tag_slug, retrieval, hits, misses, absent)
