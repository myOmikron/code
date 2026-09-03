"""Task K — where a deck sits: measured speed x interaction axes and
class-conditioned floors (`implementation-plans/cedh-pro/00-OVERVIEW.md`,
`TASK-K-AXES-AND-FLOORS.md`).

The scene-wide stack alarm (Task I) measured a floor of 0.000 — a tenth of
top-cut decks run no counterspells and win anyway, because that is a
trade-off a turbo pilot accepts on purpose. The honest alarm is relative to
a deck's own class, and the map the task asks for is "where does my deck
sit on a speed x interaction plane, against real tournament decks" — not a
new bucket, a new *view* over data every other module here already measured.

Two corpus facts, both established by earlier tasks, decide the design
rather than a hunch:

1. **Interaction has to be the whole grid, not the stack row alone**
   (`meta.MEASURED_INTERACTION_PROFILES`'s own note). Stax decks run almost
   no stack interaction — their disruption is permanent-based tax/denial —
   so a stack-only reading puts stax in the "off-meta" corner instead of
   where it belongs. K2 below measures whether `grid_total` (all four rows)
   actually separates the three classes better than the stack row alone;
   it is not assumed.
2. **A deck's own mean mana value and fast-mana count do not separate
   turbo from midrange** (`cedh_archetypes`' own measured, and rejected,
   features — fast_mana is *higher* for midrange, mean_mv is *higher* for
   turbo). The speed candidate this module actually lands on has to be the
   one the data shows separating the classes, which is why K1 below reuses
   Task H's own hold-every-piece join to find each deck's own earliest
   complete-line turn, rather than any raw curve statistic.

## K1 — per-deck features

`_fetch_deck_points` builds one row per usable `:TournamentDeck`: Task E's
`DeckFeatures` and predicted `ArchetypeClass` (`cedh_archetypes.
measure_cedh_classes`, reused wholesale — not re-fetched, since that
function already pays for the one expensive per-deck card scan this task
also needs), the four interaction-grid row totals (`meta.
_card_interaction_classification`'s per-card classification, aggregated
per deck the same "anchor on the small side" way `meta._stack_per_deck_
counts` does for the one row Task I needed — extended here to all four),
and `min_deploy_turn` — the smallest deploy-cost-derived turn over the
*complete* lines a deck holds, from Task H's own candidate-combo phase
(`meta._threat_candidates`, phase-1-pruned and phase-2-joined so this never
walks from all 17,663 decks' `PLAYED` edges the way the module docstring's
OOM hazard warns against). A deck with no complete line among those
candidates gets `min_deploy_turn = None` — counted, never imputed.

`min_deploy_turn`'s speed value is Task J's `Line.deploy_cost` when that
field exists on `lines.Line` (checked once, at import time, via
`_HAS_DEPLOY_COST` — never re-checked per deck or per combo), falling back
to the honest `mana_value_needed` otherwise with `SPEED_SOURCE` naming
which one actually ran. J owns `lines.py`/`meta.py`; this module only reads
`lines.deploy_cost_for` (a pure function, safe to import defensively) and
never edits either file.

## K2 — axis selection by evidence

`score_axis_pair` scores every (speed candidate, interaction candidate)
pair against the 18 publicly-known anchor commanders
(`cedh_archetypes.ANCHOR_COMMANDERS` — real class labels, not this
classifier's own predictions): normalise both axes (decay-weighted mean/
stdev over the anchor decks that have both values — a deck with no
complete candidate line is excluded from *that* pair's scoring and counted
separately, never imputed), compute each true class's decay-weighted
centroid, and report the share of each class's own anchor decks that land
nearer their own centroid than either other class's. `select_axes` picks
the pair maximising the *worst*-performing class's share (a judgment call:
an aggregate accuracy a big class alone could carry would hide exactly the
turbo/midrange confusion binding fact 2 above predicts) and reports whether
turbo and midrange separate at all — if neither clears a bare majority, the
map still stands as a description, but should be read as stax/non-stax x
speed, honestly, not a clean three-way split (K2's own docstring on
`select_axes` states which case actually measured).

## K3 — class-conditioned floors

`class_interaction_floors`: per `ArchetypeClass`, the decay-weighted 10th
percentile (`meta._weighted_percentile`, reused) of *that class's own
currency* — stack + proactive_protection for turbo and midrange (the
answers those two plans actually rely on), permanent_answer + class_hate
for stax (fact 1 above, restated as a floor rather than a map axis).
Unclassified decks earn no floor: they did not land cleanly in one of the
three currencies to begin with, so a floor computed over them would not
describe anything real.

## K4 — the map, once

`build_axes_map` bins the corpus (10x10 by default) over the chosen axes,
decay-weighted, per predicted class, plus each class's centroid — landed as
`SCENE_AXES_MAP[scene]`, printed by `measure_axes`/`deck-lab measure-axes`,
never recomputed per request. `position_for_deck` is the per-request
sibling `diagnostics.py` calls: given a submitted deck's own already-built
interaction grid and complete lines, compute the same two numbers the same
way, look up its class's floor, and say whether it is below it.

Scene purity (00-OVERVIEW decision 1b): every scene-shaped constant here is
a plain dict keyed by a `scene` string, exactly like `meta.
MEASURED_THREATS`. No identifier in this module names `cedh` — the module
name itself is the one allowed exception, following `cedh_archetypes.py`/
`cedh_profiles.py`'s own precedent.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from dataclasses import fields as _dc_fields
from datetime import UTC, datetime

from . import lines as _lines_module
from .cedh_archetypes import ANCHOR_COMMANDERS, ArchetypeClass, DeckFeatures, measure_cedh_classes
from .interaction import InteractionGrid
from .lines import Line, PieceInfo
from .meta import (
    HALF_LIFE_DAYS_BY_SCENE,
    MANA_PER_TURN_BY_SCENE,
    _card_interaction_classification,
    _combo_pieces,
    _decay_weight,
    _parse_date,
    _threat_candidates,
    _threat_turn,
    _weighted_percentile,
)

# --------------------------------------------------------------------------
# K1 — speed source: `Line.deploy_cost` (Task J) once it exists, else the
# honest `mana_value_needed` fallback. Checked once, at import time, against
# the dataclass's own field names rather than trying to construct a `Line`
# just to probe it — `lines.deploy_cost_for` is imported defensively
# (`getattr` on the module, not a top-level `from .lines import
# deploy_cost_for`) so this module still loads if J has not landed yet.
# --------------------------------------------------------------------------

_HAS_DEPLOY_COST: bool = "deploy_cost" in {f.name for f in _dc_fields(Line)}
SPEED_SOURCE: str = "deploy_cost" if _HAS_DEPLOY_COST else "mana_value_needed"
_deploy_cost_for = getattr(_lines_module, "deploy_cost_for", None)


def _line_speed_value(line: Line) -> int:
    """One already-resolved deck line's own speed input."""
    if _HAS_DEPLOY_COST:
        return int(line.deploy_cost)
    return int(line.mana_value_needed)


def _combo_speed_value(mana_value_needed: int, pieces_info: Sequence[PieceInfo]) -> int:
    """One candidate combo's own speed input — the same value every deck
    holding that combo shares, computed once per combo rather than once per
    (combo, deck) pair. Mirrors `meta._assemble_threat_table`'s own
    `deploy_cost_for(pieces_info, mv) if pieces_info else (mv, False)`
    degrade for a combo `_combo_pieces` returned nothing for."""
    if _HAS_DEPLOY_COST and _deploy_cost_for is not None and pieces_info:
        value, _partial = _deploy_cost_for(pieces_info, mana_value_needed)
        return int(value)
    return int(mana_value_needed)


def min_deploy_turn(lines_: Sequence[Line], *, mana_per_turn: float) -> int | None:
    """The smallest realistic turn over a deck's own *complete* lines, or
    `None` when it holds none — counted, never imputed (K1)."""
    turns = [
        _threat_turn(_line_speed_value(line), mana_per_turn) for line in lines_ if line.complete
    ]
    return min(turns) if turns else None


# --------------------------------------------------------------------------
# K1 — per-deck interaction-grid row totals, all four rows at once
# --------------------------------------------------------------------------

# Task C's own row names (`interaction._ROWS`), restated as plain strings
# rather than imported — private there, and `meta.py` already treats them
# the same way throughout (see `meta._INTERACTION_ROWS`'s own comment for
# the precedent this follows).
_INTERACTION_ROWS: tuple[str, ...] = (
    "stack",
    "proactive_protection",
    "permanent_answer",
    "class_hate",
)

# `meta._STACK_PER_DECK_COUNTS_QUERY`'s shape, generalised from the one row
# Task I needed to all four this task's own interaction candidates read
# (`grid_total` and `stack_plus_proactive` both need rows beyond stack) and
# carrying `d.id` so each count can be joined back onto the same deck's
# features/archetype/min_deploy_turn — I1 never needed that join, only a
# percentile over the raw counts, so its own query has no deck id column.
#
# `$deck_ids IS NULL OR d.id IN $deck_ids` — `meta._CELL_DATE_COUNTS_QUERY`'s
# own nullable-filter idiom, reused so the exact same query text serves both
# the full corpus run (`deck_ids=None`) and the hazard rule's own "prove on
# LIMIT 200 decks, print the timing, before the full run" requirement
# (`_prove_row_totals` below passes 200 sampled ids through this parameter).
_ROW_PER_DECK_COUNTS_QUERY = """
UNWIND $cells AS cell
UNWIND cell.ids AS oid
MATCH (c:Card {oracle_id: oid})<-[:PLAYED]-(d:TournamentDeck {scene: $scene})
WHERE $deck_ids IS NULL OR d.id IN $deck_ids
WITH cell.row AS row, d.id AS deck_id, count(*) AS n
RETURN row, deck_id, n
"""

