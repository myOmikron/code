"""Task H (cEDH Pro round): the answer matrix's canonical cells, the timing
restriction, and the grade — all pure, no live graph. Task I (same round)
extends this with I1's interaction-profile arithmetic, I2's win-through
grade, and I3's local-meta override — same discipline, same file.

The load-bearing tests are the canonical matrix cells the task file names:
`library` folds to `stack`, NOT to graveyard hate — a deck full of Bojuka
Bogs reading "answered" against Thoracle+Consultation is the exact false
comfort this module exists to remove.
"""

from datetime import UTC, datetime

import pytest

from deck_lab import meta as meta_module
from deck_lab.interaction import InteractionCell, InteractionGrid, InteractionRow
from deck_lab.lines import FoldClass, Line
from deck_lab.meta import (
    ANSWER_MATRIX,
    LOCAL_META_MIN_DECKS,
    AnswerGrade,
    GradeStatus,
    InteractionProfileCell,
    MetaThreat,
    MetaThreatTable,
    SceneInteractionProfile,
    ThreatKind,
    _applicable_cells,
    _assemble_commander_threats,
    _assemble_interaction_profile,
    _decay_weight,
    _threat_turn,
    _weighted_percentile,
    grade_deck,
    grade_line_win_through,
    grade_threat,
    resolve_expected_meta,
)

# ---------------------------------------------------------------------------
# fixtures


def _grid(
    *,
    stack: list[str] | None = None,
    proactive: list[str] | None = None,
    permanent: list[str] | None = None,
    hate: dict[str, list[str]] | None = None,
    hate_column: str = "cheap",
) -> InteractionGrid:
    """A grid whose every card sits in the `cheap` column unless stated —
    always in time, so timing tests state their columns explicitly."""

    def row(name: str, cards: list[str] | None, column: str = "cheap") -> InteractionRow:
        cells = {
            col: InteractionCell(
                count=len(cards or []) if col == column else 0,
                cards=list(cards or []) if col == column else [],
            )
            for col in ("free", "cheap", "held_up")
        }
        return InteractionRow(row=name, cells=cells)

    hate_cards = [name for names in (hate or {}).values() for name in names]
    hate_row = row("class_hate", hate_cards, hate_column)
    hate_classes = {k: list(v) for k, v in (hate or {}).items()}
    hate_row = hate_row.model_copy(update={"classes": hate_classes})
    return InteractionGrid(
        rows=[
            row("stack", stack),
            row("proactive_protection", proactive),
            row("permanent_answer", permanent),
            hate_row,
        ]
    )


def _threat(folds: set[FoldClass], *, turn: int = 2) -> MetaThreat:
    return MetaThreat(
        combo_id="t-1",
        kind=ThreatKind.COMBO_LINE,
        cards=("A", "B"),
        produces=("Win the game",),
        mana_value_needed=3,
        threat_turn=turn,
        deck_count=100,
        meta_share=0.25,
        folds_to=frozenset(folds),
    )


# ---------------------------------------------------------------------------
# H2 — the canonical cells


def test_library_folds_to_stack_not_graveyard_hate():
    row = ANSWER_MATRIX[FoldClass.LIBRARY]
    assert row["stack"].grade is AnswerGrade.ANSWERS
    assert row["proactive_protection"].grade is AnswerGrade.ANSWERS
    assert row["permanent_answer"].grade is AnswerGrade.NO
    assert row["class_hate"].grade is AnswerGrade.NO


def test_graveyard_folds_to_its_own_hate_subclass():
    cell = ANSWER_MATRIX[FoldClass.GRAVEYARD]["class_hate"]
    assert cell.grade is AnswerGrade.ANSWERS
    assert cell.class_hate_subclass == "graveyard"


def test_activated_ability_folds_to_ability_hate():
    cell = ANSWER_MATRIX[FoldClass.ACTIVATED_ABILITY]["class_hate"]
    assert cell.grade is AnswerGrade.ANSWERS
    assert cell.class_hate_subclass == "ability"


