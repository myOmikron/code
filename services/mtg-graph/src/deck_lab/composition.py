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

# Where bracket 5 begins on the speed scale.
#
# `bracketSpeed` (the frontend's only setter) maps brackets 1-5 onto
# 0.0/0.25/0.5/0.75/1.0, so this boundary is what "the deck claims cEDH"
# means everywhere in the service. It lives here rather than in
# `suggestions.py` — where it was first written — because the shape layer
# needs it too and the import only runs one way: `suggestions` and
# `type_targets` both import `composition`, never the reverse.
SPEED_BRACKET_FIVE = 0.8


def is_cedh(speed: float) -> bool:
    """Whether this deck claims bracket 5.

    The one predicate that decides between the casual ladder and the cEDH
    corpus. Deliberately a threshold on the existing `speed` field rather
    than a new request flag: every other bracket-conditioned knob in the
    service already reads brackets off `speed` this way, and a second,
    redundant way to say "bracket 5" is a way for the two to disagree.
    """
    return speed >= SPEED_BRACKET_FIVE


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

# The third archetype — not a faster TUNED, a different format. Measured by
# `cedh_profiles.measure_cedh` (`deck-lab measure-cedh --top-k 40`), pooled
# deck-count weighted over 40 commanders and 39,657 bracket-5 decks
# (2026-09-01). See `type_targets.CEDH_TYPE_COUNTS` for the same run's type
# axis; this is its bucket and curve half.
#
# The headline the corridors below encode: cEDH runs *more* mana sources
# than a tuned deck (~40 against TUNED's 30–34) while running *fewer* lands
# (28.1 against TUNED's ~35, from the same measurement — see
# `type_targets.CEDH_TYPE_COUNTS`). The missing lands are replaced by rocks
# and dorks, not by spells. That is a shape no point on the BATTLECRUISER-
# TUNED line can produce — interpolating harder toward "tuned" *raises*
# lands and *lowers* mana sources together, the opposite of what cEDH does —
# which is why this is a third template `template_for` branches to, never a
# third anchor it interpolates toward.
#
# Corridor rule, applied uniformly across all five buckets: half-width is
# one measured standard deviation of that bucket's coverage across the
# synthetic-average-deck pool (`cedh_profiles.CedhMeasurement.bucket_sd`),
# centred on the measured mean. Every other template in this file hand-picks
# its bounds because nothing was ever measured to pick them from; here
# something was, so the dispersion the measurement actually produced is used
# instead of another authored half-width.
#
#   bucket           mean   sd   corridor
#   mana_sources     40.4*  5.3  35.1-45.7
#   ramp             19.3   6.0  13.3-25.3
#   card_draw        12.7   3.7   9.0-16.4
#   interaction      21.0   5.2  15.8-26.2
#   synergy_wincon   21.9   5.2  16.7-27.1
#
# * Corrected. The raw pooled mean was 43.7, but the synthetic decks
#   `measure_cedh` builds over-count lands by +3.3 against the same pages'
#   own stated land counts (`SyntheticDeckValidation`'s Land delta) — an
#   inference artefact of picking the highest-inclusion-rate cards until the
#   list is full, not a property of real cEDH decks. Every land is a mana
#   source, so that +3.3 inflates this bucket by the same amount; 40.4 is
#   43.7 corrected for it. No other bucket's delta was material enough to
#   warrant the same correction.
#
# Weights and curve_weight are TUNED's times 1.3 — a judgment call, not a
# measurement (there is no per-deck dispersion to read a binding strength
# off, only bucket-coverage dispersion). Stated as one: a cEDH list is
# metagame-tuned against a field that punishes a slow draw harder than a
# casual pod does, so a missing piece should cost more here than at TUNED,
# the same relationship TUNED already has to BATTLECRUISER. 1.3 is not
# derived from anything further than "more than TUNED's, by an amount in
# the same range TUNED already sits above BATTLECRUISER's" (TUNED runs
# 1.3-2x BATTLECRUISER's weights depending on the bucket).
CEDH = DeckTemplate(
    name="cedh",
    buckets={
        Bucket.MANA_SOURCES: BucketTarget(35.1, 45.7, 4.0 * 1.3),
        Bucket.RAMP: BucketTarget(13.3, 25.3, 2.5 * 1.3),
        Bucket.CARD_DRAW: BucketTarget(9.0, 16.4, 2.0 * 1.3),
        Bucket.INTERACTION: BucketTarget(15.8, 26.2, 2.0 * 1.3),
        Bucket.SYNERGY_WINCON: BucketTarget(16.7, 27.1, 1.0 * 1.3),
    },
    curve={0: 0.085, 1: 0.300, 2: 0.246, 3: 0.205, 4: 0.085, 5: 0.037, 6: 0.042},
    curve_weight=1.2 * 1.3,
)

