"""Archetype type-profile derivation — kept, not thrown away.

`DEFAULT_TYPE_COUNTS` (`type_targets.py`) was measured once by a script that
lived just long enough to print a table and then vanished; the paragraph
above that constant is now the only record of how it was derived, and
nobody could re-run it the next time somebody needed to defend the number.
`agreement.py` faced the same problem for the theme-agreement numbers in
`docs/themes.md` and answered it by keeping the script. This module is that
answer applied a second time, for `ARCHETYPE_TYPE_COUNTS`
(`type_targets.py`'s tier 2.5): when no commander page exists to condition
on — a cold, unknown, or absent commander — a decisive theme still gets a
real pooled measurement instead of falling straight to the flat
cross-commander median.

The pipeline is three functions, each independently testable:

- `tag_corpus` ranks a tag's commanders by taglink deck count, reading only
  the flat commander pages `warm-edhrec` already cached. It discovers
  nothing new — the corpus is whatever is already on disk.
- `measure_tag` fetches (cache-first) the top-K commander×tag subpages and
  aggregates them into one pooled profile, applying the floors that decide
  whether the pool is trustworthy enough to keep.
- `render_constants` prints a paste-ready `ARCHETYPE_TYPE_COUNTS` block
  plus per-tag diagnostics. It prints only — the constant lands in
  `type_targets.py` as a reviewed diff, the same discipline
  `DEFAULT_TYPE_COUNTS` lost when its own derivation script was thrown away.

`measure_tag` is the second sanctioned bulk walk of EDHREC's unofficial API,
alongside `warm_top_commanders` — see the doctrine header in `edhrec.py`.
Both are operator-run CLI commands (`warm-edhrec`, `measure-archetypes`),
never called from a request path.
"""

from __future__ import annotations

import time
from collections.abc import Mapping
from datetime import date

import structlog

from .config import settings
from .type_targets import TAG_MIN_DECKS, ArchetypeProfile

log = structlog.get_logger(__name__)

# How many of a tag's best-sampled commanders to fetch subpages for. Twenty
# is a budget, not a statistical target: `warm-edhrec`'s default corpus (the
# top 1000 commanders) puts nowhere near a thousand pages behind any one
# tag, and a long tail of thin pairings would dilute the mean toward noise
# for the cost of a much slower run — the top 20 by sample size already
# carry most of a popular tag's pooled deck count.
MEASURE_TOP_K = 20

# A profile pooled from one or two commanders is one build's flavour, not
# an archetype's — Muldrotha's graveyard shenanigans alone would skew
# "reanimator" toward Muldrotha rather than the format. Three is the
# smallest number that can outvote a single outlier commander while still
# being reachable from the ~45-commander dev cache this was built against.
MIN_COMMANDERS = 3

# Tier 1 trusts a single commander's subpage once its taglink count clears
# `TAG_MIN_DECKS` (100). A pooled archetype profile stands in for *every*
# commander that could ever pilot the theme, cold or unknown, so it should
# rest on a deeper sample than any one page's gate — 1,000 decks is small
# next to a popular tag's true population but well past what a handful of
# thin pairings could produce by chance.
MIN_DECKS = 1000


def tag_corpus(tag_slug: str, top_k: int = MEASURE_TOP_K) -> list[tuple[str, int]]:
    """This tag's commanders, ranked by taglink deck count, largest first.

    Reads the flat commander pages `warm-edhrec` already cached
    (`data_dir/edhrec/*.json`) — a bare glob on that directory does not
    recurse into the theme-subpage subdirectories beside them — and
    discovers nothing of its own: the corpus is whatever is already on
    disk. A commander whose page carries this tag below `TAG_MIN_DECKS`
    (the same per-page sample floor tier 1 already trusts) is dropped
    before ranking, so a profile is never built partly from a page too
    thin to condition even one deck.

    Returns `(commander_slug, taglink_count)` pairs, capped at `top_k`.
    """
    from .edhrec import _parsed_page

    ranked: list[tuple[str, int]] = []
    for path in (settings.data_dir / "edhrec").glob("*.json"):
        _, taglinks = _parsed_page(path)
        link = next((t for t in taglinks if t.slug == tag_slug), None)
        if link is not None and link.count >= TAG_MIN_DECKS:
            ranked.append((path.stem, link.count))

    ranked.sort(key=lambda pair: -pair[1])
    return ranked[:top_k]


def _subpage_is_cached(slug: str, tag_slug: str) -> bool:
    """Whether this commander×tag subpage would be served from disk.

    The same freshness check as `edhrec.is_cached`, copied rather than
    reused because that helper is keyed on a commander *name* and the flat
    per-commander cache path; a subpage keys on a slug pair and lives one
    directory deeper (`_theme_cache_path`).
    """
    from .edhrec import CACHE_TTL_SECONDS, _theme_cache_path

    path = _theme_cache_path(slug, tag_slug)
    if not path.exists():
        return False
    return (time.time() - path.stat().st_mtime) < CACHE_TTL_SECONDS


