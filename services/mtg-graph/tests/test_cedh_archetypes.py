"""cEDH sub-archetype classification and per-class corridor measurement
(Task E, cEDH Pro round). Pure functions throughout — `no_live_graph`
(conftest.py) fails anything that reaches for Neo4j without a stub, and
nothing here needs one: `_fetch_deck_rows`/`_fetch_card_metadata` are thin,
driver()-based wrappers around the two queries this module needs, tested
only by inspection of the queries themselves (mirroring `interaction.py`'s
own split between the one graph-touching helper and everything pure)."""

from __future__ import annotations

import pytest

from deck_lab.cedh_archetypes import (
    MIN_COMMANDERS,
    MIN_DECKS,
    ArchetypeClass,
    DeckFeatures,
    DeckSample,
    _basic_land_shortfall,
    _pool_class,
    build_deck_sample,
    classify,
    confusion_table,
    deck_features,
    render_classifier_report,
)
from deck_lab.composition import CURVE_BUCKETS, Bucket

# ---------------------------------------------------------------------------
# deck_features
# ---------------------------------------------------------------------------


def _card(oracle_id, *, cmc=1.0, type_line="Instant", qty=1):
    return {"oracle_id": oracle_id, "cmc": cmc, "type_line": type_line, "qty": qty}


def test_deck_features_counts_fast_mana_from_either_resource():
    """`fast_mana` reads both `fast_mana` and `ritual_mana` producers — the
    Sol Ring family and the Dark Ritual family both count (module docstring:
    counting only the narrower resource would undercount every ritual-heavy
    turbo shell)."""
    cards = [_card("Sol Ring", type_line="Artifact"), _card("Dark Ritual")]
    resources = {
        "Sol Ring": {"produces": {"fast_mana"}},
        "Dark Ritual": {"produces": {"ritual_mana"}},
    }

    features = deck_features(cards, [], resources)

    assert features.fast_mana == 2


def test_deck_features_counts_stax_from_tax_or_denial():
    cards = [
        _card("Rhystic Study", type_line="Enchantment"),
        _card("Winter Orb", type_line="Artifact"),
    ]
    resources = {
        "Rhystic Study": {"produces": {"tax_effect"}},
        "Winter Orb": {"produces": {"resource_denial"}},
    }

    features = deck_features(cards, [], resources)

    assert features.stax == 2


def test_deck_features_counts_counterspell_role_as_stack_interaction():
    cards = [_card("Force of Will"), _card("Lightning Bolt")]
    roles = [
        {"oracle_id": "Force of Will", "roles": {"counterspell": 1.0}},
        {"oracle_id": "Lightning Bolt", "roles": {"spot_removal": 1.0}},
    ]

    features = deck_features(cards, roles, {})

    assert features.stack_interaction == 1


def test_deck_features_counts_creatures_by_primary_type():
    cards = [
        _card("Grim Monolith", type_line="Artifact"),
        _card("Dockside Extortionist", type_line="Creature — Goblin Pirate"),
    ]

    features = deck_features(cards, [], {})

    assert features.creatures == 1


def test_deck_features_mean_mv_excludes_lands():
    cards = [
        _card("Bolt", cmc=1.0, type_line="Instant"),
        _card("Wrath", cmc=4.0, type_line="Sorcery"),
        _card("Island", cmc=0.0, type_line="Basic Land — Island"),
    ]

    features = deck_features(cards, [], {})

    assert features.nonland_count == 2
    assert features.mean_mv == pytest.approx(2.5)


def test_deck_features_weights_by_quantity():
    """A live deck (unlike the tournament corpus) can carry a real qty > 1 —
    basics, mostly. Every count scales with it."""
    cards = [_card("Island", cmc=0.0, type_line="Basic Land — Island", qty=20)]

    features = deck_features(cards, [], {})

    assert features.creatures == 0
    assert features.nonland_count == 0  # lands never enter the mv average


