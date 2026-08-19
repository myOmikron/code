"""Pipeline ordering.

The order of the semantic build is load-bearing and silently wrong when
permuted — reordering `structural` before `rules` reintroduces
fetchlands-as-ramp, and nothing else asserts against it. These tests are the
only thing standing between a plausible-looking reorder and a wrong graph.
"""

from __future__ import annotations

from deck_lab.pipeline import Step, build_steps, run_build

EXPECTED_ORDER = [
    "clear",
    "tagger",
    "rules",
    "hierarchy",
    "structural",
    "typal",
    "themes",
    "payoff",
]


def _names() -> list[str]:
    return [step.name for step in build_steps()]


def test_pipeline_order_is_exact():
    assert _names() == EXPECTED_ORDER


def test_clear_runs_first():
    """MERGE is additive; anything before the clear would be wiped."""
    assert _names()[0] == "clear"


def test_payoff_runs_last():
    """Payoff only fires on cards with no other role, so any later step
    that adds a role would change its input after the fact."""
    assert _names()[-1] == "payoff"


def test_structural_runs_after_rules():
    """Structural corrections delete ramp roles that inference put on lands.
    Running them first means a rule re-adds the role afterwards."""
    names = _names()
    assert names.index("structural") > names.index("rules")


def test_rules_run_after_tagger():
    """FILLS_ROLE takes the max, so a rule can raise a weight Tagger set lower
    — but only if it runs second."""
    names = _names()
    assert names.index("rules") > names.index("tagger")


def test_hierarchy_precedes_anything_that_traverses_it():
    names = _names()
    assert names.index("hierarchy") < names.index("payoff")


def test_themes_run_after_everything_that_feeds_them():
    """Theme fit is scored over the finished resource layer, typal included."""
    names = _names()
    assert names.index("themes") > names.index("typal")
    assert names.index("themes") > names.index("rules")


def test_every_step_documents_why_it_sits_where_it_does():
    for step in build_steps():
        assert step.why.strip(), step.name


def test_step_names_are_unique():
    names = _names()
    assert len(set(names)) == len(names)


def test_run_build_executes_in_order():
    calls: list[str] = []
    steps = [
        Step("first", lambda: calls.append("first"), "why"),
        Step("second", lambda: calls.append("second"), "why"),
    ]

    run_build(steps)

    assert calls == ["first", "second"]


def test_run_build_returns_each_step_result():
    steps = [Step("a", lambda: 1, "why"), Step("b", lambda: 2, "why")]
    assert run_build(steps) == {"a": 1, "b": 2}
