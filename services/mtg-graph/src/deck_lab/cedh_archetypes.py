"""cEDH sub-archetype classification: turbo, midrange, stax.

Task E of the cEDH Pro round (`implementation-plans/cedh-pro/00-OVERVIEW.md`,
`TASK-E-SUBARCHETYPES.md`). The pooled `CEDH` `DeckTemplate` in
`composition.py` averages three genuinely different game plans — the
measured dispersion said so at the time it was built (creature sd ~= 7;
instants ran 4-31 across the pool). This module is the classifier that
splits the pool: a rule-based decision over per-deck features read straight
off graph edges (overview decision 5 — measured thresholds, not a
clustering black box), plus the corridor measurement that conditions on it.

Two things live here, both keyed to Task A's tournament corpus
(`:TournamentDeck {scene: 'cedh'}`, written by `edhtop16.py`) rather than
EDHREC's `/cedh` subpages (`cedh_profiles.py`'s corpus): a self-tagged
"cEDH" brew is exactly the checkbox-not-a-result problem this whole round
exists to fix, and it is what would happen here too if this module reused
that corpus instead.

## E1 — the classifier

Five features were named as the hypothesis to check: fast-mana count,
stack-interaction count, stax/tax/denial count, creature count, mean mana
value. Measured (2026-09-01) over all 14,611 usable decks in the corpus
plus 18 publicly-known anchor commanders spanning the three classes (see
`ANCHOR_COMMANDERS`), only **two** of the five actually separate the
classes — the other three were computed, inspected, and *rejected* as
decision inputs rather than forced in:

    fast_mana   turbo mean 10.1, midrange mean 11.4 — HIGHER for midrange.
                Etali (midrange) posts 16.6, the highest of any anchor.
                Rejected: does not separate turbo from midrange at all.
    mean_mv     turbo mean 2.20, midrange mean 1.97 — turbo is *higher*,
                the opposite of the hypothesis ("turbo = low mean MV").
                Rejected for the same reason.
    creatures   turbo mean 20.0, midrange mean 21.2 — near-identical means
                hiding a bimodal turbo population (Vivi/Rograkh-Silas/Ral
                run 6-9, Kinnan/Arcum/K'rrik/Rograkh-Thrasios run 19-27).
                Stax's mean (34.5) is elevated mostly by two anchors
                (Winota 51.5, Tayam 46.1); Magda (25.9) and Zirda (22.5)
                overlap the other two classes entirely. Rejected as a
                single-threshold input; still computed and reported.
    stack       (counterspell-role count) is the strongest single signal,
                but not for the hypothesised reason: it separates **stax
                from everything else**, not turbo from midrange. All four
                stax anchors sit at 1.0-3.4; every other anchor sits at
                8.0-13.5 *except* two outliers — K'rrik (turbo, 0.2, a
                goldfish deck with no interaction because its plan does
                not need any) and Etali (midrange, 2.2, a ramp/value deck
                light on countermagic for the same reason). Both outliers
                run LOW stax/tax/denial counts too (2.4 and 2.7), which is
                exactly what separates a low-interaction *goldfish* deck
                from a low-interaction *stax* deck — see below.
    stax        (tax_effect/resource_denial producer count) does the real
                work, in combination with `stack`: stax anchors run 6.3-25.0
                of these; turbo anchors run 2.4-6.4; midrange anchors run
                2.7-16.3 (Etali is the one low outlier, 2.7 — the same
                ramp/value deck `stack` also mis-signals on).

The shipped rule (`classify`) is two features, not five — `STAX_STACK_MAX`
gates on low stack interaction with `STAX_TAX_MIN` as a second, independent
condition so a goldfish deck (low stack, low stax count) reads as turbo
rather than stax; the non-stax remainder splits on the stax/tax/denial
count alone, with a genuine gap between `TURBO_TAX_MAX` and
`MIDRANGE_TAX_MIN` landing in `ArchetypeClass.UNCLASSIFIED` rather than
being forced either way (overview decision 5's "an honest bucket beats a
forced one", stated literally as a numeric gap here rather than a vibe).

Confusion, at the per-deck grain, over the 18 anchor commanders (8,125
decks): turbo 82.6% (3,080/3,729 — the misses are almost entirely K'rrik's
individual decks whose own interaction count occasionally clears the stax
gate's ambiguous band), midrange 82.1% (2,987/3,640 — the misses are
overwhelmingly Etali's entire 329-deck population reading as turbo, the
one anchor this two-feature rule cannot place correctly, named above and
left as an honest, reported error rather than a special case), stax 83.3%
(630/756 — the misses lean on Magda, the "stax-adjacent aggro-combo" of
the four stax anchors and the one whose stax/tax/denial count sits closest
to `STAX_TAX_MIN`). See `render_classifier_report` for the full table.

## E2 — per-class corridors

`measure_cedh_classes` pools bucket coverage, type counts, and curve
**per predicted class**, directly from real tournament decklists — no
synthetic-average-deck inference (`cedh_profiles._synthetic_average_deck`)
is needed here the way it was for EDHREC's aggregate-only `/cedh` pages,
because a `:TournamentDeck` already **is** one real decklist. That is a
strictly better measurement than the pooled `CEDH` template's own
derivation, not a shortcut: the corridor is the true per-deck distribution,
not an inference about what an "average" deck might look like built from a
page's per-card inclusion rates.

One real data quality issue bites here and nowhere else in this module:
`PLAYED.qty` is always 1 (`edhtop16.py`'s module docstring — the API
dedupes a decklist by card name, so a deck running 8 Islands and a deck
running 1 Island are indistinguishable past the first row). This
undercounts basic lands specifically — nothing else, since every nonbasic
and nonland card in a singleton format is already qty-1 in truth. The
correction (`_basic_land_shortfall`): cEDH is a fixed 99-card singleton
format, so `99 - (unique cards resolved)` is the count of "invisible"
extra basic copies a deck's own row count is short by, and every one of
those copies is a plain basic land (`Role.LAND` weight 1.0, primary type
`Land`) by construction — nothing else could be missing that specifically.
That shortfall is added back as a single synthetic Plains-shaped row before
computing type counts and bucket coverage, exactly mirroring
`cedh_profiles._synthetic_average_deck`'s `_BASIC_LAND_NAME` placeholder,
now applied to a real decklist's real gap instead of a synthetic one's.
Measured shortfall: 0.7-2.3 extra basics per deck depending on class — a
small, sane correction, consistent with cEDH's real preference for
nonbasic mana bases. A small residual bias survives: a deck's rare
unresolved *nonland* card (Task A's join-failure rate, kept under 2%) would
also show up as row-count shortfall and get misattributed to Land here.
Left uncorrected — the join-failure rate is small enough that this cannot
move a class's measured mean by more than noise, and disentangling "missing
because dedup" from "missing because join failure" per deck is not worth
the complexity for a number this size.

The land-shift check (composition.py's `CEDH` comment; `type_targets.
shift_mana_sources`'s suppression) was checked **per class**, not assumed:
the fewer-lands/more-mana-sources inversion holds for all three —
turbo (land 27.7, mana_sources 39.8), midrange (27.5, 38.5), and, contrary
to the task's own stated concern that it "may not" hold, **stax too**
(28.5, 40.0). All three sit below the 35-land corpus median with a
mana_sources mean above `TUNED`'s 30-34 ceiling. `type_targets.
conditioned_template`'s blanket `is_cedh(speed)` suppression of
`shift_mana_sources` therefore needs no per-class gate — it was already
class-agnostic in exactly the way that stays correct here. No change was
made to `type_targets.py` (out of this task's ownership; see the module's
own docstring for why: it moves buckets and curve only, never type counts).

## Naming constraint (binding, discovered in Wave 1 / Task C)

`interaction.is_cedh_template` (already landed) decides whether the cEDH
board-wipe discount and asymmetry checks apply to a template by testing
`template.name.startswith("cedh")` — the pooled `CEDH` template is named
`"cedh"`, and `apply_overrides`/`apply_curve` preserve the prefix through
`"cedh+custom"`/`"cedh+curve"`. The three templates this module's
measurement feeds are therefore named `"cedh-turbo"`, `"cedh-midrange"`,
`"cedh-stax"` in `composition.py` — not `"turbo"`/`"midrange"`/`"stax"` —
so every cEDH-family template keeps satisfying that predicate. Losing this
would silently turn off the board-wipe discount for every sub-archetype
deck while looking, at a glance, like nothing had changed. `test_
cedh_archetypes.py` asserts the prefix directly against `composition.
CEDH_TURBO/MIDRANGE/STAX` and (imported only from a test, never from this
module) `interaction.is_cedh_template` itself.
"""

