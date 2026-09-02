"""Meta-threat grading: "can this deck interact with the format's actual win
attempts, in time?"

Task H of the cEDH Pro round (`implementation-plans/cedh-pro/00-OVERVIEW.md`,
`TASK-H-META-GRADING.md`). "You hold 8 counterspells" is not an answer to
"what does my deck lose to" — this module answers the real question in two
measured/authored halves:

- **H1 — the threat table** (`measure_threats`): from Task A's tournament
  corpus, the scene's most-played *complete* combo lines (a deck that holds
  every piece, not a near-miss), weighted two ways — a time-decayed meta
  share and an earliest-realistic-turn timing, both reported rather than
  blended.
- **H2 — the answer matrix** (`ANSWER_MATRIX`): Task B's `FoldClass`
  taxonomy crossed with Task C's interaction grid rows, authored (not
  measured — this is rules knowledge) with reasoning beside every cell.
- **H3 — the grade** (`grade_deck`/`grade_threat`): per threat, which of a
  submitted deck's own interaction answers it via H2, *restricted to answers
  castable by the threat's turn* — a deck holding graveyard hate is not an
  answer to a library-fold threat, and a held-up answer is not an answer to
  a turn-1 threat.

## The format-agnostic mandate (user decision, binding)

Everything scene-shaped is data, nothing scene-shaped is code: `ThreatKind`
and every scene-scoped weight (`HALF_LIFE_DAYS_BY_SCENE`,
`MANA_PER_TURN_BY_SCENE`, `MEASURED_THREATS`) is a closed enum or a plain
dict keyed by a `scene` string — never a format-strategy interface, ABC, or
provider registry (`docs/power.md`'s "Format coupling" section is binding:
"one implementation gives the wrong seams"). `ANSWER_MATRIX` carries no scene
key at all: a counterspell answers a spell in every format, so the fold ->
interaction mapping is game-rule-level, not per-scene.

## Why H3 never blends into one score

`power.py` refuses to average `game_changer` into a playability scale
("It is not a scale and should never be averaged into one... conflating them
is how a 'power level' number becomes meaningless") for the same reason this
module refuses a single "meta score": a blended number hides exactly what
the grader exists to show — *which* threat is unanswered and *why*. Threats
are ordered by meta share; grades are reported per threat, never summed.

## Where the numbers come from

`measure_threats` is the live-Neo4j measurement, run via
`deck-lab measure-meta --scene <scene>` — the same discipline as
`archetype_profiles.py`/`cedh_profiles.py`: print a paste-ready block,
review it, land it as `MEASURED_THREATS[scene]`. Grading reads that landed
constant, not a live query — the join behind H1 walks up to 1.4M `PLAYED`
edges, and nothing this expensive belongs on a request path (the same reason
`RECOMMENDS_META` is a precomputed edge, not a live aggregation).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

import structlog

from .interaction import InteractionGrid, InteractionRow
from .lines import FoldClass, PieceInfo, classify_folds

log = structlog.get_logger(__name__)


class ThreatKind(StrEnum):
    """What kind of thing a meta threat is. Closed, per the task file: v1
    implements `COMBO_LINE` only (Spellbook-backed — the corpus genuinely is
    combo lines); `KEY_PERMANENT` (a format's engine-permanent class, e.g.
    a Modern scene's The One Ring) and `PLAN` are carried in the schema now
    so a second scene can add them without reshaping the response."""

    COMBO_LINE = "combo_line"
    KEY_PERMANENT = "key_permanent"
    PLAN = "plan"


# How fast a scene's meta shifts — a v1 judgment call (task file, H1), not a
# measurement: "a meta shifts weekly" is the stated intuition behind keeping
# this short, and 90 days is a stated starting point for the eval to move,
# not a fact. Scene-keyed so a slower-moving format need not inherit it.
HALF_LIFE_DAYS_BY_SCENE: dict[str, float] = {"cedh": 90.0}

# The scene's assumed fast-mana rate: acceleration-adjusted mana available
# per turn, used to convert a combo's `mana_value_needed` into an earliest
# realistic turn (`_threat_turn`). Also a v1 judgment call, stated verbatim
# in the task file: "cEDH ~= ceil(mv/2.5) is a stated starting point for the
# eval to move, not a fact."
MANA_PER_TURN_BY_SCENE: dict[str, float] = {"cedh": 2.5}


# --------------------------------------------------------------------------
# H1 — the threat table
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class MetaThreat:
    """One measured threat: a complete combo line, its cost, its two
    weights, and the fold classes (Task B) it belongs to."""

    combo_id: str
    kind: ThreatKind
    cards: tuple[str, ...]
    produces: tuple[str, ...]
    mana_value_needed: int
    # Earliest realistic turn this line completes — the timing half H3
    # restricts answers against. See `_threat_turn`.
    threat_turn: int
    # Raw distinct top-cut decks holding every piece — what the top ~15 are
    # ranked and selected by, before either weight below is computed.
    deck_count: int
    # Time-decayed share of the scene's *entire* top-cut corpus (not just
    # combo-holding decks) that plays this line — `0.5 ** (age_days /
    # half_life)` per deck, summed and divided by the same sum over every
    # deck in the scene. This is the ordering weight for H3's grade list.
    meta_share: float
    folds_to: frozenset[FoldClass]


@dataclass(frozen=True, slots=True)
class MetaThreatTable:
    """The scene's measured threat table — `ARCHETYPE_TYPE_COUNTS`'
    discipline: deck counts, corpus window, and the date measured, all
    carried beside the numbers so every figure the table shows is auditable
    back to its data."""

    scene: str
    measured: str  # ISO date this measurement was taken
    window_start: str  # earliest tournament date in the corpus
    window_end: str  # latest tournament date in the corpus
    half_life_days: float
    # True when the newest tournament in the corpus is already older than
    # one half-life — the table's own staleness flag (task file, H1).
    stale: bool
    decks_scanned: int
    # Both counted for transparency, per the round's binding facts, even
    # though neither should move this table: H1 groups by decks holding
    # every combo piece, not by commander, so a deck missing a commander
    # name (or carrying the "Unknown Commander" placeholder) is neither
    # included nor excluded on that basis.
    decks_no_commander: int
    decks_unknown_commander: int
    threats: tuple[MetaThreat, ...]
    # Legality drops and corpus-empty notices — said, never silent, per the
    # task file's "drops from the table with a printed note" requirement.
    notes: tuple[str, ...] = ()


def _parse_date(raw: str | None) -> datetime | None:
    """edhtop16's ISO-8601-with-`Z` timestamps (`edhtop16.py`'s
    `TournamentRef.date`), tolerant of a missing or unparsable value —
    `None` reads as "no age evidence", not "infinitely old"."""
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _decay_weight(deck_date: datetime | None, *, now: datetime, half_life_days: float) -> float:
    """`0.5 ** (age_days / half_life_days)` — a deck with no readable date
    contributes zero rather than being treated as maximally fresh or stale
    by a silent default."""
    if deck_date is None or half_life_days <= 0:
        return 0.0
    age_days = max((now - deck_date).total_seconds() / 86400.0, 0.0)
    return 0.5 ** (age_days / half_life_days)


def _threat_turn(mana_value_needed: int, mana_per_turn: float) -> int:
    """`ceil(mv / mana_per_turn)`, floored at turn 1 — no combo completes
    before the pilot's own first turn, regardless of how cheap it is."""
    if mana_value_needed <= 0 or mana_per_turn <= 0:
        return 1
    return max(1, math.ceil(mana_value_needed / mana_per_turn))