def test_every_fold_class_has_a_complete_matrix_row():
    """A fold class missing a row would silently grade as unanswerable by
    that row — the matrix is closed over both taxonomies by construction."""
    rows = {"stack", "proactive_protection", "permanent_answer", "class_hate"}
    for fold in FoldClass:
        assert set(ANSWER_MATRIX[fold]) == rows, fold


def test_stronger_fold_never_weakened_by_structural_one():
    """`library` (stack: answers) + `creature_dependent` must keep stack at
    ANSWERS whatever the structural fold's stack cell says."""
    cells = _applicable_cells(frozenset({FoldClass.LIBRARY, FoldClass.CREATURE_DEPENDENT}))
    stack_cells = [cell for (row, _), cell in cells.items() if row == "stack"]
    assert stack_cells and any(c.grade is AnswerGrade.ANSWERS for c in stack_cells)


def test_mechanism_no_vetoes_structural_grant():
    """The Thoracle merge defect, pinned: `library` says permanent_answer NO
    with rules reasoning; `creature_dependent`'s structural PARTIALLY on the
    same row must not resurrect it. Caught live on the dev Kess deck."""
    folds = frozenset({FoldClass.LIBRARY, FoldClass.CREATURE_DEPENDENT, FoldClass.ETB})
    cells = _applicable_cells(folds)
    assert not any(row == "permanent_answer" for (row, _) in cells)


def test_mechanism_folds_do_not_veto_each_other():
    """A line that is genuinely both graveyard and library still dies to
    graveyard hate through its graveyard half — `library`'s class_hate NO
    must not erase `graveyard`'s class_hate:graveyard ANSWERS."""
    cells = _applicable_cells(frozenset({FoldClass.LIBRARY, FoldClass.GRAVEYARD}))
    assert ("class_hate", "graveyard") in cells


# ---------------------------------------------------------------------------
# H3 — grading


def test_gy_hate_only_deck_leaves_thoracle_unanswered():
    """The counter-example the task file demands: a deck holding graveyard
    hate and nothing else grades UNANSWERED against a library-fold threat."""
    grid = _grid(hate={"graveyard": ["Bojuka Bog", "Soul-Guide Lantern"]})
    grade = grade_threat(_threat({FoldClass.LIBRARY, FoldClass.CREATURE_DEPENDENT}), grid)

    assert grade.status is GradeStatus.UNANSWERED
    assert grade.ways == ()


def test_same_deck_answers_a_graveyard_threat():
    grid = _grid(hate={"graveyard": ["Bojuka Bog"]})
    grade = grade_threat(_threat({FoldClass.GRAVEYARD}), grid)

    assert grade.status is GradeStatus.ANSWERED_ONLY_BY
    assert [w.kind for w in grade.ways] == ["class_hate:graveyard"]


def test_two_kinds_read_as_answered():
    grid = _grid(stack=["Swan Song"], hate={"graveyard": ["Bojuka Bog"]})
    grade = grade_threat(_threat({FoldClass.GRAVEYARD}), grid)

    assert grade.status is GradeStatus.ANSWERED
    assert {w.kind for w in grade.ways} == {"stack", "class_hate:graveyard"}


def test_held_up_answers_are_excluded_against_fast_threats():
    """A 2+-mana answer is not an answer to a turn-2 line — it lands in
    `excluded`, visible, not silently dropped."""
    grid = _grid(stack=["Counterspell"], hate={}, hate_column="cheap")
    for row in grid.rows:
        if row.row == "stack":
            row.cells["held_up"] = row.cells.pop("cheap")
            row.cells["cheap"] = InteractionCell()
    fast = grade_threat(_threat({FoldClass.LIBRARY}, turn=2), grid)
    slow = grade_threat(_threat({FoldClass.LIBRARY}, turn=3), grid)

    assert fast.status is GradeStatus.UNANSWERED
    assert [w.cards for w in fast.excluded] == [("Counterspell",)]
    assert slow.status is GradeStatus.ANSWERED_ONLY_BY


def test_ability_hate_does_not_answer_a_graveyard_threat():
    grid = _grid(hate={"ability": ["Cursed Totem"]})
    grade = grade_threat(_threat({FoldClass.GRAVEYARD}), grid)

    assert grade.status is GradeStatus.UNANSWERED


