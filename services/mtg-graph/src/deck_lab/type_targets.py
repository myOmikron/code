"""Card-type targets — what shape a deck of *this* commander and theme runs.

The third shape dimension, beside the role buckets and the curve. The role
buckets are functional and a deck can satisfy every one of them with forty
creatures; nothing in the system said that a Talrand list averages eleven.
The targets here are empirical where data exists and honest about the
fallback where it does not:

  0. commander×cedh subpage — outranks every tier below, including tier 1's
     theme/tribe subpage. Gated on `is_cedh(speed)` (bracket 5) and the
     commander's own `bracket_counts["5"]` clearing `CEDH_MIN_DECKS` —
     EDHREC serves a `/cedh` page for every commander, including ones with
     no real cEDH presence, so the floor is mandatory rather than
     defensive. A cEDH spellslinger deck is a cEDH deck first: EDHREC has
     no two-tag subpages, so there is no "commander × cedh × spellslinger"
     page to prefer over it, and the `/cedh` page carries its own
     taglinks, so it is already format-right even though it is
     theme-blind. Falls back to a pooled cross-commander profile
     (`CEDH_TYPE_COUNTS`) when this commander's own subpage is thin,
     absent, or unreadable, before falling all the way to tier 1.
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

The targets do move one thing outside this axis: the empirical Land corridor
is the base the mana-sources quota is built on (`derive_mana_sources`), so
the bucket that counts every source knows how many of them the archetype
runs as lands. That is the reconciliation in the other direction — archetype
conditioning the functional quota, never speed conditioning the empirical
counts.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from .composition import (
    BucketTarget,
    DeckTemplate,
    TargetOverride,
    apply_curve,
    apply_overrides,
    apply_type_overrides,
    apply_type_targets,
    is_cedh,
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

# The share of the ramp quota that is itself a mana source — rocks and
# dorks, as opposed to land ramp and other ramp — and therefore the part of
# the ramp quota the mana-sources quota has to leave room for (see
# `derive_mana_sources`). Measured 2026-09-07/08 over 415 cached casual
# commander pages (863,527 decks, deck-count weighted), each read as its
# synthetic average deck the way `cedh_profiles.measure_cedh` reads a `/cedh`
# page, both sides corrected for the synthetic deck's land over-count the
# way `casual_profiles` corrects every nonland bucket: pooled non-land
# sources 8.27 over pooled ramp coverage 16.1 = 0.51. A ratio of pooled
# means, not the mean of per-page ratios (that came out 0.55, sd 0.19), on
# purpose: the derivation adds this share to a *pooled* ramp corridor, so
# only the pooled ratio reproduces the pooled mana-source mean — the
# per-page mean overshot it by a card. The pool splits by colour — green
# 0.46 (dorks 4.4 + rocks 3.8 against 8.2 land ramp), non-green 0.63 (rocks
# 6.3, almost no dorks or land ramp) — but the absolute non-land source
# counts sit closer together (8.1 vs 6.9) than the shares do. A per-colour
# share is the obvious refinement if that ever proves too coarse; the
# corridor has no colour identity to read today.
NONLAND_SOURCE_SHARE = 0.51

# Penalty per card outside the range, lerped by speed like the bucket
# weights. Calibration: at speed 0.5 (weight 0.35) a deck 5.2 creatures over
# pays ≈1.8 — the order of a 1.2-card interaction shortfall — and cutting one
# over-target creature earns 0.35 in `score_cuts`, clearing MIN_CUT_SCORE
# even at the 0.4 redundancy floor.
TYPES_WEIGHT_SLOW = 0.25
TYPES_WEIGHT_FAST = 0.45

# Tier 0's sample floor. EDHREC serves a `/cedh` subpage for every commander,
# including ones with no real cEDH presence, so a floor here is mandatory
# rather than defensive — the same finding that makes `TAG_MIN_DECKS` below
# non-optional for tier 1. 150 is a judgment call, not a measurement:
# Atraxa's cEDH page rests on 156 decks and still reads correctly (top cards
# Mana Drain, Force of Negation, Narset, Esper Sentinel), so the floor exists
# to reject noise on an obscure or joke commander's handful of bracket-5
# games, not to demand a famous cEDH commander.
CEDH_MIN_DECKS = 150

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
# than thrown away. Measured 2026-08-30 against the dev corpus (a
# `warm-edhrec --top 500` walk, ~200 commander pages landed) at the CLI's
# default floors (MEASURE_TOP_K=20, MIN_COMMANDERS=3, MIN_DECKS=1000); all
# 18 mapped theme tags cleared both floors, so every one of them is here.
# Scope note: tribes have no archetype tier (see `archetype_profiles`'s
# module docstring) and a theme tag added after this measurement run — one
# was, mid-corpus, by a parallel change to `THEME_TAG_SLUGS` — simply has no
# entry until `measure-archetypes` is re-run for it.
ARCHETYPE_TYPE_COUNTS: dict[str, ArchetypeProfile] = {
    "landfall": ArchetypeProfile(
        counts={
            "Creature": 27.9,
            "Instant": 8.5,
            "Sorcery": 9.7,
            "Artifact": 6.0,
            "Enchantment": 7.4,
            "Planeswalker": 0.7,
            "Battle": 0.0,
            "Land": 38.8,
        },
        tag="landfall",
        commanders=16,
        decks=7958,
        measured="2026-08-30",
    ),
    "aristocrats": ArchetypeProfile(
        counts={
            "Creature": 31.4,
            "Instant": 8.8,
            "Sorcery": 7.6,
            "Artifact": 8.6,
            "Enchantment": 7.5,
            "Planeswalker": 0.9,
            "Battle": 0.0,
            "Land": 34.2,
        },
        tag="aristocrats",
        commanders=20,
        decks=22050,
        measured="2026-08-30",
    ),
    "blink": ArchetypeProfile(
        counts={
            "Creature": 28.9,
            "Instant": 11.6,
            "Sorcery": 6.3,
            "Artifact": 10.7,
            "Enchantment": 6.6,
            "Planeswalker": 0.6,
            "Battle": 0.0,
            "Land": 34.2,
        },
        tag="blink",
        commanders=10,
        decks=3497,
        measured="2026-08-30",
    ),
    "counters": ArchetypeProfile(
        counts={
            "Creature": 29.3,
            "Instant": 10.0,
            "Sorcery": 7.2,
            "Artifact": 8.8,
            "Enchantment": 8.1,
            "Planeswalker": 0.8,
            "Battle": 0.0,
            "Land": 34.7,
        },
        tag="plus-1-plus-1-counters",
        commanders=20,
        decks=25590,
        measured="2026-08-30",
    ),
    "tokens": ArchetypeProfile(
        counts={
            "Creature": 28.8,
            "Instant": 9.3,
            "Sorcery": 7.8,
            "Artifact": 9.2,
            "Enchantment": 8.4,
            "Planeswalker": 0.9,
            "Battle": 0.0,
            "Land": 34.7,
        },
        tag="tokens",
        commanders=20,
        decks=35457,
        measured="2026-08-30",
    ),
    "reanimator": ArchetypeProfile(
        counts={
            "Creature": 29.9,
            "Instant": 9.5,
            "Sorcery": 9.9,
            "Artifact": 8.3,
            "Enchantment": 6.3,
            "Planeswalker": 0.5,
            "Battle": 0.0,
            "Land": 34.6,
        },
        tag="reanimator",
        commanders=20,
        decks=14988,
        measured="2026-08-30",
    ),
    "spellslinger": ArchetypeProfile(
        counts={
            "Creature": 15.5,
            "Instant": 22.3,
            "Sorcery": 12.1,
            "Artifact": 9.2,
            "Enchantment": 5.7,
            "Planeswalker": 0.4,
            "Battle": 0.0,
            "Land": 33.8,
        },
        tag="spellslinger",
        commanders=20,
        decks=14667,
        measured="2026-08-30",
    ),
    "artifacts": ArchetypeProfile(
        counts={
            "Creature": 22.2,
            "Instant": 9.4,
            "Sorcery": 5.4,
            "Artifact": 21.8,
            "Enchantment": 5.6,
            "Planeswalker": 1.2,
            "Battle": 0.0,
            "Land": 33.5,
        },
        tag="artifacts",
        commanders=20,
        decks=20666,
        measured="2026-08-30",
    ),
    "treasure": ArchetypeProfile(
        counts={
            "Creature": 27.1,
            "Instant": 9.8,
            "Sorcery": 8.1,
            "Artifact": 13.7,
            "Enchantment": 5.9,
            "Planeswalker": 0.6,
            "Battle": 0.0,
            "Land": 33.7,
        },
        tag="treasure",
        commanders=15,
        decks=11164,
        measured="2026-08-30",
    ),
    "lifegain": ArchetypeProfile(
        counts={
            "Creature": 28.4,
            "Instant": 8.9,
            "Sorcery": 7.3,
            "Artifact": 10.3,
            "Enchantment": 8.5,
            "Planeswalker": 1.0,
            "Battle": 0.0,
            "Land": 34.6,
        },
        tag="lifegain",
        commanders=20,
        decks=19443,
        measured="2026-08-30",
    ),
    "aggro": ArchetypeProfile(
        counts={
            "Creature": 29.5,
            "Instant": 9.9,
            "Sorcery": 6.8,
            "Artifact": 10.3,
            "Enchantment": 7.6,
            "Planeswalker": 0.5,
            "Battle": 0.0,
            "Land": 34.5,
        },
        tag="aggro",
        commanders=20,
        decks=14731,
        measured="2026-08-30",
    ),
    "mill": ArchetypeProfile(
        counts={
            "Creature": 28.3,
            "Instant": 9.0,
            "Sorcery": 9.3,
            "Artifact": 9.0,
            "Enchantment": 7.4,
            "Planeswalker": 0.5,
            "Battle": 0.0,
            "Land": 35.5,
        },
        tag="mill",
        commanders=17,
        decks=9737,
        measured="2026-08-30",
    ),
    "group_slug": ArchetypeProfile(
        counts={
            "Creature": 22.0,
            "Instant": 11.3,
            "Sorcery": 10.0,
            "Artifact": 11.2,
            "Enchantment": 9.4,
            "Planeswalker": 1.0,
            "Battle": 0.0,
            "Land": 34.1,
        },
        tag="group-slug",
        commanders=17,
        decks=6344,
        measured="2026-08-30",
    ),
    "stax": ArchetypeProfile(
        counts={
            "Creature": 20.3,
            "Instant": 13.6,
            "Sorcery": 5.8,
            "Artifact": 14.9,
            "Enchantment": 10.9,
            "Planeswalker": 1.7,
            "Battle": 0.0,
            "Land": 31.8,
        },
        tag="stax",
        commanders=15,
        decks=4301,
        measured="2026-08-30",
    ),
    "legends": ArchetypeProfile(
        counts={
            "Creature": 31.8,
            "Instant": 7.7,
            "Sorcery": 7.0,
            "Artifact": 9.6,
            "Enchantment": 5.8,
            "Planeswalker": 0.9,
            "Battle": 0.0,
            "Land": 36.4,
        },
        tag="legends",
        commanders=11,
        decks=8482,
        measured="2026-08-30",
    ),
    "voltron": ArchetypeProfile(
        counts={
            "Creature": 19.7,
            "Instant": 10.8,
            "Sorcery": 7.5,
            "Artifact": 17.8,
            "Enchantment": 7.6,
            "Planeswalker": 0.4,
            "Battle": 0.0,
            "Land": 35.2,
        },
        tag="voltron",
        commanders=20,
        decks=5658,
        measured="2026-08-30",
    ),
    "stompy": ArchetypeProfile(
        counts={
            "Creature": 34.6,
            "Instant": 7.7,
            "Sorcery": 8.7,
            "Artifact": 5.8,
            "Enchantment": 6.7,
            "Planeswalker": 0.6,
            "Battle": 0.0,
            "Land": 35.0,
        },
        tag="stompy",
        commanders=6,
        decks=1294,
        measured="2026-08-30",
    ),
    "poison": ArchetypeProfile(
        counts={
            "Creature": 25.7,
            "Instant": 11.2,
            "Sorcery": 9.5,
            "Artifact": 9.8,
            "Enchantment": 6.3,
            "Planeswalker": 1.8,
            "Battle": 0.0,
            "Land": 34.8,
        },
        tag="infect",
        commanders=10,
        decks=5897,
        measured="2026-08-30",
    ),
}

# Pooled cross-commander cEDH profile for tier 0's fallback — the same
# relationship `ARCHETYPE_TYPE_COUNTS` has to the commander page at tier
# 2.5, one level up: when a specific commander's own `/cedh` subpage is
# thin, absent, or unreadable, a bracket-5 deck still gets a real measured
# profile instead of dropping straight to the theme/tribe ladder below it.
#
# Measured 2026-09-01 by `cedh_profiles.measure_cedh` (`deck-lab
# measure-cedh --top-k 40`), pasted in as a reviewed diff —
# `archetype_profiles`'s discipline, copied. Pooled deck-count weighted
# over the 40 commanders in this dev corpus clearing `CEDH_MIN_DECKS`
# (150) — exactly `MEASURE_TOP_K`'s default, so this reproduces with zero
# network calls against the warmed cache — and 39,657 bracket-5 decks. The
# same run also produced the curve and per-bucket coverage numbers behind
# the `CEDH` `DeckTemplate` in `composition.py`; see that module's comment
# for the corridor derivation and the land-shift trap (the casual
# mana-sources reconciliation, `derive_mana_sources` today) this table's own
# Land row (28.1, well below the 35 casual median) walks straight into if
# the cEDH branch does not suppress it. To re-derive: `warm-edhrec` a corpus, then run
# `measure-cedh --top-k 40` again inside the container — see
# `cedh_profiles`'s module docstring for the full pipeline.
#
# Typed as `ArchetypeProfile | None` rather than the bare `dict[str, float]`
# a first pass reached for: the source string below needs the
# commander/deck counts that only the dataclass carries, and a second,
# parallel container for the same three numbers is exactly the thing
# `archetype_profiles`'s module docstring already argues against building
# twice.
CEDH_TYPE_COUNTS: ArchetypeProfile | None = ArchetypeProfile(
    counts={
        "Creature": 21.5,
        "Instant": 20.1,
        "Sorcery": 8.1,
        "Artifact": 15.1,
        "Enchantment": 5.0,
        "Planeswalker": 0.9,
        "Battle": 0.1,
        "Land": 28.1,
    },
    tag="cedh",
    commanders=40,
    decks=39657,
    measured="2026-09-01",
)


def type_weight(speed: float) -> float:
    """How hard the type ranges bind at this speed."""
    return TYPES_WEIGHT_SLOW + (TYPES_WEIGHT_FAST - TYPES_WEIGHT_SLOW) * speed


def targets_from_counts(
    counts: Mapping[str, float], *, speed: float, scale: float = 1.0
) -> dict[str, BucketTarget]:
    """Point estimates -> soft ranges.

    Land binds like every other type. It used to carry weight zero on the
    argument that the MANA_SOURCES bucket already owned land count — but
    that bucket counts rocks and dorks at full weight beside the lands, so
    it owns *sources*, not lands, and a dork-heavy deck could sit inside its
    corridor with five lands too few and nothing in the system minding. The
    two rows overlap only when a deck is over on both at once (more lands is
    more sources), and there the type weight is a tenth of the bucket's, so
    the double count that argument feared is small where it exists at all.

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
            weight=weight,
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

    Tier 0, ahead of everything else: a bracket-5 deck (`is_cedh(speed)`)
    reads its commander's `/cedh` subpage instead, gated on
    `bracket_counts["5"]` clearing `CEDH_MIN_DECKS`. cEDH conditioning
    outranks theme and tribe conditioning — a cEDH spellslinger deck is a
    cEDH deck first, and EDHREC has no two-tag subpages, so there is no
    "commander × cedh × spellslinger" page to prefer over it. The `/cedh`
    page carries its own taglinks, so it is already format-right even
    though it is theme-blind. A thin, absent, or unreadable subpage falls
    to the pooled `CEDH_TYPE_COUNTS` before falling all the way through to
    tier 1 below — a deck that claims bracket 5 stays cEDH-conditioned even
    when its own commander's subpage cannot back that up.

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
    from .edhrec import (
        CEDH_TAG_SLUG,
        THEME_TAG_SLUGS,
        load_bracket_counts,
        load_type_counts,
        slugify,
    )
    from .typal import plural_forms

    if is_cedh(speed):
        bracket_decks = load_bracket_counts(commander_name).get(5, 0) if commander_name else 0
        cedh_counts = None
        if commander_name and bracket_decks >= CEDH_MIN_DECKS:
            cedh_counts, _ = load_type_counts(
                commander_name, theme_slug=CEDH_TAG_SLUG, allow_fetch=allow_fetch
            )
        if cedh_counts is not None:
            source = f"edhrec:{slugify(commander_name)}/cedh ({bracket_decks:,} decks)"
            return targets_from_counts(cedh_counts.counts, speed=speed, scale=scale), source

        if CEDH_TYPE_COUNTS is not None:
            source = (
                f"cedh-pool ({CEDH_TYPE_COUNTS.commanders} commanders, "
                f"{CEDH_TYPE_COUNTS.decks:,} decks)"
            )
            return targets_from_counts(CEDH_TYPE_COUNTS.counts, speed=speed, scale=scale), source

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


