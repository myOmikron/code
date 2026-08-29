"""Composition targets, the speed meter, and bucket overlap."""

from __future__ import annotations

import pytest

from deck_lab.composition import (
    BATTLECRUISER,
    CURVE_BUCKETS,
    OVER_TARGET_COST,
    STATUS_TOLERANCE,
    TUNED,
    BucketTarget,
    TargetOverride,
    apply_curve,
    apply_type_targets,
    bucket_coverage,
    bucket_coverage_from_cards,
    composition_penalty,
    curve_targets,
    primary_type,
    template_for,
    type_counts_from_cards,
)
from deck_lab.vocabulary import BUCKET_ROLES, Bucket, Role


def test_target_inside_range_costs_nothing():
    target = BucketTarget(10, 12, 2.0)
    assert target.deviation(11) == 0.0
    assert target.penalty(11) == 0.0


def test_target_penalises_both_directions():
    target = BucketTarget(10, 12, 2.0)
    assert target.deviation(8) == 2.0
    assert target.deviation(15) == 3.0
    assert target.penalty(8) == 4.0


@pytest.mark.parametrize("template", [BATTLECRUISER, TUNED])
def test_curve_distribution_sums_to_one(template):
    assert sum(template.curve.values()) == pytest.approx(1.0)
    assert set(template.curve) == set(CURVE_BUCKETS)


@pytest.mark.parametrize("template", [BATTLECRUISER, TUNED])
def test_every_bucket_has_a_target(template):
    assert set(template.buckets) == set(Bucket)


def test_speed_endpoints_match_archetypes():
    assert (
        template_for(0.0).buckets[Bucket.MANA_SOURCES].low
        == BATTLECRUISER.buckets[Bucket.MANA_SOURCES].low
    )
    assert template_for(1.0).buckets[Bucket.RAMP].high == TUNED.buckets[Bucket.RAMP].high


def test_speed_interpolates_monotonically():
    """Turning the dial up should shed lands and add ramp, without jumps."""
    lands = [template_for(s).buckets[Bucket.MANA_SOURCES].low for s in (0.0, 0.25, 0.5, 0.75, 1.0)]
    ramp = [template_for(s).buckets[Bucket.RAMP].low for s in (0.0, 0.25, 0.5, 0.75, 1.0)]

    assert lands == sorted(lands, reverse=True)
    assert ramp == sorted(ramp)


def test_speed_tightens_quota_weights():
    """A tuned list is less forgiving about a missing slot."""
    assert (
        template_for(1.0).buckets[Bucket.RAMP].weight
        > template_for(0.0).buckets[Bucket.RAMP].weight
    )


def test_speed_outside_range_is_rejected():
    with pytest.raises(ValueError, match=r"\[0, 1\]"):
        template_for(1.5)


def test_mana_rock_counts_toward_two_buckets():
    """The overlap that makes greedy per-bucket filling wrong."""
    coverage = bucket_coverage({Role.MANA_ROCK: 1.0})

    assert coverage[Bucket.MANA_SOURCES] == 1.0
    assert coverage[Bucket.RAMP] == 1.0


def test_fractional_role_weights_aggregate():
    """Solemn Simulacrum: mostly ramp, partly card advantage."""
    coverage = bucket_coverage({Role.LAND_RAMP: 0.8, Role.CARD_ADVANTAGE: 0.5})

    assert coverage[Bucket.RAMP] == pytest.approx(0.8)
    assert coverage[Bucket.CARD_DRAW] == pytest.approx(0.5)
    assert coverage[Bucket.MANA_SOURCES] == 0.0


def test_every_role_reaches_at_least_one_bucket():
    """An unreachable role would be invisible to the solver's quotas."""
    reachable = set().union(*BUCKET_ROLES.values())
    assert set(Role) - reachable == set()


def test_curve_targets_scale_to_nonland_count():
    targets = curve_targets(BATTLECRUISER, 60)
    assert sum(targets.values()) == pytest.approx(60.0)


def test_penalty_reports_which_bucket_is_off():
    """Diagnostics need the offending bucket, not one opaque number."""
    template = template_for(0.0)
    total, deviations = composition_penalty(template, {Role.LAND: 20.0})

    assert total > 0
    assert deviations[Bucket.MANA_SOURCES] > 0
    assert deviations[Bucket.RAMP] > 0


