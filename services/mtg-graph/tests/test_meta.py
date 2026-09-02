"""Task H (cEDH Pro round): the answer matrix's canonical cells, the timing
restriction, and the grade — all pure, no live graph.

The load-bearing tests are the canonical matrix cells the task file names:
`library` folds to `stack`, NOT to graveyard hate — a deck full of Bojuka
Bogs reading "answered" against Thoracle+Consultation is the exact false
comfort this module exists to remove.
"""

from datetime import UTC, datetime

import pytest

from deck_lab.interaction import InteractionCell, InteractionGrid, InteractionRow
from deck_lab.lines import FoldClass
from deck_lab.meta import (
    ANSWER_MATRIX,
    AnswerGrade,
    GradeStatus,
    MetaThreat,
    MetaThreatTable,
    ThreatKind,
    _applicable_cells,
    _decay_weight,
    _threat_turn,
    grade_deck,
    grade_threat,
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