# ---------------------------------------------------------------------------
# grade_deck's None contract


def test_grade_deck_is_none_without_a_grid_or_measurement():
    table = MetaThreatTable(
        scene="testscene",
        measured="2026-09-01",
        window_start="2025-09-01",
        window_end="2026-08-30",
        half_life_days=90.0,
        stale=False,
        decks_scanned=10,
        decks_no_commander=0,
        decks_unknown_commander=0,
        threats=(_threat({FoldClass.LIBRARY}),),
    )
    assert grade_deck("testscene", None, table=table) is None
    assert grade_deck("never-measured", _grid(stack=["Swan Song"])) is None

    report = grade_deck("testscene", _grid(stack=["Swan Song"]), table=table)
    assert report is not None
    assert report.grades[0].status is GradeStatus.ANSWERED_ONLY_BY


# ---------------------------------------------------------------------------
# the two weights


def test_decay_halves_at_one_half_life():
    now = datetime(2026, 9, 1, tzinfo=UTC)
    old = datetime(2026, 6, 3, tzinfo=UTC)  # 90 days earlier
    assert _decay_weight(now, now=now, half_life_days=90.0) == pytest.approx(1.0)
    assert _decay_weight(old, now=now, half_life_days=90.0) == pytest.approx(0.5)


def test_threat_turn_is_a_ceiling_with_a_floor_of_one():
    assert _threat_turn(0, 2.5) == 1
    assert _threat_turn(3, 2.5) == 2
    assert _threat_turn(5, 2.5) == 2
    assert _threat_turn(6, 2.5) == 3


# ---------------------------------------------------------------------------
# I1 — the scene interaction profile
# ---------------------------------------------------------------------------


def test_weighted_percentile_lands_in_the_zero_lump():
    """80% of the weight sits at count=0 — the 10th percentile is already
    inside that lump, so it reads 0, not the first nonzero count."""
    pairs = [(0.0, 80.0), (1.0, 10.0), (3.0, 10.0)]
    assert _weighted_percentile(pairs, 0.10) == 0.0


def test_weighted_percentile_crosses_into_the_next_bucket():
    """5% at 0, 5% at 1 — cumulative weight only reaches 10% once count=1's
    bucket is included, so p10 lands there, not at 0."""
    pairs = [(0.0, 5.0), (1.0, 5.0), (2.0, 90.0)]
    assert _weighted_percentile(pairs, 0.10) == 1.0


def test_weighted_percentile_empty_input_is_zero():
    assert _weighted_percentile([], 0.10) == 0.0


def test_assemble_interaction_profile_weighted_mean_and_per_table():
    now = datetime(2026, 9, 1, tzinfo=UTC)
    # 20 decks total (all fresh, weight 1 each); 20 "free" stack cards seen
    # on that one date -> a mean of exactly 1.0 per deck.
    cell_date_counts = {"stack|free": [{"date": "2026-09-01T00:00:00Z", "n": 20}]}

    profile = _assemble_interaction_profile(
        "testscene",
        decks_scanned=20,
        total_weight=20.0,
        window_start="2026-01-01",
        window_end="2026-09-01T00:00:00Z",
        half_life_days=90.0,
        opponents=3,
        cell_date_counts=cell_date_counts,
        stack_per_deck_counts=[],
        now=now,
    )

    assert len(profile.cells) == 12  # every row x column cell, always populated
    stack_free = next(c for c in profile.cells if c.row == "stack" and c.column == "free")
    assert stack_free.per_deck_mean == pytest.approx(1.0)
    other_cells = [c for c in profile.cells if (c.row, c.column) != ("stack", "free")]
    assert all(c.per_deck_mean == 0.0 for c in other_cells)
    assert profile.row_total("stack") == pytest.approx(1.0)
    assert profile.per_table("stack") == pytest.approx(3.0)  # I1: per_deck x opponents
    assert profile.stale is False