# The three sub-archetypes `CEDH` pooled — cEDH Pro round Task E. `CEDH`'s
# own measured dispersion said the pool was too wide at the time it was
# built (creature sd ~= 7; instants ran 4-31 across the 40-commander `/cedh`
# pool); this round asked whether that dispersion has a shape, not just a
# size. It does: `deck_lab.cedh_archetypes.classify` sorts a deck into
# turbo / midrange / stax on two measured features (stack interaction,
# stax/tax/denial density — see that module's docstring for the two other
# features that were computed, checked, and rejected), and each class below
# pools its own bucket corridor, curve and mana base directly from real
# tournament decklists.
#
# Real decklists, not synthetic ones. `CEDH` above is built from `cedh_
# profiles._synthetic_average_deck` — an *inference* about what an average
# decklist looks like, built by taking a `/cedh` page's highest-inclusion-
# rate cards until a 99-card list is full, because EDHREC's aggregate page
# publishes no decklist of its own to measure directly. A `:TournamentDeck`
# **is** a real decklist (Task A's edhtop16 ingest), so that inference step
# drops out entirely here — this is a strictly better measurement than
# `CEDH`'s own, not merely a different one, for exactly the reason `cedh_
# archetypes.py`'s module docstring gives.
#
# Measured 2026-09-01 (`deck-lab measure-cedh --classes`), deck-count
# weighted by construction (every observation already is one real deck,
# unlike `CEDH`'s per-commander synthetic average): 6,035 turbo decks
# across 387 commanders, 4,546 midrange decks across 147, 2,208 stax decks
# across 167 — all three comfortably clear the `cedh_archetypes.
# MIN_COMMANDERS`/`MIN_DECKS` floors this round set (3 / 1,000), out of
# 14,611 classified decks (17,663 total in the corpus; 2,511 carry no
# `commander_name` at all and 541 more are empty stub entries with zero
# `PLAYED` edges — both excluded, per Task A's own review). Corridor rule
# unchanged from `CEDH`: half-width is one measured standard deviation of
# that class's own per-deck bucket coverage, centred on the measured mean.
# Basic-land undercounting (`PLAYED.qty` is always 1 — `edhtop16.py`'s
# module docstring) is corrected per deck before pooling; see `cedh_
# archetypes._basic_land_shortfall` for the exact method and its one known
# residual bias (a rare unresolved nonland card reads as a missing basic
# too — immaterial at the corpus's <2% join-failure rate).
#
#   bucket          turbo mean/sd/corridor      midrange              stax
#   mana_sources    39.8 / 5.6 / 34.1-45.4      38.5/4.3/34.2-42.8    40.0/5.7/34.3-45.7
#   ramp            21.1 / 5.1 / 16.0-26.1      19.7/4.0/15.7-23.7    21.0/5.3/15.6-26.3
#   card_draw       12.7 / 4.9 /  7.8-17.7      13.1/2.5/10.6-15.6     9.8/4.6/ 5.2-14.4
#   interaction     19.9 / 4.9 / 15.0-24.8      21.6/3.7/17.9-25.3    15.4/5.2/10.2-20.6
#   synergy_wincon  21.3 / 5.1 / 16.2-26.4      25.9/3.3/22.6-29.1    29.8/5.6/24.2-35.3
#
# The headline the split makes visible that the pooled table hid: stax's
# INTERACTION coverage (15.4) sits *below* even its own TUNED-anchored
# floor and well below turbo/midrange's (~20-22), while its SYNERGY_WINCON
# coverage (29.8) is the highest of the three. `Bucket.INTERACTION` is
# `{spot_removal, board_wipe, counterspell, graveyard_hate, protection}`
# (`vocabulary.BUCKET_ROLES`) — it does not include `Role.STAX`, which
# feeds SYNERGY_WINCON instead. A stax deck's disruption is real (that is
# what `stax_count` measures to classify it in the first place) but it
# lands on a different bucket than a turbo or midrange deck's held-up
# countermagic does — exactly what the pooled `CEDH` corridor (INTERACTION
# 15.8-26.2) averaged away, wide enough to hide that stax sits at the
# bottom of that range while turbo/midrange sit in the middle of it.
#
# Land-shift check (`type_targets.shift_mana_sources`'s `is_cedh(speed)`
# suppression), done **per class** rather than assumed, because the task
# explicitly flagged that stax might not share it: it does. All three
# classes' land means sit below the 35-card corpus median with a
# mana_sources mean above `TUNED`'s 30-34 ceiling — turbo (27.7 / 39.8),
# midrange (27.5 / 38.5), stax (28.5 / 40.0). The inversion the pooled
# `CEDH` template was built to capture holds uniformly, so `type_targets.
# conditioned_template`'s blanket suppression needs no per-class gate; no
# change was made there.
#
# Weights and curve_weight carry `CEDH`'s own judgment call forward
# unchanged (TUNED's times 1.3) rather than inventing three new ones: there
# is still no per-deck dispersion in *how much a missing piece costs* to
# read a binding strength off, only bucket-coverage dispersion, and nothing
# about splitting the pool by archetype changes that reasoning.
CEDH_TURBO = DeckTemplate(
    name="cedh-turbo",
    buckets={
        Bucket.MANA_SOURCES: BucketTarget(34.1, 45.4, 4.0 * 1.3),
        Bucket.RAMP: BucketTarget(16.0, 26.1, 2.5 * 1.3),
        Bucket.CARD_DRAW: BucketTarget(7.8, 17.7, 2.0 * 1.3),
        Bucket.INTERACTION: BucketTarget(15.0, 24.8, 2.0 * 1.3),
        Bucket.SYNERGY_WINCON: BucketTarget(16.2, 26.4, 1.0 * 1.3),
    },
    # mv=1's share is 0.293 rather than the 3dp-rounded 0.292 the raw
    # measurement gives (0.29232): every other bucket here rounds down as
    # well, and the pool must sum to exactly 1 (`apply_curve`'s contract —
    # `curve_targets` multiplies these shares straight into card-count
    # targets). Absorbed by the largest bucket rather than split across all
    # seven, the same rounding convention the pooled `CEDH` curve above
    # already uses (it also sums to exactly 1.000 for the same reason).
    curve={0: 0.085, 1: 0.293, 2: 0.254, 3: 0.203, 4: 0.082, 5: 0.044, 6: 0.039},
    curve_weight=1.2 * 1.3,
)

