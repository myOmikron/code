"""Task K (cEDH Pro round): the axis measurement's pure functions, and the
one bug the live Kess check surfaced during implementation — `position_for_
deck` once compared the K2 map axis (`grid_total`) against a floor measured
in a *different* class-specific currency (`stack_plus_proactive` for turbo/
midrange). `test_position_for_deck_below_floor_uses_class_currency_not_map_
axis` pins the fix: a deck with a high `grid_total` but a currency value
under its own class's floor must still alarm.

Everything here is pure — `no_live_graph` (conftest.py) fails anything that
reaches for Neo4j without a stub, and nothing here needs one: every
`_fetch_*`/`_prove_*` function in `cedh_axes.py` is a thin `driver()`
wrapper, tested only by inspection of its query text (`interaction.py`'s own
fetch/assemble split, followed here too).
"""

from __future__ import annotations

from datetime import UTC, datetime

from deck_lab.cedh_archetypes import ArchetypeClass, DeckFeatures
from deck_lab.cedh_axes import (
    CHOSEN_AXES,
    INTERACTION_FLOOR_BY_CLASS,
    AxisPairScore,
    ChosenAxes,
    DeckAxisPoint,
    _combo_speed_value,
    _deck_min_turns,
    build_axes_map,
    class_interaction_floors,
    min_deploy_turn,
    position_for_deck,
    score_axis_pair,
    select_axes,
    separates_turbo_midrange,
)
from deck_lab.interaction import InteractionCell, InteractionGrid, InteractionRow
from deck_lab.lines import Line, PieceInfo

# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------


def _point(
    deck_id: str,
    commander_name: str,
    archetype: ArchetypeClass,
    *,
    weight: float = 1.0,
    fast_mana: int = 0,
    mean_mv: float = 2.0,
    min_deploy_turn: int | None = 1,
    stack: int = 0,
    proactive: int = 0,
    permanent: int = 0,
    class_hate: int = 0,
) -> DeckAxisPoint:
    return DeckAxisPoint(
        deck_id=deck_id,
        commander_name=commander_name,
        archetype=archetype,
        weight=weight,
        fast_mana=fast_mana,
        mean_mv=mean_mv,
        min_deploy_turn=min_deploy_turn,
        stack=stack,
        proactive=proactive,
        permanent=permanent,
        class_hate=class_hate,
    )


def _line(*, complete: bool, mana_value_needed: int, deploy_cost: int) -> Line:
    return Line(
        id="line",
        cards=(),
        mana_needed="",
        mana_value_needed=mana_value_needed,
        deploy_cost=deploy_cost,
        deploy_cost_partial=False,
        identity=(),
        produces=(),
        bracket_tag="",
        popularity=0,
        prereq_easy="",
        prereq_notable="",
        folds_to=frozenset(),
        complete=complete,
        missing=(),
    )


def _grid(*, stack=0, proactive=0, permanent=0, class_hate=0) -> InteractionGrid:
    def row(name: str, count: int) -> InteractionRow:
        return InteractionRow(
            row=name,
            cells={
                "free": InteractionCell(),
                "cheap": InteractionCell(count=count, cards=["x"] * count),
                "held_up": InteractionCell(),
            },
        )

    return InteractionGrid(
        rows=[
            row("stack", stack),
            row("proactive_protection", proactive),
            row("permanent_answer", permanent),
            row("class_hate", class_hate),
        ]
    )


# ---------------------------------------------------------------------------
# K1 — speed value / min_deploy_turn
# ---------------------------------------------------------------------------


def test_min_deploy_turn_uses_deploy_cost_when_the_field_exists():
    """`deploy_cost` has landed (Task J) on the live `lines.Line`, so this
    reads it directly rather than the `mana_value_needed` fallback —
    `mana_value_needed=0` alone would floor at turn 1; `deploy_cost=6`
    should not."""
    line = _line(complete=True, mana_value_needed=0, deploy_cost=6)
    assert min_deploy_turn([line], mana_per_turn=2.5) == 3