def test_deck_features_drops_a_role_outside_the_vocabulary():
    """A stale or future tag must not crash the classifier — the same
    defensive filter `interaction.py`/`diagnostics.py`/`cuts.py` each keep
    their own copy of."""
    cards = [_card("Mystery Card")]
    roles = [{"oracle_id": "Mystery Card", "roles": {"counterspell": 1.0, "not_a_real_role": 1.0}}]

    features = deck_features(cards, roles, {})

    assert features.stack_interaction == 1


def test_deck_features_none_for_an_empty_deck():
    assert deck_features([], [], {}) is None


# ---------------------------------------------------------------------------
# classify — the measured rule
# ---------------------------------------------------------------------------


def _features(*, fast_mana=0, stax=0, stack_interaction=0, creatures=0, mean_mv=2.0):
    return DeckFeatures(
        fast_mana=fast_mana,
        stax=stax,
        stack_interaction=stack_interaction,
        creatures=creatures,
        mean_mv=mean_mv,
        nonland_count=60,
    )


def test_classify_stax_needs_low_stack_and_high_stax_count():
    assert classify(_features(stack_interaction=2, stax=12)) == ArchetypeClass.STAX


def test_classify_low_stack_alone_is_not_stax():
    """The goldfish case this task's derivation names: K'rrik (turbo) and
    Etali (midrange) both run almost no stack interaction for reasons that
    have nothing to do with stax. Without the second, independent
    stax-count condition, both would misfire as stax."""
    assert classify(_features(stack_interaction=0, stax=2)) != ArchetypeClass.STAX
    assert classify(_features(stack_interaction=0, stax=2)) == ArchetypeClass.TURBO


def test_classify_high_stack_is_never_stax_regardless_of_stax_count():
    assert classify(_features(stack_interaction=10, stax=20)) != ArchetypeClass.STAX


def test_classify_turbo_is_the_low_stax_count_non_stax_remainder():
    assert classify(_features(stack_interaction=10, stax=4)) == ArchetypeClass.TURBO


def test_classify_midrange_is_the_high_stax_count_non_stax_remainder():
    assert classify(_features(stack_interaction=10, stax=12)) == ArchetypeClass.MIDRANGE


def test_classify_the_gap_between_turbo_and_midrange_is_unclassified():
    """An honest bucket beats a forced one (overview decision 5) — stated
    here as a real numeric gap, not a coin flip at one threshold."""
    assert classify(_features(stack_interaction=10, stax=7.5)) == ArchetypeClass.UNCLASSIFIED


@pytest.mark.parametrize(
    ("stack_interaction", "stax", "expected"),
    [
        (5.0, 6.0, ArchetypeClass.STAX),  # boundary: both at the gate exactly
        (5.1, 9.0, ArchetypeClass.MIDRANGE),  # one tick over on stack -> not stax
        (5.0, 5.9, ArchetypeClass.TURBO),  # one tick under on stax -> not stax
        (0.0, 6.0, ArchetypeClass.STAX),
    ],
)
def test_classify_boundaries_are_inclusive_where_measured(stack_interaction, stax, expected):
    assert classify(_features(stack_interaction=stack_interaction, stax=stax)) == expected


# ---------------------------------------------------------------------------
# confusion_table
# ---------------------------------------------------------------------------


def test_confusion_table_tallies_predictions_against_declared_anchors():
    anchors = {"Commander A": ArchetypeClass.TURBO, "Commander B": ArchetypeClass.STAX}
    predictions = {
        "Commander A": [ArchetypeClass.TURBO, ArchetypeClass.TURBO, ArchetypeClass.MIDRANGE],
        "Commander B": [ArchetypeClass.STAX],
    }

    rows = {row.true_class: row for row in confusion_table(predictions, anchors)}

    turbo_row = rows[ArchetypeClass.TURBO]
    assert turbo_row.total == 3
    assert turbo_row.predicted[ArchetypeClass.TURBO] == 2
    assert turbo_row.predicted[ArchetypeClass.MIDRANGE] == 1
    assert turbo_row.accuracy == pytest.approx(2 / 3)

    stax_row = rows[ArchetypeClass.STAX]
    assert stax_row.total == 1
    assert stax_row.accuracy == pytest.approx(1.0)


