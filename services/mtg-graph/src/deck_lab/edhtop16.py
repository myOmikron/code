"""edhtop16.com adapter — tournament top cuts, the corpus grinders trust.

EDHREC's `/cedh` pages (see `edhrec.py`) aggregate self-reported brews tagged
"cEDH" by whoever submitted them. edhtop16.com aggregates actual tournament
results instead: swiss standings and top-cut decklists from real cEDH events.
This module is the ONLY one that talks to it, same quarantine discipline as
`edhrec.py`: raw responses persisted before parsing, a TTL cache, tombstones
for negative answers, a polite delay after every network fetch, and nothing
here runs on a request path — `deck-lab ingest-edhtop16` is an operator-run
CLI command, not a lazy per-request fetch.

## The API, as introspected 2026-09-01

`POST https://edhtop16.com/api/graphql`, standard GraphQL, no auth. Published
rate limit ~120 requests/minute (429 on excess) — this module halves that
headroom and hard-caps itself at 1 request/second (`_throttle`). A bad query
or a nonexistent `TID` answers HTTP 200 with `data.tournament: null` plus a
top-level `errors` array (`"Query returned no rows"`) — GraphQL errors do not
set a non-2xx status, so "not found" is read from `data`, never from the
HTTP status code.

Shape, relevant to this task only (the schema is much larger — teams,
players, promos, coaching — none of it touched here):

    tournaments(first, after, sortBy: DATE|PLAYERS, filters: {minSize,
      maxSize, minDate, maxDate, timePeriod}) -> Relay connection of
      { TID, name, tournamentDate, size, swissRounds, topCut }.
      Cursor is a plain numeric offset string ("100", "200", ...).

    tournament(TID) -> { ..., entries(commander, maxStanding) -> [Entry!] }
      — a *plain array*, not paginated; `maxStanding` is exactly the
      "top-16 standings only" filter the brief asks for, and it works
      whether or not the tournament ran an explicit top-cut bracket (a
      swiss-only event with `topCut: 0` still ranks every player by
      `standing`, observed on "The Dessert - Cookout Redemption Event").

    Entry -> { id, standing, wins, losses, draws, commander: Commander,
      maindeck: [Card!], decklist: String }.
      `id` is a stable, globally-unique Relay id (`"Entry:337623"`,
      base64-opaque) — MERGE key for `:TournamentDeck.id`.
      `decklist` is a URL to a topdeck.gg page, not raw text; the actual
      card data is `maindeck`.

    Card -> { name, oracleId, cmc, type, ... }. `oracleId` is a real
    Scryfall oracle id (verified against our own `Card.oracle_id`) — a much
    stronger join key than EDHREC's printing-scoped `scryfall_id`
    (`edhrec.py`'s docstring). Joined oracle_id-first, name-fallback anyway,
    mirroring `upsert_recommendations`'s discipline.

    Commander -> { name, colorId, ... }. No oracle id inline. A partner
    (or partner+background) pair is one string, "A / B" — a *spaced*
    single slash, not Scryfall/EDHREC's unspaced "//" for a double-faced
    card's own two faces — so `split_commander_name` splits on " / " and
    resolves each half by name. Verified live: "Thrasios, Triton Hero /
    Tymna the Weaver", "Rograkh, Son of Rohgahh / Tymna the Weaver". A
    commanderless-looking entry (`commander.name == ""`) was observed once
    live — treated as "no commander data", not an error.

## Partner pairs: why there are three commander fields

`:TournamentDeck` carries `commander_oracle_id` (the brief's singular,
nullable field), `commander_oracle_ids` (a list, added here), and
`commander_name` (the raw string, also added here) — not redundancy, a fix
for a real bug caught mid-round. A first pass kept only the *first*
resolvable half of a partner string as "the" commander, which silently
merged every "Rograkh, Son of Rohgahh / X" pairing onto plain Rograkh
regardless of X. Live data (a 12-tournament sample) showed exactly the
damage that does: "Rograkh / Thrasios, Triton Hero" (91 decks) and
"Rograkh / Silas Renn, Seeker Adept" (54 decks) — two distinct, separately
well-known cEDH shells — collapsed into one 145-deck "Rograkh" bucket,
while "Kraum, Ludevic's Opus / Tymna the Weaver" (144 decks, this format's
single most-played configuration) never surfaced as itself.

The fix: `commander_oracle_ids` resolves *every* half of the string, in
order, deduplicated (`[]` none, `[oid]` solo, `[oid_a, oid_b]` a pair).
That list is what `recompute_recommends_meta` unwinds (a Kraum/Tymna deck's
cards count toward both Kraum's and Tymna's `RECOMMENDS_META`) and what any
"top commanders" measurement should group on **`commander_name`**, not on
either oracle-id field — grouping by a single resolved card is exactly the
collapse above, no matter which half is chosen as "first". `commander_oracle_id`
survives only because the brief's schema names it; it is the first entry of
`commander_oracle_ids` and is not meant to answer "how popular is this
commander" for a format with partners.

## Discovered gap against the brief: no basic-land quantities

`Entry.maindeck` is a *deduplicated-by-name* list of unique cards — a deck
running 3 Plains and 2 Islands lists one "Plains" row and one "Island" row,
identically to a deck running one of each. There is no `quantity` field
anywhere on `Card` or `Entry`. Confirmed against a real 99-card WU decklist
that came back with only 97 rows. Non-basics are always qty 1 anyway
(singleton format), so this only under-counts basic lands — `PLAYED.qty` is
therefore always written as `1`, a known, deliberate approximation rather
than a guess: the alternative (parsing the `decklist` topdeck.gg URL, a
second external site) is out of scope for this adapter.

## Format-agnostic schema (00-OVERVIEW.md decision)

    (:TournamentDeck {id, scene, format, standing, tournament, date, players,
                      commander_oracle_id?, commander_oracle_ids, commander_name?,
                      archetype?, wins, losses, draws?})
    (:TournamentDeck)-[:PLAYED {qty, board}]->(:Card)
    (cmd:Card)-[:RECOMMENDS_META {scene, source, inclusion_rate, deck_count}]->(c:Card)

`scene="cedh"`, `format="commander"` (matches `services/mtg/src/models/
format.rs`'s slug, itself Scryfall's `legalities` key). `tournament` stores
the TID (stable join key), not the display name. `commander_oracle_ids` and
`commander_name` are added beyond the brief's literal property list — see
"Partner pairs" above for why a singular anchor cannot carry this format's
meta on its own. `archetype` is always `null` — Task E's to fill, not
guessed here. `RECOMMENDS_META.deck_count` is the numerator (decks with this
commander that ran the card), matching `inclusion_rate = deck_count /
(decks with this commander)`, the same shape as EDHREC's `num_decks /
potential_decks` — and, per the fix above, a Kraum/Tymna deck contributes to
both Kraum's and Tymna's denominator and numerator, not just one.

The tournament *listing* query is deliberately never cached (only each
tournament's own entries payload is): the listing's cursor pages shift
every time a new tournament posts, so a cached page goes stale within the
run that produced it, unlike a played tournament's results, which are
permanent.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import structlog

from .config import settings

log = structlog.get_logger(__name__)

GRAPHQL_URL = "https://edhtop16.com/api/graphql"

CACHE_TTL_SECONDS = 7 * 24 * 60 * 60  # A week — tournament results never change once posted.

# Shorter than the positive TTL, mirroring `edhrec.py`: a transient GraphQL
# hiccup or an outage looks identical to "this TID does not exist" from our
# vantage, so a not-found memory must heal well before a week is up.
NEGATIVE_TTL_SECONDS = 6 * 60 * 60

# The published limit is ~120/minute (2/sec); this halves that headroom on
# purpose, per the brief's explicit hard cap.
MIN_REQUEST_INTERVAL_SECONDS = 1.0

# The "results, not brews" filter (A2): a top-16 finish at a 32+ player event
# is a result; a self-tagged EDHREC "cEDH" brew is not. `--min-players` and
# `--top` on the CLI command override these, but this is the load-bearing
# default and the reasoning belongs beside it, not just in the task doc.
DEFAULT_MONTHS = 12
DEFAULT_MIN_PLAYERS = 32
DEFAULT_TOP = 16

SCENE = "cedh"
FORMAT = "commander"
BOARD = "main"

TOURNAMENTS_LIST_QUERY = """
query TournamentsList(
  $first: Int!, $after: String, $filters: TournamentFilters, $sortBy: TournamentSortBy!
) {
  tournaments(first: $first, after: $after, filters: $filters, sortBy: $sortBy) {
    pageInfo { hasNextPage endCursor }
    edges { node { TID name tournamentDate size } }
  }
}
"""

TOURNAMENT_ENTRIES_QUERY = """
query TournamentEntries($tid: String!, $maxStanding: Int!) {
  tournament(TID: $tid) {
    TID
    name
    size
    tournamentDate
    entries(maxStanding: $maxStanding) {
      id
      standing
      wins
      losses
      draws
      commander { name }
      maindeck { name oracleId }
    }
  }
}
"""


@dataclass(frozen=True, slots=True)
class TournamentRef:
    """One row of the tournament listing — enough to go fetch its entries."""

    tid: str
    name: str
    date: str
    size: int


@dataclass(frozen=True, slots=True)
class DecklistCard:
    name: str
    oracle_id: str  # "" when edhtop16 has none on file for this card


@dataclass(frozen=True, slots=True)
class TournamentEntry:
    """One standing: a player's finish, commander, and 99(ish)-card maindeck."""

    entry_id: str
    standing: int
    wins: int
    losses: int
    draws: int | None
    commander_name: str | None  # None when edhtop16 gave an empty string
    maindeck: tuple[DecklistCard, ...]