from __future__ import annotations

import statistics
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum

from .composition import (
    CURVE_BUCKETS,
    Bucket,
    bucket_coverage_from_cards,
    primary_type,
    type_counts_from_cards,
)
from .vocabulary import Resource, Role

# --------------------------------------------------------------------------
# E1 — features and classification
# --------------------------------------------------------------------------


class ArchetypeClass(StrEnum):
    """The three measured sub-archetypes, plus the honest miss."""

    TURBO = "turbo"
    MIDRANGE = "midrange"
    STAX = "stax"
    UNCLASSIFIED = "unclassified"


# Broader than the bare `fast_mana` resource on purpose: a turbo shell's
# "how much fast mana does this run" includes the ritual family (Dark
# Ritual, Cabal Ritual) alongside the Sol Ring/Mox/Ancient Tomb family that
# `Resource.FAST_MANA` alone covers (`vocabulary.py` — `fast_mana` is a
# *child* of `ritual_mana` precisely because a bottomless-mana-sink deck
# wants both). Counting only the narrower resource would undercount every
# ritual-heavy storm/turbo shell by its whole ritual suite.
FAST_MANA_RESOURCES: frozenset[str] = frozenset(
    {Resource.FAST_MANA.value, Resource.RITUAL_MANA.value}
)

# The two resources `interaction.py`'s `class_hate` row already keys on
# (same reasoning, reused rather than re-derived): a tax makes something
# cost more, denial stops it happening at all, and both are the "stax"
# resource-side signal — as opposed to `Role.STAX`, which also catches
# plain tax creatures with no denial/tax resource of their own and reads
# noisier as a per-deck count (see the module docstring's rejected-features
# note — this narrower resource-based count is what was actually measured
# and used, not the broader Role).
STAX_RESOURCES: frozenset[str] = frozenset(
    {Resource.TAX_EFFECT.value, Resource.RESOURCE_DENIAL.value}
)