# --------------------------------------------------------------------------
# H1 — graph reads (thin; `_assemble_threat_table` carries the real logic,
# `interaction.py`'s fetch-vs-pure split, mirrored so the logic is testable
# without a live Neo4j).
# --------------------------------------------------------------------------

_SCENE_STATS_QUERY = """
MATCH (d:TournamentDeck {scene: $scene})
RETURN count(d) AS total, min(d.date) AS min_date, max(d.date) AS max_date,
       sum(CASE WHEN d.commander_name IS NULL THEN 1 ELSE 0 END) AS no_commander,
       sum(CASE WHEN d.commander_name = 'Unknown Commander' THEN 1 ELSE 0 END) AS unknown_commander
"""

_ALL_DECK_DATES_QUERY = "MATCH (d:TournamentDeck {scene: $scene}) RETURN d.date AS date"

# `have = k.pieces`, not `>= k.pieces - 1`: H1 wants complete lines only, the
# near-miss half of `DECK_COMBOS`/`DECK_LINES` (`graph.py`) does not apply
# here. `resolvable_pieces` (a fresh `(k)-[:USES]->(:Card)` count, independent
# of any deck) is the legality signal: `replace_combos`' docstring records
# that a piece whose Card node no longer exists is silently dropped from a
# combo's USES edges at ingest time, while `k.pieces` (the Spellbook-reported
# total) is not decremented to match — so `resolvable_pieces < pieces` is
# exactly "this combo needs a card the corpus no longer carries", the
# ingest-filter hazard note's "usually banned" case, surfaced rather than
# silently under-joined.
# Two phases, or the join OOMs the 1.4 GiB transaction pool: the naive
# deck-piece-combo join materialises every (deck, combo) pair sharing even
# one card, and a staple explodes it — Sol Ring alone sits in hundreds of
# combos and ~15k tournament decks, tens of millions of intermediate rows
# before the first aggregation. Measured, not feared: the one-phase form
# died with MemoryPoolOutOfMemoryError on the live corpus.
#
# Phase 1 needs no deck join at all: a line every top-cut deck could hold
# must have every piece individually popular, so the per-card played-count
# (one cheap aggregation) bounds the candidates — a combo whose least-played
# piece is under the floor cannot possibly beat one whose pieces are all
# staples into a top-15 — and the walk starts FROM the popular cards, so
# no per-row list is ever carried. The floor is generous (50 decks against top lines
# holding thousands) precisely so this stays a pruning bound, never a
# ranking.
_CANDIDATE_COMBOS_QUERY = """
MATCH (d:TournamentDeck {scene: $scene})-[:PLAYED]->(c:Card)
WITH c, count(d) AS played
WHERE played >= $min_piece_played
MATCH (c)<-[:USES]-(k:Combo)
WITH k, count(DISTINCT c) AS popular_pieces
WHERE popular_pieces = k.pieces
RETURN k.id AS combo_id
"""

# Phase 2 runs the exact hold-every-piece join only over the phase-1
# survivors, and aggregates dates into (date, n) counts rather than
# collecting a row per deck — the decay arithmetic only ever needed the
# dates, and 17k id-bearing maps per combo was pure allocation.
_THREAT_CANDIDATES_QUERY = """
MATCH (k:Combo) WHERE k.id IN $combo_ids
MATCH (k)-[:USES]->(piece:Card)<-[:PLAYED]-(d:TournamentDeck {scene: $scene})
WITH k, d, count(DISTINCT piece) AS have
WHERE have = k.pieces
WITH k, d.date AS date, count(*) AS n
WITH k, collect({date: date, n: n}) AS date_counts,
     sum(n) AS deck_count
ORDER BY deck_count DESC
LIMIT $candidate_pool
MATCH (k)-[:USES]->(p:Card)
WITH k, date_counts, deck_count, collect(p.name) AS names, count(p) AS resolvable_pieces
RETURN k.id AS combo_id, k.pieces AS pieces, resolvable_pieces, names,
       k.produces AS produces, coalesce(k.mana_value_needed, 0) AS mana_value_needed,
       date_counts, deck_count
"""

# `DECK_LINES`' (`graph.py`) piece-info shape, minus the deck-membership
# columns — this queries a combo's own pieces directly, not through any
# deck's PLAYED edges, because a threat's fold classes are a property of the
# combo alone. Kept here rather than in `graph.py` per this task's ownership
# note: new queries this round live beside their one caller.
_COMBO_PIECES_QUERY = """
UNWIND $combo_ids AS combo_id
MATCH (k:Combo {id: combo_id})-[u:USES]->(p:Card)
WITH k, u, p
ORDER BY p.oracle_id
WITH k,
     collect(p.name) AS names,
     collect(p.type_line) AS type_lines,
     collect(p.oracle_text) AS oracle_texts,
     collect(coalesce(u.zones, [])) AS zones,
     collect([(p)-[:PRODUCES]->(r:Resource) | r.name]) AS piece_produces,
     collect([(p)-[:CARES_ABOUT]->(r:Resource) | r.name]) AS piece_cares
RETURN k.id AS combo_id, names, type_lines, oracle_texts, zones,
       piece_produces, piece_cares,
       coalesce(k.prereq_easy, '') AS prereq_easy,
       coalesce(k.prereq_notable, '') AS prereq_notable
"""


