"""Does the mechanical layer earn its keep, or is this EDHREC with extra steps?

The question the whole project rests on. `resource_bridge`, the theme layer and
the typal axis exist because a graph can find cards that popularity data
structurally cannot. That claim has never been measured, and it produces
plausible results — which is precisely the state in which a wrong idea survives
longest.

## What is measured, and what it can prove

EDHREC's per-deck endpoint returns 403, so real held-out decklists are not
available. The substitute has to be chosen carefully, because the obvious one is
circular: if the gold set is "cards EDHREC says people run", then the EDHREC
channel scores ~100% by construction and the number means nothing.

EDHREC publishes two *different* lists per commander:

  topcards          generic staples — high raw inclusion rate
  highsynergycards  cards distinctive to this commander

So: hold out the **high-synergy** cards, give the system the rest of the deck,
**switch the EDHREC channel off entirely**, and ask whether the mechanical
layer alone can find them. The baseline is generic popularity, which is what
you would recommend knowing nothing about the deck.

That is a genuine test of one specific claim: *given a deck's mechanics, can the
graph identify the cards that make it that deck?* A pass says the mechanical
layer sees something popularity does not.

What it does **not** prove: that the suggestions are good, that the weights are
right, or anything about decks unlike the EDHREC aggregate. Real decklists would
be better and this is a proxy. It is written down here so the number is never
quoted as more than it is.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)

# Channel sets the harness compares.
#
# `typal_bridge` joins the mechanical set because it is mechanical in exactly
# the sense that matters here: it reads graph structure and never touches
# `edhrec_rank` for retrieval, so it cannot inherit the popularity circularity
# `all_channels` suffers from. It moves this arm's number, so the before and
# after are both recorded in `docs/evaluation.md` rather than the change being
# folded silently into the next measurement.
MECHANICAL_ONLY = {"resource_bridge", "role_gap", "combo_completion", "typal_bridge"}
ALL_CHANNELS = MECHANICAL_ONLY | {"edhrec_synergy"}
# `all_channels` plus the type-saturation demotion pass. A separate arm, not
# an edit to the sets above, so every previously recorded number stays
# comparable. Expect recall to *drop* here on creature commanders — the
# held-out high-synergy cards are often creatures, so the demotion is right
# exactly where it costs hits; `creature_share_at_k` is the number this arm
# exists to move.
SHAPED = ALL_CHANNELS | {"type_saturation"}


@dataclass(slots=True)
class Case:
    """One commander, its deck, and the cards held out of it."""

    commander: str
    commander_oracle_id: str
    kept: list[str] = field(default_factory=list)  # oracle ids
    kept_names: list[str] = field(default_factory=list)
    held_out: set[str] = field(default_factory=set)  # oracle ids
    held_out_names: list[str] = field(default_factory=list)
    inclusion: dict[str, float] = field(default_factory=dict)
    # True when the hold-out consumed every distinctive card, so `seed` had
    # nothing to vary. See `build_case`.
    saturated: bool = False


class ArmResult(BaseModel):
    arm: str
    recall_at_k: float
    novelty_at_k: float
    # Share of the top k that are creatures, averaged over cases. The defect
    # that motivated the `shaped` arm was "the advisor over-recommends
    # creatures" — this is the number that must move, and recall alone
    # cannot show it.
    creature_share_at_k: float = 0.0
    hits: int
    held_out: int
    cases: int


class EvalReport(BaseModel):
    k: int
    arms: list[ArmResult] = Field(default_factory=list)
    per_channel_hits: dict[str, int] = Field(default_factory=dict)
    commanders: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


def build_case(
    commander: str, *, hold_out: int = 10, seed: int = 7, deck_size: int = 99
) -> Case | None:
    """Assemble one evaluation case from a commander's EDHREC page.

    The kept deck is the generic-staple half; the held-out set is the
    commander-distinctive half. The system never sees the held-out cards.

    **The kept deck is capped at `deck_size`.** The first version handed the
    whole recommendation list to the system — 277 cards for Atraxa — which is a
    pile, not a deck. No bucket can be short of its quota in a 277-card pile, so
    `role_gap` could never fire and its recall of 0.000 measured the harness
    rather than the channel. Trimming to the most-included cards makes the proxy
    a plausible generic build of the right size.
    """
    from .edhrec import load_commander
    from .graph import resolve_names

    recommendations = load_commander(commander)
    if not recommendations:
        return None

    distinctive = [r for r in recommendations if r.tag == "highsynergycards"]
    rest = [r for r in recommendations if r.tag != "highsynergycards"]
    if len(distinctive) < 3 or len(rest) < 20:
        return None

    rng = random.Random(seed)
    holdout = rng.sample(distinctive, min(hold_out, len(distinctive)))
    holdout_names = {r.name for r in holdout}
    # When the hold-out takes every distinctive card there is nothing left to
    # sample, so `seed` only permutes an order that is immediately discarded
    # into a set. EDHREC returns exactly 10 `highsynergycards` and `hold_out`
    # defaults to 10, so this is the *normal* case, not an edge case — and it
    # means repeated runs agree because there is no variance, which reads
    # exactly like a stable result. Callers need to know the difference.
    saturated = hold_out >= len(distinctive)

    kept = sorted(
        (r for r in rest if r.name not in holdout_names),
        key=lambda r: -r.inclusion_rate,
    )[: max(deck_size - hold_out, 10)]
    names = [r.name for r in kept] + [commander]
    ids = resolve_names(names)

    commander_id = ids.get(commander)
    if commander_id is None:
        return None

    held_ids = resolve_names([r.name for r in holdout])

    return Case(
        commander=commander,
        commander_oracle_id=commander_id,
        kept=[oid for name, oid in ids.items() if name != commander],
        kept_names=[name for name in ids if name != commander],
        held_out=set(held_ids.values()),
        held_out_names=sorted(held_ids),
        inclusion={r.name: r.inclusion_rate for r in recommendations},
        saturated=saturated,
    )


def _novelty(names: list[str], inclusion: dict[str, float]) -> float:
    """How off-the-beaten-path the hits were.

    1 minus mean inclusion rate: finding a card in 10% of decks scores 0.9,
    finding one in 90% scores 0.1. A system that only ever returns staples
    scores near zero however good its recall looks.
    """
    if not names:
        return 0.0
    rates = [inclusion.get(name, 0.0) for name in names]
    return round(1.0 - sum(rates) / len(rates), 3)


def _creature_share(type_lines: list[str]) -> float:
    """Share of a suggestion list filed under Creature."""
    from .composition import primary_type

    if not type_lines:
        return 0.0
    creatures = sum(1 for line in type_lines if primary_type(line) == "Creature")
    return creatures / len(type_lines)


def run_arm(
    case: Case, arm: str, *, k: int, channels: set[str] | None
) -> tuple[int, list[str], dict[str, int], float]:
    """Run one configuration against one case.

    Returns (hits, hit names, per-channel hits, creature share of the top k).
    """
    from .graph import channel_edhrec
    from .suggestions import suggest

    if arm == "baseline_popularity":
        # What you would recommend knowing nothing about the deck: the most
        # played legal cards, ignoring every mechanical signal.
        rows = channel_edhrec(case.commander_oracle_id, case.kept, [], limit=500)
        rows.sort(key=lambda r: -(r.get("inclusion_rate") or 0.0))
        top = rows[:k]
        hit_ids = {r["oracle_id"] for r in top} & case.held_out
        share = _creature_share([r.get("type_line") or "" for r in top])
        return len(hit_ids), [r["name"] for r in top if r["oracle_id"] in hit_ids], {}, share

    report = suggest(
        case.kept,
        case.kept_names,
        commander_oracle_id=case.commander_oracle_id,
        limit=k,
        channels=channels,
        include_combos="combo_completion" in (channels or ALL_CHANNELS),
    )

    per_channel: dict[str, int] = {}
    hits: list[str] = []
    for suggestion in report.suggestions:
        if suggestion.oracle_id in case.held_out:
            hits.append(suggestion.name)
            for provenance in suggestion.provenance:
                per_channel[provenance.channel] = per_channel.get(provenance.channel, 0) + 1

    share = _creature_share([s.type_line for s in report.suggestions])
    return len(hits), hits, per_channel, share


def evaluate(
    commanders: list[str],
    *,
    k: int = 25,
    hold_out: int = 10,
    seed: int = 7,
    deck_size: int = 99,
) -> EvalReport:
    """Compare the mechanical layer against generic popularity."""
    # `bridge_only` exists to separate two very different failures: a bridge
    # that finds nothing, and a bridge that finds things but is crowded out of
    # the top k by other channels. They call for opposite responses.
    arms = {
        "baseline_popularity": None,
        "bridge_only": {"resource_bridge"},
        "role_gap_only": {"role_gap"},
        # Isolated for the same reason as `bridge_only`: a typal channel that
        # finds nothing and one crowded out of the top k are different failures.
        # It contributes nothing on the many commanders that have no tribe, so
        # read it against the subset it can possibly fire on, not the whole run.
        "typal_only": {"typal_bridge"},
        "mechanical_only": MECHANICAL_ONLY,
        "all_channels": ALL_CHANNELS,
        "shaped": SHAPED,
    }

    totals = {
        name: {"hits": 0, "held": 0, "novelty": [], "cases": 0, "creature_share": []}
        for name in arms
    }
    per_channel: dict[str, int] = {}
    notes: list[str] = []
    used: list[str] = []
    saturated_cases: list[str] = []

    # Warm the cache before measuring anything.
    #
    # Lazily fetching mid-run silently invalidates the whole report: fetching a
    # commander writes RECOMMENDS edges, so arms that ran before the fetch saw a
    # different graph from those that ran after. Observed in practice —
    # `baseline_popularity`, which cannot depend on any code under test, read 1
    # hit cold and 7 hits warm on the same 20 commanders. A before/after
    # comparison across that boundary measures the cache, not the change.
    from .edhrec import is_cached

    cold = [c for c in commanders if not is_cached(c)]
    if cold:
        notes.append(
            f"Fetched {len(cold)} commander(s) fresh: {', '.join(cold[:5])}"
            + (f" (+{len(cold) - 5} more)" if len(cold) > 5 else "")
            + ". Numbers are valid, but NOT comparable to a run made before "
            "these were cached — re-run to compare against earlier results."
        )

    for commander in commanders:
        case = build_case(commander, hold_out=hold_out, seed=seed, deck_size=deck_size)
        if case is None:
            notes.append(f"Skipped {commander}: no usable EDHREC data.")
            continue
        if not case.held_out:
            notes.append(f"Skipped {commander}: held-out cards did not resolve.")
            continue

        used.append(commander)
        if case.saturated:
            saturated_cases.append(commander)

        for arm, channels in arms.items():
            hits, names, channel_hits, creature_share = run_arm(case, arm, k=k, channels=channels)
            totals[arm]["hits"] += hits
            totals[arm]["held"] += len(case.held_out)
            totals[arm]["novelty"].append(_novelty(names, case.inclusion))
            totals[arm]["creature_share"].append(creature_share)
            totals[arm]["cases"] += 1

            # Per-channel counts come from the *mechanical* arm. Taking them
            # from `all_channels` measures the circular configuration: the
            # held-out cards are EDHREC high-synergy cards, so the EDHREC
            # channel finds them by construction and drowns everything else.
            if arm == "mechanical_only":
                for channel, count in channel_hits.items():
                    per_channel[channel] = per_channel.get(channel, 0) + count

        log.info("eval.case", commander=commander, held_out=len(case.held_out))

    results = [
        ArmResult(
            arm=arm,
            recall_at_k=round(data["hits"] / data["held"], 3) if data["held"] else 0.0,
            novelty_at_k=(
                round(sum(data["novelty"]) / len(data["novelty"]), 3) if data["novelty"] else 0.0
            ),
            creature_share_at_k=(
                round(sum(data["creature_share"]) / len(data["creature_share"]), 3)
                if data["creature_share"]
                else 0.0
            ),
            hits=data["hits"],
            held_out=data["held"],
            cases=data["cases"],
        )
        for arm, data in totals.items()
    ]

    if saturated_cases:
        notes.append(
            f"--seed had no effect on {len(saturated_cases)} of {len(used)} case(s): "
            f"hold_out={hold_out} consumed every distinctive card, so there was "
            "nothing to sample. Repeated runs agree because there is no variance, "
            "not because the result is stable — lower --hold-out to vary the sample."
        )

    notes.append(
        "all_channels is circular by construction — the held-out cards are "
        "EDHREC high-synergy cards and the EDHREC channel reads that same data. "
        "The honest comparison is mechanical_only against baseline_popularity."
    )

    return EvalReport(
        k=k,
        arms=results,
        per_channel_hits=per_channel,
        commanders=used,
        notes=notes,
    )