def test_min_deploy_turn_ignores_incomplete_lines():
    complete = _line(complete=True, mana_value_needed=0, deploy_cost=10)
    incomplete = _line(complete=False, mana_value_needed=0, deploy_cost=0)
    assert min_deploy_turn([incomplete, complete], mana_per_turn=2.5) == 4


def test_min_deploy_turn_none_when_no_complete_line():
    """K1: a deck with no complete line is counted, never imputed."""
    incomplete = _line(complete=False, mana_value_needed=0, deploy_cost=0)
    assert min_deploy_turn([incomplete], mana_per_turn=2.5) is None
    assert min_deploy_turn([], mana_per_turn=2.5) is None


def test_min_deploy_turn_takes_the_minimum_over_several_complete_lines():
    fast = _line(complete=True, mana_value_needed=0, deploy_cost=2)
    slow = _line(complete=True, mana_value_needed=0, deploy_cost=10)
    assert min_deploy_turn([slow, fast], mana_per_turn=2.5) == 1


def test_combo_speed_value_falls_back_to_mana_value_needed_when_pieces_empty():
    """`_assemble_threat_table`'s own degrade, mirrored: a combo
    `_combo_pieces` returned nothing for still gets a turn, from
    `mana_value_needed` alone, rather than being dropped."""
    assert _combo_speed_value(4, []) == 4


def test_combo_speed_value_adds_battlefield_and_commander_pieces():
    pieces = [
        PieceInfo(
            name="A",
            type_line="",
            oracle_text="",
            zones=("B",),
            produces=frozenset(),
            cares_about=frozenset(),
            cmc=3.0,
        ),
        PieceInfo(
            name="B",
            type_line="",
            oracle_text="",
            zones=("H",),
            produces=frozenset(),
            cares_about=frozenset(),
            cmc=5.0,
        ),
    ]
    # mv=0 (Spellbook's own execution cost) + the B-zone piece's cmc (3) —
    # the H-zone piece is already inside `mv` and must not be added again.
    assert _combo_speed_value(0, pieces) == 3


def test_deck_min_turns_takes_the_cheapest_combo_a_deck_completes():
    pairs = [("combo-slow", "deck-1"), ("combo-fast", "deck-1"), ("combo-slow", "deck-2")]
    turns = {"combo-slow": 5, "combo-fast": 1}
    result = _deck_min_turns(pairs, turns)
    assert result == {"deck-1": 1, "deck-2": 5}


def test_deck_min_turns_skips_a_combo_with_no_resolved_turn():
    result = _deck_min_turns([("unresolved", "deck-1")], {})
    assert "deck-1" not in result


# ---------------------------------------------------------------------------
# K2 — axis selection
# ---------------------------------------------------------------------------


def test_score_axis_pair_perfectly_separable_classes_score_1_0():
    anchors = {"T": ArchetypeClass.TURBO, "M": ArchetypeClass.MIDRANGE, "S": ArchetypeClass.STAX}
    points = [
        _point("d1", "T", ArchetypeClass.TURBO, fast_mana=1, stack=1, class_hate=1),
        _point("d2", "T", ArchetypeClass.TURBO, fast_mana=1, stack=1, class_hate=1),
        _point("d3", "M", ArchetypeClass.MIDRANGE, fast_mana=10, stack=10, class_hate=10),
        _point("d4", "M", ArchetypeClass.MIDRANGE, fast_mana=10, stack=10, class_hate=10),
        _point("d5", "S", ArchetypeClass.STAX, fast_mana=1, stack=20, class_hate=1),
        _point("d6", "S", ArchetypeClass.STAX, fast_mana=1, stack=20, class_hate=1),
    ]
    score = score_axis_pair(points, "fast_mana", "grid_total", anchors=anchors)
    assert score.overall_share == 1.0
    assert score.shares_by_class == {
        ArchetypeClass.TURBO: 1.0,
        ArchetypeClass.MIDRANGE: 1.0,
        ArchetypeClass.STAX: 1.0,
    }
    assert score.n_excluded_no_speed == 0