def test_well_shaped_deck_scores_near_zero():
    template = template_for(0.0)
    role_weights = {
        Role.LAND: 36.0,
        Role.MANA_ROCK: 3.0,
        Role.LAND_RAMP: 7.0,
        Role.CARD_ADVANTAGE: 12.0,
        Role.SPOT_REMOVAL: 6.0,
        Role.BOARD_WIPE: 3.0,
        Role.PAYOFF: 32.0,
    }
    total, deviations = composition_penalty(template, role_weights)

    assert total == pytest.approx(0.0)
    assert all(value == 0.0 for value in deviations.values())


def test_card_with_two_roles_in_one_bucket_counts_once():
    """The double-count bug: an Arcane Signet is mana_rock 1.0 AND ramp_other 0.7.

    Both roles sit in the ramp bucket. Summing role totals counted one card as
    1.7 ramp pieces and reported 30.8 ramp on a real decklist.
    """
    signet = ({Role.MANA_ROCK: 1.0, Role.RAMP_OTHER: 0.7}, 1)
    coverage = bucket_coverage_from_cards([signet])

    assert coverage[Bucket.RAMP] == pytest.approx(1.0)
    assert coverage[Bucket.MANA_SOURCES] == pytest.approx(1.0)


def test_card_still_counts_in_several_different_buckets():
    """Solemn Simulacrum is genuinely both ramp and card advantage."""
    solemn = ({Role.LAND_RAMP: 0.8, Role.CARD_ADVANTAGE: 0.5}, 1)
    coverage = bucket_coverage_from_cards([solemn])

    assert coverage[Bucket.RAMP] == pytest.approx(0.8)
    assert coverage[Bucket.CARD_DRAW] == pytest.approx(0.5)


def test_quantity_multiplies_contribution():
    """Basic lands are the reason qty exists."""
    coverage = bucket_coverage_from_cards([({Role.LAND: 1.0}, 9)])
    assert coverage[Bucket.MANA_SOURCES] == pytest.approx(9.0)


def test_card_with_no_roles_contributes_nothing():
    coverage = bucket_coverage_from_cards([({}, 1)])
    assert all(value == 0.0 for value in coverage.values())


def test_override_replaces_both_bounds():
    template = template_for(0.5, {Bucket.RAMP: TargetOverride(low=20, high=24)})
    target = template.buckets[Bucket.RAMP]

    assert (target.low, target.high) == (20, 24)


def test_override_may_move_one_bound_only():
    """Dragging one handle must not silently reset the other."""
    base = template_for(0.5).buckets[Bucket.RAMP]  # 10.5-14
    moved = template_for(0.5, {Bucket.RAMP: TargetOverride(low=11)}).buckets[Bucket.RAMP]

    assert moved.low == 11
    assert moved.high == base.high


def test_override_keeps_the_penalty_weight():
    """Overrides say where the range sits, not how hard it binds."""
    base = template_for(1.0).buckets[Bucket.RAMP]
    moved = template_for(1.0, {Bucket.RAMP: TargetOverride(low=5, high=6)}).buckets[Bucket.RAMP]

    assert moved.weight == base.weight


def test_inverted_override_is_swapped_not_rejected():
    """The user dragged a handle past its partner. That is a gesture, not an error.

    Left inverted, `deviation` would report a shortfall and an excess at once.
    """
    target = template_for(0.5, {Bucket.RAMP: TargetOverride(low=18, high=12)}).buckets[Bucket.RAMP]

    assert (target.low, target.high) == (12, 18)
    assert target.deviation(15) == 0.0


def test_overrides_leave_other_buckets_alone():
    plain = template_for(0.5)
    edited = template_for(0.5, {Bucket.RAMP: TargetOverride(low=20, high=24)})

    assert edited.buckets[Bucket.CARD_DRAW] == plain.buckets[Bucket.CARD_DRAW]
    assert edited.curve == plain.curve


def test_overrides_do_not_touch_the_curve():
    edited = template_for(0.5, {Bucket.RAMP: TargetOverride(low=1, high=2)})
    assert sum(edited.curve.values()) == pytest.approx(1.0)