@dataclass(frozen=True, slots=True)
class DeckJoinStats:
    """How well one entry's cards and commander resolved against our graph."""

    cards_total: int
    cards_joined: int
    commander_present: bool  # False when edhtop16 gave no commander name at all
    commander_resolved: bool


def _months_ago(months: int, *, today: datetime | None = None) -> str:
    """`YYYY-MM-DD`, `months` calendar months before `today` (UTC `now()` by
    default; a fixed value makes the wraparound arithmetic testable).

    Calendar-month subtraction rather than `days=months*30`, so a 12-month
    reach does not drift by the ~5 days that approximation would cost. The
    day-of-month is clamped to 28 to sidestep short-February overflow; a
    day or two of slack at the window's far edge does not matter here.
    """
    today = today or datetime.now(UTC)
    year = today.year
    month = today.month - months
    while month <= 0:
        month += 12
        year -= 1
    return f"{year:04d}-{month:02d}-{min(today.day, 28):02d}"


_last_request_at = 0.0


def _throttle() -> None:
    """Block until `MIN_REQUEST_INTERVAL_SECONDS` has passed since the last
    network call. Called only from `_post_graphql`, so a cache hit never
    pays this — the delay is after-network-fetches-only by construction,
    not by discipline someone has to remember at each call site."""
    global _last_request_at
    remaining = MIN_REQUEST_INTERVAL_SECONDS - (time.monotonic() - _last_request_at)
    if remaining > 0:
        time.sleep(remaining)
    _last_request_at = time.monotonic()


