"""EDHREC adapter — the empirical half of the synergy signal.

Millions of real decklists, already aggregated into per-commander inclusion
rates and a **synergy score** (this commander's inclusion rate minus the card's
baseline rate). That is the edge weight the plan wants, for free.

This is the project's riskiest dependency and it is deliberately quarantined:

- **Unofficial and undocumented.** `json.edhrec.com` is not a supported API.
  Schema breakage is expected, not exceptional. Every access goes through this
  one module, so a break is a single-file fix.
- **Raw responses are persisted verbatim** before parsing. When the schema does
  move, the cached payload is the diagnostic — and re-parsing costs no requests.
- **Lazy, per commander, on the request path.** A commander is fetched the
  first time someone asks for it and then served from disk. `warm_top_commanders`
  is the single sanctioned exception: an operator-run, throttled walk of the
  most-played commanders, so that first fetch happens on a CLI run rather than
  inside a user's request. Nothing else may crawl, and nothing crawls
  automatically.

Schema as observed 2026-08-04 (`atraxa-praetors-voice`):

    container.json_dict.cardlists[] -> {tag, header, cardviews[]}
    cardview -> {id, name, synergy, num_decks, potential_decks, ...}

`id` is the **Scryfall printing id**, not the oracle id — 195/200 matched on
scryfall_id versus 0 on oracle_id. Name matching scored marginally better
(199/200), so resolution tries the id first and falls back to the name.
`inclusion_rate` is derived: `num_decks / potential_decks`.
"""

from __future__ import annotations

import json
import re
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import httpx
import structlog

from .config import settings

log = structlog.get_logger(__name__)

BASE_URL = "https://json.edhrec.com/pages/commanders"
CACHE_TTL_SECONDS = 7 * 24 * 60 * 60  # A week. Deck statistics move slowly.

# Lists that describe the commander rather than recommending cards.
SKIP_TAGS = frozenset({"newcards"})

# Top-level average-type-count fields on a commander page, in the order the
# rest of the system reports them. `basic` and `nonbasic` are ignored — they
# partition `land`, and counting them alongside it counts lands twice.
_TYPE_FIELDS = (
    ("creature", "Creature"),
    ("instant", "Instant"),
    ("sorcery", "Sorcery"),
    ("artifact", "Artifact"),
    ("enchantment", "Enchantment"),
    ("planeswalker", "Planeswalker"),
    ("battle", "Battle"),
    ("land", "Land"),
)

# Our theme ids -> EDHREC tag slugs, for the commander×theme subpages. Every
# slug here was verified against real `panels.taglinks` entries in the cached
# commander pages on 2026-08-18; an unverifiable slug is omitted rather than
# guessed, because a wrong one silently costs a fetch per request. Absent on
# purpose: `tribal` (EDHREC uses per-type slugs — "elves", "dinosaurs" — not
# one tag), `untap_combo` (no tag observed). The mapping is additionally
# checked against the commander's own taglinks at lookup time, so a slug that
# EDHREC retires degrades to the commander-page tier instead of 404-looping.
THEME_TAG_SLUGS: dict[str, str] = {
    "landfall": "landfall",
    "aristocrats": "aristocrats",
    "blink": "blink",
    "counters": "plus-1-plus-1-counters",
    "tokens": "tokens",
    "reanimator": "reanimator",
    "spellslinger": "spellslinger",
    "artifacts": "artifacts",
    "treasure": "treasure",
    "lifegain": "lifegain",
    "aggro": "aggro",
    "mill": "mill",
    "group_slug": "group-slug",
    "stax": "stax",
    "legends": "legends",
    "voltron": "voltron",
    "stompy": "stompy",
    "poison": "infect",
}


@dataclass(frozen=True, slots=True)
class TypeCounts:
    """A page's average type distribution, normalised to a 99-card deck.

    EDHREC's fields are integers that usually sum to 99 but not always —
    homer-the-hermit sums to 100 — so the counts are rescaled by `99 / total`
    and the raw sum kept for anyone who needs to see the working.
    """

    counts: dict[str, float]  # {"Creature": 24.0, ..., "Land": 35.0}
    total: int