CEDH_MIDRANGE = DeckTemplate(
    name="cedh-midrange",
    buckets={
        Bucket.MANA_SOURCES: BucketTarget(34.2, 42.8, 4.0 * 1.3),
        Bucket.RAMP: BucketTarget(15.7, 23.7, 2.5 * 1.3),
        Bucket.CARD_DRAW: BucketTarget(10.6, 15.6, 2.0 * 1.3),
        Bucket.INTERACTION: BucketTarget(17.9, 25.3, 2.0 * 1.3),
        Bucket.SYNERGY_WINCON: BucketTarget(22.6, 29.1, 1.0 * 1.3),
    },
    curve={0: 0.085, 1: 0.335, 2: 0.270, 3: 0.194, 4: 0.077, 5: 0.029, 6: 0.010},
    curve_weight=1.2 * 1.3,
)

CEDH_STAX = DeckTemplate(
    name="cedh-stax",
    buckets={
        Bucket.MANA_SOURCES: BucketTarget(34.3, 45.7, 4.0 * 1.3),
        Bucket.RAMP: BucketTarget(15.6, 26.3, 2.5 * 1.3),
        Bucket.CARD_DRAW: BucketTarget(5.2, 14.4, 2.0 * 1.3),
        Bucket.INTERACTION: BucketTarget(10.2, 20.6, 2.0 * 1.3),
        Bucket.SYNERGY_WINCON: BucketTarget(24.2, 35.3, 1.0 * 1.3),
    },
    curve={0: 0.068, 1: 0.307, 2: 0.269, 3: 0.220, 4: 0.081, 5: 0.023, 6: 0.032},
    curve_weight=1.2 * 1.3,
)