_DECK_DATES_QUERY = (
    "MATCH (d:TournamentDeck {scene: $scene}) RETURN d.id AS deck_id, d.date AS date"
)

_SAMPLE_DECK_IDS_QUERY = (
    "MATCH (d:TournamentDeck {scene: $scene}) RETURN d.id AS deck_id LIMIT $limit"
)

# H1's own per-deck attribution never happened — `_threat_candidates`
# collapses matches to (date, n) pairs per combo because H1 only ever needed
# a decay-weighted count. This task needs to know *which* deck, so this is a
# new query, restricted to the same phase-1-pruned, phase-2-ranked candidate
# combo ids `_threat_candidates` already returns — never the full ~1,600
# phase-1 pool (`meta._CANDIDATE_COMBOS_QUERY`'s own comment: that pool is a
# pruning bound, not a ranking, and is not meant to be joined against decks
# on its own). Bounded by `candidate_pool` the same way H1's own report is.
# Same nullable `$deck_ids` filter as the query above, same reason.
_COMBO_DECK_MATCHES_QUERY = """
MATCH (k:Combo) WHERE k.id IN $combo_ids
MATCH (k)-[:USES]->(piece:Card)<-[:PLAYED]-(d:TournamentDeck {scene: $scene})
WHERE $deck_ids IS NULL OR d.id IN $deck_ids
WITH k, d, count(DISTINCT piece) AS have
WHERE have = k.pieces
RETURN k.id AS combo_id, d.id AS deck_id
"""

# Hazard rule (00-OVERVIEW.md): a driver-side timeout on every query over
# `TournamentDeck`/`PLAYED`, so a shape that turns out unexpectedly
# expensive on a bigger corpus fails loudly instead of hanging a session.
# Every full-corpus query this module runs stayed under 30s when proven
# live (see the task report); 120s leaves headroom without masking a real
# regression.
QUERY_TIMEOUT_SECONDS = 120.0

# The hazard rule's own number: prove a new query shape on 200 decks and
# print its timing before ever running it over the full corpus.
PROOF_DECK_LIMIT = 200


def _row_ids(grid: InteractionGrid, row_name: str) -> list[str]:
    row = next((r for r in grid.rows if r.row == row_name), None)
    if row is None:
        return []
    return [name for cell in row.cells.values() for name in cell.cards]


def _fetch_deck_dates(scene: str) -> dict[str, str | None]:
    from neo4j import Query

    from .config import settings
    from .graph import driver

    query = Query(_DECK_DATES_QUERY, timeout=QUERY_TIMEOUT_SECONDS)
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return {r["deck_id"]: r["date"] for r in session.run(query, scene=scene)}


def _sample_deck_ids(scene: str, *, limit: int = PROOF_DECK_LIMIT) -> list[str]:
    """`limit` sampled deck ids — the bounded universe the hazard rule's own
    proof queries run against before anything touches the full corpus."""
    from neo4j import Query

    from .config import settings
    from .graph import driver

    query = Query(_SAMPLE_DECK_IDS_QUERY, timeout=QUERY_TIMEOUT_SECONDS)
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [r["deck_id"] for r in session.run(query, scene=scene, limit=limit)]


def _fetch_row_totals(
    scene: str, *, deck_ids: list[str] | None = None
) -> dict[str, dict[str, int]]:
    """deck_id -> {row: count}, every row unioned across cost columns —
    Task C's row/column classification is a fact about the cards
    (`_card_interaction_classification`), fetched once for the whole
    corpus; this walks backward from that bounded card-id list to the
    decks that played one, never the reverse. `deck_ids=None` (the default,
    every real caller) runs over the full scene; a caller passing a sampled
    list gets the hazard rule's own bounded proof instead, same query text.
    """
    from neo4j import Query

    from .config import settings
    from .graph import driver

    grid = _card_interaction_classification()
    cells = [{"row": row_name, "ids": _row_ids(grid, row_name)} for row_name in _INTERACTION_ROWS]
    cells = [c for c in cells if c["ids"]]
    if not cells:
        return {}

    out: dict[str, dict[str, int]] = {}
    query = Query(_ROW_PER_DECK_COUNTS_QUERY, timeout=QUERY_TIMEOUT_SECONDS)
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for record in session.run(query, scene=scene, cells=cells, deck_ids=deck_ids):
            out.setdefault(record["deck_id"], {})[record["row"]] = record["n"]
    return out


def _prove_row_totals(scene: str) -> tuple[float, int]:
    """Hazard rule: run `_ROW_PER_DECK_COUNTS_QUERY` bounded to
    `PROOF_DECK_LIMIT` sampled decks and time it, before the unbounded call
    in `measure_axes` ever runs. Returns `(seconds, decks_with_a_row)`;
    `measure_axes` carries both into `AxesMeasurement.notes`."""
    import time

    deck_ids = _sample_deck_ids(scene)
    start = time.monotonic()
    result = _fetch_row_totals(scene, deck_ids=deck_ids)
    return time.monotonic() - start, len(result)


def _fetch_combo_deck_matches(
    scene: str, combo_ids: list[str], *, deck_ids: list[str] | None = None
) -> list[tuple[str, str]]:
    """`(combo_id, deck_id)` for every candidate combo a deck holds
    completely — bounded to the already-pruned/ranked `combo_ids` list
    (order tens, never the full phase-1 pool). `deck_ids=None` (every real
    caller) runs over the full scene; a sampled list runs the hazard rule's
    own bounded proof through the same query text."""
    if not combo_ids:
        return []
    from neo4j import Query

    from .config import settings
    from .graph import driver

    query = Query(_COMBO_DECK_MATCHES_QUERY, timeout=QUERY_TIMEOUT_SECONDS)
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [
            (r["combo_id"], r["deck_id"])
            for r in session.run(query, scene=scene, combo_ids=combo_ids, deck_ids=deck_ids)
        ]


def _prove_combo_deck_matches(scene: str, combo_ids: list[str]) -> tuple[float, int]:
    """Hazard rule: `_COMBO_DECK_MATCHES_QUERY`'s own LIMIT-200-decks proof,
    `_prove_row_totals`'s twin."""
    import time

    deck_ids = _sample_deck_ids(scene)
    start = time.monotonic()
    result = _fetch_combo_deck_matches(scene, combo_ids, deck_ids=deck_ids)
    return time.monotonic() - start, len(result)


def _deck_min_turns(
    pairs: Sequence[tuple[str, str]], combo_turn: Mapping[str, int]
) -> dict[str, int]:
    """Pure: `(combo_id, deck_id)` pairs + each combo's own turn -> each
    deck's minimum. A deck absent from the result held no candidate combo
    completely."""
    out: dict[str, int] = {}
    for combo_id, deck_id in pairs:
        turn = combo_turn.get(combo_id)
        if turn is None:
            continue
        if deck_id not in out or turn < out[deck_id]:
            out[deck_id] = turn
    return out


# --------------------------------------------------------------------------
# K1 — the per-deck axis point and its pure assembly
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class DeckAxisPoint:
    """One tournament deck's row for the axis measurement: Task E's
    features and predicted class, the four interaction-grid row totals,
    `min_deploy_turn`, and its decay weight."""

    deck_id: str
    commander_name: str
    archetype: ArchetypeClass
    weight: float
    fast_mana: int
    mean_mv: float
    min_deploy_turn: int | None
    stack: int
    proactive: int
    permanent: int
    class_hate: int

    @property
    def grid_total(self) -> int:
        return self.stack + self.proactive + self.permanent + self.class_hate

    @property
    def stack_plus_proactive(self) -> int:
        return self.stack + self.proactive

    @property
    def permanent_plus_hate(self) -> int:
        return self.permanent + self.class_hate


SPEED_CANDIDATES: tuple[str, ...] = ("min_deploy_turn", "fast_mana", "mean_mv")
INTERACTION_CANDIDATES: tuple[str, ...] = ("grid_total", "stack_plus_proactive", "stack")


def _speed_value(
    candidate: str, *, fast_mana: int, mean_mv: float, turn: int | None
) -> float | None:
    if candidate == "min_deploy_turn":
        return float(turn) if turn is not None else None
    if candidate == "fast_mana":
        return float(fast_mana)
    if candidate == "mean_mv":
        return mean_mv
    raise ValueError(f"unknown speed candidate {candidate!r}")


def _interaction_value(
    candidate: str, *, stack: int, proactive: int, permanent: int, class_hate: int
) -> float:
    if candidate == "grid_total":
        return float(stack + proactive + permanent + class_hate)
    if candidate == "stack_plus_proactive":
        return float(stack + proactive)
    if candidate == "stack":
        return float(stack)
    raise ValueError(f"unknown interaction candidate {candidate!r}")