def _post_graphql(query: str, variables: dict[str, Any]) -> dict:
    """One throttled POST. Raises on transport failure; GraphQL-level errors
    (bad TID, etc.) come back as HTTP 200 with an `errors` array — callers
    read `data` themselves to tell "not found" from "really broken"."""
    _throttle()
    response = httpx.post(
        GRAPHQL_URL,
        json={"query": query, "variables": variables},
        headers={
            "User-Agent": settings.scryfall_user_agent,
            "Content-Type": "application/json",
        },
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()


def _tournaments_cache_dir() -> Path:
    return settings.data_dir / "edhtop16" / "tournaments"


def _cache_path(tid: str) -> Path:
    return _tournaments_cache_dir() / f"{tid}.json"


def is_cached(tid: str) -> bool:
    path = _cache_path(tid)
    if not path.exists():
        return False
    return (time.time() - path.stat().st_mtime) < CACHE_TTL_SECONDS


def is_tombstoned(tid: str) -> bool:
    tombstone = _cache_path(tid).with_suffix(".missing")
    if not tombstone.exists():
        return False
    return (time.time() - tombstone.stat().st_mtime) < NEGATIVE_TTL_SECONDS


def fetch_tournament(tid: str, *, top: int = DEFAULT_TOP, force: bool = False) -> dict | None:
    """One tournament's entries payload, cache-first. `None` when edhtop16
    has no such TID (or the query otherwise came back empty) — an ordinary
    outcome, tombstoned like `edhrec.fetch_commander`'s 403/404 case.

    The cache key is the TID alone, not `(tid, top)`: this adapter's one
    caller always asks with the same `--top`, so a cache warmed at a
    smaller `--top` simply will not grow more entries until `--force`
    re-fetches it — a known simplicity trade, not a silent bug.
    """
    path = _cache_path(tid)
    tombstone = path.with_suffix(".missing")

    if not force and path.exists():
        age = time.time() - path.stat().st_mtime
        if age < CACHE_TTL_SECONDS:
            log.debug("edhtop16.cached", tid=tid, age_hours=round(age / 3600, 1))
            return json.loads(path.read_text())

    if not force and tombstone.exists():
        age = time.time() - tombstone.stat().st_mtime
        if age < NEGATIVE_TTL_SECONDS:
            log.debug("edhtop16.tombstoned", tid=tid, age_hours=round(age / 3600, 1))
            return None
        tombstone.unlink()

    log.info("edhtop16.fetch", tid=tid)
    payload = _post_graphql(TOURNAMENT_ENTRIES_QUERY, {"tid": tid, "maxStanding": top})

    if not (payload.get("data") or {}).get("tournament"):
        log.warning("edhtop16.not_found", tid=tid, errors=payload.get("errors"))
        tombstone.parent.mkdir(parents=True, exist_ok=True)
        tombstone.write_text(json.dumps(payload.get("errors") or "not found"))
        return None

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload))
    if tombstone.exists():
        tombstone.unlink()
    return payload


