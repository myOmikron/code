"""The semantic build pipeline — an ordered sequence, not a bag of steps.

The order is load-bearing and every dependency here is real:

1. `clear`       MERGE is additive, so a retired mapping would otherwise leave
                 its edges in the graph permanently.
2. `tagger`      Curated ontology, the broadest source.
3. `rules`       Deterministic regex layer. Runs *after* Tagger so a rule can
                 raise a role weight Tagger set lower (FILLS_ROLE takes the max).
4. `hierarchy`   BROADER edges. Independent of the above, but must exist before
                 anything traverses them.
5. `structural`  Exact facts from the card itself, overriding inference. Must
                 run *after* rules, because it deletes ramp roles that Tagger or
                 a rule may have added to a land.
6. `typal`       Creature types are their own axis, extracted with Python regex.
7. `typal_bridge` A structural correction that reads the `IS_TYPE` edges `typal`
                 just wrote, so it cannot run inside `structural` (step 5) —
                 on a fresh build that step sees zero `IS_TYPE` edges, and on a
                 rebuild it sees the *previous* run's, so run 1 and run 2 of the
                 same corpus disagreed. Must sit between `typal` and `themes`.
8. `themes`      Needs the full resource layer, typal and its bridge included,
                 to score against.
9. `payoff`      Must run **last**: it only fires on cards that ended up with no
                 other role, so any step that adds a role changes its input.

Encoding this as data rather than a function body means the order is visible,
testable, and cannot be quietly permuted — reordering `structural` before
`rules` silently reintroduces fetchlands-as-ramp, and no assertion elsewhere
would notice.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import structlog

log = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class Step:
    name: str
    run: Callable[[], object]
    why: str


def build_steps() -> list[Step]:
    """The pipeline, in dependency order."""
    from .graph import (
        apply_rules,
        apply_structural_corrections,
        apply_typal_bridge,
        build_resource_hierarchy,
        build_semantics,
        clear_semantics,
        derive_payoff_role,
    )
    from .rules import RULES
    from .tag_mapping import DERIVE_PAYOFF_WEIGHT, MAPPINGS
    from .themes import build_theme_edges
    from .typal import build_typal_edges as build_typal
    from .vocabulary import RESOURCE_PARENTS

    return [
        Step(
            "clear",
            clear_semantics,
            "MERGE is additive; a retired mapping would leave its edges forever.",
        ),
        Step(
            "tagger",
            lambda: build_semantics(MAPPINGS, clear=False),
            "Curated ontology — the broadest source.",
        ),
        Step(
            "rules",
            lambda: apply_rules(RULES),
            "After Tagger, so a rule can raise a weight Tagger set lower.",
        ),
        Step(
            "hierarchy",
            lambda: build_resource_hierarchy(RESOURCE_PARENTS),
            "BROADER edges must exist before anything traverses them.",
        ),
        Step(
            "structural",
            apply_structural_corrections,
            "After rules: deletes ramp roles that inference put on lands.",
        ),
        Step(
            "typal",
            build_typal,
            "Creature types are their own axis; needs Python regex, not Cypher.",
        ),
        Step(
            "typal_bridge",
            apply_typal_bridge,
            "Reads the IS_TYPE edges the typal step just wrote; before the split it ran "
            "in the structural step and saw the previous build's edges — or none on the "
            "first build.",
        ),
        Step(
            "themes",
            build_theme_edges,
            "Needs the full resource layer, including typal, to score against.",
        ),
        Step(
            "payoff",
            lambda: derive_payoff_role(DERIVE_PAYOFF_WEIGHT),
            "Last: only fires on cards left with no other role.",
        ),
    ]


def run_build(steps: list[Step] | None = None) -> dict[str, object]:
    """Execute the pipeline in order, returning each step's result."""
    steps = steps if steps is not None else build_steps()
    results: dict[str, object] = {}

    for index, step in enumerate(steps, start=1):
        log.info("pipeline.step", step=step.name, position=f"{index}/{len(steps)}")
        results[step.name] = step.run()

    return results