def _scene_stats(scene: str) -> dict[str, Any] | None:
    from .config import settings
    from .graph import driver

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        record = session.run(_SCENE_STATS_QUERY, scene=scene).single()
        return dict(record) if record else None


def _all_deck_dates(scene: str) -> list[str]:
    from .config import settings
    from .graph import driver

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [r["date"] for r in session.run(_ALL_DECK_DATES_QUERY, scene=scene)]


# See _CANDIDATE_COMBOS_QUERY — a pruning bound, never a ranking. Fifty is
# generous against top lines held by thousands of decks; a scene where the
# #15 threat's least-played piece sits under 50 decks has bigger sample
# problems than this floor.
MIN_PIECE_PLAYED = 50


def _threat_candidates(scene: str, candidate_pool: int) -> list[dict[str, Any]]:
    from .config import settings
    from .graph import driver

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        combo_ids = [
            r["combo_id"]
            for r in session.run(
                _CANDIDATE_COMBOS_QUERY, scene=scene, min_piece_played=MIN_PIECE_PLAYED
            )
        ]
        if not combo_ids:
            return []
        return [
            dict(r)
            for r in session.run(
                _THREAT_CANDIDATES_QUERY,
                scene=scene,
                combo_ids=combo_ids,
                candidate_pool=candidate_pool,
            )
        ]


def _combo_pieces(combo_ids: list[str]) -> dict[str, tuple[list[PieceInfo], str, str]]:
    """Combo id -> (its pieces as `lines.PieceInfo`, prereq_easy, prereq_notable)
    — everything `classify_folds` (Task B, format-independent, reused
    verbatim) needs to fold-classify a threat."""
    if not combo_ids:
        return {}

    from .config import settings
    from .graph import driver

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        rows = [dict(r) for r in session.run(_COMBO_PIECES_QUERY, combo_ids=combo_ids)]

    out: dict[str, tuple[list[PieceInfo], str, str]] = {}
    for row in rows:
        pieces = [
            PieceInfo(
                name=name,
                type_line=type_line or "",
                oracle_text=oracle_text or "",
                zones=tuple(zones or ()),
                produces=frozenset(produces or ()),
                cares_about=frozenset(cares or ()),
            )
            for name, type_line, oracle_text, zones, produces, cares in zip(
                row["names"],
                row["type_lines"],
                row["oracle_texts"],
                row["zones"],
                row["piece_produces"],
                row["piece_cares"],
                strict=True,
            )
        ]
        out[row["combo_id"]] = (pieces, row["prereq_easy"], row["prereq_notable"])
    return out


def _assemble_threat_table(
    scene: str,
    *,
    stats: dict[str, Any],
    all_dates: list[str],
    candidate_rows: list[dict[str, Any]],
    pieces_by_combo: dict[str, tuple[list[PieceInfo], str, str]],
    top_n: int,
    now: datetime,
    half_life_days: float,
    mana_per_turn: float,
) -> MetaThreatTable:
    """`measure_threats`' pure half — given already-fetched rows, does every
    bit of ranking, decay-weighting, legality-dropping and fold
    classification. Split out (`interaction.py`'s `build_interaction_grid`/
    `_assemble_interaction_grid` pattern) so this is directly unit-testable
    with synthetic rows, no live Neo4j required.
    """
    total_weight = sum(
        _decay_weight(_parse_date(d), now=now, half_life_days=half_life_days)
        for d in all_dates
        if d
    )

    notes: list[str] = []
    legal_rows: list[dict[str, Any]] = []
    for row in candidate_rows:
        missing = int(row["pieces"]) - int(row["resolvable_pieces"])
        if missing > 0:
            notes.append(
                f"dropped {' + '.join(row['names'])} ({row['combo_id']}): "
                f"{missing} piece(s) no longer resolve in the corpus (likely banned) — "
                "not corpus-legal at grade time"
            )
            continue
        legal_rows.append(row)

    # `_THREAT_CANDIDATES_QUERY` already orders by deck count descending;
    # re-sort defensively since dropping rows above cannot change relative
    # order, but a future caller passing pre-filtered rows should not have
    # to also pre-sort them.
    legal_rows.sort(key=lambda r: r["deck_count"], reverse=True)
    top_rows = legal_rows[:top_n]

    threats: list[MetaThreat] = []
    for row in top_rows:
        deck_weight = sum(
            d["n"] * _decay_weight(_parse_date(d["date"]), now=now, half_life_days=half_life_days)
            for d in row["date_counts"]
        )
        mv = int(row["mana_value_needed"] or 0)
        pieces_info, prereq_easy, prereq_notable = pieces_by_combo.get(
            row["combo_id"], ([], "", "")
        )
        folds = (
            classify_folds(pieces_info, prereq_easy, prereq_notable) if pieces_info else frozenset()
        )
        threats.append(
            MetaThreat(
                combo_id=row["combo_id"],
                kind=ThreatKind.COMBO_LINE,
                cards=tuple(row["names"]),
                produces=tuple(row.get("produces") or ()),
                mana_value_needed=mv,
                threat_turn=_threat_turn(mv, mana_per_turn),
                deck_count=int(row["deck_count"]),
                meta_share=(deck_weight / total_weight) if total_weight else 0.0,
                folds_to=folds,
            )
        )

    # The ordering H3 grades in: meta share, never a blended scalar (see the
    # module docstring's citation of `power.py`'s refusal).
    threats.sort(key=lambda t: t.meta_share, reverse=True)

    window_start = stats.get("min_date") or ""
    window_end = stats.get("max_date") or ""
    newest = _parse_date(window_end) if window_end else None
    stale = newest is None or (now - newest).days > half_life_days

    return MetaThreatTable(
        scene=scene,
        measured=now.date().isoformat(),
        window_start=window_start,
        window_end=window_end,
        half_life_days=half_life_days,
        stale=stale,
        decks_scanned=int(stats.get("total") or 0),
        decks_no_commander=int(stats.get("no_commander") or 0),
        decks_unknown_commander=int(stats.get("unknown_commander") or 0),
        threats=tuple(threats),
        notes=tuple(notes),
    )