# Selection table for `template_for`'s `cedh_class` parameter — keyed by the
# plain string values `cedh_archetypes.ArchetypeClass` carries (a `StrEnum`
# member hashes and compares equal to its own string value, so a caller may
# pass either without this module importing that one — see `template_for`'s
# docstring for why the two modules do not import each other).
_CEDH_CLASS_TEMPLATES: dict[str, DeckTemplate] = {
    "turbo": CEDH_TURBO,
    "midrange": CEDH_MIDRANGE,
    "stax": CEDH_STAX,
}


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


def apply_curve(template: DeckTemplate, curve: Mapping[int, float] | None) -> DeckTemplate:
    """Layer a user's curve shape onto a template, keeping everything else.

    The shares are renormalised to sum to 1 rather than taken literally, and
    that is the whole contract: a target is `share x spell_count`, so a shape
    summing to 1.3 would ask a 63-spell deck for 82 spells and every card in
    the list would read as missing. Renormalising keeps the promise the panel
    makes — the slots are fixed, so raising one bar lowers the rest.

    A shape with nothing in it is not a shape: an empty or all-zero mapping
    leaves the interpolated curve alone rather than dividing by zero.
    """
    if not curve:
        return template

    shares = {mv: max(0.0, curve.get(mv, 0.0)) for mv in CURVE_BUCKETS}
    total = sum(shares.values())
    if total <= 0:
        return template

    return DeckTemplate(
        name=f"{template.name}+curve",
        buckets=template.buckets,
        curve={mv: share / total for mv, share in shares.items()},
        curve_weight=template.curve_weight,
        deck_size=template.deck_size,
        types=template.types,
    )


def apply_type_overrides(
    types: Mapping[str, BucketTarget], overrides: Mapping[str, TargetOverride]
) -> dict[str, BucketTarget]:
    """Layer user edits onto resolved type targets, keeping their weights.

    The type twin of `apply_overrides`, and it takes the targets rather than
    a template because they are edited *before* the template is built: the
    Land corridor a user drags also shifts the mana-source bucket, and that
    shift happens on the way in — see `type_targets.conditioned_template`.

    A type the resolver did not report is dropped rather than invented: the
    targets are one page's empirical distribution, and a row with no data
    behind it has no weight to grade against.
    """
    if not overrides:
        return dict(types)

    resolved = dict(types)
    for name, override in overrides.items():
        current = resolved.get(name)
        if current is None:
            continue

        low = current.low if override.low is None else override.low
        high = current.high if override.high is None else override.high
        # Swapped rather than refused, exactly as `apply_overrides` does it:
        # a handle dragged past its partner is a gesture, not an error.
        if low > high:
            low, high = high, low

        resolved[name] = BucketTarget(low=low, high=high, weight=current.weight)

    return resolved


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


# The layouts whose back face is a *promise*, not a mode. A transform card
# must meet its condition before the back exists; an MDFC's land face can
# simply be played as the land drop. Search for Azcanta spends most games as
# an enchantment, and counting it as a full land inflated a real deck's mana
# base by one per copy — measured before this rule existed.
_FLIP_LAYOUTS = ("transform", "flip")

# What a conditional back face is worth, as a share of a real card of that
# type. A judgment call stated as one: the flip usually happens eventually
# in the games that matter, but "usually, eventually" is not a land drop on
# turn two.
_BACK_FACE_SHARE = 0.5