def _assemble_deck_points(
    samples: Sequence,
    *,
    deck_dates: Mapping[str, str | None],
    row_totals: Mapping[str, Mapping[str, int]],
    min_turns: Mapping[str, int],
    now: datetime,
    half_life_days: float,
) -> list[DeckAxisPoint]:
    """Pure: `cedh_archetypes.measure_cedh_classes`' own samples plus the
    three per-deck maps this module fetched -> one `DeckAxisPoint` per
    usable deck. Testable with fabricated samples, no live Neo4j."""
    points: list[DeckAxisPoint] = []
    for sample in samples:
        date = deck_dates.get(sample.deck_id)
        weight = _decay_weight(_parse_date(date), now=now, half_life_days=half_life_days)
        rows = row_totals.get(sample.deck_id, {})
        points.append(
            DeckAxisPoint(
                deck_id=sample.deck_id,
                commander_name=sample.commander_name,
                archetype=sample.archetype,
                weight=weight,
                fast_mana=sample.features.fast_mana,
                mean_mv=sample.features.mean_mv,
                min_deploy_turn=min_turns.get(sample.deck_id),
                stack=rows.get("stack", 0),
                proactive=rows.get("proactive_protection", 0),
                permanent=rows.get("permanent_answer", 0),
                class_hate=rows.get("class_hate", 0),
            )
        )
    return points


# --------------------------------------------------------------------------
# K2 — axis selection by evidence
# --------------------------------------------------------------------------

_KNOWN_CLASSES: tuple[ArchetypeClass, ...] = (
    ArchetypeClass.TURBO,
    ArchetypeClass.MIDRANGE,
    ArchetypeClass.STAX,
)


def _weighted_mean_std(pairs: Sequence[tuple[float, float]]) -> tuple[float, float]:
    total_w = sum(w for _, w in pairs)
    if total_w <= 0:
        return 0.0, 1.0
    mean = sum(v * w for v, w in pairs) / total_w
    var = sum(w * (v - mean) ** 2 for v, w in pairs) / total_w
    # A zero-variance axis (every scored deck shares one value) would divide
    # by zero for no information gained — every point is already at the
    # mean, so a std of 1.0 makes that axis contribute nothing rather than
    # crash.
    return mean, math.sqrt(var) if var > 1e-9 else 1.0


@dataclass(frozen=True, slots=True)
class AxisPairScore:
    """One (speed, interaction) candidate pair's separation score over the
    18 anchor commanders' known-class decks (K2) — not this classifier's
    own predictions, the publicly-known labels `select_axes` is judged
    against."""

    speed: str
    interaction: str
    n_scored: int
    n_excluded_no_speed: int
    shares_by_class: dict[ArchetypeClass, float]
    overall_share: float
    # Diagnostic, not a selection input: how many turbo anchor decks read
    # nearer midrange's centroid and vice versa — corpus fact 2 predicts
    # this confusion specifically, so it is reported on every pair rather
    # than folded into the one overall number.
    turbo_as_midrange: int
    midrange_as_turbo: int

    @property
    def worst_class_share(self) -> float:
        return min(self.shares_by_class.values()) if self.shares_by_class else 0.0


def score_axis_pair(
    points: Sequence[DeckAxisPoint],
    speed_candidate: str,
    interaction_candidate: str,
    *,
    anchors: Mapping[str, ArchetypeClass] = ANCHOR_COMMANDERS,
) -> AxisPairScore:
    """K2: normalise both axes over the anchor decks that have a defined
    speed value, compute each true class's decay-weighted centroid, and
    report the share of each class's own decks nearer their own centroid
    than either other class's — "simple, printable, no clustering black
    box" per the task file."""
    scored: list[tuple[DeckAxisPoint, ArchetypeClass, float, float]] = []
    excluded_no_speed = 0
    for point in points:
        true_class = anchors.get(point.commander_name)
        if true_class not in _KNOWN_CLASSES:
            continue
        speed_v = _speed_value(
            speed_candidate,
            fast_mana=point.fast_mana,
            mean_mv=point.mean_mv,
            turn=point.min_deploy_turn,
        )
        if speed_v is None:
            excluded_no_speed += 1
            continue
        interaction_v = _interaction_value(
            interaction_candidate,
            stack=point.stack,
            proactive=point.proactive,
            permanent=point.permanent,
            class_hate=point.class_hate,
        )
        scored.append((point, true_class, speed_v, interaction_v))

    if not scored:
        return AxisPairScore(
            speed=speed_candidate,
            interaction=interaction_candidate,
            n_scored=0,
            n_excluded_no_speed=excluded_no_speed,
            shares_by_class={},
            overall_share=0.0,
            turbo_as_midrange=0,
            midrange_as_turbo=0,
        )

    speed_mean, speed_std = _weighted_mean_std([(s, p.weight) for p, _, s, _ in scored])
    inter_mean, inter_std = _weighted_mean_std([(i, p.weight) for p, _, _, i in scored])

    def normalized(s: float, i: float) -> tuple[float, float]:
        return (s - speed_mean) / speed_std, (i - inter_mean) / inter_std

    by_class: dict[ArchetypeClass, list[tuple[tuple[float, float], float]]] = {}
    for point, cls, s, i in scored:
        by_class.setdefault(cls, []).append((normalized(s, i), point.weight))

    centroids: dict[ArchetypeClass, tuple[float, float]] = {}
    for cls, values in by_class.items():
        total_w = sum(w for _, w in values) or 1.0
        cx = sum(v[0] * w for v, w in values) / total_w
        cy = sum(v[1] * w for v, w in values) / total_w
        centroids[cls] = (cx, cy)

    def nearest(xy: tuple[float, float]) -> ArchetypeClass:
        return min(
            centroids, key=lambda c: (xy[0] - centroids[c][0]) ** 2 + (xy[1] - centroids[c][1]) ** 2
        )

    correct_by_class: dict[ArchetypeClass, int] = dict.fromkeys(centroids, 0)
    total_by_class: dict[ArchetypeClass, int] = dict.fromkeys(centroids, 0)
    turbo_as_midrange = 0
    midrange_as_turbo = 0
    for _point, cls, s, i in scored:
        nearest_cls = nearest(normalized(s, i))
        total_by_class[cls] += 1
        if nearest_cls == cls:
            correct_by_class[cls] += 1
        if cls is ArchetypeClass.TURBO and nearest_cls is ArchetypeClass.MIDRANGE:
            turbo_as_midrange += 1
        if cls is ArchetypeClass.MIDRANGE and nearest_cls is ArchetypeClass.TURBO:
            midrange_as_turbo += 1

    shares = {
        cls: (correct_by_class[cls] / total_by_class[cls] if total_by_class[cls] else 0.0)
        for cls in total_by_class
    }
    overall = sum(correct_by_class.values()) / sum(total_by_class.values())

    return AxisPairScore(
        speed=speed_candidate,
        interaction=interaction_candidate,
        n_scored=len(scored),
        n_excluded_no_speed=excluded_no_speed,
        shares_by_class=shares,
        overall_share=overall,
        turbo_as_midrange=turbo_as_midrange,
        midrange_as_turbo=midrange_as_turbo,
    )


# A class separates "at all" once a bare majority of its own anchor decks
# land nearer their own centroid than either other class's — the honest bar
# corpus fact 2 asks this module to check turbo and midrange against, not a
# tuned threshold.
SEPARATION_MAJORITY = 0.5


def select_axes(
    points: Sequence[DeckAxisPoint], *, anchors: Mapping[str, ArchetypeClass] = ANCHOR_COMMANDERS
) -> tuple[AxisPairScore, list[AxisPairScore]]:
    """Score every candidate pair, pick the one maximising the *worst*
    class's share (an aggregate a big class alone could carry would hide
    exactly the turbo/midrange confusion corpus fact 2 predicts), and
    return `(chosen, all_scores)` — `render_axes_constants` prints the full
    table so the pick is auditable, not asserted.
    """
    scores = [
        score_axis_pair(points, speed, interaction, anchors=anchors)
        for speed in SPEED_CANDIDATES
        for interaction in INTERACTION_CANDIDATES
    ]
    chosen = max(scores, key=lambda sc: (sc.worst_class_share, sc.overall_share))
    return chosen, scores


def separates_turbo_midrange(score: AxisPairScore) -> bool:
    """Whether the chosen pair clears corpus fact 2's own bar for both
    turbo and midrange — `False` means the map should be read as
    stax/non-stax x speed, not a clean three-way split (task file, K2)."""
    return (
        score.shares_by_class.get(ArchetypeClass.TURBO, 0.0) >= SEPARATION_MAJORITY
        and score.shares_by_class.get(ArchetypeClass.MIDRANGE, 0.0) >= SEPARATION_MAJORITY
    )


# --------------------------------------------------------------------------
# K3 — class-conditioned interaction floors
# --------------------------------------------------------------------------

# Each class's own currency (task file, K3) — turbo and midrange lean on
# stack + proactive_protection (counterspells and the "you can't cast that"
# class); stax leans on permanent_answer + class_hate (tax/denial, the
# corpus fact 1 restated as a floor rather than a map axis). Unclassified
# decks are deliberately absent: they did not land cleanly in one of the
# three currencies to begin with.
_FLOOR_CURRENCY: dict[ArchetypeClass, str] = {
    ArchetypeClass.TURBO: "stack_plus_proactive",
    ArchetypeClass.MIDRANGE: "stack_plus_proactive",
    ArchetypeClass.STAX: "permanent_plus_hate",
}

