"""Type-target resolution. Pure — EDHREC access is monkeypatched."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

import deck_lab.edhrec as edhrec
import deck_lab.type_targets as type_targets
from deck_lab.composition import (
    CEDH,
    CEDH_TURBO,
    SPEED_BRACKET_FIVE,
    TUNED,
    TargetOverride,
    template_for,
)
from deck_lab.edhrec import CEDH_TAG_SLUG, TagLink, TypeCounts
from deck_lab.type_targets import (
    CEDH_MIN_DECKS,
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


def _fake_pages(
    monkeypatch,
    *,
    commander=MULDROTHA,
    taglinks=TAGLINKS,
    theme=SPELLSLINGER,
    cedh=None,
    bracket_counts=None,
):
    """Route `load_type_counts` and `load_bracket_counts` at fakes. The
    commander page never fetches; the theme subpage returns `theme`; the
    `/cedh` subpage returns `cedh` (None models an unreachable page for
    either subpage). `bracket_counts` defaults to empty — below bracket 5,
    tier 0 never even asks for it."""

    def load(name, *, theme_slug=None, allow_fetch=False):
        if theme_slug is None:
            return commander, taglinks
        if theme_slug == CEDH_TAG_SLUG:
            return cedh, taglinks
        return theme, taglinks

    monkeypatch.setattr(edhrec, "load_type_counts", load)
    monkeypatch.setattr(edhrec, "load_bracket_counts", lambda name: bracket_counts or {})


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


# --- tier 0: cEDH conditioning ---------------------------------------------
# `is_cedh(speed)` (bracket 5) outranks every tier below, including tier 1's
# subpage — a cEDH spellslinger deck is a cEDH deck first, and EDHREC has no
# two-tag subpage to prefer over the commander's own `/cedh` page.

CEDH_COUNTS = TypeCounts(
    counts={
        "Creature": 22.0,
        "Instant": 25.0,
        "Sorcery": 9.0,
        "Artifact": 9.0,
        "Enchantment": 3.0,
        "Planeswalker": 1.0,
        "Battle": 0.0,
        "Land": 29.0,
    },
    total=98,
)


def test_bracket_five_reaches_the_cedh_tier(monkeypatch):
    _fake_pages(monkeypatch, cedh=CEDH_COUNTS, bracket_counts={5: 1258})
    targets, source = resolve_type_targets("Najeela, the Blade-Blossom", {}, speed=1.0)

    assert source == "edhrec:najeela-the-blade-blossom/cedh (1,258 decks)"
    assert targets["Instant"].high == 25.0 + RANGE_FRACTION * 25.0


def test_the_cedh_tier_outranks_a_decisive_theme(monkeypatch):
    """cEDH conditioning outranks theme and tribe conditioning — even a
    deck whose theme clears `TYPE_THEME_SHARE_FLOOR` and has a real
    subpage waiting stays on the `/cedh` page instead."""
    _fake_pages(monkeypatch, cedh=CEDH_COUNTS, bracket_counts={5: 1258})
    targets, source = resolve_type_targets("Muldrotha, the Gravetide", DECISIVE, speed=1.0)

    assert source == "edhrec:muldrotha-the-gravetide/cedh (1,258 decks)"
    assert targets["Instant"].high == 25.0 + RANGE_FRACTION * 25.0


def test_below_bracket_five_the_cedh_tier_is_unreachable(monkeypatch):
    """A speed of 0.75 — under `SPEED_BRACKET_FIVE` — resolves exactly what
    it resolves today: tier 0 never even asks about bracket counts."""
    assert SPEED_BRACKET_FIVE > 0.75
    _fake_pages(monkeypatch, cedh=CEDH_COUNTS, bracket_counts={5: 1258})
    targets, source = resolve_type_targets("Muldrotha, the Gravetide", {}, speed=0.75)

    assert source == "edhrec:muldrotha-the-gravetide"
    assert targets["Creature"].high == 30.0 + RANGE_FRACTION * 30.0


def test_a_thin_bracket_five_sample_falls_to_the_pool_not_past_cedh(monkeypatch):
    """EDHREC serves a `/cedh` page for every commander, including ones
    with no real cEDH presence — the floor exists to reject *that
    commander's own* subpage as noise. It does not reject cEDH conditioning
    itself: the deck's `speed` still claims bracket 5, so a thin per-
    commander sample falls to the pooled `CEDH_TYPE_COUNTS` profile
    (Task C4), the same relationship tier 2.5's archetype pool has to a
    per-commander page — never all the way past tier 0 to the casual
    ladder. (Before `CEDH_TYPE_COUNTS` was measured this landed on tier 2
    instead, because there was no pool to fall to yet.)"""
    _fake_pages(monkeypatch, cedh=CEDH_COUNTS, bracket_counts={5: CEDH_MIN_DECKS - 1})
    targets, source = resolve_type_targets("Muldrotha, the Gravetide", {}, speed=1.0)

    assert source == "cedh-pool (40 commanders, 39,657 decks)"
    instant = type_targets.CEDH_TYPE_COUNTS.counts["Instant"]
    assert targets["Instant"].high == instant + RANGE_FRACTION * instant


def test_a_bracket_five_deck_falls_to_the_pool_when_its_page_is_unavailable(monkeypatch):
    """The commander's own `/cedh` subpage is unreachable, but the deck
    still claims bracket 5 — the pooled cross-commander profile stands in
    before falling all the way through to the theme/tribe ladder."""
    _fake_pages(monkeypatch, cedh=None, bracket_counts={5: 1258})
    pool = ArchetypeProfile(
        counts={"Creature": 20.0, "Instant": 24.0, "Land": 30.0},
        tag="cedh",
        commanders=40,
        decks=52000,
        measured="2026-09-01",
    )
    monkeypatch.setattr(type_targets, "CEDH_TYPE_COUNTS", pool)

    targets, source = resolve_type_targets("Muldrotha, the Gravetide", {}, speed=1.0)

    assert source == "cedh-pool (40 commanders, 52,000 decks)"
    assert targets["Instant"].high == 24.0 + RANGE_FRACTION * 24.0


def test_a_none_pool_falls_through_past_the_cedh_tier(monkeypatch):
    """`CEDH_TYPE_COUNTS` was `None` before the `measure-cedh` CLI (Task B)
    landed its reviewed diff (Task C4) — kept exercised via an explicit
    monkeypatch so a thin-or-absent `/cedh` subpage with no pool to fall
    back on still degrades to tier 1 rather than blocking. The live default
    is no longer `None`; see `test_cedh_type_counts_is_measured`."""
    _fake_pages(monkeypatch, cedh=None, bracket_counts={5: 1258})
    monkeypatch.setattr(type_targets, "CEDH_TYPE_COUNTS", None)

    targets, source = resolve_type_targets("Muldrotha, the Gravetide", DECISIVE, speed=1.0)

    assert source == "edhrec:muldrotha-the-gravetide/spellslinger (2,548 decks)"
    assert targets["Creature"].high == 21.0 + RANGE_FRACTION * 21.0


def test_cedh_type_counts_is_measured():
    """Task C4: `CEDH_TYPE_COUNTS` is the pasted `measure-cedh --top-k 40`
    output (2026-09-01), not the `None` placeholder Task B shipped it as."""
    profile = type_targets.CEDH_TYPE_COUNTS
    assert profile is not None
    assert profile.tag == "cedh"
    assert profile.commanders == 40
    assert profile.decks == 39657
    assert profile.measured == "2026-09-01"
    # Same discipline as `test_archetype_counts_sum_to_99`.
    assert sum(profile.counts.values()) == pytest.approx(99.0, abs=0.5)
    # The reported defect, restated as a regression guard: today's default
    # ladder gave a cEDH deck 9 instants: this measured pool roughly
    # doubles it.
    assert profile.counts["Instant"] > 2 * DEFAULT_TYPE_COUNTS["Instant"]


def test_a_bracket_five_deck_with_no_subpage_now_reaches_the_measured_pool(monkeypatch):
    """End-to-end sanity check for C4 landing: a bracket-5 deck whose own
    commander page has no `/cedh` subpage no longer falls past tier 0 at
    all — it lands on the real pooled profile instead of degrading to the
    theme ladder, because `CEDH_TYPE_COUNTS` is no longer `None`."""
    _fake_pages(monkeypatch, cedh=None, bracket_counts={5: 1258})

    targets, source = resolve_type_targets("Muldrotha, the Gravetide", DECISIVE, speed=1.0)

    assert source == "cedh-pool (40 commanders, 39,657 decks)"
    instant = type_targets.CEDH_TYPE_COUNTS.counts["Instant"]
    assert targets["Instant"].high == instant + RANGE_FRACTION * instant


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
    """No page and no measured archetype for the theme — `untap_combo` has
    neither a `THEME_TAG_SLUGS` entry nor an `ARCHETYPE_TYPE_COUNTS` one, so
    this is the tier-3 fallback in isolation, past tier 2.5."""
    _fake_pages(monkeypatch, commander=None, taglinks=[])
    targets, source = resolve_type_targets("Nobody, the Unknown", {"untap_combo": 0.9}, speed=0.5)

    assert source == "default"
    assert targets["Creature"].high == (
        DEFAULT_TYPE_COUNTS["Creature"] + RANGE_FRACTION * DEFAULT_TYPE_COUNTS["Creature"]
    )


def test_no_commander_reads_the_default():
    targets, source = resolve_type_targets(None, {"untap_combo": 0.9}, speed=0.5)

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


# --- table hygiene: the committed ARCHETYPE_TYPE_COUNTS ---------------------
# The measured table (Commit B3) lands as a reviewed diff, not code these
# tests can re-derive — they guard its *shape*, so a future re-measurement
# or a hand edit cannot silently corrupt it.


def test_archetype_counts_sum_to_99():
    """Each source page already sums to 99 and the aggregation is a
    weighted mean, so the pasted table should too — ±0.5 covers the
    per-type rounding to one decimal place `render_constants` prints."""
    for theme_id, profile in type_targets.ARCHETYPE_TYPE_COUNTS.items():
        assert sum(profile.counts.values()) == pytest.approx(99.0, abs=0.5), theme_id


def test_archetype_keys_are_mapped_theme_tags():
    """A key with no `THEME_TAG_SLUGS` entry could never be reached —
    tier 2.5 only asks the table about a theme that already named a real
    tag when `measure_tag` produced this table's entries."""
    assert set(type_targets.ARCHETYPE_TYPE_COUNTS) <= set(edhrec.THEME_TAG_SLUGS)