_ROLE_VALUES: frozenset[str] = frozenset(r.value for r in Role)


@dataclass(frozen=True, slots=True)
class DeckFeatures:
    """The five measured features for one deck. `stack_interaction`,
    `stax`, `creatures` and `fast_mana` are quantity-weighted card counts
    (qty matters on a live deck the way it does not on the tournament
    corpus, where `PLAYED.qty` is always 1); `mean_mv` is the unweighted
    mean mana value of nonland cards, each already qty-1 in any legal
    singleton decklist real or corpus."""

    fast_mana: int
    stax: int
    stack_interaction: int
    creatures: int
    mean_mv: float
    nonland_count: int


def _typed_roles(role_weights: Mapping[str, float]) -> dict[str, float]:
    """Drop any role name outside the closed vocabulary.

    `interaction.py`/`diagnostics.py`/`cuts.py` each keep a private copy of
    this exact filter rather than share one (their own docstrings say why —
    avoiding a circular import across modules that already import each
    other). Same precedent, copied again here for the same reason.
    """
    return {name: weight for name, weight in role_weights.items() if name in _ROLE_VALUES}


def deck_features(
    cards: Sequence[Mapping],
    card_roles: Sequence[Mapping],
    resources_by_card: Mapping[str, Mapping[str, set[str]]],
) -> DeckFeatures | None:
    """Cards, roles and resources -> the five classifier features.

    Takes exactly the three shapes `graph.fetch_deck`, `graph.
    deck_card_roles` and `graph.deck_card_resources` already produce — the
    same trio `interaction.build_interaction_grid` takes, on purpose: a
    caller that already fetched them for the interaction grid (`diagnostics.
    build_diagnostics` does, at `is_cedh(speed)`) can classify the same deck
    for the cost of one more pure function call, no second fetch. Returns
    `None` for an empty deck — there is no feature vector to report.
    """
    if not cards:
        return None

    roles_by_id = {row["oracle_id"]: _typed_roles(row.get("roles") or {}) for row in card_roles}

    fast_mana = 0
    stax = 0
    stack_interaction = 0
    creatures = 0
    nonland_mv_total = 0.0
    nonland_count = 0

    for card in cards:
        oracle_id = card.get("oracle_id")
        qty = int(card.get("qty") or 1)
        produces = resources_by_card.get(oracle_id, {}).get("produces", set())
        roles = roles_by_id.get(oracle_id, {})
        type_line = card.get("type_line") or ""

        if produces & FAST_MANA_RESOURCES:
            fast_mana += qty
        if produces & STAX_RESOURCES:
            stax += qty
        if roles.get(Role.COUNTERSPELL.value, 0.0):
            stack_interaction += qty

        primary = primary_type(type_line)
        if primary == "Creature":
            creatures += qty
        if primary != "Land":
            nonland_mv_total += float(card.get("cmc") or 0.0) * qty
            nonland_count += qty

    mean_mv = nonland_mv_total / nonland_count if nonland_count else 0.0
    return DeckFeatures(
        fast_mana=fast_mana,
        stax=stax,
        stack_interaction=stack_interaction,
        creatures=creatures,
        mean_mv=mean_mv,
        nonland_count=nonland_count,
    )


# Measured 2026-09-01 over 14,611 usable decks (of 15,152 named-commander
# decks in the corpus — 541 more carry the literal placeholder commander
# name "Unknown Commander", excluded from classification the same way a
# null commander_name is, since neither identifies a real deck) plus the 18
# anchor commanders below. See the module docstring for the joint
# distribution and the confusion table these were chosen against.
#
# A stax deck holds up almost no stack interaction (all four anchors: 1.0,
# 3.2, 3.4, 3.4) while every other anchor except two outliers runs 8.0-13.5;
# 5.0 sits in the wide gap between the two groups, well clear of both.
STAX_STACK_MAX = 5.0

