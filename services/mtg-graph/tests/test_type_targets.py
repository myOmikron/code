"""Type-target resolution. Pure — EDHREC access is monkeypatched."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

import deck_lab.edhrec as edhrec
from deck_lab.composition import TargetOverride, template_for
from deck_lab.edhrec import TagLink, TypeCounts
from deck_lab.type_targets import (
    DEFAULT_TYPE_COUNTS,
    LAND_HALF_WIDTH,
    MANA_SOURCES_DELTA_CAP,
    MIN_HALF_WIDTH,
    PRIMARY_TYPES,
    RANGE_FRACTION,
    TAG_MIN_DECKS,
    TYPE_THEME_SHARE_FLOOR,
    TYPES_WEIGHT_FAST,
    TYPES_WEIGHT_SLOW,
    conditioned_template,
    resolve_type_targets,
    targets_from_counts,
    targets_from_report,
    type_weight,
)
from deck_lab.vocabulary import Bucket

MULDROTHA = TypeCounts(
    counts={
        "Creature": 30.0,
        "Instant": 6.0,
        "Sorcery": 8.0,
        "Artifact": 6.0,
        "Enchantment": 8.0,
        "Planeswalker": 1.0,
        "Battle": 0.0,
        "Land": 40.0,
    },
    total=99,
)

SPELLSLINGER = TypeCounts(
    counts={
        "Creature": 21.0,
        "Instant": 10.0,
        "Sorcery": 16.0,
        "Artifact": 10.0,
        "Enchantment": 6.0,
        "Planeswalker": 1.0,
        "Battle": 0.0,
        "Land": 35.0,
    },
    total=99,
)

TAGLINKS = [TagLink(slug="spellslinger", label="Spellslinger", count=2548)]


def _fake_pages(monkeypatch, *, commander=MULDROTHA, taglinks=TAGLINKS, theme=SPELLSLINGER):
    """Route `load_type_counts` at fakes. The commander page never fetches;
    the subpage returns `theme` (None models an unreachable page)."""

    def load(name, *, theme_slug=None, allow_fetch=False):
        if theme_slug is None:
            return commander, taglinks
        return theme, taglinks

    monkeypatch.setattr(edhrec, "load_type_counts", load)


# --- ranges from point estimates ------------------------------------------


def test_range_is_a_fraction_of_the_mean():
    targets = targets_from_counts({"Creature": 29.0}, speed=0.5)

    half = RANGE_FRACTION * 29.0
    assert targets["Creature"].low == 29.0 - half
    assert targets["Creature"].high == 29.0 + half


def test_small_means_get_the_minimum_half_width():
    """A mean of 1 planeswalker must not pin the range to [1, 1]."""
    targets = targets_from_counts({"Planeswalker": 1.0}, speed=0.5)

    assert targets["Planeswalker"].low == 0.0
    assert targets["Planeswalker"].high == 1.0 + MIN_HALF_WIDTH


def test_a_zero_mean_still_makes_a_real_target():
    """Battle stays a target: three battles in a deck should flag."""
    targets = targets_from_counts({}, speed=0.5)

    assert targets["Battle"].low == 0.0
    assert targets["Battle"].high == MIN_HALF_WIDTH
    assert targets["Battle"].deviation(3.0) == 3.0 - MIN_HALF_WIDTH


def test_every_primary_type_gets_a_target():
    assert set(targets_from_counts({}, speed=0.5)) == set(PRIMARY_TYPES)


def test_land_gets_a_flat_half_width():
    """±20% of the mean handed Land the widest band of the axis (39 ± 7.8)
    when land count is the tightest-distributed stat in the format — a
    25-land landfall deck read as barely short."""
    targets = targets_from_counts({"Land": 39.0}, speed=0.5)

    assert targets["Land"].low == 39.0 - LAND_HALF_WIDTH
    assert targets["Land"].high == 39.0 + LAND_HALF_WIDTH
    assert LAND_HALF_WIDTH < RANGE_FRACTION * 39.0


def test_land_informs_but_never_fines():
    """The mana_sources bucket owns land count; a second penalty on the same
    measure would count one signal twice."""
    targets = targets_from_counts({"Land": 35.0}, speed=1.0)

    assert targets["Land"].weight == 0.0
    assert targets["Land"].penalty(45.0) == 0.0
    assert targets["Creature"].weight > 0.0


def test_weight_lerps_with_speed_and_targets_do_not():
    """EDHREC aggregates carry no bracket conditioning — only how hard the
    range binds moves with the slider, never where it sits."""
    slow = targets_from_counts({"Creature": 29.0}, speed=0.0)
    fast = targets_from_counts({"Creature": 29.0}, speed=1.0)

    assert type_weight(0.0) == TYPES_WEIGHT_SLOW
    assert type_weight(1.0) == TYPES_WEIGHT_FAST
    assert slow["Creature"].weight == TYPES_WEIGHT_SLOW
    assert fast["Creature"].weight == TYPES_WEIGHT_FAST
    assert (slow["Creature"].low, slow["Creature"].high) == (
        fast["Creature"].low,
        fast["Creature"].high,
    )


# --- tier precedence ------------------------------------------------------

DECISIVE = {"spellslinger": 0.5, "reanimator": 0.2}


def test_decisive_theme_reaches_the_subpage_tier(monkeypatch):
    _fake_pages(monkeypatch)
    targets, source = resolve_type_targets("Muldrotha, the Gravetide", DECISIVE, speed=0.5)

    assert source == "edhrec:muldrotha-the-gravetide/spellslinger (2,548 decks)"
    assert targets["Creature"].high == 21.0 + RANGE_FRACTION * 21.0


def test_a_whisper_theme_stays_on_the_commander_page(monkeypatch):
    _fake_pages(monkeypatch)
    quiet = {"spellslinger": TYPE_THEME_SHARE_FLOOR - 0.01}
    targets, source = resolve_type_targets("Muldrotha, the Gravetide", quiet, speed=0.5)

    assert source == "edhrec:muldrotha-the-gravetide"
    assert targets["Creature"].high == 30.0 + RANGE_FRACTION * 30.0


def test_a_theme_with_no_verified_slug_falls_through(monkeypatch):
    _fake_pages(monkeypatch)
    _, source = resolve_type_targets("Muldrotha, the Gravetide", {"untap_combo": 0.9}, speed=0.5)

    assert source == "edhrec:muldrotha-the-gravetide"


def test_a_tag_this_commander_never_carries_falls_through(monkeypatch):
    _fake_pages(monkeypatch, taglinks=[TagLink("aristocrats", "Aristocrats", 900)])
    _, source = resolve_type_targets("Muldrotha, the Gravetide", DECISIVE, speed=0.5)

    assert source == "edhrec:muldrotha-the-gravetide"


def test_a_thin_sample_falls_through(monkeypatch):
    _fake_pages(
        monkeypatch,
        taglinks=[TagLink("spellslinger", "Spellslinger", TAG_MIN_DECKS - 1)],
    )
    _, source = resolve_type_targets("Muldrotha, the Gravetide", DECISIVE, speed=0.5)

    assert source == "edhrec:muldrotha-the-gravetide"


def test_an_unreachable_subpage_falls_through(monkeypatch):
    _fake_pages(monkeypatch, theme=None)
    _, source = resolve_type_targets("Muldrotha, the Gravetide", DECISIVE, speed=0.5)

    assert source == "edhrec:muldrotha-the-gravetide"


def test_an_uncached_commander_reads_the_default(monkeypatch):
    _fake_pages(monkeypatch, commander=None, taglinks=[])
    targets, source = resolve_type_targets("Nobody, the Unknown", DECISIVE, speed=0.5)

    assert source == "default"
    assert targets["Creature"].high == (
        DEFAULT_TYPE_COUNTS["Creature"] + RANGE_FRACTION * DEFAULT_TYPE_COUNTS["Creature"]
    )


def test_no_commander_reads_the_default():
    targets, source = resolve_type_targets(None, DECISIVE, speed=0.5)

    assert source == "default"
    assert set(targets) == set(PRIMARY_TYPES)


# --- the mana quota follows the archetype ---------------------------------


def test_the_land_mean_shifts_the_mana_quota():
    """The observed failure: a Necrobloom deck at 25 lands + 8 rocks sat
    *inside* the tuned 30–34 sources range while the empirical land mean
    said 39. The quota moves by the mean's deviation from the corpus
    median; how hard it binds stays with speed."""
    types = targets_from_counts({"Land": 39.0}, speed=0.5)
    base = template_for(0.5).buckets[Bucket.MANA_SOURCES]
    shifted = conditioned_template(0.5, None, types).buckets[Bucket.MANA_SOURCES]

    delta = 39.0 - DEFAULT_TYPE_COUNTS["Land"]
    assert shifted.low == pytest.approx(base.low + delta)
    assert shifted.high == pytest.approx(base.high + delta)
    assert shifted.weight == base.weight


def test_a_below_median_archetype_shifts_the_quota_down():
    """A spellslinger deck genuinely runs fewer lands — the shift is a
    reconciliation, not a floor, and it moves both ways."""
    types = targets_from_counts({"Land": 33.0}, speed=0.5)
    base = template_for(0.5).buckets[Bucket.MANA_SOURCES]
    shifted = conditioned_template(0.5, None, types).buckets[Bucket.MANA_SOURCES]

    assert shifted.low == pytest.approx(base.low - 2.0)


def test_the_default_tier_shifts_nothing():
    """The corpus median deviates from itself by zero, by construction."""
    types = targets_from_counts(DEFAULT_TYPE_COUNTS, speed=0.5)

    assert conditioned_template(0.5, None, types).buckets == template_for(0.5).buckets


def test_the_shift_is_capped_against_a_parse_gone_wrong():
    """Cached land means run 33–40; a delta past ±6 is bad data, not an
    archetype."""
    types = targets_from_counts({"Land": 60.0}, speed=0.5)
    base = template_for(0.5).buckets[Bucket.MANA_SOURCES]
    shifted = conditioned_template(0.5, None, types).buckets[Bucket.MANA_SOURCES]

    assert shifted.low == pytest.approx(base.low + MANA_SOURCES_DELTA_CAP)


def test_a_user_override_beats_the_archetype_shift():
    """The user dragged against the shifted range the report showed them;
    shifting their value again would move it behind their back."""
    types = targets_from_counts({"Land": 39.0}, speed=0.5)
    template = conditioned_template(
        0.5, {Bucket.MANA_SOURCES: TargetOverride(low=30, high=33)}, types
    )

    assert template.buckets[Bucket.MANA_SOURCES].low == 30
    assert template.buckets[Bucket.MANA_SOURCES].high == 33


# --- report round-trip ----------------------------------------------------


def test_report_rows_rebuild_the_targets(monkeypatch):
    """Cut scoring and the fill solver must score against the *reported*
    targets — a re-resolution could flip the tier between report and score."""
    _fake_pages(monkeypatch)
    targets, _ = resolve_type_targets("Muldrotha, the Gravetide", DECISIVE, speed=0.5)

    rows = [SimpleNamespace(type=name, low=t.low, high=t.high) for name, t in targets.items()]
    rebuilt = targets_from_report(rows, speed=0.5)

    assert rebuilt == targets