def test_curve_override_replaces_the_interpolated_shape():
    edited = template_for(0.5, None, {0: 0, 1: 1, 2: 1, 3: 1, 4: 0, 5: 0, 6: 0})

    assert edited.curve[1] == pytest.approx(1 / 3)
    assert edited.curve[5] == 0.0
    # The buckets are a different axis and must not move with the curve.
    assert edited.buckets == template_for(0.5).buckets


def test_curve_override_is_renormalised_to_the_slots_that_exist():
    # A shape summing to 2.0 would otherwise ask a 63-spell deck for 126
    # spells, and every bucket in the deck would read as short.
    edited = template_for(0.5, None, dict.fromkeys(CURVE_BUCKETS, 2 / 7))

    assert sum(edited.curve.values()) == pytest.approx(1.0)
    assert edited.curve[3] == pytest.approx(1 / 7)


def test_an_empty_or_dead_curve_keeps_the_archetype():
    plain = template_for(0.5)

    assert template_for(0.5, None, {}).curve == plain.curve
    assert apply_curve(plain, dict.fromkeys(CURVE_BUCKETS, 0.0)).curve == plain.curve


def test_negative_curve_shares_read_as_zero():
    edited = apply_curve(template_for(0.5), {0: -5.0, 1: 1.0, 2: 1.0})

    assert edited.curve[0] == 0.0
    assert edited.curve[1] == pytest.approx(0.5)


def test_template_name_records_that_it_was_customised():
    assert template_for(0.5, {Bucket.RAMP: TargetOverride(low=20)}).name.endswith("+custom")
    assert not template_for(0.5).name.endswith("+custom")


def test_empty_overrides_are_a_no_op():
    assert template_for(0.5, {}).name == template_for(0.5).name


def test_unknown_bucket_in_overrides_is_ignored():
    template = template_for(0.5, {"not_a_bucket": TargetOverride(low=1)})
    assert set(template.buckets) == set(Bucket)


def test_bucket_shortfall_is_capped_in_scoring():
    """An incomplete deck can be 30 cards short of its land count.

    Uncapped, that term would rank every mana source above a genuine synergy
    hit. The magnitude belongs in the reason, not the score.
    """
    from deck_lab.suggestions import _role_provenance

    small = _role_provenance({"shortfall": 2.0, "weight": 1.0}, "ramp")
    huge = _role_provenance({"shortfall": 30.0, "weight": 1.0}, "mana sources")

    assert huge.score <= 1.0
    assert huge.score > small.score
    assert "30.0 short" in huge.detail


def test_role_provenance_scales_with_role_weight():
    from deck_lab.suggestions import _role_provenance

    strong = _role_provenance({"shortfall": 4.0, "weight": 1.0}, "ramp")
    weak = _role_provenance({"shortfall": 4.0, "weight": 0.5}, "ramp")

    assert strong.score > weak.score


# --- the type axis --------------------------------------------------------


@pytest.mark.parametrize(
    ("type_line", "expected"),
    [
        ("Creature — Bear", "Creature"),
        ("Artifact Creature — Golem", "Creature"),
        ("Enchantment Creature — God", "Creature"),
        ("Land Creature — Forest Dryad", "Land"),
        ("Artifact Land", "Land"),
        ("Tribal Instant — Goblin", "Instant"),
        ("Legendary Planeswalker — Teferi", "Planeswalker"),
        ("Sorcery", "Sorcery"),
        ("Battle — Siege", "Battle"),
        ("Instant // Land", "Land"),
        ("Conspiracy", "Other"),
        ("", "Other"),
    ],
)
def test_primary_type_files_a_card_where_a_deckbuilder_would(type_line, expected):
    """Mirrors `primaryType` in frontend selectors.js — the two sides must
    count the same deck identically or a target sits beside a count it does
    not govern."""
    assert primary_type(type_line) == expected


def test_type_counts_weight_by_quantity():
    cards = [
        {"type_line": "Creature — Bear", "qty": 2},
        {"type_line": "Basic Land — Forest", "qty": 9},
        {"type_line": "Instant", "qty": 1},
    ]
    counts = type_counts_from_cards(cards)

    assert counts == {"Creature": 2, "Land": 9, "Instant": 1}