# The second, independent stax condition: without it, K'rrik (turbo, stack
# 0.2, stax-resource count 2.4) and Etali (midrange, stack 2.2, stax-
# resource count 2.7) — both low-interaction decks for reasons that have
# nothing to do with stax — would misfire as stax. All four real stax
# anchors clear 6.3; the goldfish pair sits at 2.4-2.7. 6.0 sits just under
# the weakest true positive (Magda, 6.3) and well clear of the two
# false-positive risks.
STAX_TAX_MIN = 6.0

# The non-stax split. All seven turbo anchors' stax-resource counts sit at
# 2.4-6.4; six of seven midrange anchors sit at 9.3-16.3 (Etali, again, is
# the low outlier at 2.7 and is the one anchor this rule places wrong — see
# the module docstring). The two thresholds bracket the gap rather than
# picking one point inside it: anything strictly between reads as
# `ArchetypeClass.UNCLASSIFIED`, a real "these two features do not agree"
# case rather than a coin flip forced one way.
TURBO_TAX_MAX = 6.0
MIDRANGE_TAX_MIN = 9.0


def classify(features: DeckFeatures) -> ArchetypeClass:
    """The measured rule. See the module docstring for the derivation and
    the two other features (`fast_mana`, `mean_mv`) it deliberately does
    not use — computed, checked against the anchors, and found not to
    separate the classes as the task's own hypothesis expected."""
    if features.stack_interaction <= STAX_STACK_MAX and features.stax >= STAX_TAX_MIN:
        return ArchetypeClass.STAX
    if features.stax <= TURBO_TAX_MAX:
        return ArchetypeClass.TURBO
    if features.stax >= MIDRANGE_TAX_MIN:
        return ArchetypeClass.MIDRANGE
    return ArchetypeClass.UNCLASSIFIED


# --------------------------------------------------------------------------
# Validation: publicly-known commanders, spanning all three classes
# --------------------------------------------------------------------------

# 18 commanders (>= the task's 12), the 7 named in the task file plus 11
# more, all confirmed against public cEDH community sources (EDHREC
# archetype tags, Commander's Herald, cEDH community consensus) rather than
# guessed — not this session's meta-share, but each commander's
# long-standing reputation. Kept here, not thrown away, so a future re-run
# against a bigger corpus re-derives the same confusion table rather than
# starting from nothing.
#
# Two candidates were checked and dropped rather than included on a guess:
# Inalla (low EDHREC rank, rogue-tier — no settled community consensus to
# validate against) and Dargo/Tymna (no confident public archetype call
# found). An absent anchor is better than a wrong one.
ANCHOR_COMMANDERS: dict[str, ArchetypeClass] = {
    # Turbo — task-named plus five more (Commander's Herald/EDHREC/community
    # consensus: fast, proactive combo shells that aim to win before the
    # table stabilises).
    "K'rrik, Son of Yawgmoth": ArchetypeClass.TURBO,
    "Vivi Ornitier": ArchetypeClass.TURBO,
    "Kinnan, Bonder Prodigy": ArchetypeClass.TURBO,
    "Arcum Dagsson": ArchetypeClass.TURBO,
    "Rograkh, Son of Rohgahh / Thrasios, Triton Hero": ArchetypeClass.TURBO,
    "Rograkh, Son of Rohgahh / Silas Renn, Seeker Adept": ArchetypeClass.TURBO,
    "Ral, Monsoon Mage // Ral, Leyline Prodigy": ArchetypeClass.TURBO,
    # Midrange/control — task-named plus four more ("good stuff" grind
    # shells with real card advantage and interaction that combo off later).
    "Sisay, Weatherlight Captain": ArchetypeClass.MIDRANGE,
    "Tivit, Seller of Secrets": ArchetypeClass.MIDRANGE,
    "Najeela, the Blade-Blossom": ArchetypeClass.MIDRANGE,
    "Kraum, Ludevic's Opus / Tymna the Weaver": ArchetypeClass.MIDRANGE,
    "Thrasios, Triton Hero / Tymna the Weaver": ArchetypeClass.MIDRANGE,
    "Etali, Primal Conqueror // Etali, Primal Sickness": ArchetypeClass.MIDRANGE,
    "Kenrith, the Returned King": ArchetypeClass.MIDRANGE,
    # Stax-adjacent — task-named plus two more (taxing/denial effects and
    # hatebears ahead of the kill).
    "Magda, Brazen Outlaw": ArchetypeClass.STAX,
    "Winota, Joiner of Forces": ArchetypeClass.STAX,
    "Zirda, the Dawnwaker": ArchetypeClass.STAX,
    "Tayam, Luminous Enigma": ArchetypeClass.STAX,
}