def test_archetype_profiles_clear_the_measurement_floors():
    """The pasted table is the *output* of `measure_tag`'s floors, so every
    entry in it should already satisfy them — a hand-edited row that does
    not is exactly the kind of drift this guards against."""
    from deck_lab.archetype_profiles import MIN_COMMANDERS, MIN_DECKS

    for theme_id, profile in type_targets.ARCHETYPE_TYPE_COUNTS.items():
        assert profile.commanders >= MIN_COMMANDERS, theme_id
        assert profile.decks >= MIN_DECKS, theme_id


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


# --- THE TRAP: the shift is backwards for cEDH -----------------------------
# CEDH-PLAN.md's addendum, named ahead of time: a naive read of the measured
# Land row (28.1, well below the 35 casual median) would feed a -6 shift
# into the mana-sources quota and drag `CEDH`'s own measured ~40 corridor
# down toward TUNED's ~34 — the Land row would look right while the mana
# advice quietly got worse than before this template existed.


def test_cedh_speed_suppresses_the_mana_source_shift():
    """At `is_cedh(speed)`, `conditioned_template` must leave `CEDH`'s own
    mana-sources corridor exactly as measured — not shifted down by the
    (real, measured, but structurally inapplicable) land deviation."""
    types = targets_from_counts(type_targets.CEDH_TYPE_COUNTS.counts, speed=1.0)
    unshifted = template_for(1.0).buckets[Bucket.MANA_SOURCES]

    conditioned = conditioned_template(1.0, None, types).buckets[Bucket.MANA_SOURCES]

    assert conditioned.low == unshifted.low
    assert conditioned.high == unshifted.high
    # The number the trap would have produced instead: 40.4 - 6 = 34.4-ish,
    # sitting back inside TUNED's 30-34 range. Pin against that outcome
    # explicitly, not just against "unchanged" above.
    assert conditioned.low > TUNED.buckets[Bucket.MANA_SOURCES].high