# The percentile the task file names (K3): "the decayed 10th percentile of
# that class's own currency" — mirrors I1's own stack alarm floor's choice
# of q, not re-derived.
FLOOR_PERCENTILE = 0.10


def _currency_value(
    currency: str, *, stack: int, proactive: int, permanent: int, class_hate: int
) -> float:
    """One class's own currency (K3), computed from the four raw row
    counts — never from `_interaction_value`'s map-axis candidates
    (`grid_total`/`stack_plus_proactive`/`stack`), which are a DIFFERENT
    quantity picked for cross-class map-plotting (K2). A turbo deck's floor
    is measured in `stack_plus_proactive` units; comparing it against a
    `grid_total` reading would silently compare two different scales — see
    `position_for_deck`'s own call site for why this stays a separate
    function rather than reusing `_interaction_value`.
    """
    if currency == "stack_plus_proactive":
        return float(stack + proactive)
    if currency == "permanent_plus_hate":
        return float(permanent + class_hate)
    raise ValueError(f"unknown currency {currency!r}")


def class_interaction_floors(
    points: Sequence[DeckAxisPoint], *, q: float = FLOOR_PERCENTILE
) -> dict[ArchetypeClass, tuple[float, int]]:
    """K3: `{class: (floor, deck_count)}`, over every corpus deck the
    classifier itself predicted into that class (not just the anchors —
    K2's evidence step is the only place this module restricts itself to
    the labelled 18)."""
    out: dict[ArchetypeClass, tuple[float, int]] = {}
    for cls, currency in _FLOOR_CURRENCY.items():
        pairs = [
            (
                _currency_value(
                    currency,
                    stack=p.stack,
                    proactive=p.proactive,
                    permanent=p.permanent,
                    class_hate=p.class_hate,
                ),
                p.weight,
            )
            for p in points
            if p.archetype is cls
        ]
        if not pairs:
            continue
        out[cls] = (_weighted_percentile(pairs, q), len(pairs))
    return out


# --------------------------------------------------------------------------
# K4 — the map: coarse decayed density + centroids, once
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class DensityBin:
    speed_bin: int
    interaction_bin: int
    archetype: ArchetypeClass
    weight: float


@dataclass(frozen=True, slots=True)
class ClassCentroid:
    archetype: ArchetypeClass
    speed: float
    interaction: float
    decks: int


@dataclass(frozen=True, slots=True)
class SceneAxesMap:
    """K4's landed constant — `SCENE_AXES_MAP[scene]`. The UI draws the
    cloud from this without ever touching the corpus (task file)."""

    scene: str
    measured: str
    speed_axis: str
    interaction_axis: str
    speed_range: tuple[float, float]
    interaction_range: tuple[float, float]
    bins_per_axis: int
    density: tuple[DensityBin, ...]
    centroids: tuple[ClassCentroid, ...]
    excluded_no_speed: int


DEFAULT_BINS_PER_AXIS = 10


def build_axes_map(
    points: Sequence[DeckAxisPoint],
    *,
    scene: str,
    speed_axis: str,
    interaction_axis: str,
    bins_per_axis: int = DEFAULT_BINS_PER_AXIS,
    now: datetime,
) -> SceneAxesMap:
    """K4: bin every classified (non-unclassified) deck with a defined
    speed value into a `bins_per_axis x bins_per_axis` decay-weighted
    density grid, plus each class's own decay-weighted centroid."""
    usable: list[tuple[DeckAxisPoint, float, float]] = []
    excluded_no_speed = 0
    for p in points:
        if p.archetype not in _KNOWN_CLASSES:
            continue
        s = _speed_value(
            speed_axis, fast_mana=p.fast_mana, mean_mv=p.mean_mv, turn=p.min_deploy_turn
        )
        if s is None:
            excluded_no_speed += 1
            continue
        i = _interaction_value(
            interaction_axis,
            stack=p.stack,
            proactive=p.proactive,
            permanent=p.permanent,
            class_hate=p.class_hate,
        )
        usable.append((p, s, i))

    if not usable:
        return SceneAxesMap(
            scene=scene,
            measured=now.date().isoformat(),
            speed_axis=speed_axis,
            interaction_axis=interaction_axis,
            speed_range=(0.0, 0.0),
            interaction_range=(0.0, 0.0),
            bins_per_axis=bins_per_axis,
            density=(),
            centroids=(),
            excluded_no_speed=excluded_no_speed,
        )

    speed_lo = min(s for _, s, _ in usable)
    speed_hi = max(s for _, s, _ in usable)
    inter_lo = min(i for _, _, i in usable)
    inter_hi = max(i for _, _, i in usable)
    speed_span = (speed_hi - speed_lo) or 1.0
    inter_span = (inter_hi - inter_lo) or 1.0

    def bin_index(value: float, lo: float, span: float) -> int:
        idx = int((value - lo) / span * bins_per_axis)
        return min(max(idx, 0), bins_per_axis - 1)

    density_weight: dict[tuple[int, int, ArchetypeClass], float] = {}
    # per-class running sums for the weighted centroid: [sum(s*w), sum(i*w), sum(w), n]
    class_sums: dict[ArchetypeClass, list[float]] = {}
    for p, s, i in usable:
        key = (bin_index(s, speed_lo, speed_span), bin_index(i, inter_lo, inter_span), p.archetype)
        density_weight[key] = density_weight.get(key, 0.0) + p.weight
        acc = class_sums.setdefault(p.archetype, [0.0, 0.0, 0.0, 0.0])
        acc[0] += s * p.weight
        acc[1] += i * p.weight
        acc[2] += p.weight
        acc[3] += 1

    density = tuple(
        DensityBin(speed_bin=sb, interaction_bin=ib, archetype=cls, weight=round(w, 4))
        for (sb, ib, cls), w in sorted(
            density_weight.items(), key=lambda kv: (kv[0][2], kv[0][0], kv[0][1])
        )
    )
    centroids = tuple(
        ClassCentroid(
            archetype=cls,
            speed=acc[0] / acc[2] if acc[2] else 0.0,
            interaction=acc[1] / acc[2] if acc[2] else 0.0,
            decks=int(acc[3]),
        )
        for cls, acc in class_sums.items()
    )

    return SceneAxesMap(
        scene=scene,
        measured=now.date().isoformat(),
        speed_axis=speed_axis,
        interaction_axis=interaction_axis,
        speed_range=(speed_lo, speed_hi),
        interaction_range=(inter_lo, inter_hi),
        bins_per_axis=bins_per_axis,
        density=density,
        centroids=centroids,
        excluded_no_speed=excluded_no_speed,
    )


# --------------------------------------------------------------------------
# Landed constants — populated by pasting a reviewed `measure_axes` run,
# `meta.MEASURED_THREATS`' own discipline.
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ChosenAxes:
    """K2's landed pick for a scene."""

    speed: str
    interaction: str
    separates_turbo_midrange: bool
    speed_source: str
    measured: str


CHOSEN_AXES: dict[str, ChosenAxes] = {}
INTERACTION_FLOOR_BY_CLASS: dict[str, dict[ArchetypeClass, float]] = {}
SCENE_AXES_MAP: dict[str, SceneAxesMap] = {}

# measured 2026-09-03 on the live 17,663-deck edhtop16 corpus (14,608 usable
# after Task E's own resolution floor, 3,055 excluded) via `deck-lab
# measure-axes --scene cedh --candidate-pool 100` (~30s total; both hazard-
# rule proof queries ran first, on 200 sampled decks: `_ROW_PER_DECK_COUNTS_
# QUERY` 0.71s, `_COMBO_DECK_MATCHES_QUERY` 1.14s) — re-run and re-paste to
# refresh. `speed_source="deploy_cost"`: Task J had already landed
# `Line.deploy_cost` by the time this ran, so the fallback path never fired
# live (it is unit-tested by monkeypatching `_HAS_DEPLOY_COST`, not
# exercised here).
#
# `fast_mana`/`grid_total` won K2's own selection metric (worst-class share
# 0.57) over every `min_deploy_turn` pairing (best 0.54, `stack_plus_
# proactive`) — a real, measured surprise the task file's own framing did
# not predict (it named `min_deploy_turn` as "the likeliest" candidate).
# Measured, not forced: `min_deploy_turn` is only defined for anchor decks
# holding a complete line among the 100 candidate combos (7,599 of 8,125;
# 526 excluded, counted rather than imputed), and among those, a deck's
# fastest *popular* complete line turned out to be a noisier per-deck signal
# than a curve statistic computed over its entire 99 cards — see the task
# report for the full table and reasoning. `separates_turbo_midrange=True`:
# both classes clear the >=50% bar on the chosen pair, so corpus fact 2's
# worst case (no pair separates them at all) did not happen here.
CHOSEN_AXES["cedh"] = ChosenAxes(
    speed="fast_mana",
    interaction="grid_total",
    separates_turbo_midrange=True,
    speed_source="deploy_cost",
    measured="2026-09-03",
)

INTERACTION_FLOOR_BY_CLASS["cedh"] = {
    ArchetypeClass.TURBO: 1.0000,
    ArchetypeClass.MIDRANGE: 11.0000,
    ArchetypeClass.STAX: 17.0000,
}