def list_tournaments(
    *, min_players: int = DEFAULT_MIN_PLAYERS, min_date: str, page_size: int = 100
) -> list[TournamentRef]:
    """Every tournament in the window, newest first. Not cached — see the
    module docstring's reasoning. Throttled like any other network call,
    through `_post_graphql`."""
    refs: list[TournamentRef] = []
    after: str | None = None
    while True:
        payload = _post_graphql(
            TOURNAMENTS_LIST_QUERY,
            {
                "first": page_size,
                "after": after,
                "sortBy": "DATE",
                "filters": {"minSize": min_players, "minDate": min_date},
            },
        )
        connection = (payload.get("data") or {}).get("tournaments") or {}
        edges = connection.get("edges") or []
        for edge in edges:
            node = edge.get("node") or {}
            tid = node.get("TID")
            if not tid:
                continue
            refs.append(
                TournamentRef(
                    tid=tid,
                    name=node.get("name") or "",
                    date=node.get("tournamentDate") or "",
                    size=int(node.get("size") or 0),
                )
            )
        page_info = connection.get("pageInfo") or {}
        if not edges or not page_info.get("hasNextPage"):
            break
        after = page_info.get("endCursor")
    return refs


def parse_tournament_entries(payload: dict) -> tuple[TournamentRef | None, list[TournamentEntry]]:
    """The cached/fetched payload -> a tournament ref plus its entries.

    Tolerant like `edhrec.parse_recommendations`: a missing field degrades
    the row rather than raising, because a partial schema move should cost
    one deck, not the whole run.
    """
    tournament = (payload.get("data") or {}).get("tournament")
    if not tournament:
        return None, []

    ref = TournamentRef(
        tid=tournament.get("TID") or "",
        name=tournament.get("name") or "",
        date=tournament.get("tournamentDate") or "",
        size=int(tournament.get("size") or 0),
    )

    entries: list[TournamentEntry] = []
    for row in tournament.get("entries") or []:
        entry_id = row.get("id")
        if not entry_id:
            continue

        commander = row.get("commander") or {}
        commander_name = (commander.get("name") or "").strip() or None

        maindeck = tuple(
            DecklistCard(name=card["name"], oracle_id=card.get("oracleId") or "")
            for card in row.get("maindeck") or []
            if card.get("name")
        )

        entries.append(
            TournamentEntry(
                entry_id=entry_id,
                standing=int(row.get("standing") or 0),
                wins=int(row.get("wins") or 0),
                losses=int(row.get("losses") or 0),
                draws=row.get("draws"),
                commander_name=commander_name,
                maindeck=maindeck,
            )
        )
    return ref, entries


def split_commander_name(raw: str) -> list[str]:
    """edhtop16 joins a partner/background pair as "A / B" — a *spaced*
    single slash. That is deliberately distinct from Scryfall/EDHREC's
    unspaced "//" for a double-faced card's own two faces, so this never
    mis-splits a DFC commander name (there is no legal commander whose own
    name contains " / ")."""
    return [part for part in (piece.strip() for piece in raw.split(" / ")) if part]