def test_conditioned_template_selects_the_measured_subarchetype():
    """cEDH Pro round Task E follow-up: `conditioned_template` must forward
    `cedh_class` to `template_for` — the wiring that turns the landed-but-
    uncalled classifier into a live template selection. A turbo-classified
    deck's RAMP corridor should read the measured 16.0-26.1, not the pooled
    13.3-25.3 `CEDH` carries."""
    types = targets_from_counts(type_targets.CEDH_TYPE_COUNTS.counts, speed=1.0)

    turbo = conditioned_template(1.0, None, types, cedh_class="turbo")
    pooled = conditioned_template(1.0, None, types)

    assert turbo.buckets[Bucket.RAMP] == CEDH_TURBO.buckets[Bucket.RAMP]
    assert pooled.buckets[Bucket.RAMP] == CEDH.buckets[Bucket.RAMP]
    assert turbo.buckets[Bucket.RAMP] != pooled.buckets[Bucket.RAMP]


def test_conditioned_template_unclassified_falls_back_to_pooled_cedh_byte_identically():
    """The honest miss (`ArchetypeClass.UNCLASSIFIED`) must read exactly like
    omitting `cedh_class` altogether — a deck the classifier could not place
    keeps the pooled corridor, not a KeyError or a silently wrong template."""
    types = targets_from_counts(type_targets.CEDH_TYPE_COUNTS.counts, speed=1.0)

    unclassified = conditioned_template(1.0, None, types, cedh_class="unclassified")
    assert unclassified == conditioned_template(1.0, None, types)