def test_score_axis_pair_excludes_decks_with_no_speed_value_and_counts_them():
    anchors = {"T": ArchetypeClass.TURBO}
    points = [
        _point("d1", "T", ArchetypeClass.TURBO, min_deploy_turn=None),
        _point("d2", "T", ArchetypeClass.TURBO, min_deploy_turn=2),
    ]
    score = score_axis_pair(points, "min_deploy_turn", "stack", anchors=anchors)
    assert score.n_scored == 1
    assert score.n_excluded_no_speed == 1


def test_score_axis_pair_ignores_decks_not_in_the_anchor_map():
    anchors = {"Known": ArchetypeClass.TURBO}
    points = [_point("d1", "Unknown Brew", ArchetypeClass.TURBO)]
    score = score_axis_pair(points, "fast_mana", "stack", anchors=anchors)
    assert score.n_scored == 0
    assert score.shares_by_class == {}


def test_select_axes_picks_the_pair_with_the_best_worst_class_share():
    anchors = {
        "T1": ArchetypeClass.TURBO,
        "T2": ArchetypeClass.TURBO,
        "M1": ArchetypeClass.MIDRANGE,
        "M2": ArchetypeClass.MIDRANGE,
        "S1": ArchetypeClass.STAX,
        "S2": ArchetypeClass.STAX,
    }
    # `mean_mv` and every interaction candidate are constant across every
    # deck (mean_mv=5, all four rows 0) — only `fast_mana` actually varies
    # by class, so it is the only speed candidate that can separate anything
    # (min_deploy_turn is likewise held constant at 1).
    points = [
        _point("t1", "T1", ArchetypeClass.TURBO, fast_mana=1, mean_mv=5),
        _point("t2", "T2", ArchetypeClass.TURBO, fast_mana=1, mean_mv=5),
        _point("m1", "M1", ArchetypeClass.MIDRANGE, fast_mana=5, mean_mv=5),
        _point("m2", "M2", ArchetypeClass.MIDRANGE, fast_mana=5, mean_mv=5),
        _point("s1", "S1", ArchetypeClass.STAX, fast_mana=9, mean_mv=5),
        _point("s2", "S2", ArchetypeClass.STAX, fast_mana=9, mean_mv=5),
    ]
    chosen, scores = select_axes(points, anchors=anchors)
    assert len(scores) == 9  # 3 speed candidates x 3 interaction candidates
    assert chosen.speed == "fast_mana"
    assert chosen.worst_class_share == 1.0


def test_separates_turbo_midrange_requires_a_majority_of_both_classes():
    good = AxisPairScore(
        speed="s",
        interaction="i",
        n_scored=10,
        n_excluded_no_speed=0,
        shares_by_class={ArchetypeClass.TURBO: 0.6, ArchetypeClass.MIDRANGE: 0.5},
        overall_share=0.55,
        turbo_as_midrange=0,
        midrange_as_turbo=0,
    )
    bad = AxisPairScore(
        speed="s",
        interaction="i",
        n_scored=10,
        n_excluded_no_speed=0,
        shares_by_class={ArchetypeClass.TURBO: 0.6, ArchetypeClass.MIDRANGE: 0.4},
        overall_share=0.5,
        turbo_as_midrange=0,
        midrange_as_turbo=0,
    )
    assert separates_turbo_midrange(good)
    assert not separates_turbo_midrange(bad)


# ---------------------------------------------------------------------------
# K3 — class-conditioned floors
# ---------------------------------------------------------------------------


