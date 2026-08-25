"""The start-up corpus load. Pure — the state is handed in, no graph, no network.

What these guard is the *skipping*, because that is the half that can be wrong
without anything failing: skip too eagerly and the advisor serves a half-loaded
graph, which shows up as role coverage reading 0 rather than as an error.
"""

from __future__ import annotations

import pytest

from deck_lab.bootstrap import Outcome, State, Step, bootstrap, build_steps

EXPECTED_ORDER = ["cards", "tags", "semantics", "combos"]

FULL = State(cards=31_600, taggings=400_000, role_edges=90_000, combos=30_000)


def _recording(*, failing: str | None = None) -> tuple[list[Step], list[str]]:
    """The real step list with its work replaced by a recorder."""
    ran: list[str] = []

    def runner(name: str):
        def run() -> None:
            ran.append(name)
            if name == failing:
                raise RuntimeError(f"{name} exploded")

        return run

    steps = [
        Step(step.name, runner(step.name), step.present, step.why, step.derived_from)
        for step in build_steps()
    ]
    return steps, ran


def _run(state: State, *, failing: str | None = None, force: bool = False) -> list[str]:
    """Which steps actually did work, in order."""
    steps, ran = _recording(failing=failing)
    bootstrap(steps=steps, state=state, force=force)
    return ran


# --- the order ------------------------------------------------------------


def test_step_order_is_exact():
    """Tags before semantics or the build has only its regex layer to read;
    cards before everything, since the rest writes edges between them."""
    assert [step.name for step in build_steps()] == EXPECTED_ORDER


# --- skipping -------------------------------------------------------------


def test_loaded_graph_runs_nothing():
    """The whole point: a restart costs four counting queries, not a re-ingest."""
    assert _run(FULL) == []


def test_empty_graph_runs_everything():
    assert _run(State()) == EXPECTED_ORDER


def test_missing_tags_rebuild_the_semantics():
    """The half-state that looks done. `rules` writes FILLS_ROLE edges without
    any tags, so a graph with roles but no taggings has a rules-only semantic
    layer — skipping the rebuild there leaves the coverage permanently short."""
    state = State(cards=FULL.cards, taggings=0, role_edges=FULL.role_edges, combos=FULL.combos)
    assert _run(state) == ["tags", "semantics"]


def test_reingested_cards_relink_the_combos():
    """Combo nodes survive a card wipe; the USES edges between them do not."""
    state = State(cards=0, taggings=FULL.taggings, role_edges=FULL.role_edges, combos=FULL.combos)
    assert _run(state) == ["cards", "semantics", "combos"]


def test_force_ignores_what_is_there():
    assert _run(FULL, force=True) == EXPECTED_ORDER


# --- failure --------------------------------------------------------------


def test_failure_stops_the_rest():
    """A semantic build over a corpus that never downloaded would write a
    wrong graph — and one that counts as bootstrapped on the next start."""
    assert _run(State(), failing="cards") == ["cards"]


def test_failure_is_reported_not_raised():
    steps, _ = _recording(failing="tags")
    outcomes = bootstrap(steps=steps, state=State())
    assert [(o.step, o.ran, bool(o.error)) for o in outcomes] == [
        ("cards", True, False),
        ("tags", False, True),
    ]


def test_every_skip_is_reported_with_its_count():
    steps, _ = _recording()
    outcomes = bootstrap(steps=steps, state=FULL)
    assert [o.step for o in outcomes] == EXPECTED_ORDER
    assert outcomes[0] == Outcome("cards", False, "31,600 already in the graph")
    assert all(not o.ran and not o.error for o in outcomes)


def test_unreachable_graph_reports_instead_of_raising(monkeypatch):
    """A boot against a Neo4j that is not answering yet has to stay a log line:
    the entrypoint runs this before uvicorn, and a traceback there reads as a
    broken image rather than a database that was not up."""
    from deck_lab import bootstrap as module

    def explode() -> dict[str, int]:
        raise RuntimeError("Failed to DNS resolve address nowhere:7687")

    monkeypatch.setattr("deck_lab.graph.bootstrap_state", explode)
    outcomes = module.bootstrap(steps=_recording()[0])

    assert [(o.step, o.ran) for o in outcomes] == [("graph", False)]
    assert "nowhere:7687" in outcomes[0].error


@pytest.mark.parametrize("name", EXPECTED_ORDER)
def test_every_step_says_why_it_exists(name):
    """`why` is what the log line carries when a step runs, and the only
    explanation anyone watching a slow first boot gets."""
    step = next(s for s in build_steps() if s.name == name)
    assert step.why.endswith(".")