def test_assemble_interaction_profile_stale_when_newest_deck_exceeds_half_life():
    now = datetime(2026, 9, 1, tzinfo=UTC)
    profile = _assemble_interaction_profile(
        "testscene",
        decks_scanned=5,
        total_weight=5.0,
        window_start="2025-01-01",
        window_end="2025-06-01T00:00:00Z",  # well over 90 days before `now`
        half_life_days=90.0,
        opponents=3,
        cell_date_counts={},
        stack_per_deck_counts=[],
        now=now,
    )
    assert profile.stale is True


def test_stack_alarm_floor_reconstructs_the_zero_lump_from_total_weight():
    """Only decks with >=1 stack card are ever fetched (`_stack_per_deck_counts`
    never queries the zero side) — the assembly step has to reconstruct that
    lump's weight from `total_weight` minus the nonzero decks' own weight, or
    the percentile would silently ignore every empty-stack-row deck."""
    now = datetime(2026, 9, 1, tzinfo=UTC)
    # 10 decks total; only 2 show up with n=2 (fresh) -> 8 decks (80% of the
    # weight) are implicitly at zero, so p10 sits at 0.
    stack_counts = [
        {"date": "2026-09-01T00:00:00Z", "n": 2},
        {"date": "2026-09-01T00:00:00Z", "n": 2},
    ]
    profile = _assemble_interaction_profile(
        "testscene",
        decks_scanned=10,
        total_weight=10.0,
        window_start="",
        window_end="",
        half_life_days=90.0,
        opponents=3,
        cell_date_counts={},
        stack_per_deck_counts=stack_counts,
        now=now,
    )
    assert profile.stack_alarm_floor == 0.0


def test_stack_alarm_floor_nonzero_when_almost_every_deck_holds_some():
    now = datetime(2026, 9, 1, tzinfo=UTC)
    stack_counts = [
        {"date": "2026-09-01T00:00:00Z", "n": n} for n in (1, 1, 1, 2, 2, 2, 2, 3, 3, 4)
    ]
    profile = _assemble_interaction_profile(
        "testscene",
        decks_scanned=10,
        total_weight=10.0,
        window_start="",
        window_end="",
        half_life_days=90.0,
        opponents=1,
        cell_date_counts={},
        stack_per_deck_counts=stack_counts,
        now=now,
    )
    assert profile.stack_alarm_floor == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# I2 — the win-through grade
# ---------------------------------------------------------------------------


def _win_grid(
    *,
    stack: dict[str, list[str]] | None = None,
    proactive: dict[str, list[str]] | None = None,
) -> InteractionGrid:
    """A grid for I2 tests: `stack`/`proactive` map cost column -> card
    names, so a test can place a piece in a specific column directly —
    unlike `_grid` above (H3's helper), which puts a whole row in one column
    at a time and is left alone here rather than widened for one caller."""

    def cells_for(by_column: dict[str, list[str]] | None) -> dict[str, InteractionCell]:
        by_column = by_column or {}
        return {
            col: InteractionCell(
                count=len(by_column.get(col, [])), cards=list(by_column.get(col, []))
            )
            for col in ("free", "cheap", "held_up")
        }

    return InteractionGrid(
        rows=[
            InteractionRow(row="stack", cells=cells_for(stack)),
            InteractionRow(row="proactive_protection", cells=cells_for(proactive)),
            InteractionRow(row="permanent_answer", cells=cells_for({})),
            InteractionRow(row="class_hate", cells=cells_for({}), classes={}),
        ]
    )


def _line(*, line_id: str = "line-1", mv: int = 3, complete: bool = True) -> Line:
    return Line(
        id=line_id,
        cards=(),
        mana_needed="{3}",
        mana_value_needed=mv,
        identity=(),
        produces=("Win the game",),
        bracket_tag="",
        popularity=0,
        prereq_easy="",
        prereq_notable="",
        folds_to=frozenset(),
        complete=complete,
        missing=(),
    )