def type_shares(type_line: str, layout: str | None) -> list[tuple[str, float, bool]]:
    """How much of each type row one card is, and how firmly.

    Almost every card is exactly one row at weight 1.0, filed by
    `primary_type` and *firm* — it is that type, unconditionally. Two
    double-faced exceptions, each carrying the third element `False`:

    - Transform-style flips file their front face at full weight, firm —
      it is what the card does most of the game — and their back face's
      type at `_BACK_FACE_SHARE`, flexible, because the flip is
      conditional. Search for Azcanta reads as an enchantment plus half a
      land; Westvale Abbey as a land plus half a creature.
    - MDFCs keep the joined-line filing at full weight on purpose — you
      may just play the land face — but the credit is *flexible* whenever
      the filing came from a non-front face: Malakir Rebirth counts as a
      whole land, and as a land you might cast as a spell instead. That
      firm/flexible split is what lets the Land row read "28–32 with
      MDFCs" instead of a bare 32.

    Callers without a layout in their rows fall back to the single-row
    firm filing — the fractional rule only ever *narrows* what a flip card
    counts for, so a caller that cannot tell the layouts apart safely
    overcounts the way it always has.
    """
    line = type_line or ""
    if (layout or "") in _FLIP_LAYOUTS and " // " in line:
        front, _, back = line.partition(" // ")
        front_name = primary_type(front)
        back_name = primary_type(back)
        if back_name != front_name:
            return [(front_name, 1.0, True), (back_name, _BACK_FACE_SHARE, False)]
        return [(front_name, 1.0, True)]
    if (layout or "") == "modal_dfc" and " // " in line:
        filed = primary_type(line)
        front_name = primary_type(line.partition(" // ")[0])
        return [(filed, 1.0, filed == front_name)]
    return [(primary_type(line), 1.0, True)]


def type_counts_from_cards(cards: Sequence[Mapping]) -> dict[str, float]:
    """Deck cards -> quantity-weighted counts per primary type.

    The one counting rule for both sides of every type comparison: deck
    counts here, candidate classification via the same `primary_type` — so
    a Dryad Arbor is a land in the count and a land to the demotion pass.
    Transform flips are the exception, split across their faces by
    `type_shares`; candidate classification keeps the joined-line reading
    (channel rows carry no layout), which errs toward demoting a suggested
    flip card against the fuller row — the conservative direction.
    """
    counts: dict[str, float] = {}
    for card in cards:
        qty = card.get("qty", 1)
        for name, share, _ in type_shares(card.get("type_line") or "", card.get("layout")):
            counts[name] = counts.get(name, 0.0) + qty * share
    return counts


def type_flexible_from_cards(cards: Sequence[Mapping]) -> dict[str, float]:
    """How much of each type row is optional-face credit rather than fact.

    The flexible slice of `type_counts_from_cards` — MDFC land faces whose
    front is a spell, and transform back-face halves. Always a subset of
    the count, never counted twice: the row's firm floor is
    `count - flexible`, which is what "28–32 with MDFCs" reads off.
    """
    flexible: dict[str, float] = {}
    for card in cards:
        qty = card.get("qty", 1)
        for name, share, firm in type_shares(card.get("type_line") or "", card.get("layout")):
            if not firm:
                flexible[name] = flexible.get(name, 0.0) + qty * share
    return flexible


def type_contributions_from_cards(cards: Sequence[Mapping]) -> dict[str, list[tuple[str, float]]]:
    """The same counts as `type_counts_from_cards`, itemised by card.

    The type side of `bucket_contributions_from_cards`, and the reason a
    reader can check "38 creatures" against the list rather than believing it.
    Copies count as copies: eight Mountains are eight of the Land row, listed
    once carrying eight. A transform flip appears under both its faces' rows,
    carrying the fractional share it actually contributes there.
    """
    itemised: dict[str, list[tuple[str, float]]] = {}
    for card in cards:
        qty = card.get("qty", 1)
        for name, share, _ in type_shares(card.get("type_line") or "", card.get("layout")):
            itemised.setdefault(name, []).append((card.get("name") or "", qty * share))
    return itemised


