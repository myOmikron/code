"""Filling an incomplete deck, all at once.

The formulation from `docs/composition.md`, finally built. The reason it is a
solver rather than a loop: the composition targets **overlap**. 30-40 mana
sources plus 10-12 ramp plus 10-12 draw plus 10-14 interaction plus 30-35
synergy sums to 90-113 against 99 cards, because a Signet is a mana source
*and* a ramp piece. Filling the buckets one at a time therefore gives a
different answer depending on the order you pick them in, which is the tell
that greedy decomposition is wrong. They have to be satisfied simultaneously.

CP-SAT is integer-only, so everything is scaled: role weights and coverage in
hundredths of a card, prices in cents. The scaling is the only fiddly part and
it is contained here.

Quotas are **soft**. Being one ramp piece short is a cost, not a rejection —
which is how a person builds, and also the only way the problem stays feasible
when a colour identity or a budget makes some bucket unreachable.
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from dataclasses import dataclass, field

import structlog
from pydantic import BaseModel, Field

from .composition import CURVE_BUCKETS, OVER_TARGET_COST, DeckTemplate
from .config import settings
from .vocabulary import BUCKET_ROLES, Bucket, Role

log = structlog.get_logger(__name__)

SCALE = 100  # hundredths of a card
DEFAULT_TIME_LIMIT = 10.0


class SolverBusy(RuntimeError):
    """Every fill slot is taken. The API maps this to 429."""


# The only CPU-bound work the API does, and the only work that can starve
# every other request on the box: a solve holds `solver_num_workers` threads
# for up to DEFAULT_TIME_LIMIT seconds. Uncapped, a handful of /fill requests
# saturates the host and the 250ms endpoints queue behind them.
#
# Sized at import, so tests must drain it rather than resize it.
_FILL_GATE = threading.BoundedSemaphore(settings.fill_max_concurrent)

# How a quota miss trades against card quality. A good candidate scores ~5,
# which is 500 after scaling; at 3, being one card short of a bucket with
# weight 3.0 costs 900. So the solver will take a slightly worse card to hit a
# quota, but will not take a bad one — which is the balance a person strikes.
QUOTA_PENALTY = 3


@dataclass(slots=True)
class Candidate:
    oracle_id: str
    name: str
    cmc: float
    is_land: bool
    score: float
    roles: dict[str, float] = field(default_factory=dict)
    price_usd: float | None = None
    theme_fit: float = 0.0
    primary_type: str = "Other"


class FilledCard(BaseModel):
    oracle_id: str
    name: str
    cmc: float
    score: float
    price_usd: float | None = None


class FillResult(BaseModel):
    status: str
    solved: bool
    slots: int
    chosen: list[FilledCard] = Field(default_factory=list)
    coverage: dict[str, float] = Field(default_factory=dict)
    # What the deck already had before filling. A bucket over target here was
    # over before the solver ran, and adding cards cannot fix it — without this
    # the result reads as the solver having failed.
    base_coverage: dict[str, float] = Field(default_factory=dict)
    targets: dict[str, list[float]] = Field(default_factory=dict)
    total_price: float = 0.0
    solve_ms: float = 0.0
    notes: list[str] = Field(default_factory=list)


def _bucket_weight(roles: dict[str, float], bucket: Bucket) -> int:
    """A card's contribution to one bucket, in hundredths.

    The max of its roles in that bucket, never the sum — a Signet is
    `mana_rock` and `ramp_other`, and counting it as 1.7 ramp pieces is the
    double-count `bucket_coverage_from_cards` exists to prevent.
    """
    best = 0.0
    for role in BUCKET_ROLES[bucket]:
        try:
            best = max(best, roles.get(str(Role(role)), 0.0))
        except ValueError:
            continue
    return int(round(best * SCALE))


def solve_fill(
    candidates: list[Candidate],
    template: DeckTemplate,
    *,
    slots: int,
    base_coverage: dict[Bucket, float],
    base_curve: dict[int, float],
    base_nonland: int,
    base_types: dict[str, float] | None = None,
    budget: float | None = None,
    theme_weight: float = 1.0,
    time_limit: float = DEFAULT_TIME_LIMIT,
) -> FillResult:
    """Choose `slots` cards that land the deck's quotas as close to target as possible."""
    try:
        from ortools.sat.python import cp_model
    except ImportError:  # pragma: no cover - the extra is declared in pyproject
        return FillResult(
            status="unavailable",
            solved=False,
            slots=slots,
            notes=["ortools is not installed. Install the `solver` extra."],
        )

    if slots <= 0:
        return FillResult(
            status="complete", solved=True, slots=0, notes=["The deck is already full."]
        )
    if len(candidates) < slots:
        return FillResult(
            status="infeasible",
            solved=False,
            slots=slots,
            notes=[
                f"Only {len(candidates)} candidates for {slots} slots — "
                "widen the budget or the colour identity."
            ],
        )

    model = cp_model.CpModel()
    picks = [model.NewBoolVar(c.oracle_id) for c in candidates]
    model.Add(sum(picks) == slots)

    if budget is not None:
        cents = [int(round((c.price_usd or 0.0) * 100)) for c in candidates]
        model.Add(sum(cents[i] * picks[i] for i in range(len(candidates))) <= int(budget * 100))

    objective = []

    # Score, plus a theme term the caller can turn up when a focus is set.
    for index, candidate in enumerate(candidates):
        value = candidate.score + theme_weight * candidate.theme_fit
        objective.append(int(round(value * SCALE)) * picks[index])

    # --- soft quotas ------------------------------------------------------
    for bucket, target in template.buckets.items():
        contribution = sum(
            _bucket_weight(candidates[i].roles, bucket) * picks[i] for i in range(len(candidates))
        )
        total = contribution + int(round(base_coverage.get(bucket, 0.0) * SCALE))

        under = model.NewIntVar(0, 200 * SCALE, f"under_{bucket}")
        over = model.NewIntVar(0, 200 * SCALE, f"over_{bucket}")
        model.Add(under >= int(round(target.low * SCALE)) - total)
        model.Add(over >= total - int(round(target.high * SCALE)))

        # `under` and `over` are in hundredths, so the per-card cost is
        # `weight * QUOTA_PENALTY * SCALE`. Integer arithmetic throughout —
        # CP-SAT has no division and no floats.
        #
        # A surplus is discounted against a shortfall by the same factor
        # `BucketTarget.penalty` uses, and for the same reason: the buckets
        # overlap, so a deck over on several at once usually has cards doing
        # more than one job. Without it the fill solver optimises against a
        # different objective from the diagnostics that grade its own output.
        # Floored at 1 rather than rounded — at 0 a surplus would be literally
        # free and the solver would stuff a full bucket to reach any candidate
        # score at all.
        penalty = int(round(target.weight * QUOTA_PENALTY))
        objective.append(-penalty * under)
        objective.append(-max(1, int(round(penalty * OVER_TARGET_COST))) * over)

    # --- curve ------------------------------------------------------------
    # The target has to be linear in the nonlands actually *picked*, not the
    # candidate pool: scaling to the pool size (the old `curve_targets` call)
    # left every bucket hopelessly under target regardless of what got chosen,
    # so each extra nonland "helped" every bucket by exactly 1 no matter its
    # own mana value — a flat subsidy, not shaping. `target` is kept in
    # hundredths (SCALE) throughout so `share * (picked nonlands)` stays an
    # integer CP-SAT expression; `deviation` is recovered as a whole card only
    # at the end, via integer division, which is what the objective
    # coefficient below (unchanged) expects.
    nonland_picks = [i for i, c in enumerate(candidates) if not c.is_land]
    picked_nonland = sum(picks[i] for i in nonland_picks)

    for mv in CURVE_BUCKETS:
        at_mv = [i for i in nonland_picks if min(6, int(candidates[i].cmc)) == mv]
        count = int(base_curve.get(mv, 0.0)) + sum(picks[i] for i in at_mv)
        share = int(round(template.curve[mv] * SCALE))
        target = share * (base_nonland + picked_nonland)  # hundredths of a card

        spread = model.NewIntVar(0, 200 * SCALE, f"curve_spread_{mv}")
        model.Add(spread >= SCALE * count - target)
        model.Add(spread >= target - SCALE * count)
        deviation = model.NewIntVar(0, 200, f"curve_{mv}")
        model.AddDivisionEquality(deviation, spread, SCALE)
        # Deviation is in whole cards here, so it needs the SCALE the quota
        # terms already carry to be comparable with them.
        objective.append(-int(round(template.curve_weight * SCALE)) * deviation)

    # --- card types -------------------------------------------------------
    # The same soft constraint the diagnostics penalty applies; without it the
    # solver would happily fill every slot with creatures the moment they
    # score best, and /fill would fight the very report it was built from.
    # Weight-0 types (Land — the mana_sources quota owns land count) are
    # skipped rather than modelled as free variables.
    if base_types is not None:
        for name, target in template.types.items():
            if not target.weight:
                continue
            at_type = [i for i, c in enumerate(candidates) if c.primary_type == name]
            count = int(round(base_types.get(name, 0.0))) + sum(picks[i] for i in at_type)

            type_under = model.NewIntVar(0, 200, f"type_under_{name}")
            type_over = model.NewIntVar(0, 200, f"type_over_{name}")
            model.Add(type_under >= int(round(target.low)) - count)
            model.Add(type_over >= count - int(round(target.high)))

            # Whole cards, like the curve, so the coefficient carries both
            # QUOTA_PENALTY and SCALE: at weight 0.35 that is ~105 per card
            # outside range, against candidate scores ~500 and mana-source
            # misses ~900 — types bind an order softer than mana, which is
            # the right ordering.
            coefficient = int(round(target.weight * QUOTA_PENALTY * SCALE))
            objective.append(-coefficient * type_under)
            # Discounted like the buckets above. Types partition the deck, so
            # five creatures over target *is* five of something else under it,
            # already charged at full weight on the side that hurts.
            objective.append(-max(1, int(round(coefficient * OVER_TARGET_COST))) * type_over)

    model.Maximize(sum(objective))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_workers = settings.solver_num_workers
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return FillResult(
            status=solver.StatusName(status),
            solved=False,
            slots=slots,
            solve_ms=solver.WallTime() * 1000,
            notes=["No arrangement satisfied the hard constraints."],
        )

    chosen = [candidates[i] for i in range(len(candidates)) if solver.Value(picks[i])]

    coverage = {}
    for bucket in template.buckets:
        picked = sum(_bucket_weight(c.roles, bucket) for c in chosen) / SCALE
        coverage[str(bucket)] = round(base_coverage.get(bucket, 0.0) + picked, 1)

    notes = [
        f"{bucket} was already over target before filling "
        f"({base_coverage.get(bucket, 0.0):.1f} against {target.low}-{target.high}); "
        "adding cards cannot bring it down — cut something instead."
        for bucket, target in template.buckets.items()
        if base_coverage.get(bucket, 0.0) > target.high
    ]

    return FillResult(
        status=solver.StatusName(status),
        solved=True,
        slots=slots,
        notes=notes,
        base_coverage={
            str(bucket): round(base_coverage.get(bucket, 0.0), 1) for bucket in template.buckets
        },
        chosen=[
            FilledCard(
                oracle_id=c.oracle_id,
                name=c.name,
                cmc=c.cmc,
                score=round(c.score, 2),
                price_usd=c.price_usd,
            )
            for c in sorted(chosen, key=lambda c: -c.score)
        ],
        coverage=coverage,
        targets={
            str(bucket): [target.low, target.high] for bucket, target in template.buckets.items()
        },
        total_price=round(sum(c.price_usd or 0.0 for c in chosen), 2),
        solve_ms=round(solver.WallTime() * 1000, 1),
    )


