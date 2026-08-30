"""Card-type targets — what shape a deck of *this* commander and theme runs.

The third shape dimension, beside the role buckets and the curve. The role
buckets are functional and a deck can satisfy every one of them with forty
creatures; nothing in the system said that a Talrand list averages eleven.
The targets here are empirical where data exists and honest about the
fallback where it does not:

  1. commander×theme subpage — when the deck's own theme profile is
     decisive, or its typal profile names a real tribe, and EDHREC has a
     page for that pairing. Muldrotha averages ~30 creatures;
     muldrotha/spellslinger averages 21, and a spellslinger build deserves
     the 21. A Slivers deck under a commander with no tribal theme of its
     own reaches the same subpage through the tribe instead — krenko/goblins
     — rather than a manufactured "goblins" entry in the theme mapping.
  2. commander page — already conditioned on how people actually build this
     commander, which subsumes the theme for most decks. Unconditionally
     outranks tier 2.5 below: a single commander's own cached page, however
     thin, is a real per-commander sample, where the archetype tier is a
     pooled cross-commander one standing in for a commander with none.
  2.5. measured archetype profile (`ARCHETYPE_TYPE_COUNTS`) — only when no
     commander page exists at all (cold, unknown, or absent commander) and
     the deck's theme is still decisive. A brand-new lands-matter commander
     gets ~39 lands from the pooled measurement instead of the flat
     cross-commander median, without inventing a per-commander number that
     was never observed. Tribes are out of scope here (see the module for
     `archetype_profiles`) — a tribal deck's commander page already carries
     the tribe's shape often enough that the gap was not worth the second
     measurement axis.
  3. `DEFAULT_TYPE_COUNTS` — the median of the cached commander pages.

Hard tiers, no blending: each answer is auditable through its source string,
and the tests can enumerate every fallthrough.

The speed slider does NOT move these targets — EDHREC aggregates carry no
bracket conditioning, and shifting counts for a tuned deck would be inventing
data. Only the penalty weight lerps, the same way the bucket weights bind
harder at speed. Recorded as a gap in `docs/composition.md`, not papered over.

The targets do move one thing outside this axis: the empirical land mean
shifts the mana-sources quota (`shift_mana_sources`), so the bucket that owns
land count knows what the archetype runs. That is the reconciliation in the
other direction — archetype conditioning the functional quota, never speed
conditioning the empirical counts.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from .composition import (
    BucketTarget,
    DeckTemplate,
    apply_curve,
    apply_overrides,
    apply_type_targets,
    template_for,
)
from .vocabulary import Bucket

# Reporting order, and the closed key set for `DeckTemplate.types`.
PRIMARY_TYPES = (
    "Creature",
    "Instant",
    "Sorcery",
    "Artifact",
    "Enchantment",
    "Planeswalker",
    "Battle",
    "Land",
)

# A point estimate becomes a soft range of ± max(MIN_HALF_WIDTH,
# RANGE_FRACTION × mean). Cross-commander creature means in the cache run 6
# (narset) to 36 (meren), sd ≈ 6.9; 0.20 of the mean is deliberately narrower
# because within-commander build variance is smaller than across-commander
# variance — but that number is unmeasured (there is no decklist corpus), so
# 0.20 is a judgment stated as one, tunable here.
RANGE_FRACTION = 0.20
MIN_HALF_WIDTH = 2.0  # cards; a mean of 1 planeswalker must not pin [1, 1]

# Land is the exception to the fractional rule. Its mean is the largest of
# any type, so ±20% handed it the *widest* band of the axis (39 ± 7.8 for a
# landfall commander) when land count is the tightest-distributed stat in
# the format — cached commander pages run 33–40 lands against creature means
# of 6–36. The observed failure: a Necrobloom deck on 25 lands read as only
# 6.2 "short" because the band's low edge sat at 31.2, and the basics
# channel went silent 8 lands under the empirical mean. Flat ±3.5, another
# judgment stated as one.
LAND_HALF_WIDTH = 3.5

# How far the archetype may move the mana-sources quota (see
# `shift_mana_sources`). Cached land means run 33–40 against the 35 median,
# so ±6 is past every observed page — a cap against a parse gone wrong, not
# a bound that real data reaches.
MANA_SOURCES_DELTA_CAP = 6.0

# Penalty per card outside the range, lerped by speed like the bucket
# weights. Calibration: at speed 0.5 (weight 0.35) a deck 5.2 creatures over
# pays ≈1.8 — the order of a 1.2-card interaction shortfall — and cutting one
# over-target creature earns 0.35 in `score_cuts`, clearing MIN_CUT_SCORE
# even at the 0.4 redundancy floor.
TYPES_WEIGHT_SLOW = 0.25
TYPES_WEIGHT_FAST = 0.45

# The subpage tier fires only when the deck's loudest theme is an identity
# rather than a whisper, maps to a verified EDHREC tag, and that tag has a
# real sample behind it on this commander's page.
TYPE_THEME_SHARE_FLOOR = 0.35
TAG_MIN_DECKS = 100

# The typal branch of the same tier: a tribe reaches the subpage only when
# it is the deck's real shape, not just the biggest of four incidental
# creature types. Typal shares run hot by construction — floored at 0.08,
# renormalised over whatever survives that floor, then the commander's own
# cares-about types get a further ×5 anchor and its is-types a ×2 anchor
# (`themes.py` TYPAL_SHARE_FLOOR, COMMANDER_TYPAL_ANCHOR,
# COMMANDER_TYPAL_IS_ANCHOR) — so a genuine tribal deck reads far above 0.6
# while a deck merely light on creature variety does not. A miss here still
# lands on the commander page, which for a tribal commander already carries
# the tribe's shape, so keeping this floor conservative costs nothing.
TYPE_TYPAL_SHARE_FLOOR = 0.60

# Median of the 24 cached commander pages, measured 2026-08-18 (raw medians
# creature 29 / instant 9 / sorcery 8.5 / artifact 9 / enchantment 6.5 /
# planeswalker 1 / battle 0 / land 35, rounded to sum 99). Derivation
# recorded in docs/composition.md.
DEFAULT_TYPE_COUNTS: dict[str, float] = {
    "Creature": 29,
    "Instant": 9,
    "Sorcery": 9,
    "Artifact": 9,
    "Enchantment": 7,
    "Planeswalker": 1,
    "Battle": 0,
    "Land": 35,
}


@dataclass(frozen=True, slots=True)
class ArchetypeProfile:
    """One theme's measured type distribution, pooled across commanders.

    Exists for tier 2.5: the commander page is always the better sample
    when one exists, but a cold, unknown, or absent commander has no page
    at all, and until now a decisive "lands matter" theme on such a deck
    fell all the way to the flat cross-commander median. Keyed by our
    theme id in `ARCHETYPE_TYPE_COUNTS`, not by `tag` — the resolver
    already has the theme id from `theme_profile` and looks nothing else
    up to reach this table.
    """

    counts: dict[str, float]  # per-99 means, same shape as DEFAULT_TYPE_COUNTS
    tag: str  # the EDHREC slug measured, for the source string
    commanders: int  # M: how many commanders' subpages went into the pool
    decks: int  # N: the pooled taglink deck count across those commanders
    measured: str  # ISO date, so a stale table is visible at a glance


# Measured per-theme archetype profiles for tier 2.5, derived by
# `archetype_profiles.measure_tag` (`measure-archetypes` CLI) and pasted in
# as a reviewed diff — see that module for why the derivation is kept rather
# than thrown away. Starts empty: the tier is wired here so landing it does
# not wait on a live measurement run against the dev corpus, and an empty
# table simply means tier 2.5 never fires yet — every deck still resolves
# through tiers 1, 2, and the default exactly as before.
ARCHETYPE_TYPE_COUNTS: dict[str, ArchetypeProfile] = {}


def type_weight(speed: float) -> float:
    """How hard the type ranges bind at this speed."""
    return TYPES_WEIGHT_SLOW + (TYPES_WEIGHT_FAST - TYPES_WEIGHT_SLOW) * speed


def targets_from_counts(
    counts: Mapping[str, float], *, speed: float, scale: float = 1.0
) -> dict[str, BucketTarget]:
    """Point estimates -> soft ranges.

    Land is a real row with weight zero: the MANA_SOURCES bucket already
    binds land count at the loudest weight in the system, and a second
    penalty on the same measure is one signal counted twice. The row still
    exists so the report can show land count against the empirical target.

    `scale` is deck_size/99 — a Rule 0 deck may target 60 or 150 cards, and
    every count here is a per-99 empirical mean. The mean scales; the bands
    re-derive from the scaled mean, so the absolute floors (`MIN_HALF_WIDTH`,
    `LAND_HALF_WIDTH`) stay absolute — two cards of counting noise is two
    cards at any deck size.
    """
    weight = type_weight(speed)
    out: dict[str, BucketTarget] = {}
    for name in PRIMARY_TYPES:
        mean = counts.get(name, 0.0) * scale
        half = LAND_HALF_WIDTH if name == "Land" else max(MIN_HALF_WIDTH, RANGE_FRACTION * mean)
        out[name] = BucketTarget(
            low=max(0.0, mean - half),
            high=mean + half,
            weight=0.0 if name == "Land" else weight,
        )
    return out


def resolve_type_targets(
    commander_name: str | None,
    theme_profile: Mapping[str, float],
    *,
    speed: float,
    allow_fetch: bool = False,
    scale: float = 1.0,
    typal_profile: Mapping[str, float] | None = None,
) -> tuple[dict[str, BucketTarget], str]:
    """Targets plus the source string that makes them auditable.

    The tiers fall through independently: a theme or tribe that clears its
    share floor but has no verified slug, no taglink on this commander, too
    small a sample, or an unreadable subpage degrades to the commander page,
    and a commander EDHREC has never cached degrades to the default.

    Two candidates can reach the subpage tier: the deck's loudest theme
    (mapped through `THEME_TAG_SLUGS`) and its loudest tribe (`typal_profile`,
    mapped by generating every plural form of the type name and keeping only
    the one this commander's own taglinks actually carry — EDHREC's plural is
    never guessed at). When both clear their floor, the larger taglink
    sample wins: the two shares are cross-profile incomparable, but the
    counts are the same unit off the same panel. A tie goes to the theme.
    Only the winner gets a subpage fetch — a runner-up retry on an
    unreadable page would just be a second speculative request for a page
    that already answered no.

    `typal_profile` defaults to nothing, so a caller that never computed one
    (`/replace`) gets exactly today's theme-only ladder.

    A commander with no cached page at all — cold, unknown, or absent —
    skips tiers 1 and 2 (both need a page to condition on) and falls to
    tier 2.5: a measured cross-commander profile for the deck's theme, from
    `ARCHETYPE_TYPE_COUNTS`, gated the same way tier 1's theme candidate is
    (`TYPE_THEME_SHARE_FLOOR`). Tier 2 unconditionally outranks it whenever
    a commander page does exist, however thin — a single commander's own
    sample beats a pooled one standing in for a commander with none. Tribes
    do not get an archetype tier; see `archetype_profiles` for the scope
    note.

    `scale` resizes every tier the same way — see `targets_from_counts` —
    so the tier precedence never depends on the deck's target size.
    """
    from .edhrec import THEME_TAG_SLUGS, load_type_counts, slugify
    from .typal import plural_forms

    commander_counts, taglinks = load_type_counts(commander_name) if commander_name else (None, [])

    top_theme, top_theme_share = None, 0.0
    for theme, share in theme_profile.items():
        if share > top_theme_share:
            top_theme, top_theme_share = theme, share

    top_type, top_type_share = None, 0.0
    for creature_type, share in (typal_profile or {}).items():
        if share > top_type_share:
            top_type, top_type_share = creature_type, share

    theme_link = None
    if commander_counts is not None and top_theme and top_theme_share >= TYPE_THEME_SHARE_FLOOR:
        tag_slug = THEME_TAG_SLUGS.get(top_theme)
        theme_link = next((t for t in taglinks if t.slug == tag_slug), None) if tag_slug else None

    tribe_link = None
    if commander_counts is not None and top_type and top_type_share >= TYPE_TYPAL_SHARE_FLOOR:
        # Never guess EDHREC's plural — a tribe only reaches the subpage
        # through a slug this commander's own taglinks actually carry.
        tribe_slugs = {slugify(p) for p in plural_forms(top_type)}
        tribe_link = next((t for t in taglinks if t.slug in tribe_slugs), None)

    theme_ok = theme_link is not None and theme_link.count >= TAG_MIN_DECKS
    tribe_ok = tribe_link is not None and tribe_link.count >= TAG_MIN_DECKS

    winner = None
    if theme_ok and tribe_ok:
        winner = tribe_link if tribe_link.count > theme_link.count else theme_link
    elif theme_ok:
        winner = theme_link
    elif tribe_ok:
        winner = tribe_link

    if winner is not None:
        theme_counts, _ = load_type_counts(
            commander_name, theme_slug=winner.slug, allow_fetch=allow_fetch
        )
        if theme_counts is not None:
            source = f"edhrec:{slugify(commander_name)}/{winner.slug} ({winner.count:,} decks)"
            return targets_from_counts(theme_counts.counts, speed=speed, scale=scale), source

    if commander_counts is not None:
        return (
            targets_from_counts(commander_counts.counts, speed=speed, scale=scale),
            f"edhrec:{slugify(commander_name)}",
        )

    # Tier 2.5: no commander page exists at all, so the commander tiers
    # above had nothing to condition on — the only empirical signal left is
    # the theme itself. Tribes are excluded (`archetype_profiles`'s scope
    # note): a tribal deck's commander is, in practice, a tribal commander,
    # whose page already carries the tribe's shape.
    if top_theme and top_theme_share >= TYPE_THEME_SHARE_FLOOR:
        archetype = ARCHETYPE_TYPE_COUNTS.get(top_theme)
        if archetype is not None:
            source = (
                f"archetype:{archetype.tag} "
                f"({archetype.commanders} commanders, {archetype.decks:,} decks)"
            )
            return targets_from_counts(archetype.counts, speed=speed, scale=scale), source

    return targets_from_counts(DEFAULT_TYPE_COUNTS, speed=speed, scale=scale), "default"


def shift_mana_sources(
    template: DeckTemplate, land_target: BucketTarget | None, *, scale: float = 1.0
) -> DeckTemplate:
    """Move the mana-sources quota by the archetype's land deviation.

    The Land type row is weight-zero by design — the mana-sources bucket owns
    land count — but that bucket was speed-conditioned and *not* archetype-
    conditioned, so the one signal that knew a landfall deck runs 39 lands
    was mute and the signal that owned land count did not know. The observed
    failure: a Necrobloom deck at 25 lands + 8 rocks sat *inside* the tuned
    30–34 sources range while the empirical land mean said 39.

    The reconciliation is a shift, not a floor: the quota moves by the land
    mean's deviation from the corpus median (`DEFAULT_TYPE_COUNTS`). The
    template captures the speed effect around a median deck; the commander
    page captures the archetype effect around mostly-casual builds; adding
    the archetype *delta* composes the two without dragging a tuned deck
    back to casual land counts wholesale. Both bounds move together and the
    weight stays — where the quota sits is archetype, how hard it binds is
    speed. Default-tier targets shift by zero, by construction.

    The land mean is recovered as the range midpoint, exact because Land's
    half-width is flat and its low never clips at zero.

    `scale` is deck_size/99: the land mean arrives already resized to the
    deck (see `targets_from_counts`), so the corpus median and the cap
    resize with it — the same archetype shifts a 60-card deck's quota by
    the same *fraction* it shifts a 99-card deck's.
    """
    if land_target is None:
        return template

    mean = (land_target.low + land_target.high) / 2
    delta = mean - DEFAULT_TYPE_COUNTS["Land"] * scale
    cap = MANA_SOURCES_DELTA_CAP * scale
    delta = max(-cap, min(cap, delta))
    if delta == 0.0:
        return template

    sources = template.buckets[Bucket.MANA_SOURCES]
    buckets = dict(template.buckets)
    buckets[Bucket.MANA_SOURCES] = BucketTarget(
        low=sources.low + delta,
        high=sources.high + delta,
        weight=sources.weight,
    )
    return DeckTemplate(
        name=template.name,
        buckets=buckets,
        curve=template.curve,
        curve_weight=template.curve_weight,
        deck_size=template.deck_size,
        types=template.types,
    )


def conditioned_template(
    speed: float,
    overrides,
    types: Mapping[str, BucketTarget],
    *,
    scale: float = 1.0,
    curve: Mapping[int, float] | None = None,
) -> DeckTemplate:
    """The one way to build a template once type targets are resolved.

    Order matters and is the point: interpolate by speed, resize to the
    deck, shift the mana quota by the archetype, apply user overrides,
    attach the type targets. Overrides land *after* the shift so a hand on
    the handle beats the archetype nudge — the user dragged against the
    shifted range the report showed them, and shifting their value again
    would move it behind their back. Every scorer (diagnose, cut scoring,
    /replace, the fill solver) must come through here, or one of them
    scores a mana quota the report never showed.

    `scale` is deck_size/99 — a Rule 0 deck may target another size, and
    the archetype bucket ranges are tuned for 99 cards. Only the
    interpolated bounds resize here: `types` arrive already sized (resolved
    with the same scale, or read back off a report), overrides stay literal
    because the user authored them against the displayed, already-scaled
    ranges, and curve shares are fractions of the spell count with no size
    to scale.

    `curve` is the builder's own curve shape, replacing the interpolated one.
    Last, like the bucket overrides and for the same reason: a hand on a
    handle beats the archetype.
    """
    template = template_for(speed)
    if scale != 1.0:
        template = DeckTemplate(
            name=template.name,
            buckets={
                bucket: BucketTarget(
                    low=target.low * scale, high=target.high * scale, weight=target.weight
                )
                for bucket, target in template.buckets.items()
            },
            curve=template.curve,
            curve_weight=template.curve_weight,
            deck_size=round(template.deck_size * scale),
            types=template.types,
        )
    template = shift_mana_sources(template, types.get("Land"), scale=scale)
    template = apply_curve(apply_overrides(template, overrides or {}), curve)
    return apply_type_targets(template, types)


def targets_from_report(types_rows: Iterable, *, speed: float) -> dict[str, BucketTarget]:
    """Rebuild targets from a report's `types` block.

    Downstream consumers — cut scoring, the fill solver — already hold a
    `Diagnostics` and must score against the *same* targets it reported,
    not re-resolve and risk a tier flip between the report and the score.
    Rows carry ranges but not weights, so the weight is re-derived from
    speed exactly as `targets_from_counts` set it.
    """
    weight = type_weight(speed)
    return {
        row.type: BucketTarget(
            low=row.low,
            high=row.high,
            weight=0.0 if row.type == "Land" else weight,
        )
        for row in types_rows
    }