def measure_tag(
    tag_slug: str,
    *,
    top_k: int = MEASURE_TOP_K,
    delay_seconds: float = 1.0,
    min_commanders: int = MIN_COMMANDERS,
    min_decks: int = MIN_DECKS,
) -> tuple[ArchetypeProfile | None, dict[str, float]]:
    """Fetch and aggregate one tag's commander×tag subpages.

    Copies `warm_top_commanders`'s discipline exactly: cache-first (a
    subpage already on disk costs no request and no politeness delay), one
    bad commander does not end the run, and the delay applies only after a
    genuine network fetch.

    The aggregation is a taglink-deck-count-weighted mean of
    `parse_type_counts` across subpages — algebraically the pooled per-deck
    mean, because every source page already sums to 99 and a weighted
    average of vectors that each sum to 99 sums to 99 itself. A median was
    considered and rejected: it would let a 150-deck pairing outvote
    Ur-Dragon's tens of thousands as easily as the reverse, which is
    backwards for a number meant to describe the format's *decks*, not its
    commanders.

    Returns the profile — `None` when `min_commanders` or `min_decks` was
    not met, so a thin corpus emits nothing rather than a number nobody
    can trust — alongside per-type weighted standard deviations, for the
    operator to sanity-check dispersion before pasting anything into
    `type_targets.py`. The sd is diagnostic only; it is not part of the
    committed shape.
    """
    from .edhrec import fetch_commander_theme, parse_type_counts

    ranked = tag_corpus(tag_slug, top_k)

    weighted_sum: dict[str, float] = {}
    weighted_sq: dict[str, float] = {}
    total_weight = 0.0
    commanders = 0
    decks = 0

    for slug, deck_count in ranked:
        network = not _subpage_is_cached(slug, tag_slug)
        try:
            payload = fetch_commander_theme(slug, tag_slug)
        except Exception as exc:  # noqa: BLE001 — unofficial API, one bad page must not end the run
            log.warning("archetype.fetch_failed", slug=f"{slug}/{tag_slug}", error=str(exc))
            payload = None
        if network:
            time.sleep(delay_seconds)

        if payload is None:
            continue
        counts = parse_type_counts(payload)
        if counts is None:
            continue

        commanders += 1
        decks += deck_count
        total_weight += deck_count
        for type_name, mean in counts.counts.items():
            weighted_sum[type_name] = weighted_sum.get(type_name, 0.0) + mean * deck_count
            weighted_sq[type_name] = weighted_sq.get(type_name, 0.0) + mean * mean * deck_count

    weighted_sd: dict[str, float] = {}
    if total_weight > 0:
        for type_name, total in weighted_sum.items():
            mean = total / total_weight
            variance = max(0.0, weighted_sq[type_name] / total_weight - mean * mean)
            weighted_sd[type_name] = variance**0.5

    if commanders < min_commanders or decks < min_decks:
        log.info(
            "archetype.below_floor",
            tag=tag_slug,
            commanders=commanders,
            decks=decks,
            min_commanders=min_commanders,
            min_decks=min_decks,
        )
        return None, weighted_sd

    raw_total = sum(weighted_sum.values())
    counts = {t: v * 99 / raw_total for t, v in weighted_sum.items()}
    profile = ArchetypeProfile(
        counts=counts,
        tag=tag_slug,
        commanders=commanders,
        decks=decks,
        measured=date.today().isoformat(),
    )
    return profile, weighted_sd


def render_constants(
    results: Mapping[str, tuple[ArchetypeProfile | None, dict[str, float]]],
) -> str:
    """A paste-ready `ARCHETYPE_TYPE_COUNTS` block, plus per-tag diagnostics.

    Prints only. The constant lands in `type_targets.py` as a reviewed
    diff — the discipline `DEFAULT_TYPE_COUNTS` lost when its own
    derivation script was thrown away, so nobody could re-derive the
    number the next time it needed defending.

    `results` is keyed by our theme id, one entry per tag `measure_tag` was
    run against — including tags that failed a floor, so the printed
    diagnostics show every tag a run attempted, not only the ones that
    qualified.
    """
    lines = ["ARCHETYPE_TYPE_COUNTS: dict[str, ArchetypeProfile] = {"]
    for theme_id, (profile, _) in results.items():
        if profile is None:
            continue
        counts = ", ".join(f'"{t}": {v:.1f}' for t, v in profile.counts.items())
        lines.append(f'    "{theme_id}": ArchetypeProfile(')
        lines.append(f"        counts={{{counts}}},")
        lines.append(f'        tag="{profile.tag}",')
        lines.append(f"        commanders={profile.commanders},")
        lines.append(f"        decks={profile.decks},")
        lines.append(f'        measured="{profile.measured}",')
        lines.append("    ),")
    lines.append("}")
    lines.append("")

    for theme_id, (profile, sd) in results.items():
        if profile is not None:
            summary = ", ".join(f"{t}={v:.1f}" for t, v in profile.counts.items())
            sd_summary = ", ".join(f"{t}={v:.1f}" for t, v in sorted(sd.items()))
            lines.append(
                f"# {theme_id}: M={profile.commanders} N={profile.decks} "
                f"mean=[{summary}] sd=[{sd_summary}]"
            )
        else:
            lines.append(f"# {theme_id}: below floor — no profile emitted")

    return "\n".join(lines)