def test_a_synthetic_low_land_count_still_shifts_below_bracket_five():
    """Proves the suppression is scoped to `is_cedh`, not a blanket 'skip
    the shift whenever land count is low' rule — the mechanism is still
    exactly as designed for every archetype it was built for, cEDH's own
    measured land mean included, right up until bracket 5."""
    types = targets_from_counts({"Land": 28.1}, speed=0.75)
    base = template_for(0.75).buckets[Bucket.MANA_SOURCES]

    shifted = conditioned_template(0.75, None, types).buckets[Bucket.MANA_SOURCES]

    delta = max(-MANA_SOURCES_DELTA_CAP, 28.1 - DEFAULT_TYPE_COUNTS["Land"])
    assert shifted.low == pytest.approx(base.low + delta)
    assert shifted.low < base.low


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


# --- corridors the builder moved -------------------------------------------


def test_a_type_override_replaces_the_measured_corridor():
    types = targets_from_counts(DEFAULT_TYPE_COUNTS, speed=0.5)
    template = conditioned_template(
        0.5, None, types, type_overrides={"Creature": TargetOverride(low=40, high=44)}
    )

    assert (template.types["Creature"].low, template.types["Creature"].high) == (40, 44)


def test_a_land_override_moves_the_mana_quota_with_it():
    """The two panels are one decision. A builder who asks for 39 lands is
    asking the mana-source quota to follow — a shift computed off the
    archetype's row instead would have the role meter arguing with the type
    meter about the same number."""
    types = targets_from_counts(DEFAULT_TYPE_COUNTS, speed=0.5)
    base = template_for(0.5).buckets[Bucket.MANA_SOURCES]
    shifted = conditioned_template(
        0.5, None, types, type_overrides={"Land": TargetOverride(low=39, high=39)}
    ).buckets[Bucket.MANA_SOURCES]

    delta = 39.0 - DEFAULT_TYPE_COUNTS["Land"]
    assert shifted.low == pytest.approx(base.low + delta)


def test_a_bucket_override_still_beats_the_shift_a_type_override_caused():
    """Overrides land after the shift, whichever axis moved it."""
    types = targets_from_counts(DEFAULT_TYPE_COUNTS, speed=0.5)
    template = conditioned_template(
        0.5,
        {Bucket.MANA_SOURCES: TargetOverride(low=30, high=33)},
        types,
        type_overrides={"Land": TargetOverride(low=39, high=39)},
    )

    assert (
        template.buckets[Bucket.MANA_SOURCES].low,
        template.buckets[Bucket.MANA_SOURCES].high,
    ) == (30, 33)


def test_no_type_overrides_leaves_the_measured_corridors_alone():
    types = targets_from_counts(DEFAULT_TYPE_COUNTS, speed=0.5)

    assert conditioned_template(0.5, None, types, type_overrides={}) == conditioned_template(
        0.5, None, types
    )
