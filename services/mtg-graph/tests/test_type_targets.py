"""Type-target resolution. Pure — EDHREC access is monkeypatched."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

import deck_lab.edhrec as edhrec
import deck_lab.type_targets as type_targets
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
    TYPE_TYPAL_SHARE_FLOOR,
    TYPES_WEIGHT_FAST,
    TYPES_WEIGHT_SLOW,
    ArchetypeProfile,
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


# --- the typal branch of tier 1 --------------------------------------------
# A tribe reaches the same subpage tier as a theme, through `typal_profile`
# instead of `theme_profile` — the fallthrough shape mirrors the suite above.

GOBLINS = [TagLink(slug="goblins", label="Goblins", count=5831)]


def test_a_decisive_tribe_reaches_the_subpage_tier(monkeypatch):
    _fake_pages(monkeypatch, taglinks=GOBLINS)
    targets, source = resolve_type_targets(
        "Muldrotha, the Gravetide", {}, speed=0.5, typal_profile={"Goblin": 0.7}
    )

    assert source == "edhrec:muldrotha-the-gravetide/goblins (5,831 decks)"
    assert targets["Creature"].high == 21.0 + RANGE_FRACTION * 21.0


def test_a_quiet_tribe_stays_on_the_commander_page(monkeypatch):
    _fake_pages(monkeypatch, taglinks=GOBLINS)
    quiet = {"Goblin": TYPE_TYPAL_SHARE_FLOOR - 0.01}
    _, source = resolve_type_targets("Muldrotha, the Gravetide", {}, speed=0.5, typal_profile=quiet)

    assert source == "edhrec:muldrotha-the-gravetide"


def test_a_tribe_this_commander_never_carries_falls_through(monkeypatch):
    _fake_pages(monkeypatch, taglinks=TAGLINKS)  # spellslinger only, no goblins link
    _, source = resolve_type_targets(
        "Muldrotha, the Gravetide", {}, speed=0.5, typal_profile={"Goblin": 0.9}
    )

    assert source == "edhrec:muldrotha-the-gravetide"


def test_a_thin_tribe_sample_falls_through(monkeypatch):
    _fake_pages(
        monkeypatch, taglinks=[TagLink(slug="goblins", label="Goblins", count=TAG_MIN_DECKS - 1)]
    )
    _, source = resolve_type_targets(
        "Muldrotha, the Gravetide", {}, speed=0.5, typal_profile={"Goblin": 0.9}
    )

    assert source == "edhrec:muldrotha-the-gravetide"


def test_an_unreachable_tribe_subpage_falls_through(monkeypatch):
    _fake_pages(monkeypatch, taglinks=GOBLINS, theme=None)
    _, source = resolve_type_targets(
        "Muldrotha, the Gravetide", {}, speed=0.5, typal_profile={"Goblin": 0.9}
    )

    assert source == "edhrec:muldrotha-the-gravetide"


def test_irregular_plurals_are_generated_not_guessed(monkeypatch):
    """Elf -> Elves, Fungus -> Fungi. `plural_forms` covers Magic's
    irregulars; a naive `+ "s"` would miss both tags and fall through."""
    _fake_pages(monkeypatch, taglinks=[TagLink(slug="elves", label="Elves", count=4955)])
    _, elf_source = resolve_type_targets(
        "Muldrotha, the Gravetide", {}, speed=0.5, typal_profile={"Elf": 0.7}
    )
    assert elf_source == "edhrec:muldrotha-the-gravetide/elves (4,955 decks)"

    _fake_pages(monkeypatch, taglinks=[TagLink(slug="fungi", label="Fungi", count=500)])
    _, fungus_source = resolve_type_targets(
        "Muldrotha, the Gravetide", {}, speed=0.5, typal_profile={"Fungus": 0.7}
    )
    assert fungus_source == "edhrec:muldrotha-the-gravetide/fungi (500 decks)"


def test_precedence_the_bigger_sample_wins_tribe_over_theme(monkeypatch):
    _fake_pages(
        monkeypatch,
        taglinks=[
            TagLink(slug="spellslinger", label="Spellslinger", count=2548),
            TagLink(slug="goblins", label="Goblins", count=5831),
        ],
    )
    _, source = resolve_type_targets(
        "Muldrotha, the Gravetide", DECISIVE, speed=0.5, typal_profile={"Goblin": 0.7}
    )

    assert source == "edhrec:muldrotha-the-gravetide/goblins (5,831 decks)"


def test_precedence_the_bigger_sample_wins_theme_over_tribe(monkeypatch):
    _fake_pages(
        monkeypatch,
        taglinks=[
            TagLink(slug="spellslinger", label="Spellslinger", count=5831),
            TagLink(slug="goblins", label="Goblins", count=2548),
        ],
    )
    _, source = resolve_type_targets(
        "Muldrotha, the Gravetide", DECISIVE, speed=0.5, typal_profile={"Goblin": 0.7}
    )

    assert source == "edhrec:muldrotha-the-gravetide/spellslinger (5,831 decks)"


def test_a_tie_goes_to_the_theme(monkeypatch):
    """Shares are cross-profile incomparable; counts are the same unit off
    the same panel — but a genuine tie still has to land somewhere, and
    the theme is the more conservative of the two candidates."""
    _fake_pages(
        monkeypatch,
        taglinks=[
            TagLink(slug="spellslinger", label="Spellslinger", count=2548),
            TagLink(slug="goblins", label="Goblins", count=2548),
        ],
    )
    _, source = resolve_type_targets(
        "Muldrotha, the Gravetide", DECISIVE, speed=0.5, typal_profile={"Goblin": 0.7}
    )

    assert source == "edhrec:muldrotha-the-gravetide/spellslinger (2,548 decks)"


def test_typal_profile_is_optional(monkeypatch):
    """Omitted `typal_profile` is exactly today's ladder — the shape
    `/replace` relies on, since it never computes a typal profile."""
    _fake_pages(monkeypatch)
    targets, source = resolve_type_targets("Muldrotha, the Gravetide", DECISIVE, speed=0.5)

    assert source == "edhrec:muldrotha-the-gravetide/spellslinger (2,548 decks)"
    assert targets["Creature"].high == 21.0 + RANGE_FRACTION * 21.0


# --- tier 2.5: the measured archetype tier ---------------------------------
# Fires only when no commander page exists at all — the commander tiers
# above have nothing to condition on — and the deck's theme is still
# decisive. `ARCHETYPE_TYPE_COUNTS` is monkeypatched per test; the committed
# table starts empty (Commit B1), so nothing here depends on real numbers.

SPELLSLINGER_ARCHETYPE = ArchetypeProfile(
    counts={"Creature": 20.0, "Instant": 14.0, "Sorcery": 12.0, "Land": 34.0},
    tag="spellslinger",
    commanders=5,
    decks=8342,
    measured="2026-08-30",
)


def test_a_cold_commander_reads_the_archetype_tier(monkeypatch):
    """A commander EDHREC has not cached yet has no page for tiers 1 or 2 to
    condition on — a decisive theme still has a pooled measurement."""
    _fake_pages(monkeypatch, commander=None, taglinks=[])
    monkeypatch.setattr(
        type_targets, "ARCHETYPE_TYPE_COUNTS", {"spellslinger": SPELLSLINGER_ARCHETYPE}
    )

    targets, source = resolve_type_targets("Nobody, the Unknown", DECISIVE, speed=0.5)

    assert source == "archetype:spellslinger (5 commanders, 8,342 decks)"
    assert targets["Instant"].high == 14.0 + RANGE_FRACTION * 14.0


def test_no_commander_reads_the_archetype_tier(monkeypatch):
    """A commander-less deck reaches the same tier a cold commander does —
    folding the old `if not commander_name: return default` into the ladder
    is what makes this reachable at all."""
    monkeypatch.setattr(
        type_targets, "ARCHETYPE_TYPE_COUNTS", {"spellslinger": SPELLSLINGER_ARCHETYPE}
    )

    _, source = resolve_type_targets(None, DECISIVE, speed=0.5)

    assert source == "archetype:spellslinger (5 commanders, 8,342 decks)"


def test_a_whisper_theme_skips_the_archetype_tier(monkeypatch):
    _fake_pages(monkeypatch, commander=None, taglinks=[])
    monkeypatch.setattr(
        type_targets, "ARCHETYPE_TYPE_COUNTS", {"spellslinger": SPELLSLINGER_ARCHETYPE}
    )
    quiet = {"spellslinger": TYPE_THEME_SHARE_FLOOR - 0.01}

    _, source = resolve_type_targets("Nobody, the Unknown", quiet, speed=0.5)

    assert source == "default"


def test_an_unmeasured_theme_skips_the_archetype_tier(monkeypatch):
    """A theme with no measured entry — the state of the committed table
    until Commit B3 runs the measurement — falls to the default exactly
    like an unmapped or thin-sample theme does at tier 1."""
    _fake_pages(monkeypatch, commander=None, taglinks=[])
    monkeypatch.setattr(type_targets, "ARCHETYPE_TYPE_COUNTS", {})

    _, source = resolve_type_targets("Nobody, the Unknown", DECISIVE, speed=0.5)

    assert source == "default"


def test_the_commander_page_outranks_the_archetype_tier(monkeypatch):
    """User decision: a commander page, however thin, always outranks the
    pooled archetype tier — even on a deck whose theme also clears tier
    2.5's floor and has a measured entry waiting."""
    _fake_pages(monkeypatch)
    monkeypatch.setattr(
        type_targets, "ARCHETYPE_TYPE_COUNTS", {"untap_combo": SPELLSLINGER_ARCHETYPE}
    )

    _, source = resolve_type_targets("Muldrotha, the Gravetide", {"untap_combo": 0.9}, speed=0.5)

    assert source == "edhrec:muldrotha-the-gravetide"


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