# Same run. Class centroids on the chosen axes only partially match the
# user's sketch (task report has the full comparison): turbo (interaction
# 24.68, lowest) and midrange (interaction 37.71, highest) land where the
# sketch predicts, but stax (interaction 28.83) sits in the *middle* of the
# interaction axis, not at the top — real, not a bug: stax's own class_hate
# + permanent_answer currency (K3) is genuine but smaller in raw count than
# midrange's broader, less-concentrated answer suite. All three classes
# also sit within a narrow band on `fast_mana` itself (9.51-10.31) — the
# axis wins the separation metric measured above, but the map should not
# oversell how far apart the classes actually sit on it.
SCENE_AXES_MAP["cedh"] = SceneAxesMap(
    scene="cedh",
    measured="2026-09-03",
    speed_axis="fast_mana",
    interaction_axis="grid_total",
    speed_range=(0.0, 22.0),
    interaction_range=(3.0, 68.0),
    bins_per_axis=10,
    density=(
        DensityBin(
            speed_bin=0, interaction_bin=4, archetype=ArchetypeClass.MIDRANGE, weight=2.3093
        ),
        DensityBin(
            speed_bin=0, interaction_bin=5, archetype=ArchetypeClass.MIDRANGE, weight=1.0735
        ),
        DensityBin(
            speed_bin=0, interaction_bin=6, archetype=ArchetypeClass.MIDRANGE, weight=0.9105
        ),
        DensityBin(
            speed_bin=0, interaction_bin=7, archetype=ArchetypeClass.MIDRANGE, weight=0.2378
        ),
        DensityBin(
            speed_bin=1, interaction_bin=3, archetype=ArchetypeClass.MIDRANGE, weight=0.9285
        ),
        DensityBin(speed_bin=1, interaction_bin=4, archetype=ArchetypeClass.MIDRANGE, weight=5.19),
        DensityBin(
            speed_bin=1, interaction_bin=5, archetype=ArchetypeClass.MIDRANGE, weight=8.7051
        ),
        DensityBin(
            speed_bin=1, interaction_bin=6, archetype=ArchetypeClass.MIDRANGE, weight=3.9939
        ),
        DensityBin(
            speed_bin=1, interaction_bin=7, archetype=ArchetypeClass.MIDRANGE, weight=0.1734
        ),
        DensityBin(
            speed_bin=1, interaction_bin=8, archetype=ArchetypeClass.MIDRANGE, weight=0.3262
        ),
        DensityBin(speed_bin=2, interaction_bin=3, archetype=ArchetypeClass.MIDRANGE, weight=2.034),
        DensityBin(
            speed_bin=2, interaction_bin=4, archetype=ArchetypeClass.MIDRANGE, weight=31.9157
        ),
        DensityBin(
            speed_bin=2, interaction_bin=5, archetype=ArchetypeClass.MIDRANGE, weight=32.2524
        ),
        DensityBin(
            speed_bin=2, interaction_bin=6, archetype=ArchetypeClass.MIDRANGE, weight=20.4163
        ),
        DensityBin(
            speed_bin=2, interaction_bin=7, archetype=ArchetypeClass.MIDRANGE, weight=1.2826
        ),
        DensityBin(
            speed_bin=2, interaction_bin=8, archetype=ArchetypeClass.MIDRANGE, weight=1.1135
        ),
        DensityBin(
            speed_bin=3, interaction_bin=3, archetype=ArchetypeClass.MIDRANGE, weight=4.8852
        ),
        DensityBin(
            speed_bin=3, interaction_bin=4, archetype=ArchetypeClass.MIDRANGE, weight=130.1739
        ),
        DensityBin(
            speed_bin=3, interaction_bin=5, archetype=ArchetypeClass.MIDRANGE, weight=209.7535
        ),
        DensityBin(
            speed_bin=3, interaction_bin=6, archetype=ArchetypeClass.MIDRANGE, weight=86.2849
        ),
        DensityBin(
            speed_bin=3, interaction_bin=7, archetype=ArchetypeClass.MIDRANGE, weight=10.1696
        ),
        DensityBin(
            speed_bin=3, interaction_bin=8, archetype=ArchetypeClass.MIDRANGE, weight=1.2646
        ),
        DensityBin(
            speed_bin=4, interaction_bin=2, archetype=ArchetypeClass.MIDRANGE, weight=0.1307
        ),
        DensityBin(
            speed_bin=4, interaction_bin=3, archetype=ArchetypeClass.MIDRANGE, weight=4.0688
        ),
        DensityBin(
            speed_bin=4, interaction_bin=4, archetype=ArchetypeClass.MIDRANGE, weight=57.5745
        ),
        DensityBin(
            speed_bin=4, interaction_bin=5, archetype=ArchetypeClass.MIDRANGE, weight=133.8817
        ),
        DensityBin(
            speed_bin=4, interaction_bin=6, archetype=ArchetypeClass.MIDRANGE, weight=106.9274
        ),
        DensityBin(
            speed_bin=4, interaction_bin=7, archetype=ArchetypeClass.MIDRANGE, weight=28.9815
        ),
        DensityBin(speed_bin=4, interaction_bin=8, archetype=ArchetypeClass.MIDRANGE, weight=2.975),
        DensityBin(
            speed_bin=5, interaction_bin=2, archetype=ArchetypeClass.MIDRANGE, weight=0.5267
        ),
        DensityBin(
            speed_bin=5, interaction_bin=3, archetype=ArchetypeClass.MIDRANGE, weight=2.0141
        ),
        DensityBin(
            speed_bin=5, interaction_bin=4, archetype=ArchetypeClass.MIDRANGE, weight=102.6163
        ),
        DensityBin(
            speed_bin=5, interaction_bin=5, archetype=ArchetypeClass.MIDRANGE, weight=197.3871
        ),
        DensityBin(
            speed_bin=5, interaction_bin=6, archetype=ArchetypeClass.MIDRANGE, weight=37.2208
        ),
        DensityBin(
            speed_bin=5, interaction_bin=7, archetype=ArchetypeClass.MIDRANGE, weight=2.0138
        ),
        DensityBin(
            speed_bin=5, interaction_bin=8, archetype=ArchetypeClass.MIDRANGE, weight=0.2927
        ),
        DensityBin(
            speed_bin=6, interaction_bin=3, archetype=ArchetypeClass.MIDRANGE, weight=5.0312
        ),
        DensityBin(
            speed_bin=6, interaction_bin=4, archetype=ArchetypeClass.MIDRANGE, weight=202.8385
        ),
        DensityBin(
            speed_bin=6, interaction_bin=5, archetype=ArchetypeClass.MIDRANGE, weight=112.4439
        ),
        DensityBin(
            speed_bin=6, interaction_bin=6, archetype=ArchetypeClass.MIDRANGE, weight=0.7509
        ),
        DensityBin(
            speed_bin=7, interaction_bin=3, archetype=ArchetypeClass.MIDRANGE, weight=1.1844
        ),
        DensityBin(
            speed_bin=7, interaction_bin=4, archetype=ArchetypeClass.MIDRANGE, weight=11.521
        ),
        DensityBin(
            speed_bin=7, interaction_bin=5, archetype=ArchetypeClass.MIDRANGE, weight=3.8351
        ),
        DensityBin(
            speed_bin=8, interaction_bin=4, archetype=ArchetypeClass.MIDRANGE, weight=0.1112
        ),
        DensityBin(speed_bin=0, interaction_bin=2, archetype=ArchetypeClass.STAX, weight=1.6177),
        DensityBin(speed_bin=0, interaction_bin=3, archetype=ArchetypeClass.STAX, weight=24.4591),
        DensityBin(speed_bin=0, interaction_bin=4, archetype=ArchetypeClass.STAX, weight=17.1722),
        DensityBin(speed_bin=0, interaction_bin=5, archetype=ArchetypeClass.STAX, weight=4.5651),
        DensityBin(speed_bin=0, interaction_bin=6, archetype=ArchetypeClass.STAX, weight=1.3898),
        DensityBin(speed_bin=0, interaction_bin=7, archetype=ArchetypeClass.STAX, weight=0.1376),
        DensityBin(speed_bin=1, interaction_bin=2, archetype=ArchetypeClass.STAX, weight=9.338),
        DensityBin(speed_bin=1, interaction_bin=3, archetype=ArchetypeClass.STAX, weight=38.8065),
        DensityBin(speed_bin=1, interaction_bin=4, archetype=ArchetypeClass.STAX, weight=14.0581),
        DensityBin(speed_bin=1, interaction_bin=5, archetype=ArchetypeClass.STAX, weight=6.4162),
        DensityBin(speed_bin=1, interaction_bin=6, archetype=ArchetypeClass.STAX, weight=4.3393),
        DensityBin(speed_bin=1, interaction_bin=7, archetype=ArchetypeClass.STAX, weight=1.2096),
        DensityBin(speed_bin=1, interaction_bin=8, archetype=ArchetypeClass.STAX, weight=0.7132),
        DensityBin(speed_bin=2, interaction_bin=2, archetype=ArchetypeClass.STAX, weight=10.835),
        DensityBin(speed_bin=2, interaction_bin=3, archetype=ArchetypeClass.STAX, weight=33.4935),
        DensityBin(speed_bin=2, interaction_bin=4, archetype=ArchetypeClass.STAX, weight=30.438),
        DensityBin(speed_bin=2, interaction_bin=5, archetype=ArchetypeClass.STAX, weight=10.5905),
        DensityBin(speed_bin=2, interaction_bin=6, archetype=ArchetypeClass.STAX, weight=4.981),
        DensityBin(speed_bin=2, interaction_bin=7, archetype=ArchetypeClass.STAX, weight=1.7192),
        DensityBin(speed_bin=2, interaction_bin=8, archetype=ArchetypeClass.STAX, weight=2.3046),
        DensityBin(speed_bin=3, interaction_bin=1, archetype=ArchetypeClass.STAX, weight=3.9926),
        DensityBin(speed_bin=3, interaction_bin=2, archetype=ArchetypeClass.STAX, weight=56.5599),
        DensityBin(speed_bin=3, interaction_bin=3, archetype=ArchetypeClass.STAX, weight=21.9297),
        DensityBin(speed_bin=3, interaction_bin=4, archetype=ArchetypeClass.STAX, weight=48.3214),
        DensityBin(speed_bin=3, interaction_bin=5, archetype=ArchetypeClass.STAX, weight=14.2),
        DensityBin(speed_bin=3, interaction_bin=6, archetype=ArchetypeClass.STAX, weight=15.3575),
        DensityBin(speed_bin=3, interaction_bin=7, archetype=ArchetypeClass.STAX, weight=9.8918),
        DensityBin(speed_bin=3, interaction_bin=8, archetype=ArchetypeClass.STAX, weight=0.4654),
        DensityBin(speed_bin=4, interaction_bin=1, archetype=ArchetypeClass.STAX, weight=0.4445),
        DensityBin(speed_bin=4, interaction_bin=2, archetype=ArchetypeClass.STAX, weight=15.5312),
        DensityBin(speed_bin=4, interaction_bin=3, archetype=ArchetypeClass.STAX, weight=22.7539),
        DensityBin(speed_bin=4, interaction_bin=4, archetype=ArchetypeClass.STAX, weight=40.6046),
        DensityBin(speed_bin=4, interaction_bin=5, archetype=ArchetypeClass.STAX, weight=7.597),
        DensityBin(speed_bin=4, interaction_bin=6, archetype=ArchetypeClass.STAX, weight=5.7359),
        DensityBin(speed_bin=4, interaction_bin=7, archetype=ArchetypeClass.STAX, weight=3.6243),
        DensityBin(speed_bin=5, interaction_bin=2, archetype=ArchetypeClass.STAX, weight=20.4338),
        DensityBin(speed_bin=5, interaction_bin=3, archetype=ArchetypeClass.STAX, weight=26.9632),
        DensityBin(speed_bin=5, interaction_bin=4, archetype=ArchetypeClass.STAX, weight=44.3801),
        DensityBin(speed_bin=5, interaction_bin=5, archetype=ArchetypeClass.STAX, weight=16.9846),
        DensityBin(speed_bin=5, interaction_bin=6, archetype=ArchetypeClass.STAX, weight=0.945),
        DensityBin(speed_bin=6, interaction_bin=2, archetype=ArchetypeClass.STAX, weight=12.5884),
        DensityBin(speed_bin=6, interaction_bin=3, archetype=ArchetypeClass.STAX, weight=47.8339),
        DensityBin(speed_bin=6, interaction_bin=4, archetype=ArchetypeClass.STAX, weight=29.0818),
        DensityBin(speed_bin=6, interaction_bin=5, archetype=ArchetypeClass.STAX, weight=2.7131),
        DensityBin(speed_bin=6, interaction_bin=6, archetype=ArchetypeClass.STAX, weight=0.1106),
        DensityBin(speed_bin=7, interaction_bin=2, archetype=ArchetypeClass.STAX, weight=17.5854),
        DensityBin(speed_bin=7, interaction_bin=3, archetype=ArchetypeClass.STAX, weight=69.3586),
        DensityBin(speed_bin=7, interaction_bin=4, archetype=ArchetypeClass.STAX, weight=11.8035),
        DensityBin(speed_bin=7, interaction_bin=5, archetype=ArchetypeClass.STAX, weight=0.1051),
        DensityBin(speed_bin=8, interaction_bin=2, archetype=ArchetypeClass.STAX, weight=1.5083),
        DensityBin(speed_bin=8, interaction_bin=3, archetype=ArchetypeClass.STAX, weight=7.2538),
        DensityBin(speed_bin=8, interaction_bin=4, archetype=ArchetypeClass.STAX, weight=1.0038),
        DensityBin(speed_bin=8, interaction_bin=5, archetype=ArchetypeClass.STAX, weight=5.6783),
        DensityBin(speed_bin=8, interaction_bin=6, archetype=ArchetypeClass.STAX, weight=0.0803),
        DensityBin(speed_bin=9, interaction_bin=3, archetype=ArchetypeClass.STAX, weight=0.8692),
        DensityBin(speed_bin=0, interaction_bin=0, archetype=ArchetypeClass.TURBO, weight=4.4072),
        DensityBin(speed_bin=0, interaction_bin=1, archetype=ArchetypeClass.TURBO, weight=25.5934),
        DensityBin(speed_bin=0, interaction_bin=2, archetype=ArchetypeClass.TURBO, weight=38.0321),
        DensityBin(speed_bin=0, interaction_bin=3, archetype=ArchetypeClass.TURBO, weight=12.8237),
        DensityBin(speed_bin=0, interaction_bin=4, archetype=ArchetypeClass.TURBO, weight=2.6029),
        DensityBin(speed_bin=0, interaction_bin=6, archetype=ArchetypeClass.TURBO, weight=0.5997),
        DensityBin(speed_bin=0, interaction_bin=9, archetype=ArchetypeClass.TURBO, weight=0.2933),
        DensityBin(speed_bin=1, interaction_bin=0, archetype=ArchetypeClass.TURBO, weight=0.5997),
        DensityBin(speed_bin=1, interaction_bin=1, archetype=ArchetypeClass.TURBO, weight=1.6051),
        DensityBin(speed_bin=1, interaction_bin=2, archetype=ArchetypeClass.TURBO, weight=11.9486),
        DensityBin(speed_bin=1, interaction_bin=3, archetype=ArchetypeClass.TURBO, weight=3.3361),
        DensityBin(speed_bin=1, interaction_bin=4, archetype=ArchetypeClass.TURBO, weight=1.9097),
        DensityBin(speed_bin=1, interaction_bin=5, archetype=ArchetypeClass.TURBO, weight=0.6354),
        DensityBin(speed_bin=1, interaction_bin=6, archetype=ArchetypeClass.TURBO, weight=0.2027),
        DensityBin(speed_bin=2, interaction_bin=0, archetype=ArchetypeClass.TURBO, weight=2.5202),
        DensityBin(speed_bin=2, interaction_bin=1, archetype=ArchetypeClass.TURBO, weight=13.5612),
        DensityBin(speed_bin=2, interaction_bin=2, archetype=ArchetypeClass.TURBO, weight=28.1514),
        DensityBin(speed_bin=2, interaction_bin=3, archetype=ArchetypeClass.TURBO, weight=43.3934),
        DensityBin(speed_bin=2, interaction_bin=4, archetype=ArchetypeClass.TURBO, weight=6.3371),
        DensityBin(speed_bin=2, interaction_bin=5, archetype=ArchetypeClass.TURBO, weight=5.4381),
        DensityBin(speed_bin=2, interaction_bin=6, archetype=ArchetypeClass.TURBO, weight=3.8584),
        DensityBin(speed_bin=3, interaction_bin=0, archetype=ArchetypeClass.TURBO, weight=6.89),
        DensityBin(speed_bin=3, interaction_bin=1, archetype=ArchetypeClass.TURBO, weight=34.8336),
        DensityBin(speed_bin=3, interaction_bin=2, archetype=ArchetypeClass.TURBO, weight=124.4993),
        DensityBin(speed_bin=3, interaction_bin=3, archetype=ArchetypeClass.TURBO, weight=407.4258),
        DensityBin(speed_bin=3, interaction_bin=4, archetype=ArchetypeClass.TURBO, weight=102.06),
        DensityBin(speed_bin=3, interaction_bin=5, archetype=ArchetypeClass.TURBO, weight=3.2324),
        DensityBin(speed_bin=3, interaction_bin=6, archetype=ArchetypeClass.TURBO, weight=1.6049),
        DensityBin(speed_bin=4, interaction_bin=0, archetype=ArchetypeClass.TURBO, weight=1.3634),
        DensityBin(speed_bin=4, interaction_bin=1, archetype=ArchetypeClass.TURBO, weight=10.1208),
        DensityBin(speed_bin=4, interaction_bin=2, archetype=ArchetypeClass.TURBO, weight=32.0929),
        DensityBin(speed_bin=4, interaction_bin=3, archetype=ArchetypeClass.TURBO, weight=109.1068),
        DensityBin(speed_bin=4, interaction_bin=4, archetype=ArchetypeClass.TURBO, weight=88.5877),
        DensityBin(speed_bin=4, interaction_bin=5, archetype=ArchetypeClass.TURBO, weight=34.3328),
        DensityBin(speed_bin=4, interaction_bin=6, archetype=ArchetypeClass.TURBO, weight=3.2508),
        DensityBin(speed_bin=4, interaction_bin=7, archetype=ArchetypeClass.TURBO, weight=0.8294),
        DensityBin(speed_bin=4, interaction_bin=8, archetype=ArchetypeClass.TURBO, weight=1.8856),
        DensityBin(speed_bin=5, interaction_bin=0, archetype=ArchetypeClass.TURBO, weight=1.492),
        DensityBin(speed_bin=5, interaction_bin=1, archetype=ArchetypeClass.TURBO, weight=18.4189),
        DensityBin(speed_bin=5, interaction_bin=2, archetype=ArchetypeClass.TURBO, weight=68.3337),
        DensityBin(speed_bin=5, interaction_bin=3, archetype=ArchetypeClass.TURBO, weight=154.7025),
        DensityBin(speed_bin=5, interaction_bin=4, archetype=ArchetypeClass.TURBO, weight=113.6073),
        DensityBin(speed_bin=5, interaction_bin=5, archetype=ArchetypeClass.TURBO, weight=25.2849),
        DensityBin(speed_bin=5, interaction_bin=6, archetype=ArchetypeClass.TURBO, weight=0.9576),
        DensityBin(speed_bin=5, interaction_bin=7, archetype=ArchetypeClass.TURBO, weight=3.3318),
        DensityBin(speed_bin=6, interaction_bin=0, archetype=ArchetypeClass.TURBO, weight=2.6929),
        DensityBin(speed_bin=6, interaction_bin=1, archetype=ArchetypeClass.TURBO, weight=23.7841),
        DensityBin(speed_bin=6, interaction_bin=2, archetype=ArchetypeClass.TURBO, weight=63.3517),
        DensityBin(speed_bin=6, interaction_bin=3, archetype=ArchetypeClass.TURBO, weight=78.3964),
        DensityBin(speed_bin=6, interaction_bin=4, archetype=ArchetypeClass.TURBO, weight=76.1949),
        DensityBin(speed_bin=6, interaction_bin=5, archetype=ArchetypeClass.TURBO, weight=2.1133),
        DensityBin(speed_bin=7, interaction_bin=0, archetype=ArchetypeClass.TURBO, weight=5.7922),
        DensityBin(speed_bin=7, interaction_bin=1, archetype=ArchetypeClass.TURBO, weight=22.1436),
        DensityBin(speed_bin=7, interaction_bin=2, archetype=ArchetypeClass.TURBO, weight=74.0668),
        DensityBin(speed_bin=7, interaction_bin=3, archetype=ArchetypeClass.TURBO, weight=36.936),
        DensityBin(speed_bin=7, interaction_bin=4, archetype=ArchetypeClass.TURBO, weight=56.6524),
        DensityBin(speed_bin=7, interaction_bin=5, archetype=ArchetypeClass.TURBO, weight=0.5357),
        DensityBin(speed_bin=8, interaction_bin=1, archetype=ArchetypeClass.TURBO, weight=16.5436),
        DensityBin(speed_bin=8, interaction_bin=2, archetype=ArchetypeClass.TURBO, weight=41.3523),
        DensityBin(speed_bin=8, interaction_bin=3, archetype=ArchetypeClass.TURBO, weight=12.7951),
        DensityBin(speed_bin=8, interaction_bin=4, archetype=ArchetypeClass.TURBO, weight=3.1452),
        DensityBin(speed_bin=9, interaction_bin=1, archetype=ArchetypeClass.TURBO, weight=2.9659),
        DensityBin(speed_bin=9, interaction_bin=2, archetype=ArchetypeClass.TURBO, weight=1.6972),
        DensityBin(speed_bin=9, interaction_bin=3, archetype=ArchetypeClass.TURBO, weight=0.2629),
    ),
    centroids=(
        ClassCentroid(
            archetype=ArchetypeClass.MIDRANGE, speed=10.2234, interaction=37.7134, decks=4546
        ),
        ClassCentroid(archetype=ArchetypeClass.STAX, speed=9.5105, interaction=28.8333, decks=2208),
        ClassCentroid(
            archetype=ArchetypeClass.TURBO, speed=10.3132, interaction=24.6809, decks=6032
        ),
    ),
    excluded_no_speed=0,
)


