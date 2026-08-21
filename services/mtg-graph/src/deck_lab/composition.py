"""Deck composition targets and the speed meter.

The quota ranges are *soft*. Their own arithmetic proves it: 30–40 mana sources
+ 10–12 ramp + 10–12 draw + 10–14 interaction + 30–35 synergy sums to 90–113
against a 99-card deck. They overlap by design — a Signet is a mana source and
a ramp piece, Solemn Simulacrum is ramp and card advantage — so they cannot be
satisfied one bucket at a time. See `docs/composition.md` for how the solver
balances them.

The speed meter is a single scalar in [0, 1] interpolating between two
archetype templates. It moves both the target ranges and how hard they bind:
a tuned list is less forgiving about a missing ramp slot than a battlecruiser.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from .vocabulary import BUCKET_ROLES, Bucket, Role

# Nonland spells are bucketed by mana value, with 6 meaning "6 or more".
CURVE_BUCKETS: tuple[int, ...] = (0, 1, 2, 3, 4, 5, 6)

# Precedence for filing a card under one type. Mirrors `primaryType` in
# frontend/src/lib/deck/selectors.js exactly — drifting from it is a silent
# defect: the two sides would count the same deck differently and a target
# shown beside a count would not govern the count it sits beside.
_TYPE_PRECEDENCE = (
    "Creature",
    "Planeswalker",
    "Instant",
    "Sorcery",
    "Artifact",
    "Enchantment",
    "Battle",
)


def primary_type(type_line: str) -> str:
    """The one type a card is filed under when counting.

    Order matters: an "Artifact Creature" is a creature to a deckbuilder,
    and a "Land Creature" (Dryad Arbor) is a land, because that is where you
    look for it when counting mana.
    """
    line = type_line or ""
    if re.search(r"\bLand\b", line):
        return "Land"
    for name in _TYPE_PRECEDENCE:
        if re.search(rf"\b{name}\b", line):
            return name
    return "Other"


# What a card over the target costs, against a card missing from under it.
#
# The two are not the same failure and were priced as though they were. A
# shortfall is functional: a deck with too little ramp is slow, and no other
# card in the list makes up for it. Overage is mostly an artefact of how
# coverage is counted — the buckets *overlap*, so a mana rock is both ramp and
# a mana source, and their totals sum well past 99. A deck being over on
# several at once usually means its cards each do more than one job, which is
# the thing a good list is built for rather than a defect.
#
# Not free, though. Ninety-nine slots are fixed: seven mana sources over target
# really are seven cards that are not spells, and without some cost nothing
# would ever read as over, `score_cuts` would have no marginal delta to find,
# and the cut half of the tool would stop working. So overage is priced as a
# real but second-order cost — enough to break ties and rank cuts, not enough
# to make a role-dense deck look broken.
OVER_TARGET_COST = 0.35

# How far *over* a target a deck may sit before it is called out.
#
# Separate from what a surplus costs, and answering a different question: the
# penalty ranks decks, this decides what the report says out loud and — through
# `status` — which buckets the saturation demotion and the cross-bucket swap
# pairing treat as full. A bucket 1.1 over a target of 33.2 was earning an
# amber badge, and behind it a demotion on every card that touched the bucket.
#
# Absolute, not proportional, because coverage is fractional by construction:
# roles carry weights like `RAMP_OTHER: 0.7`, so a surplus under about a card
# and a half is inside the noise of the role weighting itself and says nothing
# about the deck. A percentage band would get this backwards — it would forgive
# three surplus lands on a 36-card mana base while flagging the same absolute
# miss on a ten-card bucket.
#
# **The surplus side only.** Applied to shortfalls as well it silenced a deck
# sitting 1.5 under its ramp floor, and with nothing left reading as short the
# cross-bucket swap pairing stopped firing entirely — 26 shape-fixing exchanges
# went to 0 on the measured deck. That is the asymmetry from `OVER_TARGET_COST`
# restated: a shortfall is functional and worth saying the moment it exists,
# while a false "over" costs a demotion on every card in the bucket. Shortfalls
# are read off the exact bound, exactly as the penalty charges them.
#
# Only the verdict moves. `deviation` still reports the true distance and
# `penalty` still charges from the exact bound, so a deck drifting through the
# band is still ranked below one sitting inside it.
STATUS_TOLERANCE = 1.5


@dataclass(frozen=True, slots=True)
class BucketTarget:
    """A soft quota. `weight` is the penalty per card missing from [low, high];
    a card over the top costs `OVER_TARGET_COST` of that."""

    low: float
    high: float
    weight: float

    def deviation(self, coverage: float) -> float:
        """How far `coverage` falls outside the range. Zero when inside.

        Unweighted and symmetric — this is what the report *displays*, and "3
        over" is a plain fact about the deck whatever it costs the ranking.
        """
        if coverage < self.low:
            return self.low - coverage
        if coverage > self.high:
            return coverage - self.high
        return 0.0

    def penalty(self, coverage: float) -> float:
        if coverage < self.low:
            return self.weight * (self.low - coverage)
        if coverage > self.high:
            return self.weight * OVER_TARGET_COST * (coverage - self.high)
        return 0.0

    def is_over(self, coverage: float) -> bool:
        """Whether the deck is over this target by enough to say so.

        The single definition. `_status`, the cut reasons and everything
        downstream of `status` read it here rather than comparing against
        `high` themselves — two call sites deciding this independently is how
        a report came to say *ok* while the cut beside it said *over*.
        """
        return coverage > self.high + STATUS_TOLERANCE

    def is_short(self, coverage: float) -> bool:
        """Whether the deck is under this target at all.

        No band, unlike `is_over`. A shortfall is a functional gap rather than
        a counting artefact, and forgiving one and a half cards of it stopped
        the swap pairing offering anything that closed it. See
        `STATUS_TOLERANCE`.
        """
        return coverage < self.low


@dataclass(frozen=True, slots=True)
class DeckTemplate:
    """Target shape for a 99-card deck (the commander sits outside the count)."""

    name: str
    buckets: Mapping[Bucket, BucketTarget]
    # Share of nonland spells per curve bucket. Sums to 1.
    curve: Mapping[int, float]
    curve_weight: float
    deck_size: int = 99
    # Per-primary-type targets — the third shape dimension. Empty means
    # unconditioned: the archetype templates carry none because they have no
    # commander to condition on; `apply_type_targets` layers them on per
    # request from `type_targets.resolve_type_targets`.
    types: Mapping[str, BucketTarget] = field(default_factory=dict)


BATTLECRUISER = DeckTemplate(
    name="battlecruiser",
    buckets={
        Bucket.MANA_SOURCES: BucketTarget(37, 40, 3.0),
        Bucket.RAMP: BucketTarget(9, 12, 1.5),
        Bucket.CARD_DRAW: BucketTarget(11, 14, 1.5),
        Bucket.INTERACTION: BucketTarget(8, 11, 1.2),
        Bucket.SYNERGY_WINCON: BucketTarget(31, 36, 0.8),
    },
    curve={0: 0.02, 1: 0.10, 2: 0.19, 3: 0.20, 4: 0.18, 5: 0.14, 6: 0.17},
    curve_weight=0.6,
)

TUNED = DeckTemplate(
    name="tuned",
    buckets={
        Bucket.MANA_SOURCES: BucketTarget(30, 34, 4.0),
        Bucket.RAMP: BucketTarget(12, 16, 2.5),
        Bucket.CARD_DRAW: BucketTarget(9, 12, 2.0),
        Bucket.INTERACTION: BucketTarget(12, 16, 2.0),
        Bucket.SYNERGY_WINCON: BucketTarget(26, 31, 1.0),
    },
    curve={0: 0.05, 1: 0.24, 2: 0.28, 3: 0.20, 4: 0.13, 5: 0.06, 6: 0.04},
    curve_weight=1.2,
)


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


@dataclass(frozen=True, slots=True)
class TargetOverride:
    """A user's edit to one bucket's range.

    Either bound may be left `None` to nudge one end only. Overrides are applied
    *after* interpolation, so the speed slider keeps working and the user is
    never authoring a template from scratch — they are adjusting a preset.
    """

    low: float | None = None
    high: float | None = None


def apply_overrides(
    template: DeckTemplate, overrides: Mapping[Bucket, TargetOverride]
) -> DeckTemplate:
    """Layer user edits onto a template, keeping its penalty weights."""
    if not overrides:
        return template

    buckets = dict(template.buckets)

    for bucket, override in overrides.items():
        if bucket not in buckets:
            continue

        current = buckets[bucket]
        low = current.low if override.low is None else override.low
        high = current.high if override.high is None else override.high

        # An inverted range would make `deviation` report a shortfall and an
        # excess at once. Swap rather than reject: the user dragged a handle
        # past its partner, which is a gesture, not an error.
        if low > high:
            low, high = high, low

        buckets[bucket] = BucketTarget(low=low, high=high, weight=current.weight)

    return DeckTemplate(
        name=f"{template.name}+custom",
        buckets=buckets,
        curve=template.curve,
        curve_weight=template.curve_weight,
        deck_size=template.deck_size,
        types=template.types,
    )


def apply_type_targets(template: DeckTemplate, types: Mapping[str, BucketTarget]) -> DeckTemplate:
    """Condition a template on per-type targets, keeping everything else."""
    if not types:
        return template

    return DeckTemplate(
        name=template.name,
        buckets=template.buckets,
        curve=template.curve,
        curve_weight=template.curve_weight,
        deck_size=template.deck_size,
        types=types,
    )


def type_counts_from_cards(cards: Sequence[Mapping]) -> dict[str, float]:
    """Deck cards -> quantity-weighted counts per primary type.

    The one counting rule for both sides of every type comparison: deck
    counts here, candidate classification via the same `primary_type` — so
    a Dryad Arbor is a land in the count and a land to the demotion pass.
    """
    counts: dict[str, float] = {}
    for card in cards:
        name = primary_type(card.get("type_line") or "")
        counts[name] = counts.get(name, 0.0) + card.get("qty", 1)
    return counts


def template_for(
    speed: float, overrides: Mapping[Bucket, TargetOverride] | None = None
) -> DeckTemplate:
    """Interpolate between the archetypes. 0 is battlecruiser, 1 is tuned.

    Exposed to the UI as a single slider, but the result is just a set of
    targets — `overrides` is the advanced mode, layered on top.
    """
    if not 0.0 <= speed <= 1.0:
        raise ValueError(f"speed must be in [0, 1], got {speed}")

    slow, fast = BATTLECRUISER, TUNED

    buckets = {
        bucket: BucketTarget(
            low=_lerp(slow.buckets[bucket].low, fast.buckets[bucket].low, speed),
            high=_lerp(slow.buckets[bucket].high, fast.buckets[bucket].high, speed),
            weight=_lerp(slow.buckets[bucket].weight, fast.buckets[bucket].weight, speed),
        )
        for bucket in slow.buckets
    }

    curve = {mv: _lerp(slow.curve[mv], fast.curve[mv], speed) for mv in CURVE_BUCKETS}

    template = DeckTemplate(
        name=f"speed-{speed:.2f}",
        buckets=buckets,
        curve=curve,
        curve_weight=_lerp(slow.curve_weight, fast.curve_weight, speed),
        deck_size=slow.deck_size,
    )

    return apply_overrides(template, overrides or {})


def bucket_coverage(role_weights: Mapping[Role, float]) -> dict[Bucket, float]:
    """Aggregate already-deduplicated role totals into bucket totals.

    A role feeding two buckets contributes to both — that is the overlap, and
    it is why the bucket totals legitimately sum past the deck size.

    Only correct when the input is a *deck-level* total in which no single card
    contributes to two roles of the same bucket. For a real decklist use
    `bucket_coverage_from_cards`, which enforces that per card.
    """
    return {
        bucket: sum(role_weights.get(role, 0.0) for role in roles)
        for bucket, roles in BUCKET_ROLES.items()
    }


def bucket_coverage_from_cards(
    cards: Sequence[tuple[Mapping[Role, float], int]],
) -> dict[Bucket, float]:
    """Bucket totals computed per card, then summed.

    A card contributes **at most its strongest role** to any one bucket. An
    Arcane Signet is `mana_rock` 1.0 and (via the generic `ramp` tag)
    `ramp_other` 0.7; both roles sit in the ramp bucket, so summing role totals
    counts one card as 1.7 ramp pieces. Across a real decklist that reported
    30.8 ramp against a target of 10.5–14.

    Across *different* buckets a card still counts in each — Solemn Simulacrum
    is genuinely both ramp and card advantage. That is the intended overlap;
    within-bucket duplication is not.

    Each entry is `(role_weights, qty)`; qty matters for basic lands.
    """
    totals = dict.fromkeys(BUCKET_ROLES, 0.0)

    for role_weights, qty in cards:
        for bucket, roles in BUCKET_ROLES.items():
            best = max((role_weights.get(role, 0.0) for role in roles), default=0.0)
            if best:
                totals[bucket] += best * qty

    return totals


def curve_targets(template: DeckTemplate, nonland_count: int) -> dict[int, float]:
    """Turn the curve distribution into absolute card counts."""
    return {mv: template.curve[mv] * nonland_count for mv in CURVE_BUCKETS}


def composition_penalty(
    template: DeckTemplate,
    role_weights: Mapping[Role, float],
    curve_counts: Mapping[int, float] | None = None,
    type_counts: Mapping[str, float] | None = None,
) -> tuple[float, dict[Bucket, float]]:
    """Score a deck's shape against a template.

    Returns the total penalty and the per-bucket deviation, so the diagnostics
    tab can show *which* quota is off rather than a single opaque number.
    """
    coverage = bucket_coverage(role_weights)
    deviations = {
        bucket: template.buckets[bucket].deviation(value) for bucket, value in coverage.items()
    }
    total = sum(template.buckets[bucket].penalty(value) for bucket, value in coverage.items())

    if curve_counts:
        nonland = sum(curve_counts.values())
        targets = curve_targets(template, nonland)
        total += template.curve_weight * sum(
            abs(curve_counts.get(mv, 0.0) - targets[mv]) for mv in CURVE_BUCKETS
        )

    if type_counts is not None:
        total += sum(
            target.penalty(type_counts.get(name, 0.0)) for name, target in template.types.items()
        )

    return total, deviations