# --- Rule 0 deck sizes ------------------------------------------------------
# `scale` is deck_size/99. The interpolated bucket bounds and the type-target
# means resize; the half-width floors, the weights, the curve shares, and the
# user's overrides do not.


def test_scale_resizes_bucket_bounds_and_leaves_the_curve_alone():
    scale = 60 / 99
    types = targets_from_counts(DEFAULT_TYPE_COUNTS, speed=0.0, scale=scale)
    base = template_for(0.0)
    template = conditioned_template(0.0, None, types, scale=scale)

    sources = template.buckets[Bucket.MANA_SOURCES]
    assert sources.low == pytest.approx(37 * scale)  # ~22.4, from 37
    assert sources.high == pytest.approx(40 * scale)  # ~24.2, from 40
    assert sources.weight == base.buckets[Bucket.MANA_SOURCES].weight
    # Curve shares are fractions of the spell count — nothing to scale.
    assert template.curve == base.curve
    assert template.curve_weight == base.curve_weight


def test_scale_resizes_the_type_means_not_the_floors():
    scale = 60 / 99
    targets = targets_from_counts({"Creature": 29.0, "Planeswalker": 1.0}, speed=0.5, scale=scale)

    mean = 29.0 * scale
    assert targets["Creature"].low == pytest.approx(mean - RANGE_FRACTION * mean)
    assert targets["Creature"].high == pytest.approx(mean + RANGE_FRACTION * mean)
    # Two cards of counting noise is two cards at any deck size.
    assert targets["Planeswalker"].high == pytest.approx(1.0 * scale + MIN_HALF_WIDTH)