def fill_deck(
    deck_oracle_ids: list[str],
    deck_card_names: list[str],
    *,
    quantities: dict[str, int] | None = None,
    commander_oracle_id: str | None = None,
    commander_oracle_ids: list[str] | None = None,
    speed: float = 0.5,
    overrides: dict | None = None,
    focus: str | None = None,
    pinned_themes: list[str] | None = None,
    excluded_themes: list[str] | None = None,
    deck_size: int = 99,
    budget: float | None = None,
    rejected: list[str] | None = None,
    identity: list[str] | None = None,
    pool_size: int = 300,
    allow_network: bool | Callable[[], bool] = True,
) -> FillResult:
    """Fill an incomplete deck to `deck_size`, respecting the chosen ratios.

    Raises `SolverBusy` when every fill slot is occupied. The gate is taken
    before any graph work: the diagnose-and-suggest that precedes the solve is
    part of a fill's cost, and acquiring first is also what lets the rejection
    path be exercised without a database.

    `allow_network` and `identity` thread through to the `suggest()` call
    inside — see its doc comment. `allow_network` may also be a callable,
    resolved only once the gate is held: the API's cold-commander probe costs
    a graph query, which must not run on the rejection path.
    """
    if not _FILL_GATE.acquire(timeout=settings.fill_acquire_timeout_seconds):
        raise SolverBusy(f"{settings.fill_max_concurrent} fills already running")

    try:
        if callable(allow_network):
            allow_network = allow_network()
        return _fill_deck(
            deck_oracle_ids,
            deck_card_names,
            quantities=quantities,
            commander_oracle_id=commander_oracle_id,
            commander_oracle_ids=commander_oracle_ids,
            speed=speed,
            overrides=overrides,
            focus=focus,
            pinned_themes=pinned_themes,
            excluded_themes=excluded_themes,
            deck_size=deck_size,
            budget=budget,
            rejected=rejected,
            identity=identity,
            pool_size=pool_size,
            allow_network=allow_network,
        )
    finally:
        _FILL_GATE.release()