def measure_threats(
    scene: str,
    *,
    top_n: int = 15,
    candidate_pool: int = 40,
    now: datetime | None = None,
) -> MetaThreatTable:
    """H1: fetch-and-delegate. `deck-lab measure-meta --scene <scene>`'s
    entry point — a live, ~1.4M-edge join (see `_THREAT_CANDIDATES_QUERY`),
    operator-run and never called from a request path; grading reads the
    landed `MEASURED_THREATS` constant instead (module docstring).
    """
    now = now or datetime.now(UTC)
    half_life_days = HALF_LIFE_DAYS_BY_SCENE.get(scene)
    mana_per_turn = MANA_PER_TURN_BY_SCENE.get(scene)
    if half_life_days is None or mana_per_turn is None:
        return MetaThreatTable(
            scene=scene,
            measured=now.date().isoformat(),
            window_start="",
            window_end="",
            half_life_days=0.0,
            stale=True,
            decks_scanned=0,
            decks_no_commander=0,
            decks_unknown_commander=0,
            threats=(),
            notes=(f"scene {scene!r} has no measured norms (half-life/fast-mana) yet",),
        )

    stats = _scene_stats(scene)
    if not stats or not stats.get("total"):
        return MetaThreatTable(
            scene=scene,
            measured=now.date().isoformat(),
            window_start="",
            window_end="",
            half_life_days=half_life_days,
            stale=True,
            decks_scanned=0,
            decks_no_commander=0,
            decks_unknown_commander=0,
            threats=(),
            notes=(f"no {scene!r} tournament decks ingested — run `deck-lab ingest-edhtop16`",),
        )

    all_dates = _all_deck_dates(scene)
    candidate_rows = _threat_candidates(scene, candidate_pool)
    pieces_by_combo = _combo_pieces([row["combo_id"] for row in candidate_rows])

    return _assemble_threat_table(
        scene,
        stats=stats,
        all_dates=all_dates,
        candidate_rows=candidate_rows,
        pieces_by_combo=pieces_by_combo,
        top_n=top_n,
        now=now,
        half_life_days=half_life_days,
        mana_per_turn=mana_per_turn,
    )


# The landed measurement — `ARCHETYPE_TYPE_COUNTS`/`CEDH_TYPE_COUNTS`'
# discipline. Populated by running `deck-lab measure-meta --scene cedh`
# against the live dev graph and pasting the reviewed result in; grading
# (`grade_deck`) reads this, never re-runs the live join.
MEASURED_THREATS: dict[str, MetaThreatTable] = {}