def test_the_archetype_shift_scales_with_the_deck():
    """A 39-land archetype shifts a 60-card deck's quota by the same
    *fraction* it shifts a 99-card deck's — the corpus median and the cap
    resize with the land mean."""
    scale = 60 / 99
    types = targets_from_counts({"Land": 39.0}, speed=0.5, scale=scale)
    base = template_for(0.5).buckets[Bucket.MANA_SOURCES]
    shifted = conditioned_template(0.5, None, types, scale=scale).buckets[Bucket.MANA_SOURCES]

    delta = 39.0 - DEFAULT_TYPE_COUNTS["Land"]
    assert shifted.low == pytest.approx((base.low + delta) * scale)
    assert shifted.high == pytest.approx((base.high + delta) * scale)


def test_a_user_override_is_literal_at_any_deck_size():
    """Overrides are authored against the displayed — already scaled —
    ranges; scaling them again would move the handle behind the user's back."""
    scale = 60 / 99
    types = targets_from_counts(DEFAULT_TYPE_COUNTS, speed=0.5, scale=scale)
    template = conditioned_template(
        0.5, {Bucket.MANA_SOURCES: TargetOverride(low=20, high=23)}, types, scale=scale
    )

    assert template.buckets[Bucket.MANA_SOURCES].low == 20
    assert template.buckets[Bucket.MANA_SOURCES].high == 23


def test_scale_one_is_the_identity():
    """The golden path: a 99-card deck's template is untouched, bound for
    bound, whether the scale is stated or defaulted."""
    types = targets_from_counts(DEFAULT_TYPE_COUNTS, speed=0.5)

    assert targets_from_counts(DEFAULT_TYPE_COUNTS, speed=0.5, scale=1.0) == types
    assert conditioned_template(0.5, None, types, scale=1.0) == conditioned_template(
        0.5, None, types
    )


# --- report round-trip ----------------------------------------------------


def test_report_rows_rebuild_the_targets(monkeypatch):
    """Cut scoring and the fill solver must score against the *reported*
    targets — a re-resolution could flip the tier between report and score."""
    _fake_pages(monkeypatch)
    targets, _ = resolve_type_targets("Muldrotha, the Gravetide", DECISIVE, speed=0.5)

    rows = [SimpleNamespace(type=name, low=t.low, high=t.high) for name, t in targets.items()]
    rebuilt = targets_from_report(rows, speed=0.5)

    assert rebuilt == targets