@dataclass(frozen=True, slots=True)
class ConfusionRow:
    """One true-class row of the confusion table: how many anchor decks of
    this declared class landed in each predicted bucket."""

    true_class: ArchetypeClass
    predicted: dict[ArchetypeClass, int]

    @property
    def total(self) -> int:
        return sum(self.predicted.values())

    @property
    def accuracy(self) -> float:
        total = self.total
        return self.predicted.get(self.true_class, 0) / total if total else 0.0


def confusion_table(
    predictions_by_commander: Mapping[str, Sequence[ArchetypeClass]],
    anchors: Mapping[str, ArchetypeClass] = ANCHOR_COMMANDERS,
) -> list[ConfusionRow]:
    """The anchor confusion table, at the per-deck grain.

    `predictions_by_commander` is every classified deck's predicted class,
    grouped by `commander_name` — the caller already has this from
    `measure_cedh_classes`'s per-deck pass. Pure: no graph access, so this
    is fully unit-testable against a fabricated prediction map.
    """
    by_true: dict[ArchetypeClass, dict[ArchetypeClass, int]] = {
        cls: dict.fromkeys(ArchetypeClass, 0)
        for cls in (ArchetypeClass.TURBO, ArchetypeClass.MIDRANGE, ArchetypeClass.STAX)
    }
    for commander, true_class in anchors.items():
        for predicted in predictions_by_commander.get(commander, ()):
            by_true[true_class][predicted] += 1

    return [
        ConfusionRow(true_class=cls, predicted=by_true[cls])
        for cls in (ArchetypeClass.TURBO, ArchetypeClass.MIDRANGE, ArchetypeClass.STAX)
    ]


# --------------------------------------------------------------------------
# E2 — per-class corridor measurement
# --------------------------------------------------------------------------

# cEDH is a fixed 99-card singleton format (the commander sits outside the
# count, as everywhere else in this codebase) — the anchor the basic-land
# correction reads off. See the module docstring's "PLAYED.qty" section.
DECK_SIZE = 99

# Mirrors `cedh_profiles.MIN_COMMANDERS`/`MIN_DECKS` exactly — a class pool
# below this is one or two commanders' flavour, not a format's, and gets no
# template of its own (the caller falls back to the pooled `CEDH`). Restated
# here rather than imported for the same reason `cedh_profiles.py` restates
# it from `archetype_profiles.py`: the two floors are about different
# corpora, not the same number reused.
MIN_COMMANDERS = 3
MIN_DECKS = 1000

# The placeholder that fills a deck's basic-land shortfall — `cedh_profiles.
# _BASIC_LAND_NAME`'s twin, restated rather than imported (same module
# boundary reasoning as everywhere else in this file).
_BASIC_LAND_PLACEHOLDER = "Plains"

# `cedh_profiles.MIN_RESOLVED_FRACTION`'s twin: a deck resolving fewer than
# half its true 99 cards (Task A's join-failure rate, or edhtop16's own
# empty "Unknown Commander" stubs — see `_DECK_COUNTS_QUERY`'s comment) is
# not a decklist worth classifying or pooling — its raw feature counts
# would read as near-zero across the board for having little data behind
# them, not because the deck actually plays that way. Guards both E1
# (`build_deck_sample` returns `None`, so the deck never enters the
# classifier's joint distribution or confusion table) and E2 (never enters
# a class's pool either) with the one check, since a deck too thin to trust
# for one is too thin to trust for the other.
MIN_RESOLVED_FRACTION = 0.5


def _basic_land_shortfall(known_count: int, *, deck_size: int = DECK_SIZE) -> int:
    """How many basic-land copies a deck's own row count is silently
    missing. See the module docstring — never negative."""
    return max(0, deck_size - known_count)


@dataclass(frozen=True, slots=True)
class DeckSample:
    """One tournament deck, resolved down to what the corridor measurement
    and the classifier both need. `build_deck_sample` returns `None`
    instead of one of these when the deck has too few resolved cards to
    trust (`MIN_RESOLVED_FRACTION` — mirrors `cedh_profiles`'s resolution
    floor, applied per-deck here since every observation already is a real
    deck rather than one synthetic average per commander)."""

    deck_id: str
    commander_name: str
    features: DeckFeatures
    archetype: ArchetypeClass
    type_counts: dict[str, float]
    bucket_coverage: dict[Bucket, float]
    curve_counts: dict[int, int]
    nonland_count: int