# --------------------------------------------------------------------------
# The per-request position (K4's sibling): `diagnostics.py` calls this once
# it already has a submitted deck's own interaction grid and lines built.
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class AxesPosition:
    """`Diagnostics.cedh_position` (diagnostics.py names the field; this is
    its value type). `archetype_class` rather than the task shorthand
    `class` — a reserved word. `speed`/`interaction` are `None` only when
    the corresponding axis has no defined value for this deck (a deck with
    no complete candidate line has `speed=None`); `below_floor` depends
    only on `interaction` against the class's own floor, never on speed."""

    speed: float | None
    speed_axis: str
    interaction: float
    interaction_axis: str
    archetype_class: str
    floor: float | None
    below_floor: bool | None
    note: str = ""


def position_for_deck(
    scene: str,
    *,
    archetype: ArchetypeClass,
    features: DeckFeatures,
    interaction_grid: InteractionGrid | None,
    lines_: Sequence[Line] = (),
) -> AxesPosition | None:
    """K4: a submitted deck's own position, computed the same way the
    corpus points were. `None` when this scene's axes are not landed yet
    (`CHOSEN_AXES`) or the deck carries no interaction grid (below bracket
    5) — the same "not measured yet" contract `meta.grade_deck` uses for
    `MEASURED_THREATS`.
    """
    chosen = CHOSEN_AXES.get(scene)
    if chosen is None or interaction_grid is None:
        return None

    mana_per_turn = MANA_PER_TURN_BY_SCENE.get(scene)
    turn = (
        min_deploy_turn(lines_, mana_per_turn=mana_per_turn)
        if chosen.speed == "min_deploy_turn" and mana_per_turn
        else None
    )
    speed_v = _speed_value(
        chosen.speed, fast_mana=features.fast_mana, mean_mv=features.mean_mv, turn=turn
    )

    row_counts = {
        row.row: sum(cell.count for cell in row.cells.values()) for row in interaction_grid.rows
    }
    interaction_v = _interaction_value(
        chosen.interaction,
        stack=row_counts.get("stack", 0),
        proactive=row_counts.get("proactive_protection", 0),
        permanent=row_counts.get("permanent_answer", 0),
        class_hate=row_counts.get("class_hate", 0),
    )

    # `below_floor` is judged on the class's own currency (K3 —
    # `stack_plus_proactive` for turbo/midrange, `permanent_plus_hate` for
    # stax), never on `interaction_v` above: that is the K2 map axis
    # (`grid_total` as landed), a different quantity picked for cross-class
    # plotting, and comparing it against a floor measured in the other
    # currency's units would silently compare two different scales.
    floor = INTERACTION_FLOOR_BY_CLASS.get(scene, {}).get(archetype)
    currency = _FLOOR_CURRENCY.get(archetype)
    below = None
    if floor is not None and currency is not None:
        currency_v = _currency_value(
            currency,
            stack=row_counts.get("stack", 0),
            proactive=row_counts.get("proactive_protection", 0),
            permanent=row_counts.get("permanent_answer", 0),
            class_hate=row_counts.get("class_hate", 0),
        )
        below = currency_v < floor
    note = (
        "" if floor is not None else f"no measured interaction floor for class {archetype.value!r}"
    )

    return AxesPosition(
        speed=speed_v,
        speed_axis=chosen.speed,
        interaction=interaction_v,
        interaction_axis=chosen.interaction,
        archetype_class=archetype.value,
        floor=floor,
        below_floor=below,
        note=note,
    )