def test_class_interaction_floors_use_each_classs_own_currency():
    """Turbo/midrange read `stack_plus_proactive`; stax reads
    `permanent_plus_hate` — a turbo deck's `permanent`/`class_hate` counts
    must never move its own floor."""
    points = [
        _point("d1", "T1", ArchetypeClass.TURBO, stack=2, proactive=0, permanent=99, class_hate=99),
        _point("d2", "T2", ArchetypeClass.TURBO, stack=4, proactive=0, permanent=0, class_hate=0),
        _point("s1", "S1", ArchetypeClass.STAX, stack=0, proactive=0, permanent=10, class_hate=2),
        _point("s2", "S2", ArchetypeClass.STAX, stack=99, proactive=99, permanent=20, class_hate=4),
    ]
    floors = class_interaction_floors(points, q=0.5)
    turbo_floor, turbo_n = floors[ArchetypeClass.TURBO]
    stax_floor, stax_n = floors[ArchetypeClass.STAX]
    assert turbo_n == 2
    assert turbo_floor in (2.0, 4.0)  # median of {2, 4}, ignoring the huge permanent/class_hate
    assert stax_n == 2
    assert stax_floor in (12.0, 24.0)  # median of {10+2, 20+4}, ignoring the huge stack/proactive


def test_class_interaction_floors_skip_classes_with_no_decks():
    floors = class_interaction_floors([_point("d1", "T", ArchetypeClass.TURBO)])
    assert ArchetypeClass.MIDRANGE not in floors
    assert ArchetypeClass.STAX not in floors


# ---------------------------------------------------------------------------
# K4 — the density map
# ---------------------------------------------------------------------------


def test_build_axes_map_bins_and_centroids():
    points = [
        _point("d1", "T", ArchetypeClass.TURBO, fast_mana=0, stack=0),
        _point("d2", "T", ArchetypeClass.TURBO, fast_mana=10, stack=10),
    ]
    axes_map = build_axes_map(
        points,
        scene="cedh",
        speed_axis="fast_mana",
        interaction_axis="stack",
        bins_per_axis=2,
        now=datetime.now(UTC),
    )
    assert axes_map.speed_range == (0.0, 10.0)
    assert axes_map.interaction_range == (0.0, 10.0)
    assert len(axes_map.density) == 2  # the two decks land in different bins
    (centroid,) = axes_map.centroids
    assert centroid.archetype is ArchetypeClass.TURBO
    assert centroid.speed == 5.0
    assert centroid.interaction == 5.0
    assert centroid.decks == 2


def test_build_axes_map_excludes_unclassified_and_no_speed_decks():
    points = [
        _point("d1", "U", ArchetypeClass.UNCLASSIFIED, fast_mana=5),
        _point("d2", "T", ArchetypeClass.TURBO, min_deploy_turn=None),
    ]
    axes_map = build_axes_map(
        points,
        scene="cedh",
        speed_axis="min_deploy_turn",
        interaction_axis="stack",
        now=datetime.now(UTC),
    )
    assert axes_map.density == ()
    assert axes_map.centroids == ()
    assert axes_map.excluded_no_speed == 1  # the unclassified deck never entered that count


# ---------------------------------------------------------------------------
# The per-request position (K4's sibling) — including the below_floor fix
# ---------------------------------------------------------------------------


def test_position_for_deck_none_when_axes_not_landed():
    """No `CHOSEN_AXES` entry for this scene at all — never crash, never
    guess a default."""
    assert (
        position_for_deck(
            "no-such-scene",
            archetype=ArchetypeClass.TURBO,
            features=DeckFeatures(
                fast_mana=0, stax=0, stack_interaction=0, creatures=0, mean_mv=0.0, nonland_count=0
            ),
            interaction_grid=_grid(),
        )
        is None
    )


def test_position_for_deck_none_without_an_interaction_grid(monkeypatch):
    monkeypatch.setitem(
        CHOSEN_AXES,
        "test-scene",
        ChosenAxes(
            speed="fast_mana",
            interaction="grid_total",
            separates_turbo_midrange=True,
            speed_source="deploy_cost",
            measured="2026-01-01",
        ),
    )
    features = DeckFeatures(
        fast_mana=0, stax=0, stack_interaction=0, creatures=0, mean_mv=0.0, nonland_count=0
    )
    assert (
        position_for_deck(
            "test-scene", archetype=ArchetypeClass.TURBO, features=features, interaction_grid=None
        )
        is None
    )


