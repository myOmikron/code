"""The corpus loads a graph is useless without, run only when they are missing.

One layer above `pipeline.py`, and the difference is the whole point: the
pipeline's steps always run, because a semantic build is a rebuild by nature.
These steps are skipped when the graph already holds what they write, so this
is safe to run on every container start — which is what makes it a fix for the
way an empty graph fails.

It does not fail loudly. Role coverage is read straight off `FILLS_ROLE`
edges, so a graph nobody ingested into answers *0 for every role* against a
perfectly normal-looking target corridor. That reads as a broken advisor
rather than an empty database, and the four commands that fix it are not
guessable from the symptom.

"Has this run" is asked of the graph, never of a marker file: `down -v` empties
the store and a marker would keep claiming the corpus was loaded.

`warm-edhrec` is deliberately not here. It is a thousand sequential requests to
an unofficial third-party endpoint at a second apiece — a quarter hour of
someone else's bandwidth is not a thing to do automatically on boot, and the
advisor fetches the commanders it actually needs on demand anyway.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

import structlog

log = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class State:
    """What the graph already holds. Filled by `graph.bootstrap_state`."""

    cards: int = 0
    taggings: int = 0
    role_edges: int = 0
    combos: int = 0


@dataclass(frozen=True, slots=True)
class Step:
    """One load, and how to tell it already happened."""

    name: str
    run: Callable[[], object]
    # How much of this step's own output the graph holds. Only zero-or-not is
    # read: a partial load is indistinguishable from a complete one here, and
    # guessing at completeness from a count would re-ingest the corpus every
    # time Scryfall printed a new set.
    present: Callable[[State], int]
    why: str
    # The steps this one's output is derived from. If one of them ran just
    # now, what is in the graph is stale whatever it counts — the semantic
    # layer is a function of cards and tags, and a rules-only build (roles
    # present, tags absent) is exactly the half-state that looks done.
    derived_from: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class Outcome:
    """What happened to one step, for the CLI to print and tests to assert."""

    step: str
    ran: bool
    reason: str
    error: str | None = None


def build_steps() -> list[Step]:
    """The load order. Every dependency here is real, same as `pipeline.py`."""
    from .ingest import ingest
    from .pipeline import run_build
    from .spellbook import ingest_combos
    from .tagger import ingest_tags

    return [
        Step(
            "cards",
            ingest,
            lambda state: state.cards,
            "Every other step writes edges between Card nodes.",
        ),
        Step(
            "tags",
            ingest_tags,
            lambda state: state.taggings,
            "The curated ontology the semantic build reads first.",
        ),
        Step(
            "semantics",
            run_build,
            lambda state: state.role_edges,
            "FILLS_ROLE lives here — without it every role coverage reads 0.",
            derived_from=("cards", "tags"),
        ),
        Step(
            "combos",
            ingest_combos,
            lambda state: state.combos,
            "Combo nodes survive a card wipe; their USES edges do not.",
            derived_from=("cards",),
        ),
    ]


def bootstrap(
    *,
    force: bool = False,
    steps: Sequence[Step] | None = None,
    state: State | None = None,
) -> list[Outcome]:
    """Run the steps the graph is missing, in order.

    Stops at the first failure rather than pressing on. Everything downstream
    reads what the failed step was supposed to write, and a semantic build over
    a corpus that never downloaded would replace "no data" with "wrong data" —
    the graph would then count as bootstrapped on the next start.
    """
    steps = list(steps) if steps is not None else build_steps()

    if state is None:
        from .graph import bootstrap_state

        try:
            state = State(**bootstrap_state())
        except Exception as exc:  # noqa: BLE001 - a boot-time reason, not a crash
            # Nothing can be decided without the counts. Raising here would put
            # a traceback in front of a container that is otherwise fine to
            # serve, so this reports the one line worth reading and stops.
            log.error("bootstrap.unreachable", error=str(exc))
            return [Outcome("graph", False, "unreachable", error=str(exc))]

    outcomes: list[Outcome] = []
    ran: set[str] = set()

    for step in steps:
        present = step.present(state)
        stale = [name for name in step.derived_from if name in ran]

        if force:
            reason = "forced"
        elif stale:
            reason = f"stale after {', '.join(stale)}"
        elif present:
            log.info("bootstrap.skip", step=step.name, present=present)
            outcomes.append(Outcome(step.name, False, f"{present:,} already in the graph"))
            continue
        else:
            reason = "graph holds none"

        log.info("bootstrap.run", step=step.name, reason=reason, why=step.why)
        try:
            step.run()
        except Exception as exc:  # noqa: BLE001 - reported to the caller, not swallowed
            log.error("bootstrap.failed", step=step.name, error=str(exc))
            outcomes.append(Outcome(step.name, False, reason, error=str(exc)))
            break

        ran.add(step.name)
        outcomes.append(Outcome(step.name, True, reason))

    return outcomes