def template_for(
    speed: float,
    overrides: Mapping[Bucket, TargetOverride] | None = None,
    curve: Mapping[int, float] | None = None,
    *,
    cedh_class: str | None = None,
) -> DeckTemplate:
    """Brackets 1-4 interpolate between the archetypes (0 is battlecruiser,
    ~0.75 is tuned); bracket 5 (`is_cedh`) returns `CEDH` outright, or one of
    the three measured sub-archetype templates when `cedh_class` names one.

    Exposed to the UI as a single slider, but the result is just a set of
    targets — `overrides` and `curve` are the advanced mode, layered on top:
    the quota corridors and the curve shape the builder dragged for this deck,
    which is why they land last and win, on either path.

    cEDH is not reached by turning the dial to 1.0 — see `CEDH`'s comment for
    why a lerp cannot produce its shape (more mana sources on fewer lands is
    not a point between "more lands, more sources" and "fewer lands, fewer
    sources"). So `is_cedh(speed)` branches to the measured template outright
    rather than blending it in: every deck that claims bracket 5 gets the
    same template regardless of exactly where in [0.8, 1.0] `speed` sits,
    the same way tier 0 (`type_targets.resolve_type_targets`) gives every
    bracket-5 deck the same `/cedh`-conditioned type targets rather than a
    speed-scaled blend of them.

    `cedh_class` (cEDH Pro round Task E) is `"turbo"` / `"midrange"` /
    `"stax"` — the string values of `cedh_archetypes.ArchetypeClass`, kept as
    a plain string parameter here rather than importing that enum so this
    module and `cedh_archetypes.py` do not import each other (that module
    already imports *this* one for `Bucket`/`bucket_coverage_from_cards`).
    A `StrEnum` member hashes and compares equal to its own string value
    (the same interop `interaction.discount_board_wipe` already relies on),
    so a caller may pass either. **Defaults to `None`**, which — together
    with every value this dict lookup does not recognise, including
    `"unclassified"` — falls back to the pooled `CEDH`, so every existing
    call site that does not pass this keyword sees byte-identical behaviour
    to before this parameter existed. No caller in this codebase passes it
    yet: wiring a live deck's own classification in (`cedh_archetypes.
    deck_features` + `classify`, fed from the same cards/roles/resources
    `diagnostics.build_diagnostics` already fetches for the interaction
    grid) is a follow-up outside this task's file ownership, not done here.
    """
    if not 0.0 <= speed <= 1.0:
        raise ValueError(f"speed must be in [0, 1], got {speed}")

    if is_cedh(speed):
        template = _CEDH_CLASS_TEMPLATES.get(cedh_class, CEDH)
    else:
        slow, fast = BATTLECRUISER, TUNED

        buckets = {
            bucket: BucketTarget(
                low=_lerp(slow.buckets[bucket].low, fast.buckets[bucket].low, speed),
                high=_lerp(slow.buckets[bucket].high, fast.buckets[bucket].high, speed),
                weight=_lerp(slow.buckets[bucket].weight, fast.buckets[bucket].weight, speed),
            )
            for bucket in slow.buckets
        }

        interpolated = {mv: _lerp(slow.curve[mv], fast.curve[mv], speed) for mv in CURVE_BUCKETS}

        template = DeckTemplate(
            name=f"speed-{speed:.2f}",
            buckets=buckets,
            curve=interpolated,
            curve_weight=_lerp(slow.curve_weight, fast.curve_weight, speed),
            deck_size=slow.deck_size,
        )

    return apply_curve(apply_overrides(template, overrides or {}), curve)


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


def bucket_contributions_from_cards(
    cards: Sequence[tuple[str, Mapping[Role, float], int]],
) -> dict[Bucket, list[tuple[str, float]]]:
    """The same totals as `bucket_coverage_from_cards`, itemised by card.

    What a reported bucket is *made of*, so a panel can open a total onto the
    cards behind it: "42 mana sources against 30 lands" is either twelve rocks
    and dorks or a bug, and the number alone cannot say which.

    The per-card rule is `bucket_coverage_from_cards`'s, restated here rather
    than shared because that one runs per candidate in the cut scorer and must
    not allocate a list per call. `test_composition` pins the two together: the
    contributions of every bucket sum to its coverage, so the drill-down can
    never quietly disagree with the number it opens from.

    Each entry is `(name, role_weights, qty)`; a card that contributes nothing
    to a bucket is absent from it rather than listed at zero.
    """
    itemised: dict[Bucket, list[tuple[str, float]]] = {bucket: [] for bucket in BUCKET_ROLES}

    for name, role_weights, qty in cards:
        for bucket, roles in BUCKET_ROLES.items():
            best = max((role_weights.get(role, 0.0) for role in roles), default=0.0)
            if best:
                itemised[bucket].append((name, best * qty))

    return itemised


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