@dataclass(frozen=True, slots=True)
class TagLink:
    """One entry of `panels.taglinks`: a theme tag and how many decks carry it."""

    slug: str
    label: str
    count: int


@dataclass(frozen=True, slots=True)
class Recommendation:
    name: str
    scryfall_id: str
    synergy: float
    num_decks: int
    potential_decks: int
    tag: str

    @property
    def inclusion_rate(self) -> float:
        if not self.potential_decks:
            return 0.0
        return self.num_decks / self.potential_decks


def slugify(name: str) -> str:
    """Card name -> EDHREC URL slug.

    "Atraxa, Praetors' Voice" -> "atraxa-praetors-voice"
    Partner/DFC names are split on `//` and only the front face is used.
    """
    front = name.split("//")[0].strip()
    ascii_name = unicodedata.normalize("NFKD", front).encode("ascii", "ignore").decode()
    cleaned = re.sub(r"[^a-zA-Z0-9\s-]", "", ascii_name)
    return re.sub(r"[\s-]+", "-", cleaned).strip("-").lower()


def _cache_path(slug: str) -> Path:
    return settings.data_dir / "edhrec" / f"{slug}.json"


def is_cached(name: str) -> bool:
    """Whether this commander would be served from disk rather than fetched.

    The eval harness needs this: a run that fetches partway through is not
    comparable to one that did not, because the graph gains `RECOMMENDS` edges
    mid-run and arms executed before the fetch see a different corpus from
    those after it.
    """
    path = _cache_path(slugify(name))
    if not path.exists():
        return False
    return (time.time() - path.stat().st_mtime) < CACHE_TTL_SECONDS


def fetch_commander(slug: str, *, force: bool = False) -> dict | None:
    """Fetch a commander page, serving from disk when the cache is warm.

    Returns `None` when EDHREC has no page for the slug (404) — an ordinary
    outcome for an obscure or misspelled commander, not an error.
    """
    path = _cache_path(slug)

    if not force and path.exists():
        age = time.time() - path.stat().st_mtime
        if age < CACHE_TTL_SECONDS:
            log.debug("edhrec.cached", slug=slug, age_hours=round(age / 3600, 1))
            return json.loads(path.read_text())

    log.info("edhrec.fetch", slug=slug)
    response = httpx.get(
        f"{BASE_URL}/{slug}.json",
        headers={
            "User-Agent": settings.scryfall_user_agent,
            "Accept": "application/json",
        },
        timeout=30.0,
        follow_redirects=True,
    )

    # EDHREC answers an unknown slug with 403 as often as 404, so both mean
    # "no page for this commander" rather than an error worth raising.
    if response.status_code in (403, 404):
        log.warning("edhrec.not_found", slug=slug, status=response.status_code)
        return None

    response.raise_for_status()
    payload = response.json()

    # Persist raw, before parsing. If the schema has moved, this file is the
    # evidence — and re-parsing it costs EDHREC nothing.
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload))

    return payload


def parse_recommendations(payload: dict) -> list[Recommendation]:
    """Pull every cardview out of the page, tagged with the list it came from.

    Tolerant by design: a missing key means EDHREC changed something, and losing
    one list is better than losing the commander.
    """
    cardlists = (payload.get("container") or {}).get("json_dict", {}).get("cardlists") or []
    out: list[Recommendation] = []
    seen: set[str] = set()

    for cardlist in cardlists:
        tag = cardlist.get("tag") or ""
        if tag in SKIP_TAGS:
            continue

        for view in cardlist.get("cardviews") or []:
            name = view.get("name")
            if not name or name in seen:
                continue
            seen.add(name)

            out.append(
                Recommendation(
                    name=name,
                    scryfall_id=view.get("id") or "",
                    synergy=float(view.get("synergy") or 0.0),
                    num_decks=int(view.get("num_decks") or 0),
                    potential_decks=int(view.get("potential_decks") or 0),
                    tag=tag,
                )
            )

    return out