def _resolve_card(
    card: DecklistCard, known_oracle_ids: set[str], name_lookup: dict[str, str]
) -> str | None:
    if card.oracle_id and card.oracle_id in known_oracle_ids:
        return card.oracle_id
    return name_lookup.get(card.name)


def _resolve_commander_ids(commander_name: str | None, name_lookup: dict[str, str]) -> list[str]:
    """Every half of a commander string that resolved, in the order edhtop16
    gave them. `[]` for no commander data, `[oid]` for a solo commander,
    `[oid_a, oid_b]` for a resolved partner/background pair.

    Resolving *both* halves — not just the first — is the fix for a real
    bug: an earlier version of this adapter kept only the first resolvable
    half as "the" commander, which silently merged every "Rograkh, Son of
    Rohgahh / X" pairing onto plain Rograkh regardless of X, hiding
    "Rograkh/Thrasios" and "Rograkh/Silas Renn" as the two distinct,
    separately-popular cEDH shells they are. See the module docstring's
    "Partner pairs" section.
    """
    if not commander_name:
        return []
    ids = []
    for part in split_commander_name(commander_name):
        oracle_id = name_lookup.get(part)
        if oracle_id and oracle_id not in ids:
            ids.append(oracle_id)
    return ids


def build_deck_row(
    ref: TournamentRef,
    entry: TournamentEntry,
    *,
    known_oracle_ids: set[str],
    name_lookup: dict[str, str],
) -> tuple[dict[str, Any], DeckJoinStats]:
    """One entry -> the dict `graph.upsert_tournament_decks` writes, plus its
    join stats. Pure — every resolution is a lookup against the two maps the
    caller already built, so this needs no Neo4j connection and is safe to
    unit test directly.

    A card that fails to join both ways is silently dropped from `cards`
    rather than written with a placeholder: `upsert_tournament_decks` MATCHes
    by oracle_id, and a fabricated one would either miss (harmless) or,
    worse, collide with an unrelated real card.
    """
    cards: list[dict[str, Any]] = []
    joined = 0
    for card in entry.maindeck:
        oracle_id = _resolve_card(card, known_oracle_ids, name_lookup)
        if oracle_id:
            cards.append({"oracle_id": oracle_id, "qty": 1, "board": BOARD})
            joined += 1

    commander_oracle_ids = _resolve_commander_ids(entry.commander_name, name_lookup)

    row = {
        "id": entry.entry_id,
        "scene": SCENE,
        "format": FORMAT,
        "standing": entry.standing,
        "tournament": ref.tid,
        "date": ref.date,
        "players": ref.size,
        # The brief's schema field: a single nullable anchor. Populated as
        # the *first* resolved half for a pair — arbitrary, and exactly the
        # choice that must NOT be used for meta-share grouping or
        # RECOMMENDS_META (see `commander_oracle_ids` and `commander_name`
        # below, which carry the full, undistorted pairing).
        "commander_oracle_id": commander_oracle_ids[0] if commander_oracle_ids else None,
        # Every resolved commander card for this deck (1 solo, 2 partners) —
        # not in the brief's literal property list, added alongside
        # `commander_name` for the same reason: a singular anchor cannot
        # round-trip a partner pair. `recompute_recommends_meta` unwinds
        # this list so a Kraum/Tymna deck's cards count toward *both*
        # Kraum's and Tymna's RECOMMENDS_META, not just whichever came
        # first in edhtop16's string.
        "commander_oracle_ids": commander_oracle_ids,
        "commander_name": entry.commander_name,
        "archetype": None,
        "wins": entry.wins,
        "losses": entry.losses,
        "draws": entry.draws,
        "cards": cards,
    }
    stats = DeckJoinStats(
        cards_total=len(entry.maindeck),
        cards_joined=joined,
        commander_present=entry.commander_name is not None,
        commander_resolved=bool(commander_oracle_ids),
    )
    return row, stats


def _names_to_resolve(entries: list[TournamentEntry], known_oracle_ids: set[str]) -> set[str]:
    wanted = {
        card.name
        for entry in entries
        for card in entry.maindeck
        if not (card.oracle_id and card.oracle_id in known_oracle_ids)
    }
    wanted.update(
        part
        for entry in entries
        if entry.commander_name
        for part in split_commander_name(entry.commander_name)
    )
    return wanted


_EMPTY_TOURNAMENT_COUNTS = {
    "decks": 0,
    "cards_total": 0,
    "cards_joined": 0,
    "commanders_resolved": 0,
    "commanders_missing": 0,
    "commanders_unresolved": 0,
}