# --------------------------------------------------------------------------
# The measurement entry point
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class AxesMeasurement:
    """One full `measure_axes` run — everything `render_axes_constants`
    needs, kept together the same way `cedh_archetypes.ClassifierRun` is."""

    scene: str
    measured: str
    speed_source: str
    decks_used: int
    decks_excluded: int
    decks_with_min_deploy_turn: int
    candidate_combo_count: int
    pair_scores: tuple[AxisPairScore, ...]
    chosen: AxisPairScore
    separates_turbo_midrange: bool
    floors: dict[ArchetypeClass, tuple[float, int]]
    axes_map: SceneAxesMap
    notes: tuple[str, ...] = ()


def measure_axes(
    scene: str = "cedh",
    *,
    candidate_pool: int = 40,
    bins_per_axis: int = DEFAULT_BINS_PER_AXIS,
    now: datetime | None = None,
) -> AxesMeasurement:
    """K1-K4: fetch-and-delegate, `meta.measure_threats`'s own discipline —
    an expensive live measurement, operator-run via `deck-lab measure-axes`,
    never on a request path. Reuses `cedh_archetypes.measure_cedh_classes`
    wholesale for the per-deck feature/archetype fetch rather than paying
    for a second corpus scan.
    """
    now = now or datetime.now(UTC)
    half_life_days = HALF_LIFE_DAYS_BY_SCENE.get(scene)
    mana_per_turn = MANA_PER_TURN_BY_SCENE.get(scene)
    if half_life_days is None or mana_per_turn is None:
        empty_map = SceneAxesMap(
            scene=scene,
            measured=now.date().isoformat(),
            speed_axis="",
            interaction_axis="",
            speed_range=(0.0, 0.0),
            interaction_range=(0.0, 0.0),
            bins_per_axis=bins_per_axis,
            density=(),
            centroids=(),
            excluded_no_speed=0,
        )
        empty_score = AxisPairScore(
            speed="",
            interaction="",
            n_scored=0,
            n_excluded_no_speed=0,
            shares_by_class={},
            overall_share=0.0,
            turbo_as_midrange=0,
            midrange_as_turbo=0,
        )
        return AxesMeasurement(
            scene=scene,
            measured=now.date().isoformat(),
            speed_source=SPEED_SOURCE,
            decks_used=0,
            decks_excluded=0,
            decks_with_min_deploy_turn=0,
            candidate_combo_count=0,
            pair_scores=(),
            chosen=empty_score,
            separates_turbo_midrange=False,
            floors={},
            axes_map=empty_map,
            notes=(f"scene {scene!r} has no measured norms (half-life/mana-per-turn) yet",),
        )

    run = measure_cedh_classes(scene=scene)
    deck_dates = _fetch_deck_dates(scene)

    # Hazard rule: prove each new query shape on `PROOF_DECK_LIMIT` sampled
    # decks and print its timing before the corpus-wide call below ever
    # runs. `_ROW_PER_DECK_COUNTS_QUERY`'s proof needs no combo ids, so it
    # runs first; `_COMBO_DECK_MATCHES_QUERY`'s needs the candidate combo
    # ids, so its proof runs right after they are known.
    proof_notes: list[str] = []
    row_totals_proof_seconds, row_totals_proof_decks = _prove_row_totals(scene)
    proof_notes.append(
        f"proof: _ROW_PER_DECK_COUNTS_QUERY on {PROOF_DECK_LIMIT} sampled decks -> "
        f"{row_totals_proof_decks} deck(s) with >=1 interaction-grid row in "
        f"{row_totals_proof_seconds:.2f}s"
    )
    row_totals = _fetch_row_totals(scene)

    candidate_rows = _threat_candidates(scene, candidate_pool)
    pieces_by_combo = _combo_pieces([row["combo_id"] for row in candidate_rows])
    combo_turn: dict[str, int] = {}
    for row in candidate_rows:
        combo_id = row["combo_id"]
        pieces_info, _prereq_easy, _prereq_notable = pieces_by_combo.get(combo_id, ([], "", ""))
        mv = int(row["mana_value_needed"] or 0)
        combo_turn[combo_id] = _threat_turn(_combo_speed_value(mv, pieces_info), mana_per_turn)

    combo_matches_proof_seconds, combo_matches_proof_rows = _prove_combo_deck_matches(
        scene, list(combo_turn)
    )
    proof_notes.append(
        f"proof: _COMBO_DECK_MATCHES_QUERY on {PROOF_DECK_LIMIT} sampled decks x "
        f"{len(combo_turn)} candidate combos -> {combo_matches_proof_rows} match(es) in "
        f"{combo_matches_proof_seconds:.2f}s"
    )
    pairs = _fetch_combo_deck_matches(scene, list(combo_turn))
    min_turns = _deck_min_turns(pairs, combo_turn)

    points = _assemble_deck_points(
        run.samples,
        deck_dates=deck_dates,
        row_totals=row_totals,
        min_turns=min_turns,
        now=now,
        half_life_days=half_life_days,
    )

    chosen, scores = select_axes(points)
    turbo_midrange_ok = separates_turbo_midrange(chosen)
    floors = class_interaction_floors(points)
    axes_map = build_axes_map(
        points,
        scene=scene,
        speed_axis=chosen.speed,
        interaction_axis=chosen.interaction,
        bins_per_axis=bins_per_axis,
        now=now,
    )

    notes: list[str] = list(proof_notes)
    if not turbo_midrange_ok:
        notes.append(
            "no candidate pair separated turbo from midrange with a majority of each "
            "class's own anchor decks nearer their own centroid — consistent with the "
            "task file's corpus fact 2 (raw speed proxies measure backwards across "
            "turbo/midrange). The map still stands as a description; read it as "
            "stax/non-stax x speed, not a clean three-way split."
        )

    return AxesMeasurement(
        scene=scene,
        measured=now.date().isoformat(),
        speed_source=SPEED_SOURCE,
        decks_used=len(points),
        decks_excluded=run.excluded_no_commander + run.excluded_unresolved,
        decks_with_min_deploy_turn=sum(1 for p in points if p.min_deploy_turn is not None),
        candidate_combo_count=len(combo_turn),
        pair_scores=tuple(scores),
        chosen=chosen,
        separates_turbo_midrange=turbo_midrange_ok,
        floors=floors,
        axes_map=axes_map,
        notes=tuple(notes),
    )


