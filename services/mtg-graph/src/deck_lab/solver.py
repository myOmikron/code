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
from .poolquery import PoolFilter
from .suggestions import (
    GAME_CHANGER_CAP_BRACKET_THREE,
    ROLE_SHORTFALL_SATURATION,
    SPEED_BRACKET_FOUR,
    SPEED_BRACKET_THREE,
    Phrase,
    phrase,
)
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

# A shortfall's urgency saturates, in the solver exactly as in the ranking.
# `_role_provenance` caps its term at `shortfall / 4` for the reason its doc
# comment states — the shortfall belongs in the reason, not the magnitude —
# but the solver kept charging the full rate per missing card without limit,
# and the two layers came apart: a deck 24 synergy cards short priced *any*
# role-carrier above *every* staple, and /fill answered a famine with the
# rank-250 tail of the pool while the adds list led with cards the solver
# refused. Measured on a 65-card Prosper deck: 13 of 35 picks overlapped the
# top-35 adds, and the picks included 0.4-score cards over 3.5-score ones.
#
# So the under-penalty is piecewise: full rate for the last few cards before
# the band (hitting a nearly-met quota is worth a quality sacrifice), a
# discounted rate beyond (a famine the fill cannot close anyway must not buy
# junk). Both constants are the sources they mirror, not copies of their
# values: the depth IS the ranking's saturation divisor, and the discount IS
# the over-target factor — the same "far side of the band binds softer"
# reasoning — so tuning either moves both layers together instead of
# silently falsifying this comment.
QUOTA_SATURATION_CARDS = ROLE_SHORTFALL_SATURATION
DEEP_SHORTFALL_COST = OVER_TARGET_COST