def test_confusion_table_row_with_no_decks_has_zero_accuracy_not_a_crash():
    rows = {
        row.true_class: row for row in confusion_table({}, {"Commander A": ArchetypeClass.TURBO})
    }
    assert rows[ArchetypeClass.TURBO].total == 0
    assert rows[ArchetypeClass.TURBO].accuracy == 0.0


# ---------------------------------------------------------------------------
# _basic_land_shortfall and build_deck_sample — the land undercounting fix
# ---------------------------------------------------------------------------


def test_basic_land_shortfall_is_the_gap_to_99():
    assert _basic_land_shortfall(90) == 9
    assert _basic_land_shortfall(99) == 0
    assert _basic_land_shortfall(105) == 0  # never negative


def _meta(cmc, type_line, roles=None, produces=None, layout=None):
    return {
        "cmc": cmc,
        "type_line": type_line,
        "layout": layout,
        "roles": roles or {},
        "produces": produces or set(),
    }


def test_build_deck_sample_folds_the_basic_land_shortfall_into_land_and_mana_sources():
    """A deck resolving 97 of a true 99 cards is short 2 basics — added back
    as `Role.LAND` weight 1.0 and primary type Land, exactly the way a real
    Plains would count, per the module docstring's correction."""
    card_meta = {f"filler-{i}": _meta(2.0, "Sorcery") for i in range(96)}
    card_meta["sol-ring"] = _meta(1.0, "Artifact", roles={"mana_rock": 1.0}, produces={"fast_mana"})
    oracle_ids = [*card_meta.keys()]  # 97 resolved cards -> shortfall of 2

    sample = build_deck_sample("deck-1", "Test Commander", oracle_ids, card_meta)

    assert sample is not None
    assert sample.type_counts["Land"] == pytest.approx(2.0)
    assert sample.bucket_coverage[Bucket.MANA_SOURCES] == pytest.approx(
        2.0 + 1.0
    )  # 2 basics + Sol Ring
    assert sample.archetype == ArchetypeClass.TURBO  # low stack, low stax, per classify()


def test_build_deck_sample_none_when_nothing_resolves():
    assert build_deck_sample("deck-1", "Test Commander", ["missing-a", "missing-b"], {}) is None


def test_build_deck_sample_none_below_the_resolution_floor():
    """`MIN_RESOLVED_FRACTION`'s guard: a deck resolving only a handful of
    its true 99 cards (a join failure, or edhtop16's empty "Unknown
    Commander" stubs) is not a decklist worth classifying or pooling — its
    raw counts would read as near-zero for having little data behind them,
    not because the deck plays that way."""
    card_meta = {f"filler-{i}": _meta(2.0, "Sorcery") for i in range(40)}  # < 49.5

    assert build_deck_sample("deck-1", "Test Commander", list(card_meta), card_meta) is None


def _filled(card_meta: dict, count: int = 50) -> dict:
    """Pad a fixture's card_meta past `MIN_RESOLVED_FRACTION * DECK_SIZE`
    with inert filler, so a test isolating one specific behaviour (a curve
    shape, a land correction) does not also have to clear the resolution
    floor by hand."""
    filled = dict(card_meta)
    for i in range(count):
        filled.setdefault(f"filler-{i}", _meta(2.0, "Sorcery"))
    return filled