def test_type_targets_layer_onto_a_template_without_touching_it():
    template = template_for(0.5)
    conditioned = apply_type_targets(template, {"Creature": BucketTarget(23, 35, 0.35)})

    assert conditioned.buckets == template.buckets
    assert conditioned.curve == template.curve
    assert conditioned.types == {"Creature": BucketTarget(23, 35, 0.35)}
    assert template.types == {}
    assert apply_type_targets(template, {}) is template


def test_overrides_keep_the_type_targets():
    conditioned = apply_type_targets(template_for(0.5), {"Creature": BucketTarget(23, 35, 0.35)})
    edited = template_for(0.5, {Bucket.RAMP: TargetOverride(low=14)})

    assert edited.types == {}
    assert apply_type_targets(edited, conditioned.types).types == conditioned.types


def test_penalty_gains_a_type_term_only_when_counts_are_given():
    template = apply_type_targets(template_for(0.5), {"Creature": BucketTarget(23, 35, 0.5)})

    without, _ = composition_penalty(template, {})
    with_types, _ = composition_penalty(template, {}, type_counts={"Creature": 40.0})

    assert with_types == pytest.approx(without + 0.5 * OVER_TARGET_COST * 5.0)


def test_missing_cards_cost_more_than_surplus_ones():
    """Not the same failure. A shortfall is functional — too little ramp is
    slow and nothing else in the list covers it — while overage is largely an
    artefact of buckets that overlap, and of 99 slots that have to add up."""
    target = BucketTarget(10, 20, 1.0)

    assert target.penalty(5.0) == pytest.approx(5.0)
    assert target.penalty(25.0) == pytest.approx(5.0 * OVER_TARGET_COST)
    assert target.penalty(25.0) < target.penalty(5.0)


def test_the_report_still_states_the_plain_distance():
    """What a surplus *costs* is a ranking decision; how far over the deck is,
    is a fact, and the row that prints it must not inherit the discount."""
    target = BucketTarget(10, 20, 1.0)

    assert target.deviation(25.0) == pytest.approx(5.0)
    assert target.deviation(5.0) == pytest.approx(5.0)


def test_type_counts_inside_range_cost_nothing():
    template = apply_type_targets(template_for(0.5), {"Creature": BucketTarget(23, 35, 0.5)})

    bare, _ = composition_penalty(template, {})
    inside, _ = composition_penalty(template, {}, type_counts={"Creature": 30.0})

    assert inside == bare


def test_role_gap_channel_is_known_to_the_frontend():
    """`Provenance` renders null for an unknown channel, which would silently
    drop the reason from the UI. Every channel name emitted here must exist in
    the component's map."""
    from pathlib import Path

    from deck_lab.suggestions import _role_provenance

    component = (
        Path(__file__).resolve().parents[2] / "frontend/src/components/ui/Provenance/Provenance.js"
    )
    if not component.exists():
        return

    assert f"{_role_provenance({'shortfall': 1}, 'x').channel}:" in component.read_text()


# --- what counts as over ---------------------------------------------------


def test_a_bucket_just_past_its_bound_is_not_called_over():
    """34.3 against a target topping out at 33.2 was earning an amber badge —
    and behind it a demotion on every card that touched the bucket."""
    target = BucketTarget(28.2, 33.2, 1.0)

    assert not target.is_over(34.3)
    assert target.is_over(33.2 + STATUS_TOLERANCE + 0.01)


def test_a_shortfall_is_reported_the_moment_it_exists():
    """The band is the surplus side only. Forgiving 1.5 cards of shortfall
    silenced a deck under its ramp floor, and with nothing reading as short the
    cross-bucket swap pairing stopped firing — 26 exchanges went to 0."""
    target = BucketTarget(10.0, 14.0, 1.0)

    assert target.is_short(9.0)
    assert target.is_short(10.0 - STATUS_TOLERANCE)
    assert not target.is_short(10.0)


def test_inside_the_band_still_costs_something():
    """Only the verdict moves. A deck drifting through the band is still
    ranked below one sitting inside its target."""
    target = BucketTarget(10.0, 14.0, 1.0)

    assert not target.is_over(15.0)
    assert target.penalty(15.0) > 0
    assert target.deviation(15.0) == pytest.approx(1.0)