def render_axes_constants(measurement: AxesMeasurement) -> str:
    """Paste-ready `CHOSEN_AXES`/`INTERACTION_FLOOR_BY_CLASS`/
    `SCENE_AXES_MAP` blocks plus the human-readable axis-selection table and
    per-class floors — `meta.render_constants`'s discipline: prints only,
    landing the constants is a reviewed diff."""
    lines: list[str] = []
    lines.append(
        f"# measured {measurement.measured}  scene={measurement.scene!r}  "
        f"speed_source={measurement.speed_source!r}"
    )
    lines.append(
        f"# decks_used={measurement.decks_used}  decks_excluded={measurement.decks_excluded}  "
        f"decks_with_min_deploy_turn={measurement.decks_with_min_deploy_turn}  "
        f"candidate_combos={measurement.candidate_combo_count}"
    )
    for note in measurement.notes:
        lines.append(f"# {note}")
    lines.append("")

    lines.append("# --- K2: axis-selection table (all candidate pairs) ---")
    lines.append(
        "# speed                interaction            n_scored  no_speed  "
        "turbo   midrange  stax    overall  t->m  m->t"
    )
    for score in measurement.pair_scores:
        mark = " <== chosen" if score is measurement.chosen else ""
        t = score.shares_by_class.get(ArchetypeClass.TURBO, 0.0)
        m = score.shares_by_class.get(ArchetypeClass.MIDRANGE, 0.0)
        x = score.shares_by_class.get(ArchetypeClass.STAX, 0.0)
        lines.append(
            f"#  {score.speed:<20} {score.interaction:<22} {score.n_scored:>8}  "
            f"{score.n_excluded_no_speed:>8}  {t:>6.2f}  {m:>8.2f}  {x:>6.2f}  "
            f"{score.overall_share:>7.2f}  {score.turbo_as_midrange:>4}  "
            f"{score.midrange_as_turbo:>4}{mark}"
        )
    lines.append(
        f"# chosen: speed={measurement.chosen.speed!r} "
        f"interaction={measurement.chosen.interaction!r} "
        f"separates_turbo_midrange={measurement.separates_turbo_midrange}"
    )
    lines.append("")

    lines.append("# --- K3: per-class interaction floors ---")
    for cls in _KNOWN_CLASSES:
        entry = measurement.floors.get(cls)
        if entry is None:
            lines.append(f"#   {cls.value:<10} NO FLOOR (no decks predicted into this class)")
            continue
        floor, count = entry
        lines.append(f"#   {cls.value:<10} floor={floor:>7.3f}  decks={count}")
    lines.append("")

    lines.append("# --- K4: class centroids (chosen axes) ---")
    for c in measurement.axes_map.centroids:
        lines.append(
            f"#   {c.archetype.value:<10} speed={c.speed:>7.3f}  "
            f"interaction={c.interaction:>8.3f}  decks={c.decks}"
        )
    lines.append(f"# excluded_no_speed={measurement.axes_map.excluded_no_speed}")
    lines.append("")

    lines.append(f'CHOSEN_AXES["{measurement.scene}"] = ChosenAxes(')
    lines.append(f'    speed="{measurement.chosen.speed}",')
    lines.append(f'    interaction="{measurement.chosen.interaction}",')
    lines.append(f"    separates_turbo_midrange={measurement.separates_turbo_midrange},")
    lines.append(f'    speed_source="{measurement.speed_source}",')
    lines.append(f'    measured="{measurement.measured}",')
    lines.append(")")
    lines.append("")

    lines.append(f'INTERACTION_FLOOR_BY_CLASS["{measurement.scene}"] = {{')
    for cls, (floor, _count) in measurement.floors.items():
        lines.append(f"    ArchetypeClass.{cls.name}: {floor:.4f},")
    lines.append("}")
    lines.append("")

    m = measurement.axes_map
    lines.append(f'SCENE_AXES_MAP["{measurement.scene}"] = SceneAxesMap(')
    lines.append(f'    scene="{m.scene}",')
    lines.append(f'    measured="{m.measured}",')
    lines.append(f'    speed_axis="{m.speed_axis}",')
    lines.append(f'    interaction_axis="{m.interaction_axis}",')
    lines.append(f"    speed_range={m.speed_range!r},")
    lines.append(f"    interaction_range={m.interaction_range!r},")
    lines.append(f"    bins_per_axis={m.bins_per_axis},")
    lines.append("    density=(")
    for d in m.density:
        lines.append(
            f"        DensityBin(speed_bin={d.speed_bin}, interaction_bin={d.interaction_bin}, "
            f"archetype=ArchetypeClass.{d.archetype.name}, weight={d.weight}),"
        )
    lines.append("    ),")
    lines.append("    centroids=(")
    for c in m.centroids:
        lines.append(
            f"        ClassCentroid(archetype=ArchetypeClass.{c.archetype.name}, "
            f"speed={c.speed:.4f}, interaction={c.interaction:.4f}, decks={c.decks}),"
        )
    lines.append("    ),")
    lines.append(f"    excluded_no_speed={m.excluded_no_speed},")
    lines.append(")")

    return "\n".join(lines)