def test_build_deck_sample_curve_excludes_land_and_the_correction_card():
    card_meta = _filled(
        {
            "bolt": _meta(1.0, "Instant"),
            "plains-1": _meta(0.0, "Basic Land — Plains"),
        }
    )

    sample = build_deck_sample("deck-1", "Test Commander", list(card_meta), card_meta)

    assert sample.curve_counts[1] == 1  # only "bolt" — every filler is mv 2, "plains-1" is a land
    assert sample.nonland_count == 1 + 50  # bolt + the 50 mv-2 filler sorceries


def test_build_deck_sample_caps_curve_at_six_plus():
    card_meta = _filled({"big": _meta(9.0, "Sorcery")})

    sample = build_deck_sample("deck-1", "Test Commander", list(card_meta), card_meta)

    assert sample.curve_counts[6] == 1
    assert set(sample.curve_counts) == set(CURVE_BUCKETS)


# ---------------------------------------------------------------------------
# _pool_class — the corridor measurement's floor and arithmetic
# ---------------------------------------------------------------------------


def _sample(commander, *, mana_sources=40.0, land=28.0):
    return DeckSample(
        deck_id=f"deck-{commander}-{mana_sources}",
        commander_name=commander,
        features=_features(),
        archetype=ArchetypeClass.TURBO,
        type_counts={"Land": land},
        bucket_coverage={b: (mana_sources if b == Bucket.MANA_SOURCES else 10.0) for b in Bucket},
        curve_counts=dict.fromkeys(CURVE_BUCKETS, 0) | {1: 5, 2: 5},
        nonland_count=10,
    )


def test_pool_class_below_floor_returns_no_numbers():
    samples = [_sample("Only Commander") for _ in range(MIN_DECKS - 1)]

    measurement = _pool_class(ArchetypeClass.TURBO, samples)

    assert measurement.decks == MIN_DECKS - 1
    assert measurement.type_counts is None
    assert measurement.bucket_mean is None
    assert measurement.curve is None


def test_pool_class_below_commander_floor_returns_no_numbers_even_with_enough_decks():
    samples = [_sample("Solo Commander") for _ in range(MIN_DECKS + 10)]

    measurement = _pool_class(ArchetypeClass.TURBO, samples)

    assert measurement.commanders == 1
    assert measurement.commanders < MIN_COMMANDERS
    assert measurement.type_counts is None


def test_pool_class_means_and_sd_and_land_shift_fields():
    samples = (
        [_sample("A", mana_sources=35.0, land=30.0) for _ in range(MIN_DECKS)]
        + [_sample("B", mana_sources=45.0, land=26.0) for _ in range(MIN_DECKS)]
        + [_sample("C", mana_sources=40.0, land=28.0) for _ in range(MIN_DECKS)]
    )

    measurement = _pool_class(ArchetypeClass.STAX, samples)

    assert measurement.decks == 3 * MIN_DECKS
    assert measurement.commanders == 3
    assert measurement.bucket_mean[Bucket.MANA_SOURCES] == pytest.approx(40.0)
    assert measurement.bucket_sd[Bucket.MANA_SOURCES] > 0
    assert measurement.land_mean == pytest.approx(28.0)
    assert measurement.mana_sources_mean == pytest.approx(40.0)
    assert sum(measurement.curve.values()) == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# render_classifier_report — prints only
# ---------------------------------------------------------------------------


def test_render_classifier_report_smoke():
    from deck_lab.cedh_archetypes import ClassifierRun

    samples = [_sample("A", mana_sources=40.0, land=28.0) for _ in range(3)]
    below_floor = _pool_class(ArchetypeClass.TURBO, samples)
    run = ClassifierRun(
        samples=samples,
        measurements={
            ArchetypeClass.TURBO: below_floor,
            ArchetypeClass.MIDRANGE: below_floor,
            ArchetypeClass.STAX: below_floor,
        },
        total_decks=10,
        excluded_no_commander=2,
        excluded_unresolved=1,
    )

    output = render_classifier_report(run)

    assert "10 total decks" in output
    assert "BELOW FLOOR" in output
    assert "anchor confusion table" in output