def build_deck_sample(
    deck_id: str,
    commander_name: str,
    oracle_ids: Sequence[str],
    card_meta: Mapping[str, Mapping],
) -> DeckSample | None:
    """One deck's raw `(deck_id, commander_name, oracle_ids)` row plus the
    corpus-wide card metadata table -> a fully-classified, corridor-ready
    sample. `None` when none of the deck's cards resolved against
    `card_meta` — an empty deck has nothing to classify or pool.

    Pure given `card_meta` (oracle_id -> {cmc, type_line, layout, roles,
    produces}) — the one thing `_fetch_card_metadata` fetches, once, for
    every card the whole corpus plays, so this runs per deck with no
    further graph access.
    """
    resolved = [oid for oid in oracle_ids if oid in card_meta]
    if len(resolved) < MIN_RESOLVED_FRACTION * DECK_SIZE:
        return None

    cards = [card_meta[oid] for oid in resolved]
    shortfall = _basic_land_shortfall(len(resolved))

    # The three shapes `deck_features` wants, built from the flat metadata
    # table — `qty` is always 1 here (the tournament corpus's own limit;
    # see the module docstring), the shortfall is not folded into the
    # classifier features because none of the five reads land count.
    paired = list(zip(resolved, cards, strict=True))
    feature_cards = [
        {"oracle_id": oid, "qty": 1, "type_line": c["type_line"], "cmc": c["cmc"]}
        for oid, c in paired
    ]
    feature_roles = [{"oracle_id": oid, "roles": c["roles"]} for oid, c in paired]
    feature_resources = {oid: {"produces": c["produces"]} for oid, c in paired}

    features = deck_features(feature_cards, feature_roles, feature_resources)
    if features is None:  # pragma: no cover - resolved is non-empty above
        return None
    archetype = classify(features)

    type_rows: list[dict] = [
        {"type_line": c["type_line"], "layout": c["layout"], "qty": 1} for c in cards
    ]
    role_rows: list[tuple[Mapping[str, float], int]] = [(c["roles"], 1) for c in cards]
    if shortfall:
        basic_type_line = f"Basic Land — {_BASIC_LAND_PLACEHOLDER}"
        type_rows.append({"type_line": basic_type_line, "layout": None, "qty": shortfall})
        role_rows.append(({Role.LAND.value: 1.0}, shortfall))

    type_counts = type_counts_from_cards(type_rows)
    bucket_coverage = bucket_coverage_from_cards(role_rows)

    curve_counts = dict.fromkeys(CURVE_BUCKETS, 0)
    for _oid, c in paired:
        if primary_type(c["type_line"]) == "Land":
            continue
        curve_counts[min(6, int(c["cmc"]))] += 1

    return DeckSample(
        deck_id=deck_id,
        commander_name=commander_name,
        features=features,
        archetype=archetype,
        type_counts=type_counts,
        bucket_coverage=bucket_coverage,
        curve_counts=curve_counts,
        nonland_count=features.nonland_count,
    )


@dataclass(frozen=True, slots=True)
class ClassMeasurement:
    """One class's pooled corridor measurement. `None` fields mean the
    class did not clear `MIN_COMMANDERS`/`MIN_DECKS` — a caller should keep
    the pooled `CEDH` template for that class rather than trust a thin one."""

    archetype: ArchetypeClass
    decks: int
    commanders: int
    type_counts: dict[str, float] | None
    bucket_mean: dict[Bucket, float] | None
    bucket_sd: dict[Bucket, float] | None
    curve: dict[int, float] | None
    land_mean: float | None
    mana_sources_mean: float | None


def _pool_class(archetype: ArchetypeClass, samples: Sequence[DeckSample]) -> ClassMeasurement:
    decks = len(samples)
    commanders = len({s.commander_name for s in samples})

    if decks < MIN_DECKS or commanders < MIN_COMMANDERS:
        return ClassMeasurement(
            archetype=archetype,
            decks=decks,
            commanders=commanders,
            type_counts=None,
            bucket_mean=None,
            bucket_sd=None,
            curve=None,
            land_mean=None,
            mana_sources_mean=None,
        )

    type_counts = {
        name: statistics.fmean(s.type_counts.get(name, 0.0) for s in samples)
        for name in {name for s in samples for name in s.type_counts}
    }
    bucket_mean = {
        bucket: statistics.fmean(s.bucket_coverage.get(bucket, 0.0) for s in samples)
        for bucket in Bucket
    }
    bucket_sd = {
        bucket: (
            statistics.pstdev(s.bucket_coverage.get(bucket, 0.0) for s in samples)
            if decks > 1
            else 0.0
        )
        for bucket in Bucket
    }

    total_nonland = sum(s.nonland_count for s in samples) or 1
    curve = {
        mv: sum(s.curve_counts.get(mv, 0) for s in samples) / total_nonland for mv in CURVE_BUCKETS
    }

    return ClassMeasurement(
        archetype=archetype,
        decks=decks,
        commanders=commanders,
        type_counts=type_counts,
        bucket_mean=bucket_mean,
        bucket_sd=bucket_sd,
        curve=curve,
        land_mean=type_counts.get("Land"),
        mana_sources_mean=bucket_mean.get(Bucket.MANA_SOURCES),
    )