def parse_type_counts(payload: dict) -> TypeCounts | None:
    """The page's average type distribution, or None when the schema moved.

    All-or-nothing: a page missing any type field is treated as unreadable
    rather than read as "zero planeswalkers", because a partial distribution
    would silently skew every target derived from it.
    """
    raw: dict[str, int] = {}
    for field_name, label in _TYPE_FIELDS:
        value = payload.get(field_name)
        if not isinstance(value, (int, float)):
            log.warning("edhrec.no_type_counts", missing=field_name)
            return None
        raw[label] = int(value)

    total = sum(raw.values())
    if total <= 0:
        log.warning("edhrec.no_type_counts", missing="all fields zero")
        return None

    return TypeCounts(
        counts={label: value * 99 / total for label, value in raw.items()},
        total=total,
    )


def parse_taglinks(payload: dict) -> list[TagLink]:
    """The page's theme tags with deck counts. Empty when the panel is absent."""
    out: list[TagLink] = []
    for entry in (payload.get("panels") or {}).get("taglinks") or []:
        slug = entry.get("slug")
        if not slug:
            continue
        out.append(
            TagLink(
                slug=slug,
                label=entry.get("value") or slug,
                count=int(entry.get("count") or 0),
            )
        )
    return out


def parse_curve(payload: dict) -> dict[int, float] | None:
    """The page's average mana curve, folded into the 0-6+ buckets.

    EDHREC's keys run past 6 ('7'..'12'); our `CURVE_BUCKETS` treat 6 as
    "6 or more", so the tail is folded rather than dropped. Parsed for the
    day the curve prior is wired in; nothing consumes it yet.
    """
    raw = (payload.get("panels") or {}).get("mana_curve")
    if not raw:
        return None

    curve = dict.fromkeys(range(7), 0.0)
    for key, value in raw.items():
        try:
            mv = int(key)
        except TypeError, ValueError:
            continue
        curve[min(6, mv)] += float(value or 0)
    return curve


def _theme_cache_path(slug: str, tag_slug: str) -> Path:
    # A subdirectory per commander, so theme subpages never collide with the
    # flat `<slug>.json` commander pages beside them.
    return settings.data_dir / "edhrec" / slug / f"{tag_slug}.json"


def fetch_commander_theme(slug: str, tag_slug: str, *, force: bool = False) -> dict | None:
    """Fetch a commander×theme subpage — `fetch_commander`'s discipline, copied.

    Same cache TTL, same 403/404-means-no-page, same persist-raw-before-parse.
    These pages carry the theme-conditioned average type distribution the
    plain commander page cannot: muldrotha averages ~30 creatures, but
    muldrotha/spellslinger averages 21.
    """
    path = _theme_cache_path(slug, tag_slug)

    if not force and path.exists():
        age = time.time() - path.stat().st_mtime
        if age < CACHE_TTL_SECONDS:
            log.debug("edhrec.cached", slug=f"{slug}/{tag_slug}", age_hours=round(age / 3600, 1))
            return json.loads(path.read_text())

    log.info("edhrec.fetch", slug=f"{slug}/{tag_slug}")
    response = httpx.get(
        f"{BASE_URL}/{slug}/{tag_slug}.json",
        headers={
            "User-Agent": settings.scryfall_user_agent,
            "Accept": "application/json",
        },
        timeout=30.0,
        follow_redirects=True,
    )

    if response.status_code in (403, 404):
        log.warning("edhrec.not_found", slug=f"{slug}/{tag_slug}", status=response.status_code)
        return None

    response.raise_for_status()
    payload = response.json()

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload))

    return payload


# Parsed pages memoised on (path, mtime): a dict lookup per request after the
# first, and a forced refetch rewrites the file, changing the mtime, so the
# memo inherits the cache's TTL discipline without its own clock.
_PARSE_MEMO: dict[str, tuple[float, TypeCounts | None, tuple[TagLink, ...]]] = {}


def _parsed_page(path: Path) -> tuple[TypeCounts | None, list[TagLink]]:
    if not path.exists():
        return None, []

    mtime = path.stat().st_mtime
    cached = _PARSE_MEMO.get(str(path))
    if cached is not None and cached[0] == mtime:
        return cached[1], list(cached[2])

    try:
        payload = json.loads(path.read_text())
    except OSError, json.JSONDecodeError:
        log.warning("edhrec.unreadable_cache", path=str(path))
        return None, []

    counts = parse_type_counts(payload)
    taglinks = parse_taglinks(payload)
    _PARSE_MEMO[str(path)] = (mtime, counts, tuple(taglinks))
    return counts, taglinks