def derive_mana_sources(template: DeckTemplate, land_target: BucketTarget | None) -> DeckTemplate:
    """Build the mana-sources quota from the Land corridor and the ramp quota.

    The mana-sources bucket counts lands, rocks and dorks at full weight
    each, so its corridor is a corridor on *all* of them at once. The
    authored `BATTLECRUISER`/`TUNED` corridors (37-40 and 30-34) never left
    room for that: at the 35-land corpus median they allowed two to five
    non-land sources against a ramp quota of 9-16 pieces, most of which are
    rocks and dorks. Measured over 415 cached casual commander pages, 383
    read as *over* the speed-0.5 corridor — the corridor said the format
    was wrong. The observed failure: a green deck at 41 sources against a
    34.5-38 target, with its lands already *under* the Land row, was told to
    cut a Mountain first, because cutting a land relieved the sources
    overage and the weight-zero Land row (since fixed) charged nothing for
    going further under.

    So the corridor is derived rather than authored: each Land bound plus
    `NONLAND_SOURCE_SHARE` of the ramp corridor's *midpoint*. The Land row
    supplies the corridor's width and its per-commander position; the ramp
    quota supplies one point allowance for the rocks and dorks the speed
    expects (8.2 cards at the measured casual ramp corridor,
    `composition.CASUAL_CORRIDORS`). If the deck hits its ramp quota with the
    measured mix of rocks and dorks to land ramp, the sources quota
    accommodates it, and the two panels stop asking for incompatible things.
    At the corpus median (Land 31.5-38.5, `DEFAULT_TYPE_COUNTS`'s Land mean
    ± `LAND_HALF_WIDTH`) that is 39.7-46.7, the same at every
    bracket-1-4 speed since brackets 1-4 share one ramp corridor; only the
    Land row itself moves the quota, per commander.

    Midpoint, not bound-for-bound. A first version added the share of the
    matching ramp *bound* to each Land bound, which reads as "room for the
    whole ramp corridor" but double-counts dispersion: the Land row already
    carries ±3.5 of it, and the measured ramp corridor is ±6.9 wide, so the
    derived corridor came out 36.6-51.2 at the median — 14.6 cards wide for
    a quantity that measures 35 stated lands + 8.3 non-land sources =
    43.3 with sd 3.9, and 7 of 415 casual pages could ever read over
    it. With the midpoint the corridor is the Land corridor's own 7 cards
    wide, which is what the sources dispersion actually is. Checked against
    the same 415 pages with each commander's own Land corridor: 301 sit
    inside, 84 read short and 30 read over — a corridor that fires
    both ways, roughly in proportion. The ramp corridor's edges still land
    inside it at the Land midpoint (35 + 0.51·9.3 = 39.7 against
    39.7; 35 + 0.51·23.0 = 46.7 against 46.7) because
    0.51 × ramp's half-width happens to be within a tenth of
    `LAND_HALF_WIDTH` — a coincidence of the measured numbers, pinned by a
    test so a re-measurement that breaks it is noticed rather than assumed.

    The weight stays the template's: where the quota sits is the archetype's
    land count plus the speed's ramp appetite, how hard it binds is speed.
    The archetype effect the old shift carried (a landfall deck's 39 lands
    moving the quota up) survives unchanged, because the Land corridor *is*
    the base now rather than a delta against the corpus median. A template
    with no Land corridor to build on (an unconditioned `template_for`) keeps
    its authored fallback.

    Both inputs arrive already sized to the deck — the template's ramp bounds
    by `conditioned_template`'s scale pass, the Land corridor by
    `targets_from_counts` — so nothing here is scaled again.
    """
    if land_target is None:
        return template

    sources = template.buckets[Bucket.MANA_SOURCES]
    ramp = template.buckets[Bucket.RAMP]
    allowance = NONLAND_SOURCE_SHARE * (ramp.low + ramp.high) / 2
    buckets = dict(template.buckets)
    buckets[Bucket.MANA_SOURCES] = BucketTarget(
        low=land_target.low + allowance,
        high=land_target.high + allowance,
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
    type_overrides: Mapping[str, TargetOverride] | None = None,
    cedh_class: str | None = None,
) -> DeckTemplate:
    """The one way to build a template once type targets are resolved.

    Order matters and is the point: interpolate by speed, resize to the
    deck, derive the mana quota from the Land corridor, apply user
    overrides, attach the type targets. Overrides land *after* the
    derivation so a hand on the handle beats the archetype — the user
    dragged against the derived range the report showed them, and deriving
    over their value again would move it behind their back. A ramp override
    does not feed the derivation for the same reason: the corridor is built
    from the speed's ramp quota, and the user's ramp handle moves ramp.
    Every scorer (diagnose, cut scoring, /replace, the fill solver) must
    come through here, or one of them scores a mana quota the report never
    showed.

    `cedh_class` (cEDH Pro round Task E follow-up) is threaded straight
    through to `template_for` — `"turbo"` / `"midrange"` / `"stax"` picks
    the matching measured sub-archetype template at `is_cedh(speed)`;
    `None` or anything `template_for`'s selection table does not recognise
    (including `"unclassified"`) falls back to the pooled `CEDH`, and below
    bracket 5 this parameter does nothing at all. A caller with no
    classification to offer — `/replace`, which never diagnoses — simply
    omits it and gets exactly the old pooled behaviour.

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

    `type_overrides` are the builder's edits to the type corridors, and they
    land *first* — before the mana-source derivation, which reads the Land
    target. A user who asks for 34 lands is asking the mana quota to move
    with them, and a quota built off the archetype's Land row would have the
    two panels disagreeing about the same decision. Pass them only where the
    targets come from `resolve_type_targets`: targets read back off a report
    with `targets_from_report` already carry the user's edits, and applying
    them again would move a corridor the user only moved once.

    The mana-source derivation is skipped outright at `is_cedh(speed)` — see
    the comment at the call site below. `CEDH`'s own corridor is already the
    measured cEDH mana base; it needs no reconstruction layered on.
    """
    types = apply_type_overrides(types, type_overrides or {})
    template = template_for(speed, cedh_class=cedh_class)
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
    # `derive_mana_sources` builds the casual quota from a Land corridor and
    # a ramp quota that were each authored or measured for brackets 1-4. The
    # cEDH templates' mana-sources corridors were measured directly, lands
    # and fast mana together, off the tournament corpus (see `CEDH` in
    # `composition.py`): 28 lands and ~40 sources, with the gap filled by
    # rocks and dorks at a rate no casual share describes. Rebuilding that
    # corridor from the cEDH Land row plus 0.55 of the cEDH ramp quota would
    # land near it by accident and drift from it on every re-measurement,
    # while the Land row beside it kept reading correctly — a right-looking
    # Land row next to a wrong mana-sources corridor is the trap the earlier
    # shift-based reconciliation walked into, and it is avoided the same
    # way: a measured cEDH corridor is never reconstructed, at any class.
    if not is_cedh(speed):
        template = derive_mana_sources(template, types.get("Land"))
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
            weight=weight,
        )
        for row in types_rows
    }
