"""The fill solver. Uses CP-SAT but no database."""

from __future__ import annotations

import pytest

from deck_lab.composition import DeckTemplate, template_for
from deck_lab.solver import Candidate, solve_fill
from deck_lab.vocabulary import Bucket

TEMPLATE = template_for(0.5)
EMPTY_CURVE = dict.fromkeys(range(7), 0.0)


def _cand(oid, roles, *, score=1.0, cmc=2.0, land=False, price=None):
    return Candidate(
        oracle_id=oid,
        name=oid,
        cmc=cmc,
        is_land=land,
        score=score,
        roles=roles,
        price_usd=price,
    )


def _pool(n, roles, **kwargs):
    return [_cand(f"c{i}", roles, **kwargs) for i in range(n)]


def _solve(candidates, slots, **kwargs):
    return solve_fill(
        candidates,
        kwargs.pop("template", TEMPLATE),
        slots=slots,
        base_coverage=kwargs.pop("base_coverage", {}),
        base_curve=kwargs.pop("base_curve", EMPTY_CURVE),
        base_nonland=kwargs.pop("base_nonland", 0),
        **kwargs,
    )


def test_it_picks_exactly_the_requested_number():
    result = _solve(_pool(40, {"land": 1.0}, land=True, cmc=0.0), 20)

    assert result.solved
    assert len(result.chosen) == 20


def test_a_full_deck_needs_no_fill():
    assert _solve(_pool(5, {"land": 1.0}), 0).status == "complete"


def test_too_few_candidates_is_reported_not_crashed():
    result = _solve(_pool(3, {"land": 1.0}), 20)

    assert not result.solved
    assert result.status == "infeasible"
    assert "widen" in result.notes[0]


def test_it_moves_a_bucket_toward_its_target():
    """The point of the whole thing: quotas satisfied, not approached."""
    lands = _pool(60, {"land": 1.0}, land=True, cmc=0.0)
    result = _solve(lands, 34)

    low, high = (
        TEMPLATE.buckets[Bucket.MANA_SOURCES].low,
        TEMPLATE.buckets[Bucket.MANA_SOURCES].high,
    )
    assert low - 1 <= result.coverage["mana_sources"] <= high + 1


def test_it_prefers_the_stronger_card_when_shape_is_equal():
    strong = _cand("strong", {"payoff": 1.0}, score=9.0)
    weak = [_cand(f"w{i}", {"payoff": 1.0}, score=0.1) for i in range(10)]

    result = _solve([strong, *weak], 1)

    assert result.chosen[0].oracle_id == "strong"


def test_a_signet_counts_once_toward_ramp():
    """Two roles in one bucket is one card, not 1.7 of one — the double-count
    `bucket_coverage_from_cards` exists to prevent."""
    signets = _pool(20, {"mana_rock": 1.0, "ramp_other": 0.7})
    result = _solve(signets, 10)

    assert result.coverage["ramp"] == pytest.approx(10.0)


def test_budget_is_a_hard_constraint():
    cheap = [_cand(f"cheap{i}", {"payoff": 1.0}, score=1.0, price=1.0) for i in range(20)]
    dear = [_cand(f"dear{i}", {"payoff": 1.0}, score=9.0, price=100.0) for i in range(20)]

    result = _solve([*cheap, *dear], 10, budget=20.0)

    assert result.solved
    assert result.total_price <= 20.0


def test_base_coverage_counts_toward_the_quota():
    """The deck already has cards; the solver fills the remainder, it does not
    start from nothing."""
    lands = _pool(60, {"land": 1.0}, land=True, cmc=0.0)

    without = _solve(lands, 10)
    with_base = _solve(lands, 10, base_coverage={Bucket.MANA_SOURCES: 30.0})

    assert with_base.coverage["mana_sources"] > without.coverage["mana_sources"]
    assert with_base.base_coverage["mana_sources"] == 30.0


def test_a_bucket_already_over_target_is_called_out():
    """Adding cards cannot bring a bucket down. Without saying so, the result
    reads as the solver having failed."""
    result = _solve(
        _pool(30, {"land": 1.0}, land=True, cmc=0.0),
        10,
        base_coverage={Bucket.INTERACTION: 40.0},
    )

    assert any("already over target" in note for note in result.notes)


def test_it_solves_fast_enough_to_be_interactive():
    result = _solve(_pool(300, {"payoff": 1.0}), 47)

    assert result.solved
    assert result.solve_ms < 2000


# --- the type axis --------------------------------------------------------


def _typed_template(**targets):
    from deck_lab.composition import BucketTarget, apply_type_targets

    return apply_type_targets(
        TEMPLATE, {name: BucketTarget(*spec) for name, spec in targets.items()}
    )