def load_type_counts(
    name: str, *, theme_slug: str | None = None, allow_fetch: bool = False
) -> tuple[TypeCounts | None, list[TagLink]]:
    """Type distribution for a commander, or for one of its theme subpages.

    Without `theme_slug`: the commander page's counts and taglinks, read from
    the disk cache only — never fetched here. The suggestion path already
    ingests the commander page before diagnosing, and the bare diagnostics
    endpoint must stay off the network, so a cold commander simply reads as
    "no counts". Deliberately no TTL check on the read: a stale page's
    macro-shape is still a better prior than the hand-authored default.

    With `theme_slug`: the subpage's counts (fetched when `allow_fetch` and
    the cache is cold or stale) alongside the *commander page's* taglinks,
    which the caller uses to decide whether the subpage was worth asking for.
    """
    slug = slugify(name)
    _, taglinks = _parsed_page(_cache_path(slug))

    if theme_slug is None:
        counts, _ = _parsed_page(_cache_path(slug))
        return counts, taglinks

    if allow_fetch:
        try:
            fetch_commander_theme(slug, theme_slug)
        except Exception as exc:  # noqa: BLE001 — unofficial API, must not break diagnostics
            log.warning("edhrec.theme_fetch_failed", slug=f"{slug}/{theme_slug}", error=str(exc))

    counts, _ = _parsed_page(_theme_cache_path(slug, theme_slug))
    return counts, taglinks


def load_commander(name: str, *, force: bool = False) -> list[Recommendation]:
    """Name -> recommendations. Empty list when EDHREC has no page."""
    payload = fetch_commander(slugify(name), force=force)
    if payload is None:
        return []

    recommendations = parse_recommendations(payload)
    if not recommendations:
        # Reachable but empty means the schema moved — loud, not silent.
        log.warning("edhrec.empty", name=name, slug=slugify(name))

    return recommendations


def ingest_commander(name: str, *, force: bool = False) -> dict[str, int]:
    """Fetch a commander and persist RECOMMENDS edges into the graph."""
    from .graph import upsert_recommendations

    recommendations = load_commander(name, force=force)
    if not recommendations:
        return {"fetched": 0, "linked": 0}

    linked = upsert_recommendations(name, recommendations)
    log.info("edhrec.ingested", commander=name, fetched=len(recommendations), linked=linked)
    return {"fetched": len(recommendations), "linked": linked}


def warm_top_commanders(top: int = 1000, *, delay_seconds: float = 1.0) -> dict[str, int]:
    """Pre-fetch the most-played commanders so users never pay the first fetch.

    The lazy path is correct but lands its cost on whoever picks a cold
    commander first — a second or two inside their request. Walking the popular
    ones ahead of time moves that cost to an operator.

    Throttled because `json.edhrec.com` is unofficial and this is the only bulk
    access in the codebase: one second between *network* fetches, applied after
    failures too, since an error is no reason to hurry. Commanders already on
    disk cost nothing and are not slept on.
    """
    from .graph import has_recommendations, top_commanders

    counts = {
        "considered": 0,
        "fetched": 0,
        "from_disk": 0,
        "skipped": 0,
        "no_page": 0,
        "failed": 0,
    }

    for row in top_commanders(top):
        name = row["name"]
        counts["considered"] += 1

        # Disk alone is not enough: a warm cache over a re-ingested graph still
        # needs its edges rewritten, and re-parsing from disk costs no requests.
        if is_cached(name) and has_recommendations(row["oracle_id"]):
            counts["skipped"] += 1
            continue

        network = not is_cached(name)
        try:
            result = ingest_commander(name)
        except Exception as exc:  # noqa: BLE001 — one bad commander must not end the walk
            counts["failed"] += 1
            log.warning("edhrec.warm_failed", commander=name, error=str(exc))
        else:
            if result["fetched"] == 0:
                counts["no_page"] += 1
            elif network:
                counts["fetched"] += 1
            else:
                counts["from_disk"] += 1

        if network:
            time.sleep(delay_seconds)

    log.info("edhrec.warmed", **counts)
    return counts