# measured 2026-09-01 on the live 17,663-deck edhtop16 corpus
# (window 2025-09-05 .. 2026-08-30, half-life 90d, stale=False) via
# `deck-lab measure-meta --scene cedh` — re-run and re-paste to refresh.
MEASURED_THREATS["cedh"] = MetaThreatTable(
    scene="cedh",
    measured="2026-09-01",
    window_start="2025-09-05T23:30:00.000Z",
    window_end="2026-08-30T19:00:00.000Z",
    half_life_days=90.0,
    stale=False,
    decks_scanned=17663,
    decks_no_commander=2511,
    decks_unknown_commander=541,
    threats=(
        MetaThreat(
            combo_id="1368-1414-4856",
            kind=ThreatKind.COMBO_LINE,
            cards=("Underworld Breach", "Brain Freeze", "Lotus Petal"),
            produces=(
                "Infinite self-mill",
                "Near-infinite magecraft triggers",
                "Near-infinite mill",
            ),
            mana_value_needed=0,
            threat_turn=1,
            deck_count=5452,
            meta_share=0.2959,
            folds_to=frozenset(
                {FoldClass.ACTIVATED_ABILITY, FoldClass.CAST_TRIGGER, FoldClass.GRAVEYARD}
            ),
        ),
        MetaThreat(
            combo_id="1368-3518-4856",
            kind=ThreatKind.COMBO_LINE,
            cards=("Lion's Eye Diamond", "Underworld Breach", "Brain Freeze"),
            produces=(
                "Infinite self-mill",
                "Near-infinite colored mana",
                "Near-infinite magecraft triggers",
                "Near-infinite mill",
                "Near-infinite storm count",
            ),
            mana_value_needed=0,
            threat_turn=1,
            deck_count=5341,
            meta_share=0.2893,
            folds_to=frozenset(
                {FoldClass.ACTIVATED_ABILITY, FoldClass.CAST_TRIGGER, FoldClass.GRAVEYARD}
            ),
        ),
        MetaThreat(
            combo_id="1295-3093",
            kind=ThreatKind.COMBO_LINE,
            cards=("Thassa's Oracle", "Tainted Pact"),
            produces=("Win the game",),
            mana_value_needed=4,
            threat_turn=2,
            deck_count=5334,
            meta_share=0.2713,
            folds_to=frozenset({FoldClass.CREATURE_DEPENDENT, FoldClass.ETB, FoldClass.LIBRARY}),
        ),
        MetaThreat(
            combo_id="742-1295",
            kind=ThreatKind.COMBO_LINE,
            cards=("Thassa's Oracle", "Demonic Consultation"),
            produces=("Exile your library", "Win the game"),
            mana_value_needed=3,
            threat_turn=2,
            deck_count=5146,
            meta_share=0.2613,
            folds_to=frozenset({FoldClass.CREATURE_DEPENDENT, FoldClass.ETB, FoldClass.LIBRARY}),
        ),
        MetaThreat(
            combo_id="1368-2706-3518",
            kind=ThreatKind.COMBO_LINE,
            cards=("Lion's Eye Diamond", "Underworld Breach", "Wheel of Fortune"),
            produces=(
                "Infinite draw triggers",
                "Infinite looting",
                "Infinite looting for opponents",
                "Near-infinite storm count",
            ),
            mana_value_needed=0,
            threat_turn=1,
            deck_count=4037,
            meta_share=0.1962,
            folds_to=frozenset({FoldClass.ACTIVATED_ABILITY, FoldClass.GRAVEYARD}),
        ),
        MetaThreat(
            combo_id="1368-1878-2706",
            kind=ThreatKind.COMBO_LINE,
            cards=("Underworld Breach", "Wheel of Fortune", "Jeska's Will"),
            produces=(
                "Infinite draw triggers for all players",
                "Infinite looting for all players",
                "Near-infinite magecraft triggers",
                "Near-infinite storm count",
            ),
            mana_value_needed=3,
            threat_turn=2,
            deck_count=2953,
            meta_share=0.1527,
            folds_to=frozenset({FoldClass.GRAVEYARD}),
        ),
        MetaThreat(
            combo_id="513-3682",
            kind=ThreatKind.COMBO_LINE,
            cards=("Hullbreaker Horror", "Mox Amber"),
            produces=(
                "Infinite creature ETB",
                "Infinite creature LTB",
                "Infinite colored mana",
                "Infinite storm count",
            ),
            mana_value_needed=0,
            threat_turn=1,
            deck_count=1992,
            meta_share=0.1101,
            folds_to=frozenset(
                {
                    FoldClass.ACTIVATED_ABILITY,
                    FoldClass.ARTIFACT_DEPENDENT,
                    FoldClass.CAST_TRIGGER,
                    FoldClass.CREATURE_DEPENDENT,
                }
            ),
        ),
        MetaThreat(
            combo_id="1174-2404-6678",
            kind=ThreatKind.COMBO_LINE,
            cards=("Oboro Breezecaller", "Talon Gates of Madara", "Gaea's Cradle"),
            produces=(
                "Infinite mana lands you control can produce",
                "Infinite green mana",
                "Infinite landfall triggers",
                "Phase out any number of creatures any number of times",
            ),
            mana_value_needed=0,
            threat_turn=1,
            deck_count=1484,
            meta_share=0.0817,
            folds_to=frozenset(
                {FoldClass.ACTIVATED_ABILITY, FoldClass.ETB, FoldClass.TRIGGERED_ABILITY}
            ),
        ),
        MetaThreat(
            combo_id="1368-2706-4682",
            kind=ThreatKind.COMBO_LINE,
            cards=("Wheel of Fortune", "Smothering Tithe", "Underworld Breach"),
            produces=(
                "Infinite draw triggers for all players",
                "Infinite looting for all players",
                "Infinite self-discard triggers for all players",
                "Near-infinite colored mana",
                "Near-infinite Treasure tokens",
            ),
            mana_value_needed=3,
            threat_turn=2,
            deck_count=1718,
            meta_share=0.0760,
            folds_to=frozenset({FoldClass.ENCHANTMENT_DEPENDENT, FoldClass.GRAVEYARD}),
        ),
        MetaThreat(
            combo_id="184-736-4682",
            kind=ThreatKind.COMBO_LINE,
            cards=("Faerie Mastermind", "Smothering Tithe", "Copy Enchantment"),
            produces=(
                "Near-infinite colored mana",
                "Infinite draw triggers for all players",
                "Near-infinite Treasure tokens",
                "Infinite card draw for all players",
            ),
            mana_value_needed=4,
            threat_turn=2,
            deck_count=761,
            meta_share=0.0547,
            folds_to=frozenset({FoldClass.ACTIVATED_ABILITY, FoldClass.ENCHANTMENT_DEPENDENT}),
        ),
        MetaThreat(
            combo_id="2404-2608-4499",
            kind=ThreatKind.COMBO_LINE,
            cards=("Derevi, Empyrial Tactician", "Gaea's Cradle", "Emiel the Blessed"),
            produces=(
                "Infinite blinking",
                "Infinite creature ETB",
                "Infinite creature LTB",
                "Infinite green mana",
                "Infinite mana permanents you control can produce",
            ),
            mana_value_needed=0,
            threat_turn=1,
            deck_count=979,
            meta_share=0.0521,
            folds_to=frozenset(
                {
                    FoldClass.ACTIVATED_ABILITY,
                    FoldClass.CREATURE_DEPENDENT,
                    FoldClass.ETB,
                    FoldClass.TRIGGERED_ABILITY,
                }
            ),
        ),
        MetaThreat(
            combo_id="184-2210-4682",
            kind=ThreatKind.COMBO_LINE,
            cards=("Mirrormade", "Smothering Tithe", "Faerie Mastermind"),
            produces=(
                "Near-infinite colored mana",
                "Infinite draw triggers for all players",
                "Near-infinite Treasure tokens",
                "Infinite card draw for all players",
            ),
            mana_value_needed=4,
            threat_turn=2,
            deck_count=779,
            meta_share=0.0505,
            folds_to=frozenset({FoldClass.ACTIVATED_ABILITY, FoldClass.ENCHANTMENT_DEPENDENT}),
        ),
        MetaThreat(
            combo_id="2364-2608-4499",
            kind=ThreatKind.COMBO_LINE,
            cards=("Derevi, Empyrial Tactician", "Emiel the Blessed", "Mana Vault"),
            produces=("Infinite creature LTB", "Infinite creature ETB"),
            mana_value_needed=0,
            threat_turn=1,
            deck_count=917,
            meta_share=0.0489,
            folds_to=frozenset(
                {
                    FoldClass.ACTIVATED_ABILITY,
                    FoldClass.CREATURE_DEPENDENT,
                    FoldClass.ETB,
                    FoldClass.TRIGGERED_ABILITY,
                }
            ),
        ),
        MetaThreat(
            combo_id="129-184-4682",
            kind=ThreatKind.COMBO_LINE,
            cards=("Faerie Mastermind", "Smothering Tithe", "Kinnan, Bonder Prodigy"),
            produces=(
                "Infinite card draw for all players",
                "Infinite draw triggers for all players",
                "Near-infinite Treasure tokens",
                "Near-infinite colored mana",
                "Near-infinite colorless mana",
            ),
            mana_value_needed=4,
            threat_turn=2,
            deck_count=700,
            meta_share=0.0430,
            folds_to=frozenset({FoldClass.ACTIVATED_ABILITY, FoldClass.CREATURE_DEPENDENT}),
        ),
        MetaThreat(
            combo_id="147-5487",
            kind=ThreatKind.COMBO_LINE,
            cards=("Dualcaster Mage", "Molten Duplication"),
            produces=(
                "Infinite creature LTB",
                "Infinite creature ETB",
                "Infinite creature sacrifice triggers",
                "Infinite death triggers",
                "Infinite creature tokens with haste",
                "Infinite magecraft triggers",
            ),
            mana_value_needed=5,
            threat_turn=2,
            deck_count=752,
            meta_share=0.0349,
            folds_to=frozenset(
                {FoldClass.CREATURE_DEPENDENT, FoldClass.ETB, FoldClass.TRIGGERED_ABILITY}
            ),
        ),
    ),
    notes=(),
)