@dataclass(frozen=True, slots=True)
class ClassifierRun:
    """One full `measure_cedh_classes` run: every usable deck's sample plus
    the three per-class corridor measurements. `samples` is kept (not just
    the pooled numbers) so `render_classifier_report` can print the joint
    distribution and the anchor confusion table from the same run."""

    samples: list[DeckSample]
    measurements: dict[ArchetypeClass, ClassMeasurement]
    total_decks: int
    excluded_no_commander: int
    excluded_unresolved: int


_DECK_ROWS_QUERY = """
MATCH (d:TournamentDeck {scene: $scene})
WHERE d.commander_name IS NOT NULL
OPTIONAL MATCH (d)-[:PLAYED]->(c:Card)
RETURN d.id AS deck_id, d.commander_name AS commander_name, collect(c.oracle_id) AS oracle_ids
"""

# The binding count from Task A's review: decks with no `commander_name` at
# all cannot be grouped by commander for anything, classifier included, and
# must be counted once rather than silently dropped. A second, distinct
# data-quality wrinkle lives beside it: edhtop16 occasionally returns the
# literal string `"Unknown Commander"` (not null) for a handful of entries —
# those decks DO pass `_DECK_ROWS_QUERY`'s `IS NOT NULL` filter and get
# classified individually (their cards are real), but they share one
# meaningless commander identity, which very slightly inflates the
# distinct-commander count `_pool_class`'s floor reads. Immaterial here —
# every class clears `MIN_COMMANDERS` by more than an order of magnitude —
# so this is reported rather than filtered.
_DECK_COUNTS_QUERY = """
MATCH (d:TournamentDeck {scene: $scene})
RETURN count(d) AS total, count(CASE WHEN d.commander_name IS NULL THEN 1 END) AS no_commander
"""

_CARD_METADATA_QUERY = """
UNWIND $oracle_ids AS oid
MATCH (c:Card {oracle_id: oid})
OPTIONAL MATCH (c)-[f:FILLS_ROLE]->(role:Role)
WITH c, collect([role.name, f.weight]) AS role_rows
OPTIONAL MATCH (c)-[:PRODUCES]->(res:Resource)
RETURN c.oracle_id AS oracle_id, c.cmc AS cmc, c.type_line AS type_line, c.layout AS layout,
       role_rows, collect(DISTINCT res.name) AS produces
"""

# Batched: a single `UNWIND` over every distinct card the corpus plays
# (order 10^4, measured 9,399 on the dev corpus) is well within one query,
# but batching keeps this from ever depending on how large that number
# grows on a bigger corpus.
_CARD_METADATA_BATCH = 5_000


def _fetch_deck_rows(scene: str = "cedh") -> list[dict]:
    """Every named-commander `:TournamentDeck`'s id, commander string and
    played oracle_ids, one row per deck. `graph.py` has no existing helper
    shaped for this (per-deck oracle_id lists grouped for bulk classification,
    not one deck's cards for a single request) — written here directly via
    the `driver()` pattern per this task's ownership note."""
    from .config import settings
    from .graph import driver

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [dict(r) for r in session.run(_DECK_ROWS_QUERY, scene=scene)]


def _fetch_deck_counts(scene: str = "cedh") -> tuple[int, int]:
    """`(total decks, decks with no commander_name)` for `scene` — the
    binding count from Task A's review, read fresh each run rather than
    hardcoded so a corpus re-ingest keeps this report honest."""
    from .config import settings
    from .graph import driver

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        record = session.run(_DECK_COUNTS_QUERY, scene=scene).single()
        return (record["total"], record["no_commander"]) if record else (0, 0)


def _fetch_card_metadata(oracle_ids: Sequence[str]) -> dict[str, dict]:
    """Role weights, produced resources, cmc and type line for every id in
    `oracle_ids` — fetched once for the whole corpus (a few thousand
    distinct cards) rather than once per deck (tens of thousands of
    repeats), the same "fetch the small side once" shape `cedh_profiles.py`
    and `archetype_profiles.py` both use for their own corpora."""
    from .config import settings
    from .graph import driver

    ids = list(dict.fromkeys(oid for oid in oracle_ids if oid))
    if not ids:
        return {}

    out: dict[str, dict] = {}
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for start in range(0, len(ids), _CARD_METADATA_BATCH):
            chunk = ids[start : start + _CARD_METADATA_BATCH]
            for record in session.run(_CARD_METADATA_QUERY, oracle_ids=chunk):
                roles = {name: weight for name, weight in record["role_rows"] if name}
                out[record["oracle_id"]] = {
                    "cmc": record["cmc"] or 0.0,
                    "type_line": record["type_line"] or "",
                    "layout": record["layout"],
                    "roles": _typed_roles(roles),
                    "produces": {p for p in (record["produces"] or []) if p},
                }
    return out