def _profile(
    *,
    stack_free: float = 0.0,
    stack_cheap: float = 0.0,
    stack_held_up: float = 0.0,
    opponents: int = 3,
) -> SceneInteractionProfile:
    return SceneInteractionProfile(
        scene="testscene",
        measured="2026-09-01",
        window_start="",
        window_end="",
        half_life_days=90.0,
        stale=False,
        decks_scanned=100,
        opponents=opponents,
        cells=(
            InteractionProfileCell(row="stack", column="free", per_deck_mean=stack_free),
            InteractionProfileCell(row="stack", column="cheap", per_deck_mean=stack_cheap),
            InteractionProfileCell(row="stack", column="held_up", per_deck_mean=stack_held_up),
        ),
        stack_alarm_floor=0.0,
    )


def test_win_through_free_and_cheap_protection_always_count():
    grid = _win_grid(stack={"free": ["Fierce Guardianship"], "cheap": ["Swan Song"]})
    profile = _profile(stack_free=1.0, stack_cheap=1.0, stack_held_up=2.0)
    line = _line(mv=0)  # turn 1, mana_left = 1*2.5 - 0 = 2.5

    grade = grade_line_win_through(line, grid, "testscene", profile=profile, mana_per_turn=2.5)

    assert grade is not None
    assert grade.protected_count == 2
    assert {w.kind for w in grade.ways} == {"stack"}
    assert grade.excluded == ()
    assert grade.expected_stack == pytest.approx((1.0 + 1.0 + 2.0) * 3)


def test_win_through_held_up_excluded_when_line_leaves_under_two_mana():
    grid = _win_grid(stack={"held_up": ["Cryptic Command"]})
    profile = _profile(stack_held_up=1.0)
    line = _line(mv=5)  # turn = ceil(5/2.5) = 2, mana_left = 2*2.5 - 5 = 0

    grade = grade_line_win_through(line, grid, "testscene", profile=profile, mana_per_turn=2.5)

    assert grade.ways == ()
    assert [w.cards for w in grade.excluded] == [("Cryptic Command",)]
    assert grade.protected_count == 0


def test_win_through_held_up_counts_when_line_leaves_two_or_more_mana():
    grid = _win_grid(stack={"held_up": ["Cryptic Command"]})
    profile = _profile(stack_held_up=1.0)
    line = _line(mv=0)  # turn 1, mana_left = 1*2.5 - 0 = 2.5

    grade = grade_line_win_through(line, grid, "testscene", profile=profile, mana_per_turn=2.5)

    assert [w.cards for w in grade.ways] == [("Cryptic Command",)]
    assert grade.excluded == ()
    assert grade.protected_count == 1


def test_win_through_none_without_grid_profile_or_complete_line():
    grid = _win_grid(stack={"free": ["Swan Song"]})
    profile = _profile(stack_free=1.0)

    assert grade_line_win_through(_line(complete=True), None, "testscene", profile=profile) is None
    assert grade_line_win_through(_line(complete=True), grid, "testscene", profile=None) is None
    assert grade_line_win_through(_line(complete=False), grid, "testscene", profile=profile) is None


def test_win_through_none_when_scene_mana_rate_is_unmeasured():
    grid = _win_grid(stack={"free": ["Swan Song"]})
    profile = _profile(stack_free=1.0)
    assert grade_line_win_through(_line(), grid, "never-measured-scene", profile=profile) is None


def test_win_through_uses_scene_rate_by_default():
    grid = _win_grid(stack={"free": ["Swan Song"]})
    profile = _profile(stack_free=1.0)
    grade = grade_line_win_through(_line(mv=0), grid, "cedh", profile=profile)
    assert grade is not None
    assert grade.line_turn == 1


# ---------------------------------------------------------------------------
# I3 — the local-meta override
# ---------------------------------------------------------------------------


def _base_table_for_resolve() -> MetaThreatTable:
    return MetaThreatTable(
        scene="testscene",
        measured="2026-09-01",
        window_start="2025-01-01",
        window_end="2026-09-01T00:00:00Z",
        half_life_days=90.0,
        stale=False,
        decks_scanned=1000,
        decks_no_commander=0,
        decks_unknown_commander=0,
        threats=(_threat({FoldClass.LIBRARY}, turn=2),),
    )