def render_constants(table: MetaThreatTable) -> str:
    """A paste-ready `MEASURED_THREATS[scene] = ...` block plus a
    human-readable ranking — `cedh_profiles.render_constants`'s discipline,
    copied: prints only, landing the constant is a reviewed diff."""
    lines: list[str] = []
    lines.append(
        f"# measured {table.measured}  window {table.window_start} .. {table.window_end}  "
        f"half_life={table.half_life_days:.0f}d  stale={table.stale}"
    )
    lines.append(
        f"# decks_scanned={table.decks_scanned}  "
        f"no_commander={table.decks_no_commander}  "
        f"unknown_commander={table.decks_unknown_commander} "
        "(both irrelevant to this piece-holding grouping — counted for transparency only)"
    )
    for note in table.notes:
        lines.append(f"# {note}")
    lines.append("")
    lines.append(f'MEASURED_THREATS["{table.scene}"] = MetaThreatTable(')
    lines.append(f'    scene="{table.scene}",')
    lines.append(f'    measured="{table.measured}",')
    lines.append(f'    window_start="{table.window_start}",')
    lines.append(f'    window_end="{table.window_end}",')
    lines.append(f"    half_life_days={table.half_life_days},")
    lines.append(f"    stale={table.stale},")
    lines.append(f"    decks_scanned={table.decks_scanned},")
    lines.append(f"    decks_no_commander={table.decks_no_commander},")
    lines.append(f"    decks_unknown_commander={table.decks_unknown_commander},")
    lines.append("    threats=(")
    for t in table.threats:
        folds = ", ".join(f"FoldClass.{f.name}" for f in sorted(t.folds_to, key=lambda x: x.value))
        lines.append("        MetaThreat(")
        lines.append(f'            combo_id="{t.combo_id}",')
        lines.append("            kind=ThreatKind.COMBO_LINE,")
        lines.append(f"            cards={t.cards!r},")
        lines.append(f"            produces={t.produces!r},")
        lines.append(f"            mana_value_needed={t.mana_value_needed},")
        lines.append(f"            threat_turn={t.threat_turn},")
        lines.append(f"            deck_count={t.deck_count},")
        lines.append(f"            meta_share={t.meta_share:.4f},")
        lines.append(f"            folds_to=frozenset({{{folds}}}),")
        lines.append("        ),")
    lines.append("    ),")
    lines.append(f"    notes={table.notes!r},")
    lines.append(")")
    lines.append("")
    lines.append("# --- diagnostics: ranked threats, human-readable ---")
    for t in table.threats:
        lines.append(
            f"#  {' + '.join(t.cards):<55} decks={t.deck_count:>4}  "
            f"share={t.meta_share:>6.2%}  turn={t.threat_turn}  "
            f"folds={sorted(f.value for f in t.folds_to)}"
        )
    return "\n".join(lines)


# --------------------------------------------------------------------------
# H2 — the answer matrix (format-independent: no scene key, rules knowledge)
# --------------------------------------------------------------------------


class AnswerGrade(StrEnum):
    """Whether one interaction row answers one fold class."""

    ANSWERS = "answers"
    PARTIALLY = "partially"
    NO = "no"


@dataclass(frozen=True, slots=True)
class MatrixCell:
    grade: AnswerGrade
    reasoning: str
    # Only meaningful when the row is `class_hate`: which of
    # `InteractionRow.classes`' subclasses (`graveyard`/`artifact`/`ability`)
    # this fold needs. `class_hate` having *any* card at all is not enough —
    # gy hate does not answer artifact-dependent lines, and vice versa.
    class_hate_subclass: str | None = None


_ANSWERS = AnswerGrade.ANSWERS
_PARTIALLY = AnswerGrade.PARTIALLY
_NO = AnswerGrade.NO