def test_a_saturated_base_steers_the_pick_away_from_creatures():
    """Equal score, equal roles — the deck already at its creature ceiling
    should be handed the artifact, or /fill fights the diagnostics penalty."""
    creature = _cand("bear", {"payoff": 1.0})
    creature.primary_type = "Creature"
    artifact = _cand("mirror", {"payoff": 1.0})
    artifact.primary_type = "Artifact"

    result = _solve(
        [creature, artifact],
        1,
        template=_typed_template(Creature=(23, 35, 0.35), Artifact=(5, 12, 0.35)),
        base_types={"Creature": 35.0, "Artifact": 8.0},
    )

    assert [c.oracle_id for c in result.chosen] == ["mirror"]


def test_a_weight_zero_type_never_steers():
    """Land's constraint is skipped entirely — a 'saturated' land count must
    not make the solver dodge the better land. Everything but `primary_type`
    and score is identical, so any preference for the utility land would be
    the Land constraint leaking in."""
    land = _cand("island", {"land": 1.0}, land=True, cmc=0.0, score=1.1)
    land.primary_type = "Land"
    utility = _cand("maze", {"land": 1.0}, land=True, cmc=0.0, score=1.0)
    utility.primary_type = "Other"

    result = _solve(
        [land, utility],
        1,
        template=_typed_template(Land=(30, 38, 0.0)),
        base_types={"Land": 45.0},
    )

    assert [c.oracle_id for c in result.chosen] == ["island"]


def test_fill_would_rather_overshoot_than_leave_a_gap():
    """The asymmetry `BucketTarget.penalty` uses, in the solver that has to
    agree with it.

    One slot, and two ways to spend it: on the bucket that is short, or on the
    one that is already full. Both candidates score the same, so only the shape
    argument separates them — and a shortfall costs more than a surplus.
    """
    template = template_for(0.5)
    base = {
        # Well past target, so another mana source is a pure surplus.
        Bucket.MANA_SOURCES: template.buckets[Bucket.MANA_SOURCES].high + 6,
        # Short by more than the tolerance, so ramp is a real gap.
        Bucket.RAMP: template.buckets[Bucket.RAMP].low - 4,
    }
    pool = [
        _cand("surplus", {"land": 1.0}, land=True, cmc=0.0),
        _cand("gap", {"ramp_other": 1.0}),
    ]

    result = _solve(pool, 1, base_coverage=base)

    assert [c.oracle_id for c in result.chosen] == ["gap"]


# --- the curve axis --------------------------------------------------------


def test_curve_target_shapes_the_pick_by_what_is_actually_chosen():
    """Task 9: the target must track the nonlands actually picked, not the
    candidate pool. Equal-score candidates at three mana values and a curve
    that only wants 1 and 2, evenly, should split 2/2 between them and take
    none at 6 — which only holds if the per-mv target grows with what gets
    picked instead of sitting fixed at the pool size."""
    template = DeckTemplate(
        name="curve-only",
        buckets={},
        curve={0: 0.0, 1: 0.5, 2: 0.5, 3: 0.0, 4: 0.0, 5: 0.0, 6: 0.0},
        curve_weight=10.0,
    )
    pool = [
        *[_cand(f"one{i}", {}, cmc=1.0) for i in range(4)],
        *[_cand(f"two{i}", {}, cmc=2.0) for i in range(4)],
        *[_cand(f"six{i}", {}, cmc=6.0) for i in range(4)],
    ]

    result = _solve(pool, 4, template=template)

    assert sorted(c.cmc for c in result.chosen) == [1.0, 1.0, 2.0, 2.0]


def test_the_curve_no_longer_penalises_a_clearly_better_land():
    """Before the fix, `target` was pinned to the size of the candidate pool,
    so picking *any* nonland always looked like completing that mis-scaled
    target and bought a fixed reward independent of how many slots were being
    filled — enough to make the solver prefer a worse-scoring nonland over a
    land with a clearly higher score. Fixed, the target tracks what's
    actually picked, so the land's real score edge is what decides."""
    template = DeckTemplate(
        name="curve-only",
        buckets={},
        curve={0: 0.0, 1: 0.0, 2: 1.0, 3: 0.0, 4: 0.0, 5: 0.0, 6: 0.0},
        curve_weight=5.0,
    )
    land = _cand("land", {}, cmc=0.0, land=True, score=9.0)
    nonland = _cand("spell", {}, cmc=2.0, score=8.5)

    result = _solve([land, nonland], 1, template=template)

    assert [c.oracle_id for c in result.chosen] == ["land"]


def test_a_surplus_is_still_worth_avoiding():
    """Discounted, not free. At zero the solver would stuff a full bucket to
    reach any candidate score at all — which is why the coefficient is floored
    at one rather than rounded."""
    template = template_for(0.5)
    base = {Bucket.MANA_SOURCES: template.buckets[Bucket.MANA_SOURCES].high + 6}
    pool = [
        _cand("surplus", {"land": 1.0}, land=True, cmc=0.0),
        _cand("neutral", {}),
    ]

    result = _solve(pool, 1, base_coverage=base)

    assert [c.oracle_id for c in result.chosen] == ["neutral"]