def test_position_for_deck_below_floor_uses_class_currency_not_map_axis(monkeypatch):
    """Pins the bug the live Kess check surfaced: `grid_total` (the K2 map
    axis) can be large while turbo's own `stack_plus_proactive` currency
    sits under the floor — `below_floor` must read the latter, not the
    former. Before the fix, comparing `floor` (measured in
    `stack_plus_proactive` units) against `grid_total` meant a deck's
    `permanent_answer`/`class_hate` cards could mask a real stack/
    proactive_protection shortfall."""
    monkeypatch.setitem(
        CHOSEN_AXES,
        "test-scene",
        ChosenAxes(
            speed="fast_mana",
            interaction="grid_total",
            separates_turbo_midrange=True,
            speed_source="deploy_cost",
            measured="2026-01-01",
        ),
    )
    monkeypatch.setitem(INTERACTION_FLOOR_BY_CLASS, "test-scene", {ArchetypeClass.TURBO: 5.0})
    features = DeckFeatures(
        fast_mana=3, stax=0, stack_interaction=0, creatures=0, mean_mv=2.0, nonland_count=40
    )
    # stack=0, proactive=0 -> currency (stack_plus_proactive) = 0, well under
    # the floor of 5 — but permanent/class_hate are large, so grid_total=40
    # is nowhere near the floor. A position that compared grid_total against
    # the floor would wrongly read `below_floor=False`.
    grid = _grid(stack=0, proactive=0, permanent=30, class_hate=10)

    position = position_for_deck(
        "test-scene", archetype=ArchetypeClass.TURBO, features=features, interaction_grid=grid
    )

    assert position.interaction == 40.0  # grid_total, the map axis, unaffected
    assert position.floor == 5.0
    assert position.below_floor is True


def test_position_for_deck_unclassified_gets_no_floor_and_says_why(monkeypatch):
    monkeypatch.setitem(
        CHOSEN_AXES,
        "test-scene",
        ChosenAxes(
            speed="mean_mv",
            interaction="stack",
            separates_turbo_midrange=False,
            speed_source="deploy_cost",
            measured="2026-01-01",
        ),
    )
    monkeypatch.setitem(INTERACTION_FLOOR_BY_CLASS, "test-scene", {ArchetypeClass.TURBO: 5.0})
    features = DeckFeatures(
        fast_mana=0, stax=0, stack_interaction=0, creatures=0, mean_mv=2.0, nonland_count=10
    )

    position = position_for_deck(
        "test-scene",
        archetype=ArchetypeClass.UNCLASSIFIED,
        features=features,
        interaction_grid=_grid(stack=3),
    )

    assert position.floor is None
    assert position.below_floor is None
    assert "unclassified" in position.note


def test_position_for_deck_speed_none_when_min_deploy_turn_axis_and_no_complete_line(monkeypatch):
    monkeypatch.setitem(
        CHOSEN_AXES,
        "test-scene",
        ChosenAxes(
            speed="min_deploy_turn",
            interaction="grid_total",
            separates_turbo_midrange=True,
            speed_source="deploy_cost",
            measured="2026-01-01",
        ),
    )
    features = DeckFeatures(
        fast_mana=5, stax=0, stack_interaction=0, creatures=0, mean_mv=2.0, nonland_count=40
    )

    position = position_for_deck(
        "test-scene",
        archetype=ArchetypeClass.TURBO,
        features=features,
        interaction_grid=_grid(),
        lines_=[_line(complete=False, mana_value_needed=0, deploy_cost=0)],
    )

    assert position.speed is None
    assert position.speed_axis == "min_deploy_turn"