# Rows, per `interaction.py`: stack (counterspells), proactive_protection
# (Silence/Abolisher-class "opponents can't cast" effects), permanent_answer
# (spot removal/board wipe), class_hate (resource denial, subdivided by
# `classes`). Authored per the task file: "this is rules knowledge, not
# statistics; pretending to measure it would be false precision."
#
# `library`'s row is the canonical worked example (task file, H2): Thoracle
# + Demonic Consultation neither mills nor needs a permanent to survive —
# Consultation exiles, and Thassa's Oracle's win-check trigger resolves with
# last-known information once it is on the stack, so removing the Oracle
# after the fact does not stop it. `stack`/`proactive_protection` are the
# only real answers: countering (or pre-empting the cast of) either half
# stops the line before either effect exists.
ANSWER_MATRIX: dict[FoldClass, dict[str, MatrixCell]] = {
    FoldClass.LIBRARY: {
        "stack": MatrixCell(
            _ANSWERS, "Counter the enabler (Consultation/Tainted Pact) or the payoff's cast."
        ),
        "proactive_protection": MatrixCell(
            _ANSWERS, "A can't-cast-this-turn effect stops either half from ever being cast."
        ),
        "permanent_answer": MatrixCell(
            _NO,
            "Nothing to remove stops it: the enabler is an instant/sorcery, and the payoff's "
            "own trigger resolves with last-known information once on the stack — killing it "
            "in response does not stop the win. The canonical trap this task exists to name.",
        ),
        "class_hate": MatrixCell(
            _NO,
            "Consultation/Tainted Pact exile, they do not mill — graveyard hate denies a "
            "resource this line never touches. Canonical: NOT class_hate:graveyard.",
        ),
    },
    FoldClass.GRAVEYARD: {
        "stack": MatrixCell(
            _ANSWERS, "Counter the enabling spell (e.g. Underworld Breach) before it resolves."
        ),
        "proactive_protection": MatrixCell(
            _ANSWERS, "Stops the enabler from ever being cast this turn."
        ),
        "permanent_answer": MatrixCell(
            _PARTIALLY,
            "Removes a graveyard-recursion permanent before it is used, but many graveyard "
            "lines chain instants/sorceries straight from the yard with no single permanent "
            "to point removal at.",
        ),
        "class_hate": MatrixCell(
            _ANSWERS,
            "Exile-from-graveyard/graveyard-hate cards deny the resource the line depends on "
            "directly.",
            class_hate_subclass="graveyard",
        ),
    },
    FoldClass.ACTIVATED_ABILITY: {
        "stack": MatrixCell(
            _ANSWERS, "Counter the ability-granting permanent as it is cast, same turn."
        ),
        "proactive_protection": MatrixCell(
            _PARTIALLY,
            "Stops casting the enabler this turn, but does nothing once the permanent is "
            "already resolved from an earlier turn.",
        ),
        "permanent_answer": MatrixCell(
            _ANSWERS,
            "Removing the ability's source stops every future activation outright — unlike a "
            "trigger, an activated ability cannot fire without the permanent still present.",
        ),
        "class_hate": MatrixCell(
            _ANSWERS,
            '"Activated abilities can\'t be activated" (Cursed Totem class) shuts the line '
            "off regardless of timing.",
            class_hate_subclass="ability",
        ),
    },
    FoldClass.TRIGGERED_ABILITY: {
        "stack": MatrixCell(
            _PARTIALLY,
            "Only works if the triggering permanent must still be cast this turn; a landfall "
            "or attack-trigger engine already on board from a prior turn has no spell left to "
            "counter.",
        ),
        "proactive_protection": MatrixCell(
            _PARTIALLY, "Same caveat as stack — stops the cast, not an already-resolved permanent."
        ),
        "permanent_answer": MatrixCell(
            _ANSWERS,
            "Unlike an ETB, these triggers (attack/combat-damage/landfall/upkeep/end-step/"
            "lifegain) fire off a later event — removing the source before that event denies "
            "the trigger outright.",
        ),
        "class_hate": MatrixCell(_NO, "No Tagger-precise subclass names this trigger family."),
    },
    FoldClass.ETB: {
        "stack": MatrixCell(
            _ANSWERS,
            "Counter the permanent's cast; it never enters, so the trigger never fires.",
        ),
        "proactive_protection": MatrixCell(_ANSWERS, "Stops the cast outright."),
        "permanent_answer": MatrixCell(
            _NO,
            "An ETB trigger resolves independent of the source's continued existence — killing "
            "it in response to its own trigger does not stop the trigger from resolving.",
        ),
        "class_hate": MatrixCell(_NO, "No subclass targets ETB triggers specifically."),
    },
    FoldClass.CAST_TRIGGER: {
        "stack": MatrixCell(
            _ANSWERS,
            "Counter the payoff's cast, or one of the chained cheap spells, breaking the chain.",
        ),
        "proactive_protection": MatrixCell(_ANSWERS, "Stops the whole cast-chain for the turn."),
        "permanent_answer": MatrixCell(
            _PARTIALLY,
            "Removing the payoff before the chain starts stops it, but does not undo triggers "
            "it already counted this turn before being removed.",
        ),
        "class_hate": MatrixCell(
            _NO, "No subclass targets storm/magecraft-count payoffs specifically."
        ),
    },
    FoldClass.ARTIFACT_DEPENDENT: {
        "stack": MatrixCell(_ANSWERS, "Counter the key artifact as it is cast."),
        "proactive_protection": MatrixCell(_ANSWERS, "Stops casting it."),
        "permanent_answer": MatrixCell(
            _PARTIALLY,
            "The fold is a type-composition signal (>=half the pieces are artifacts), not a "
            "claim about which piece is the removable, load-bearing one — a payoff whose "
            "relevant ability has already resolved is not stopped by removing it after the "
            "fact, the same trap the library fold exists to name.",
        ),
        "class_hate": MatrixCell(
            _PARTIALLY,
            "Null Rod-class effects blank activated/mana abilities, not every artifact effect "
            "(a static boost keeps working).",
            class_hate_subclass="artifact",
        ),
    },
    FoldClass.CREATURE_DEPENDENT: {
        "stack": MatrixCell(_ANSWERS, "Counter the key creature as it is cast."),
        "proactive_protection": MatrixCell(_ANSWERS, "Stops casting it."),
        "permanent_answer": MatrixCell(
            _PARTIALLY,
            "Same structural caveat as artifact_dependent: the fold cannot tell enabler from "
            "already-triggered payoff (this is exactly how a Thoracle line, half creature by "
            "type share, must not read as answered by removal alone).",
        ),
        "class_hate": MatrixCell(
            _NO,
            "No creature-specific class_hate subclass exists here — a creature-sourced "
            "activated ability is already covered under activated_ability's own ability "
            "subclass, and double-crediting the same hate card under two folds would inflate "
            "the count.",
        ),
    },
    FoldClass.ENCHANTMENT_DEPENDENT: {
        "stack": MatrixCell(_ANSWERS, "Counter the key enchantment as it is cast."),
        "proactive_protection": MatrixCell(_ANSWERS, "Stops casting it."),
        "permanent_answer": MatrixCell(
            _PARTIALLY, "Same structural caveat as artifact/creature_dependent above."
        ),
        "class_hate": MatrixCell(
            _NO, "No subclass targets enchantment-dependent lines specifically."
        ),
    },
}


def _matrix_row_names() -> tuple[str, ...]:
    return ("stack", "proactive_protection", "permanent_answer", "class_hate")


# --------------------------------------------------------------------------
# H3 — the grade
# --------------------------------------------------------------------------


class GradeStatus(StrEnum):
    ANSWERED = "answered"
    ANSWERED_ONLY_BY = "answered_only_by"
    UNANSWERED = "unanswered"


@dataclass(frozen=True, slots=True)
class Way:
    """One in-time (or, in `ThreatGrade.excluded`, timing-excluded) answer:
    which interaction kind, at what grade, in which cost column, and which
    named cards."""

    kind: str  # "stack" | "proactive_protection" | "permanent_answer" | "class_hate:<subclass>"
    grade: AnswerGrade
    column: str
    cards: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ThreatGrade:
    threat: MetaThreat
    status: GradeStatus
    ways: tuple[Way, ...]
    # Real answers the deck holds that arrive too late for this threat's
    # turn — "2 answers exist but cost 3+ mana against a turn-2 line"
    # (task file, H3), never silently folded into "unanswered".
    excluded: tuple[Way, ...]

    @property
    def label(self) -> str:
        if self.status is GradeStatus.UNANSWERED:
            return "unanswered"
        kinds = sorted({w.kind for w in self.ways})
        if self.status is GradeStatus.ANSWERED_ONLY_BY:
            return f"answered only by {kinds[0]}"
        return f"answered ({len(kinds)} ways)"