def _ingest_tournament(
    ref: TournamentRef, *, top: int, known_oracle_ids: set[str], force: bool
) -> dict[str, int]:
    """Fetch (cache-first), resolve, and write one tournament's decks.

    Name resolution happens per tournament rather than once for the whole
    run: it is a local Neo4j query, not a throttled edhtop16 request, so
    doing it ~1,000 times over the run costs nothing the throttle already
    doesn't dominate, and it keeps this function — and its test coverage —
    from needing to hold the whole corpus in memory at once.
    """
    from .graph import resolve_names, upsert_tournament_decks

    counts = dict(_EMPTY_TOURNAMENT_COUNTS)

    payload = fetch_tournament(ref.tid, top=top, force=force)
    if payload is None:
        return counts

    _, entries = parse_tournament_entries(payload)
    if not entries:
        log.warning("edhtop16.empty_tournament", tid=ref.tid)
        return counts

    wanted = _names_to_resolve(entries, known_oracle_ids)
    name_lookup = resolve_names(list(wanted)) if wanted else {}

    rows = []
    for entry in entries:
        row, stats = build_deck_row(
            ref, entry, known_oracle_ids=known_oracle_ids, name_lookup=name_lookup
        )
        rows.append(row)
        counts["decks"] += 1
        counts["cards_total"] += stats.cards_total
        counts["cards_joined"] += stats.cards_joined
        if not stats.commander_present:
            counts["commanders_missing"] += 1
        elif stats.commander_resolved:
            counts["commanders_resolved"] += 1
        else:
            counts["commanders_unresolved"] += 1

    upsert_tournament_decks(rows)
    return counts


def ingest(
    *,
    months: int = DEFAULT_MONTHS,
    min_players: int = DEFAULT_MIN_PLAYERS,
    top: int = DEFAULT_TOP,
    force: bool = False,
) -> dict[str, int | float]:
    """The whole pipeline: discover tournaments in the window, fetch/parse/
    join each one's top standings, write `:TournamentDeck` + `PLAYED`, then
    recompute `RECOMMENDS_META` for the `cedh` scene from what landed.

    One bad tournament never ends the run (mirrors `warm_top_commanders`);
    a systemic failure (persistent 429, edhtop16 down) surfaces instead as
    `list_tournaments` itself raising, since without a listing there is
    nothing left to iterate.
    """
    from .graph import ensure_tournament_deck_schema, known_oracle_ids, recompute_recommends_meta

    ensure_tournament_deck_schema()
    known_ids = known_oracle_ids()
    min_date = _months_ago(months)

    totals: dict[str, int | float] = {
        "tournaments_seen": 0,
        "tournaments_fetched": 0,
        "tournaments_cached": 0,
        "tournaments_not_found": 0,
        "decks": 0,
        "cards_total": 0,
        "cards_joined": 0,
        "commanders_resolved": 0,
        "commanders_missing": 0,
        "commanders_unresolved": 0,
    }

    for ref in list_tournaments(min_players=min_players, min_date=min_date):
        totals["tournaments_seen"] += 1
        network = force or not is_cached(ref.tid)

        try:
            result = _ingest_tournament(ref, top=top, known_oracle_ids=known_ids, force=force)
        except Exception as exc:  # noqa: BLE001 — one bad tournament must not end the run
            log.warning("edhtop16.ingest_failed", tid=ref.tid, error=str(exc))
            continue

        if result["decks"] == 0:
            totals["tournaments_not_found"] += 1
        elif network:
            totals["tournaments_fetched"] += 1
        else:
            totals["tournaments_cached"] += 1

        for key in (
            "decks",
            "cards_total",
            "cards_joined",
            "commanders_resolved",
            "commanders_missing",
            "commanders_unresolved",
        ):
            totals[key] += result[key]

    cards_total = totals["cards_total"]
    join_failure_rate = 1 - (totals["cards_joined"] / cards_total) if cards_total else 0.0
    totals["join_failure_rate"] = round(join_failure_rate, 4)
    if join_failure_rate > 0.02:
        log.warning("edhtop16.high_join_failure_rate", rate=join_failure_rate)

    totals["recommends_meta_edges"] = recompute_recommends_meta(scene=SCENE)

    log.info("edhtop16.ingested", **totals)
    return totals