def measure_cedh_classes(*, scene: str = "cedh") -> ClassifierRun:
    """Fetch the tournament corpus, classify every usable deck, and pool
    per-class corridors. The one entry point `deck-lab measure-cedh
    --classes` calls; everything else in this module is pure and unit-
    tested directly against fabricated rows."""
    deck_rows = _fetch_deck_rows(scene)
    total_decks, excluded_no_commander = _fetch_deck_counts(scene)

    all_ids: set[str] = set()
    for row in deck_rows:
        all_ids.update(oid for oid in row["oracle_ids"] if oid)
    card_meta = _fetch_card_metadata(list(all_ids))

    samples: list[DeckSample] = []
    excluded_unresolved = 0
    for row in deck_rows:
        sample = build_deck_sample(
            row["deck_id"], row["commander_name"], row["oracle_ids"], card_meta
        )
        if sample is None:
            excluded_unresolved += 1
            continue
        samples.append(sample)

    by_class: dict[ArchetypeClass, list[DeckSample]] = {cls: [] for cls in ArchetypeClass}
    for sample in samples:
        by_class[sample.archetype].append(sample)

    measurements = {
        cls: _pool_class(cls, by_class[cls])
        for cls in (ArchetypeClass.TURBO, ArchetypeClass.MIDRANGE, ArchetypeClass.STAX)
    }

    return ClassifierRun(
        samples=samples,
        measurements=measurements,
        total_decks=total_decks,
        excluded_no_commander=excluded_no_commander,
        excluded_unresolved=excluded_unresolved,
    )


def render_classifier_report(run: ClassifierRun) -> str:
    """Paste-ready summary: overall predicted-class shares, the anchor
    confusion table, and the per-class corridor/curve/land-shift numbers —
    `cedh_profiles.render_constants`'s discipline, applied to this
    module's own measurement. Prints only; landing a `DeckTemplate` in
    `composition.py` from this output is a reviewed diff like every other
    measured constant in this codebase."""
    lines: list[str] = []

    total = len(run.samples)
    counts: dict[ArchetypeClass, int] = {}
    for sample in run.samples:
        counts[sample.archetype] = counts.get(sample.archetype, 0) + 1

    lines.append(
        f"# {run.total_decks} total decks, {run.excluded_no_commander} with no commander_name "
        f"(excluded), {run.excluded_unresolved} with no resolvable cards (excluded), "
        f"{total} classified"
    )
    for cls in (
        ArchetypeClass.TURBO,
        ArchetypeClass.MIDRANGE,
        ArchetypeClass.STAX,
        ArchetypeClass.UNCLASSIFIED,
    ):
        n = counts.get(cls, 0)
        share = 100 * n / total if total else 0.0
        lines.append(f"#   {cls.value:<14} {n:>6}  ({share:.1f}%)")
    lines.append("")

    predictions_by_commander: dict[str, list[ArchetypeClass]] = {}
    for sample in run.samples:
        predictions_by_commander.setdefault(sample.commander_name, []).append(sample.archetype)
    lines.append("# anchor confusion table (true anchor label x predicted), deck counts:")
    for row in confusion_table(predictions_by_commander):
        cells = " ".join(f"{cls.value}={row.predicted.get(cls, 0)}" for cls in ArchetypeClass)
        acc = 100 * row.accuracy
        lines.append(f"#   {row.true_class.value:<10} n={row.total:<6} acc={acc:.1f}%  {cells}")
    lines.append("")

    for cls in (ArchetypeClass.TURBO, ArchetypeClass.MIDRANGE, ArchetypeClass.STAX):
        measurement = run.measurements[cls]
        lines.append(
            f"# {cls.value}: decks={measurement.decks} commanders={measurement.commanders}"
            + ("" if measurement.type_counts is not None else "  BELOW FLOOR — keep pooled CEDH")
        )
        if measurement.bucket_mean is None:
            lines.append("")
            continue
        for bucket in Bucket:
            mean = measurement.bucket_mean[bucket]
            sd = measurement.bucket_sd[bucket]
            corridor = f"{mean - sd:.1f}-{mean + sd:.1f}"
            row = f"#   {bucket.value:<16} mean={mean:>6.2f} sd={sd:>5.2f} corridor={corridor}"
            lines.append(row)
        curve = ", ".join(f"{mv}: {share:.3f}" for mv, share in sorted(measurement.curve.items()))
        lines.append(f"#   curve: {{{curve}}}")
        lines.append(
            f"#   land_mean={measurement.land_mean:.1f} "
            f"mana_sources_mean={measurement.mana_sources_mean:.1f}"
        )
        lines.append("")

    return "\n".join(lines)