def test_assemble_commander_threats_recomputes_share_against_the_named_pool():
    now = datetime(2026, 9, 1, tzinfo=UTC)
    base = _base_table_for_resolve()
    threat_counts = {
        "t-1": {"date_counts": [{"date": "2026-09-01T00:00:00Z", "n": 40}], "deck_count": 40}
    }

    table = _assemble_commander_threats(
        base, threat_counts, deck_count=40, total_weight=40.0, now=now
    )

    assert table.decks_scanned == 40
    assert table.threats[0].deck_count == 40
    assert table.threats[0].meta_share == pytest.approx(1.0)
    # Combo facts (cards, fold classes, cost) are untouched — only the
    # deck-population-derived numbers were recomputed.
    assert table.threats[0].cards == base.threats[0].cards
    assert table.threats[0].folds_to == base.threats[0].folds_to


def test_assemble_commander_threats_zero_for_a_combo_the_pool_never_holds():
    now = datetime(2026, 9, 1, tzinfo=UTC)
    base = _base_table_for_resolve()

    table = _assemble_commander_threats(base, {}, deck_count=40, total_weight=40.0, now=now)

    assert table.threats[0].deck_count == 0
    assert table.threats[0].meta_share == 0.0


def test_resolve_expected_meta_with_no_names_is_scene_pooled(monkeypatch):
    base_table = _base_table_for_resolve()
    monkeypatch.setitem(meta_module.MEASURED_THREATS, "testscene", base_table)

    context = resolve_expected_meta("testscene", [])

    assert context.used_fallback is True
    assert context.source == "scene"
    assert context.threats is base_table


def test_resolve_expected_meta_fallback_floor_fires_for_a_fringe_commander(monkeypatch):
    """The Verify section's required proof: a commander with fewer than
    `LOCAL_META_MIN_DECKS` tournament decks falls back to the scene-pooled
    meta, and the response says so."""
    base_table = _base_table_for_resolve()
    monkeypatch.setitem(meta_module.MEASURED_THREATS, "testscene", base_table)
    monkeypatch.setattr(
        meta_module, "_commander_deck_dates", lambda scene, names: ["2026-01-01"] * 5
    )

    context = resolve_expected_meta("testscene", ["Some Fringe Brewer"])

    assert context.used_fallback is True
    assert context.deck_count == 5
    assert "5 tournament deck" in context.source
    assert str(LOCAL_META_MIN_DECKS) in context.source
    assert context.threats is base_table


def test_resolve_expected_meta_clears_the_floor_and_recomputes(monkeypatch):
    base_table = _base_table_for_resolve()
    monkeypatch.setitem(meta_module.MEASURED_THREATS, "testscene", base_table)
    monkeypatch.setattr(
        meta_module, "_commander_deck_dates", lambda scene, names: ["2026-09-01T00:00:00Z"] * 50
    )
    monkeypatch.setattr(
        meta_module,
        "_commander_threat_counts",
        lambda scene, combo_ids, names: {
            "t-1": {"date_counts": [{"date": "2026-09-01T00:00:00Z", "n": 50}], "deck_count": 50}
        },
    )

    context = resolve_expected_meta(
        "testscene",
        ["Kraum, Ludevic's Opus / Tymna the Weaver"],
        now=datetime(2026, 9, 1, tzinfo=UTC),
    )

    assert context.used_fallback is False
    assert context.deck_count == 50
    assert context.threats is not None
    assert context.threats.decks_scanned == 50
    assert context.threats.threats[0].meta_share == pytest.approx(1.0)
    assert context.profile is None  # no scene profile measured in this test
    assert "50 tournament decks" in context.source


def test_resolve_expected_meta_falls_back_when_scene_itself_is_unmeasured(monkeypatch):
    monkeypatch.setattr(
        meta_module, "_commander_deck_dates", lambda scene, names: ["2026-01-01"] * 50
    )
    context = resolve_expected_meta("never-measured-scene", ["Some Commander"])
    assert context.used_fallback is True
    assert context.threats is None
    assert context.deck_count == 50