@dataclass(frozen=True, slots=True)
class MetaGradeReport:
    scene: str
    measured: str
    stale: bool
    half_life_days: float
    # Already meta-share ordered (inherited from `MetaThreatTable.threats`)
    # — never re-sorted into a blended score, per the module docstring.
    grades: tuple[ThreatGrade, ...]


def _in_time(column: str, threat_turn: int) -> bool:
    """The grid's cost columns *are* the timing check (task file, H3): free
    and cheap (mv<=1) are castable from turn 1 on, so they are always in
    time for any threat turn >= 1. Held-up (mv>=2) needs a turn spent
    developing while still holding mana back — v1's stated threshold is
    threat turn >= 3."""
    if column == "held_up":
        return threat_turn >= 3
    return True


# The type-share heuristics, as opposed to the mechanism folds. The split
# matters to `_applicable_cells`: a mechanism fold states how the line
# actually wins, a structural fold only states what its pieces are made of.
_STRUCTURAL_FOLDS: frozenset[FoldClass] = frozenset(
    {
        FoldClass.CREATURE_DEPENDENT,
        FoldClass.ARTIFACT_DEPENDENT,
        FoldClass.ENCHANTMENT_DEPENDENT,
    }
)


def _applicable_cells(
    folds: frozenset[FoldClass],
) -> dict[tuple[str, str | None], MatrixCell]:
    """Row (+ class_hate subclass) -> the strongest cell any of the
    threat's fold classes earns it — with one veto.

    Between folds that agree a row helps, "answers" wins over "partially".
    But a *mechanism* fold's explicit NO on a row vetoes any *structural*
    fold's grant of the same row: Thoracle+Consultation is half creatures
    by type share, so `creature_dependent`'s permanent_answer PARTIALLY
    would read the line as killable — while `library`'s own permanent cell
    states precisely why removal does not stop it (the trigger resolves
    with last-known information). When a mechanism has said "removal does
    not work on this win", a heuristic about the pieces' card types must
    not overrule it. Mechanism folds never veto each other — a line that is
    genuinely both graveyard and library still dies to graveyard hate
    through its graveyard half, whatever the library row says about hate.
    Caught live, not hypothesised: the un-vetoed merge graded the dev Kess
    deck "answered_only_by permanent_answer" against Thoracle+Consultation.
    """
    best: dict[tuple[str, str | None], MatrixCell] = {}
    vetoed_rows: set[str] = {
        row_name
        for fold in folds
        if fold not in _STRUCTURAL_FOLDS
        for row_name, cell in ANSWER_MATRIX.get(fold, {}).items()
        if cell.grade is AnswerGrade.NO
    }
    for fold in folds:
        for row_name, cell in ANSWER_MATRIX.get(fold, {}).items():
            if cell.grade is AnswerGrade.NO:
                continue
            if fold in _STRUCTURAL_FOLDS and row_name in vetoed_rows:
                continue
            key = (row_name, cell.class_hate_subclass)
            current = best.get(key)
            if current is None or (
                current.grade is AnswerGrade.PARTIALLY and cell.grade is AnswerGrade.ANSWERS
            ):
                best[key] = cell
    return best


def _class_hate_columns(grid_row: InteractionRow) -> dict[str, str]:
    """Card name -> cost column, for the `class_hate` row. `InteractionRow`
    names which cards belong to which subclass (`classes`) and which column
    each card sits in (`cells[column].cards`) as two separate collections —
    cross-referencing them here is cheaper than widening `interaction.py`'s
    schema for one caller, and needs no change there at all."""
    by_name: dict[str, str] = {}
    for column, cell in grid_row.cells.items():
        for name in cell.cards:
            by_name[name] = column
    return by_name


def grade_threat(threat: MetaThreat, grid: InteractionGrid) -> ThreatGrade:
    """H3 for one threat: every row/subclass its fold classes earn via
    `ANSWER_MATRIX`, restricted to columns castable in time (`_in_time`).
    """
    rows_by_name = {row.row: row for row in grid.rows}
    applicable = _applicable_cells(threat.folds_to)

    ways: list[Way] = []
    excluded: list[Way] = []

    for (row_name, subclass), cell in applicable.items():
        grid_row = rows_by_name.get(row_name)
        if grid_row is None:
            continue

        if row_name == "class_hate":
            if subclass is None:
                continue
            names = list((grid_row.classes or {}).get(subclass, ()))
            if not names:
                continue
            column_of = _class_hate_columns(grid_row)
            by_column: dict[str, list[str]] = {}
            for name in names:
                column = column_of.get(name)
                if column:
                    by_column.setdefault(column, []).append(name)
        else:
            by_column = {
                column: list(icell.cards)
                for column, icell in grid_row.cells.items()
                if icell.count > 0
            }

        kind = f"class_hate:{subclass}" if row_name == "class_hate" else row_name
        for column, names in by_column.items():
            way = Way(kind=kind, grade=cell.grade, column=column, cards=tuple(names))
            (ways if _in_time(column, threat.threat_turn) else excluded).append(way)

    distinct_kinds = sorted({w.kind for w in ways})
    if not distinct_kinds:
        status = GradeStatus.UNANSWERED
    elif len(distinct_kinds) == 1:
        status = GradeStatus.ANSWERED_ONLY_BY
    else:
        status = GradeStatus.ANSWERED

    return ThreatGrade(threat=threat, status=status, ways=tuple(ways), excluded=tuple(excluded))


def grade_deck(
    scene: str, grid: InteractionGrid | None, *, table: MetaThreatTable | None = None
) -> MetaGradeReport | None:
    """H3 for a whole deck: every measured threat, graded against its own
    interaction grid (Task C). `None` when the scene has not been measured
    yet or the deck carries no grid (below bracket 5, same short-circuit
    `build_interaction_grid` already applies) — never an empty report,
    which would read as "graded, zero threats" instead of "not applicable".

    `table` defaults to the landed `MEASURED_THREATS[scene]`; overridable so
    a caller (or a test) can grade against a specific measurement without
    mutating module state.
    """
    resolved = table if table is not None else MEASURED_THREATS.get(scene)
    if resolved is None or grid is None:
        return None

    grades = tuple(grade_threat(threat, grid) for threat in resolved.threats)
    return MetaGradeReport(
        scene=resolved.scene,
        measured=resolved.measured,
        stale=resolved.stale,
        half_life_days=resolved.half_life_days,
        grades=grades,
    )