@dataclass(slots=True)
class Candidate:
    oracle_id: str
    name: str
    cmc: float
    is_land: bool
    score: float
    roles: dict[str, float] = field(default_factory=dict)
    price_usd: float | None = None
    primary_type: str = "Other"
    game_changer: bool = False


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
    notes: list[Phrase] = Field(default_factory=list)


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
    max_game_changers: int | None = None,
    time_limit: float = DEFAULT_TIME_LIMIT,
) -> FillResult:
    """Choose `slots` cards that land the deck's quotas as close to target as possible.

    `max_game_changers` caps how many Game Changers the *chosen set* may
    contain — the headroom bracket 3 leaves after what the deck already
    plays. The suggestion layer withholds them one card at a time; only the
    solver picks many cards at once, so only the solver can add four singly
    legal ones and land the deck over its cap. `None` means no cap.
    """
    try:
        from ortools.sat.python import cp_model
    except ImportError:  # pragma: no cover - the extra is declared in pyproject
        return FillResult(
            status="unavailable",
            solved=False,
            slots=slots,
            notes=[
                phrase(
                    "fill-solver-unavailable",
                    "ortools is not installed. Install the `solver` extra.",
                )
            ],
        )

    if slots <= 0:
        return FillResult(
            status="complete",
            solved=True,
            slots=0,
            notes=[phrase("fill-deck-full", "The deck is already full.")],
        )
    if len(candidates) < slots:
        return FillResult(
            status="infeasible",
            solved=False,
            slots=slots,
            notes=[
                phrase(
                    "fill-pool-too-small",
                    f"Only {len(candidates)} candidates for {slots} slots — "
                    "widen the budget or the colour identity.",
                    candidates=len(candidates),
                    slots=slots,
                )
            ],
        )

    model = cp_model.CpModel()
    picks = [model.NewBoolVar(c.oracle_id) for c in candidates]
    model.Add(sum(picks) == slots)

    if budget is not None:
        cents = [int(round((c.price_usd or 0.0) * 100)) for c in candidates]
        model.Add(sum(cents[i] * picks[i] for i in range(len(candidates))) <= int(budget * 100))

    if max_game_changers is not None:
        changers = [i for i, c in enumerate(candidates) if c.game_changer]
        if changers:
            model.Add(sum(picks[i] for i in changers) <= max_game_changers)

    objective = []

    # The suggestion score, and only that. It already carries every channel's
    # argument — theme fit included — so the solver ranks a card exactly as
    # the adds list does; an extra theme term here double-counted what the
    # score had already priced in.
    for index, candidate in enumerate(candidates):
        objective.append(int(round(candidate.score * SCALE)) * picks[index])

    # --- soft quotas ------------------------------------------------------
    for bucket, target in template.buckets.items():
        contribution = sum(
            _bucket_weight(candidates[i].roles, bucket) * picks[i] for i in range(len(candidates))
        )
        total = contribution + int(round(base_coverage.get(bucket, 0.0) * SCALE))

        # `under` can never usefully exceed the low edge itself (coverage is
        # nonnegative), and the tight domain is worth stating: the piecewise
        # penalty below leaves the LP relaxation weak, and every bound helps
        # the solver prove what it already found.
        low_s = int(round(target.low * SCALE))
        under = model.NewIntVar(0, low_s, f"under_{bucket}")
        over = model.NewIntVar(0, 200 * SCALE, f"over_{bucket}")
        model.Add(under >= low_s - total)
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
        #
        # The shortfall side is piecewise (see QUOTA_SATURATION_CARDS): `near`
        # is the shortfall clamped to the saturation depth, charged at full
        # rate; the remainder — `under` beyond the clamp — at the deep
        # discount. Written as `(full - deep) * near + deep * under` so each
        # term stays linear: within the depth the sum is the full rate, past
        # it the marginal card costs only the discount. The min-equality is
        # exact, so the solver cannot shift shortfall into the cheap segment
        # while the near band is unfilled.
        penalty = int(round(target.weight * QUOTA_PENALTY))
        deep = max(1, int(round(penalty * DEEP_SHORTFALL_COST)))
        # The depth is clamped to the low edge: a bucket whose whole low is
        # inside the saturation window (a Rule 0 micro-deck's rescaled
        # targets) charges full rate over its entire shortfall range, which
        # is what "saturation only matters for deep famines" means there.
        cap = min(QUOTA_SATURATION_CARDS * SCALE, low_s)
        near = model.NewIntVar(0, cap, f"near_{bucket}")
        model.AddMinEquality(near, [under, cap])
        objective.append(-(penalty - deep) * near)
        objective.append(-deep * under)
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
            notes=[phrase("fill-no-arrangement", "No arrangement satisfied the hard constraints.")],
        )

    chosen = [candidates[i] for i in range(len(candidates)) if solver.Value(picks[i])]

    coverage = {}
    for bucket in template.buckets:
        picked = sum(_bucket_weight(c.roles, bucket) for c in chosen) / SCALE
        coverage[str(bucket)] = round(base_coverage.get(bucket, 0.0) + picked, 1)

    notes = [
        phrase(
            "fill-bucket-over-target",
            f"{bucket} was already over target before filling "
            f"({base_coverage.get(bucket, 0.0):.1f} against {target.low:.1f}-{target.high:.1f}); "
            "adding cards cannot bring it down — cut something instead.",
            bucket=str(bucket),
            current=f"{base_coverage.get(bucket, 0.0):.1f}",
            low=f"{target.low:.1f}",
            high=f"{target.high:.1f}",
        )
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
    curve: dict | None = None,
    type_overrides: dict | None = None,
    focus: str | None = None,
    pinned_themes: list[str] | None = None,
    excluded_themes: list[str] | None = None,
    deck_size: int = 99,
    budget: float | None = None,
    rejected: list[str] | None = None,
    identity: list[str] | None = None,
    pool_filter: PoolFilter | None = None,
    pool_size: int = 300,
    allow_network: bool | Callable[[], bool] = True,
) -> FillResult:
    """Fill an incomplete deck to `deck_size`, respecting the chosen ratios.

    `pool` restricts the candidate pool the suggest() inside draws from —
    distinct from `budget`, which is the solver's total-spend constraint over
    whatever pool it was handed.

    `deck_size` is also the size the grading scales to: the diagnose and
    suggest inside grade against quotas resized by deck_size/99, so a
    60-card fill no longer fills to 60 while grading against 99.

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
            curve=curve,
            type_overrides=type_overrides,
            focus=focus,
            pinned_themes=pinned_themes,
            excluded_themes=excluded_themes,
            deck_size=deck_size,
            budget=budget,
            rejected=rejected,
            identity=identity,
            pool_filter=pool_filter,
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
    curve: dict | None = None,
    type_overrides: dict | None = None,
    focus: str | None = None,
    pinned_themes: list[str] | None = None,
    excluded_themes: list[str] | None = None,
    deck_size: int = 99,
    budget: float | None = None,
    rejected: list[str] | None = None,
    identity: list[str] | None = None,
    pool_filter: PoolFilter | None = None,
    pool_size: int = 300,
    allow_network: bool = True,
) -> FillResult:
    """The fill itself, once a slot is held. Call `fill_deck`, not this."""
    from .composition import (
        bucket_coverage_from_cards,
        is_cedh,
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

    # As cast, not as printed — the base curve the solver fills toward has to
    # bucket the way the diagnostics report does, and the candidates arrive
    # already discounted from `suggest`.
    from .eminence import apply_discount, discount_for

    apply_discount(cards, discount_for(cards, commanders))
    current = sum(c["qty"] for c in cards if c["oracle_id"] not in commanders)
    slots = deck_size - current

    if slots <= 0:
        return FillResult(
            status="complete",
            solved=True,
            slots=0,
            notes=[
                phrase(
                    "fill-already-at-size",
                    f"Already at {current} cards — nothing to fill.",
                    current=current,
                )
            ],
        )

    # Diagnose once and hand the report to suggest() — the /swaps pattern,
    # halving the round trips — and condition the solver's template from the
    # *reported* type targets so /fill optimises against the same shape the
    # diagnostics showed, never a re-resolved one.
    diagnostics = diagnose(
        [DeckEntry(oracle_id=oid, qty=qty) for oid, qty in deck.items()],
        speed=speed,
        overrides=overrides,
        curve=curve,
        type_overrides=type_overrides,
        commander_oracle_id=commander_oracle_id,
        commander_oracle_ids=commander_oracle_ids,
        deck_size=deck_size,
        allow_network=True,
    )

    report = suggest(
        deck_oracle_ids,
        deck_card_names,
        quantities=deck,
        commander_oracle_id=commander_oracle_id,
        commander_oracle_ids=commander_oracle_ids,
        limit=pool_size,
        pool_filter=pool_filter,
        speed=speed,
        overrides=overrides,
        curve=curve,
        type_overrides=type_overrides,
        focus=focus,
        pinned_themes=pinned_themes,
        excluded_themes=excluded_themes,
        # The same layer /suggestions drops its ignore list at: filtered after
        # the pool ranking, a rejected card still occupied one of the
        # `pool_size` slots and the fill shopped a shallower pool than the
        # adds list showed.
        excluded=rejected,
        identity=identity,
        deck_size=deck_size,
        diagnostics=diagnostics,
        allow_network=allow_network,
    )

    roles = cards_role_weights([s.oracle_id for s in report.suggestions])

    # cEDH board-wipe coverage discount (Task C2, cEDH Pro round) — applied to
    # both the pool the solver picks from (below) and the deck's own already-
    # held cards (`base_coverage`, below), so a fill run reads the same
    # INTERACTION number the diagnostics report and cut scoring do for this
    # deck. See `interaction.discount_board_wipe`.
    from .interaction import discount_board_wipe

    cedh = is_cedh(speed)

    candidates = [
        Candidate(
            oracle_id=s.oracle_id,
            name=s.name,
            cmc=s.cmc,
            is_land="Land" in (s.type_line or ""),
            score=s.score,
            roles=discount_board_wipe(roles.get(s.oracle_id, {}), cedh=cedh),
            price_usd=s.price_usd,
            primary_type=primary_type(s.type_line or ""),
            game_changer=s.game_changer,
        )
        for s in report.suggestions
    ]

    # Bracket 3's Game Changer headroom, as a count constraint on the chosen
    # set. The suggestion layer withholds game changers card-by-card — all of
    # them below bracket 3, all of them at bracket 3 once the deck is at its
    # cap — but under the cap they are legitimately in the pool, and only the
    # solver picks many at once. Without this a deck playing one game changer
    # filled at bracket 3 could come back playing six. The deck's own count
    # is read off the `fetch_deck` rows already in hand — they carry
    # `game_changer` per card — not a fresh flag query.
    max_game_changers = None
    if SPEED_BRACKET_THREE <= speed < SPEED_BRACKET_FOUR:
        already = sum(1 for card in cards if card["game_changer"])
        max_game_changers = max(0, GAME_CHANGER_CAP_BRACKET_THREE - already)

    base_coverage = bucket_coverage_from_cards(
        [
            (discount_board_wipe(_typed_roles(row["roles"]), cedh=cedh), row["qty"])
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

    # The report's rows are already deck-sized; the scale resizes only the
    # interpolated buckets to match them. `cedh_class` (Task E follow-up,
    # cEDH Pro round) comes off the same `diagnostics` report for the same
    # reason: it already classified this deck, so /fill optimises toward the
    # measured turbo/midrange/stax corridor the report showed rather than
    # the pooled `CEDH` one.
    template = conditioned_template(
        speed,
        overrides,
        targets_from_report(diagnostics.types, speed=speed),
        scale=deck_size / 99,
        curve=curve,
        cedh_class=diagnostics.cedh_class,
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
        max_game_changers=max_game_changers,
    )
    result.notes.extend(report.notes)

    log.info("fill.done", slots=slots, pool=len(candidates), status=result.status)
    return result