def _fill_deck(
    deck_oracle_ids: list[str],
    deck_card_names: list[str],
    *,
    quantities: dict[str, int] | None = None,
    commander_oracle_id: str | None = None,
    commander_oracle_ids: list[str] | None = None,
    speed: float = 0.5,
    overrides: dict | None = None,
    focus: str | None = None,
    pinned_themes: list[str] | None = None,
    excluded_themes: list[str] | None = None,
    deck_size: int = 99,
    budget: float | None = None,
    rejected: list[str] | None = None,
    identity: list[str] | None = None,
    pool_size: int = 300,
    allow_network: bool = True,
) -> FillResult:
    """The fill itself, once a slot is held. Call `fill_deck`, not this."""
    from .composition import (
        bucket_coverage_from_cards,
        primary_type,
        type_counts_from_cards,
    )
    from .diagnostics import DeckEntry, _typed_roles, diagnose
    from .graph import cards_role_weights, deck_card_roles, fetch_deck
    from .suggestions import effective_commanders, suggest
    from .type_targets import conditioned_template, targets_from_report

    deck = quantities or dict.fromkeys(deck_oracle_ids, 1)
    cards = fetch_deck(deck)
    card_roles = deck_card_roles(deck)

    # The command zone sits outside the 99 — every seat of it, not just the
    # anchor's.
    commanders = set(effective_commanders(commander_oracle_id, commander_oracle_ids))
    current = sum(c["qty"] for c in cards if c["oracle_id"] not in commanders)
    slots = deck_size - current

    if slots <= 0:
        return FillResult(
            status="complete",
            solved=True,
            slots=0,
            notes=[f"Already at {current} cards — nothing to fill."],
        )

    # Diagnose once and hand the report to suggest() — the /swaps pattern,
    # halving the round trips — and condition the solver's template from the
    # *reported* type targets so /fill optimises against the same shape the
    # diagnostics showed, never a re-resolved one.
    diagnostics = diagnose(
        [DeckEntry(oracle_id=oid, qty=qty) for oid, qty in deck.items()],
        speed=speed,
        overrides=overrides,
        commander_oracle_id=commander_oracle_id,
        commander_oracle_ids=commander_oracle_ids,
        allow_network=True,
    )

    report = suggest(
        deck_oracle_ids,
        deck_card_names,
        quantities=deck,
        commander_oracle_id=commander_oracle_id,
        commander_oracle_ids=commander_oracle_ids,
        limit=pool_size,
        speed=speed,
        overrides=overrides,
        focus=focus,
        pinned_themes=pinned_themes,
        excluded_themes=excluded_themes,
        identity=identity,
        diagnostics=diagnostics,
        allow_network=allow_network,
    )

    excluded = set(rejected or [])
    pool = [s for s in report.suggestions if s.oracle_id not in excluded]
    roles = cards_role_weights([s.oracle_id for s in pool])

    candidates = [
        Candidate(
            oracle_id=s.oracle_id,
            name=s.name,
            cmc=s.cmc,
            is_land="Land" in (s.type_line or ""),
            score=s.score,
            roles=roles.get(s.oracle_id, {}),
            price_usd=s.price_usd,
            theme_fit=next(
                (p.score for p in s.provenance if p.channel == "theme_fit"),
                0.0,
            ),
            primary_type=primary_type(s.type_line or ""),
        )
        for s in pool
    ]

    base_coverage = bucket_coverage_from_cards(
        [
            (_typed_roles(row["roles"]), row["qty"])
            for row in card_roles
            if row["oracle_id"] not in commanders
        ]
    )
    base_curve = dict.fromkeys(CURVE_BUCKETS, 0.0)
    base_nonland = 0
    for card in cards:
        if card["oracle_id"] in commanders or card["is_land"]:
            continue
        base_curve[min(6, int(card["cmc"]))] += card["qty"]
        base_nonland += card["qty"]

    base_types = type_counts_from_cards(
        [card for card in cards if card["oracle_id"] not in commanders]
    )

    template = conditioned_template(
        speed, overrides, targets_from_report(diagnostics.types, speed=speed)
    )

    result = solve_fill(
        candidates,
        template,
        slots=slots,
        base_coverage=base_coverage,
        base_curve=base_curve,
        base_nonland=base_nonland,
        base_types=base_types,
        budget=budget,
    )
    result.notes.extend(report.notes)

    log.info("fill.done", slots=slots, pool=len(candidates), status=result.status)
    return result
